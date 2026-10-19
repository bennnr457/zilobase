import { buildContextMarkdown, type ResourceRef } from "@zilobase/page-context";
import { getPage } from "../pages/operations";
import { getDatabaseExport } from "../databases/reads";
import { captureClientOperation, type ClientOperationContext } from "../shared/operation-context";
import { collectWorkspaceContext, type LocalPageSnapshot } from "./context";

export async function prepareChatContext(
  context: ClientOperationContext,
  input: {
    workspaceId: string;
    roots: ResourceRef[];
    snapshots?: LocalPageSnapshot[];
    maxChars?: number;
    signal?: AbortSignal;
  },
) {
  const scope = captureClientOperation(context);
  const check = () => {
    scope.assertCurrent();
    input.signal?.throwIfAborted();
  };
  const guarded = {
    ...scope.context,
    apiFetch: (async (path, init) => {
      check();
      const signal =
        input.signal && init?.signal
          ? AbortSignal.any([input.signal, init.signal])
          : (input.signal ?? init?.signal);
      return scope.context.apiFetch(path, { ...init, signal });
    }) as ClientOperationContext["apiFetch"],
  };
  const data = await collectWorkspaceContext(input, {
    check,
    now: () => new Date().toISOString(),
    page: async (id) => {
      const detail = await getPage(guarded, { pageId: id, fresh: true });
      if (!detail) throw new Error("Page unavailable");
      return detail.page;
    },
    database: async (id, dataSourceId) => {
      const result = await getDatabaseExport(guarded, {
        databaseId: id,
        dataSourceId,
        fresh: true,
      });
      if (!result) throw new Error("Database unavailable");
      return result;
    },
  });
  check();
  return buildContextMarkdown({ context: data, maxChars: input.maxChars });
}
