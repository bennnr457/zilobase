import { pageCollaborationTicket, pageQueryOptions } from "@zilobase/features/pages";
import { sessionQueryKey, type SessionResponse } from "@zilobase/features/auth";
import { Effect } from "effect";

import { queryClient } from "@/app/query-client";
import { getConnectivityState } from "@/platform/network/connectivity";
import { apiFetch } from "@/platform/network/api";
import { applyTicketState } from "./collaboration-connection";
import {
  acquirePageDocument,
  markPageDocumentInitialized,
  releasePageDocument,
} from "./page-document-cache";

const pending = new Map<string, Promise<void>>();

export function prefetchPageForNavigation(pageId: string) {
  const userId = queryClient.getQueryData<SessionResponse>(sessionQueryKey)?.user?.id;
  if (!userId || getConnectivityState() !== "online") return;
  const key = `${userId}:${pageId}`;
  if (pending.has(key) || pending.size >= 2) return;
  const task = Promise.allSettled([
    queryClient.prefetchQuery(pageQueryOptions(apiFetch, pageId)),
    prefetchDocument(userId, pageId),
  ]).then(() => undefined);
  pending.set(key, task);
  void task.finally(() => pending.delete(key));
}

async function prefetchDocument(userId: string, pageId: string) {
  return Effect.runPromise(
    Effect.gen(function* () {
      const entry = yield* Effect.tryPromise({
        try: () => acquirePageDocument(userId, pageId),
        catch: (error) => error,
      });
      yield* Effect.gen(function* () {
        if (entry.hasPersistedState) return;
        const ticket = yield* Effect.tryPromise({
          try: () => pageCollaborationTicket(apiFetch, pageId, undefined, true),
          catch: (error) => error,
        });
        yield* Effect.try({
          try: () => applyTicketState(entry.document, ticket),
          catch: (error) => error,
        });
        yield* Effect.tryPromise({ try: () => entry.flush(), catch: (error) => error });
        if (entry.persistenceError) return;
        yield* Effect.tryPromise({
          try: () => markPageDocumentInitialized(entry),
          catch: (error) => error,
        });
      }).pipe(
        Effect.exit,
        Effect.ensuring(Effect.sync(() => releasePageDocument(entry))),
        Effect.flatMap((exit) => exit),
      );
    }),
  );
}
