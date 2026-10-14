import { sharedClient } from "../data/client";
import { useMutation } from "@tanstack/react-query";
import { useZilobaseFeatures } from "../shared/context";
import { setPageDetailCache } from "../shared/item-action-cache";
import { updatePageContexts, type PageDetailReference, readCachedPage } from "./cache";
import type { Page } from "./contracts";
import type { NavItemKind } from "./item-relationships";
import { pagesQueryKey } from "./queries";
type SetPageFavoriteInput = {
  isFavorite: boolean;
  pageId: string;
};

type RecordItemVisitInput = {
  itemId: string;
  itemKind: "database" | "page";
  workspaceId: string;
};

export function useSetPageFavorite() {
  const { apiFetch, queryClient } = useZilobaseFeatures();
  return useMutation({
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

export function useRecordItemVisit() {
  const { apiFetch, queryClient } = useZilobaseFeatures();

  return useMutation({
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

export function useMovePageToTeamspace() {
  const { apiFetch, queryClient } = useZilobaseFeatures();

  return useMutation({
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

export function useConvertPageToTeamspace() {
  const { apiFetch, queryClient } = useZilobaseFeatures();
  return useMutation({
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

type EmbedPageItemInput = {
  hostPageId: string;
  itemId: string;
  kind: NavItemKind;
  placementId?: string;
};

export function useEmbedPageItem() {
  const { apiFetch, queryClient } = useZilobaseFeatures();

  return useMutation({
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

export function useRemovePageEmbed() {
  const { apiFetch, queryClient } = useZilobaseFeatures();

  return useMutation({
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
