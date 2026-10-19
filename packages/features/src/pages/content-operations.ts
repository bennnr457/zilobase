import { sharedClient } from "../data/client";
import { refreshTitleMembership } from "../databases/queries/invalidation";
import {
  invalidateDeletedItems,
  invalidateRestoredItems,
  setPageDetailCache,
} from "../shared/item-action-cache";
import type { ClientOperationContext } from "../shared/operation-context";
import { clientMutation, runClientMutation } from "../shared/operation-mutation";
import { cachePageDetail, readCachedPage, type PageDetailReference } from "./cache";
import type { AccessLevel, Page, PageDetail } from "./contracts";
import type { PageMetadata } from "./item-relationships";
import { hasPageBodyContent } from "./models";
import { applyNavigationDeltaToCache } from "./navigation-cache";
import { type NavDelta } from "./navigation-model";
import { pageQueryKey } from "./queries";

export type CreatePageInput = {
  content?: unknown;
  metadata?: PageMetadata;
  workspaceId: string;
  name?: string;
  emoji?: string;
  parentItemId?: string;
  teamspaceId?: string | null;
};

export type CreatePageResponse = {
  navDelta?: NavDelta;
  page: Page;
};

export type CreatedPageResult = Page & {
  navDelta?: NavDelta;
};

export type UpdatePageInput = {
  id: string;
  content?: unknown;
  name?: string;
  metadata?: PageMetadata;
};

export type UpdatePageResponse =
  | {
      page: Page;
    }
  | {
      page: Pick<Page, "id" | "updatedAt">;
    };

function defineCreatePageMutation(context: ClientOperationContext) {
  const { apiFetch, queryClient } = context;

  return clientMutation({
    mutationFn: async ({
      content = null,
      workspaceId,
      name = "",
      emoji,
      metadata: inputMetadata,
      parentItemId,
      teamspaceId,
    }: CreatePageInput) => {
      const metadata: PageMetadata = { ...inputMetadata };

      if (emoji) {
        metadata.emoji = emoji;
      }

      const result = await apiFetch<CreatePageResponse>("/pages", {
        method: "POST",
        body: JSON.stringify({
          workspaceId,
          name,
          type: "pageblock",
          url: "#",
          content,
          metadata,
          parentItemId,
          teamspaceId,
        }),
      });

      return {
        ...result.page,
        navDelta: result.navDelta,
      } satisfies CreatedPageResult;
    },
    onSuccess: async (page) => {
      const { navDelta, ...pageRecord } = page;
      const parentItemId = navDelta?.upsertPlacements?.find(
        (placement) =>
          placement.itemKind === "page" &&
          placement.itemId === pageRecord.id &&
          placement.placementKind === "primary",
      )?.parentId;
      const parentDetail = parentItemId
        ? queryClient.getQueryData<PageDetail | null>(pageQueryKey(parentItemId))
        : null;
      const inheritedAccessLevel = parentDetail?.accessLevel ?? ("full" as AccessLevel);

      cachePageDetail(queryClient, {
        accessLevel: inheritedAccessLevel,
        databaseIds: [],
        page: pageRecord,
      });
      applyNavigationDeltaToCache(
        queryClient,
        pageRecord.workspaceId,
        navDelta ?? { upsertPages: [pageRecord] },
      );
    },
  });
}
export type CreatePageResult = Awaited<
  ReturnType<NonNullable<ReturnType<typeof defineCreatePageMutation>["mutationFn"]>>
>;
export function createPage(
  context: ClientOperationContext,
  input: CreatePageInput,
): Promise<CreatePageResult> {
  return runClientMutation(context, input, defineCreatePageMutation);
}

function defineUpdatePageMutation(context: ClientOperationContext) {
  const { apiFetch, queryClient } = context;
  return clientMutation({
    mutationFn: async ({ id, ...patch }: UpdatePageInput) => {
      const client = sharedClient(queryClient);
      const read = await client.captureRead();
      const current = readCachedPage(queryClient, id);
      const reference = queryClient.getQueryData<PageDetailReference | null>(pageQueryKey(id));
      const entities = reference
        ? client.get(reference.page.cacheId)
        : current
          ? client.resolve(read, current.workspaceId)
          : undefined;
      const confirm = async () => {
        const contentOnly =
          patch.content !== undefined && patch.name === undefined && patch.metadata === undefined;
        const result = await apiFetch<UpdatePageResponse>(
          contentOnly ? `/pages/${id}/content` : `/pages/${id}`,
          {
            method: "PATCH",
            body: JSON.stringify(
              contentOnly ? { baseUpdatedAt: current?.updatedAt, content: patch.content } : patch,
            ),
          },
        );
        const page = resolveUpdatedPage(result.page, { id, ...patch }, current ?? undefined);
        if (!page) throw new Error("Page acknowledgement needs an authorized page read");
        cachePageDetail(
          queryClient,
          {
            ...reference,
            page,
            accessLevel: reference?.accessLevel ?? null,
            databaseIds: reference?.databaseIds ?? [],
          },
          read,
        );
        return page;
      };
      if (!entities || (patch.name === undefined && patch.metadata === undefined)) return confirm();
      return entities.session.commands.run(
        entities.pages,
        id,
        (draft) => {
          if (patch.name !== undefined) draft.name = patch.name;
          if (patch.metadata !== undefined)
            draft.metadata = { ...draft.metadata, ...patch.metadata };
        },
        confirm,
      );
    },
    onSuccess: (page, variables) => {
      if (variables.name !== undefined) refreshTitleMembership(queryClient, [page.id]);
    },
  });
}
export type UpdatePageResult = Awaited<
  ReturnType<NonNullable<ReturnType<typeof defineUpdatePageMutation>["mutationFn"]>>
>;
export function updatePage(
  context: ClientOperationContext,
  input: UpdatePageInput,
): Promise<UpdatePageResult> {
  return runClientMutation(context, input, defineUpdatePageMutation);
}

export type DeletePageResult = {
  deletedDatabaseIds: string[];
  deletedPageIds: string[];
  page: Page | null;
};

export type RestorePageResult = {
  page: Page;
  restoredDatabaseIds: string[];
  restoredPageIds: string[];
};

function defineDeletePageMutation(context: ClientOperationContext) {
  const { apiFetch, queryClient } = context;

  return clientMutation({
    mutationFn: async (pageId: string) => {
      const client = sharedClient(queryClient);
      const read = await client.captureRead();
      const result = await apiFetch<DeletePageResult>(`/pages/${pageId}`, {
        method: "DELETE",
      });
      if (!client.isCurrent(read)) throw new Error("Page deletion belongs to an expired scope");
      await invalidateDeletedItems({
        workspaceId: result.page?.workspaceId,
        queryClient,
        result,
        isCurrent: () => client.isCurrent(read),
      });
      return result;
    },
  });
}
export type DeletePageInput = Parameters<
  NonNullable<ReturnType<typeof defineDeletePageMutation>["mutationFn"]>
>[0];
export function deletePage(
  context: ClientOperationContext,
  input: DeletePageInput,
): Promise<DeletePageResult> {
  return runClientMutation(context, input, defineDeletePageMutation);
}

function defineRestorePageMutation(context: ClientOperationContext) {
  const { apiFetch, queryClient } = context;

  return clientMutation({
    mutationFn: async (pageId: string) => {
      const client = sharedClient(queryClient);
      const read = await client.captureRead();
      const result = await apiFetch<RestorePageResult>(`/pages/${pageId}/restore`, {
        method: "POST",
      });
      if (!client.isCurrent(read)) throw new Error("Page restoration belongs to an expired scope");
      await invalidateRestoredItems({
        workspaceId: result.page.workspaceId,
        queryClient,
        result,
        isCurrent: () => client.isCurrent(read),
      });
      setPageDetailCache(queryClient, result.page, read);
      return result;
    },
  });
}
export type RestorePageInput = Parameters<
  NonNullable<ReturnType<typeof defineRestorePageMutation>["mutationFn"]>
>[0];
export function restorePage(
  context: ClientOperationContext,
  input: RestorePageInput,
): Promise<RestorePageResult> {
  return runClientMutation(context, input, defineRestorePageMutation);
}

function resolveUpdatedPage(
  pagePatch: UpdatePageResponse["page"],
  variables: UpdatePageInput,
  current: Page | undefined,
): Page | null {
  if ("content" in pagePatch) return pagePatch;
  if (!current) return null;
  return {
    ...current,
    ...pagePatch,
    ...(variables.content !== undefined
      ? {
          content: variables.content,
          hasContent: hasPageBodyContent(variables.content),
        }
      : {}),
  };
}
