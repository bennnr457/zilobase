import { sharedClient } from "../data/client";
import { setPageDetailCache } from "../shared/item-action-cache";
import type { ClientOperationContext } from "../shared/operation-context";
import { clientMutation, runClientMutation } from "../shared/operation-mutation";
import { readCachedPage, updatePageContexts, type PageDetailReference } from "./cache";
import type { Page } from "./contracts";
import type { NavItemKind } from "./item-relationships";
import { pagesQueryKey } from "./queries";
export type SetPageFavoriteInput = {
  isFavorite: boolean;
  pageId: string;
};

export type RecordItemVisitInput = {
  itemId: string;
  itemKind: "database" | "page";
  workspaceId: string;
};

function defineSetPageFavoriteMutation(context: ClientOperationContext) {
  const { apiFetch, queryClient } = context;
  return clientMutation({
    mutationFn: async ({ isFavorite, pageId }: SetPageFavoriteInput) => {
      const cache = sharedClient(queryClient);
      const detail = queryClient.getQueryData<PageDetailReference>(["page", pageId]);
      const owner = detail
        ? cache.get(detail.page.cacheId)
        : cache
            .all()
            .find(
              (entity) =>
                entity.session.scope.viewer.kind === "account" &&
                entity.pages.collection.base.has(pageId),
            );
      const read = await cache.captureRead(owner?.session.id);
      const send = async () => {
        const result = await apiFetch<{ page: Page }>(`/pages/${pageId}/favorite`, {
          method: isFavorite ? "PUT" : "DELETE",
        });
        setPageDetailCache(queryClient, result.page, read);
        updatePageContexts(queryClient, pageId, { isFavorite: result.page.isFavorite }, read);
        return result.page;
      };
      return owner?.navigation.pagePreferences.get(pageId)
        ? owner.session.commands.run(
            owner.navigation.pagePreferences,
            pageId,
            (draft) => {
              draft.isFavorite = isFavorite;
            },
            send,
          )
        : send();
    },
  });
}
export type SetPageFavoriteResult = Awaited<
  ReturnType<NonNullable<ReturnType<typeof defineSetPageFavoriteMutation>["mutationFn"]>>
>;
export function setPageFavorite(
  context: ClientOperationContext,
  input: SetPageFavoriteInput,
): Promise<SetPageFavoriteResult> {
  return runClientMutation(context, input, defineSetPageFavoriteMutation);
}

function defineRecordItemVisitMutation(context: ClientOperationContext) {
  const { apiFetch, queryClient } = context;

  return clientMutation({
    mutationFn: async (input: RecordItemVisitInput) => {
      const read = await sharedClient(queryClient).captureRead();
      const result = await apiFetch<{
        itemId: string;
        itemKind: RecordItemVisitInput["itemKind"];
        lastVisitedAt: string;
      }>("/pages/item-visits", { method: "POST", body: JSON.stringify(input) });
      if (!sharedClient(queryClient).isCurrent(read)) throw new Error("Expired visit confirmation");
      const variables = input;
      if (result.itemKind === "page")
        updatePageContexts(
          queryClient,
          result.itemId,
          { lastVisitedAt: result.lastVisitedAt },
          read,
        );
      else
        for (const owner of sharedClient(queryClient).all()) {
          if (
            owner.session.scope.viewer.kind !== "account" ||
            owner.session.scope.workspaceId !== variables.workspaceId ||
            !owner.databases.hosts.collection.base.has(result.itemId)
          )
            continue;
          owner.session.ingest([
            owner.navigation.databaseContexts.stage([
              {
                id: result.itemId,
                readSequence: read.sequence,
                context: { lastVisitedAt: result.lastVisitedAt },
              },
            ]),
          ]);
        }
      return result;
    },
  });
}
export type RecordItemVisitResult = Awaited<
  ReturnType<NonNullable<ReturnType<typeof defineRecordItemVisitMutation>["mutationFn"]>>
>;
export function recordItemVisit(
  context: ClientOperationContext,
  input: RecordItemVisitInput,
): Promise<RecordItemVisitResult> {
  return runClientMutation(context, input, defineRecordItemVisitMutation);
}

function defineMovePageToTeamspaceMutation(context: ClientOperationContext) {
  const { apiFetch, queryClient } = context;

  return clientMutation({
    mutationFn: (input: { pageId: string; teamspaceId: string | null; workspaceId: string }) =>
      apiFetch<{ movedPageIds: string[]; teamspaceId: string | null }>(
        `/pages/${encodeURIComponent(input.pageId)}/move-teamspace`,
        {
          body: JSON.stringify({ teamspaceId: input.teamspaceId }),
          method: "POST",
        },
      ),
    onSuccess: async (_result, input) => {
      await queryClient.invalidateQueries({
        queryKey: pagesQueryKey(input.workspaceId),
      });
    },
  });
}
export type MovePageToTeamspaceInput = Parameters<
  NonNullable<ReturnType<typeof defineMovePageToTeamspaceMutation>["mutationFn"]>
>[0];
export type MovePageToTeamspaceResult = Awaited<
  ReturnType<NonNullable<ReturnType<typeof defineMovePageToTeamspaceMutation>["mutationFn"]>>
>;
export function movePageToTeamspace(
  context: ClientOperationContext,
  input: MovePageToTeamspaceInput,
): Promise<MovePageToTeamspaceResult> {
  return runClientMutation(context, input, defineMovePageToTeamspaceMutation);
}

function defineConvertPageToTeamspaceMutation(context: ClientOperationContext) {
  const { apiFetch, queryClient } = context;
  return clientMutation({
    mutationFn: (input: {
      accessMode?: "open" | "closed" | "private";
      name?: string;
      pageId: string;
      workspaceId: string;
    }) =>
      apiFetch<{ teamspace: { id: string; name: string } }>(
        `/pages/${encodeURIComponent(input.pageId)}/convert-to-teamspace`,
        {
          body: JSON.stringify({ accessMode: input.accessMode, name: input.name }),
          method: "POST",
        },
      ),
    onSuccess: async (_result, input) => {
      await queryClient.invalidateQueries({ queryKey: pagesQueryKey(input.workspaceId) });
      await queryClient.invalidateQueries({
        queryKey: ["workspace", input.workspaceId, "teamspaces"],
      });
    },
  });
}
export type ConvertPageToTeamspaceInput = Parameters<
  NonNullable<ReturnType<typeof defineConvertPageToTeamspaceMutation>["mutationFn"]>
>[0];
export type ConvertPageToTeamspaceResult = Awaited<
  ReturnType<NonNullable<ReturnType<typeof defineConvertPageToTeamspaceMutation>["mutationFn"]>>
>;
export function convertPageToTeamspace(
  context: ClientOperationContext,
  input: ConvertPageToTeamspaceInput,
): Promise<ConvertPageToTeamspaceResult> {
  return runClientMutation(context, input, defineConvertPageToTeamspaceMutation);
}

export type EmbedPageItemInput = {
  hostPageId: string;
  itemId: string;
  kind: NavItemKind;
  placementId?: string;
};

function defineEmbedPageItemMutation(context: ClientOperationContext) {
  const { apiFetch, queryClient } = context;

  return clientMutation({
    mutationFn: async ({ hostPageId, itemId, kind }: EmbedPageItemInput) =>
      apiFetch<{ action: string; host: Page; placementId: string | null }>(
        `/pages/${hostPageId}/embed-item`,
        {
          method: "POST",
          body: JSON.stringify({ itemId, kind }),
        },
      ),
    onSuccess: (result) => {
      // The embed is saved. Refresh navigation without delaying editor updates.
      void queryClient
        .invalidateQueries({
          queryKey: pagesQueryKey(result.host.workspaceId),
        })
        .catch(() => {
          // A failed refresh must not turn a committed embed into a failed mutation.
        });
    },
  });
}
export type EmbedPageItemResult = Awaited<
  ReturnType<NonNullable<ReturnType<typeof defineEmbedPageItemMutation>["mutationFn"]>>
>;
export function embedPageItem(
  context: ClientOperationContext,
  input: EmbedPageItemInput,
): Promise<EmbedPageItemResult> {
  return runClientMutation(context, input, defineEmbedPageItemMutation);
}

function defineRemovePageEmbedMutation(context: ClientOperationContext) {
  const { apiFetch, queryClient } = context;

  return clientMutation({
    mutationFn: async ({ hostPageId, itemId, kind, placementId }: EmbedPageItemInput) =>
      apiFetch<{ action: string }>(`/pages/${hostPageId}/embed-item`, {
        method: "DELETE",
        body: JSON.stringify({ itemId, kind, placementId }),
      }),
    onSuccess: async (_result, variables) => {
      const host = readCachedPage(queryClient, variables.hostPageId);

      if (host) {
        await queryClient.invalidateQueries({
          queryKey: pagesQueryKey(host.workspaceId),
        });
      }
    },
  });
}
export type RemovePageEmbedInput = Parameters<
  NonNullable<ReturnType<typeof defineRemovePageEmbedMutation>["mutationFn"]>
>[0];
export type RemovePageEmbedResult = Awaited<
  ReturnType<NonNullable<ReturnType<typeof defineRemovePageEmbedMutation>["mutationFn"]>>
>;
export function removePageEmbed(
  context: ClientOperationContext,
  input: RemovePageEmbedInput,
): Promise<RemovePageEmbedResult> {
  return runClientMutation(context, input, defineRemovePageEmbedMutation);
}
