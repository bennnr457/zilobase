import { loadWorkspacePageGraph } from "../graph/loader";
export const getNestedFavoriteTargetIds = async (
  rootPageId: string,
  workspaceId: string,
  accessibleIds: Set<string>,
) => {
  const graph = await loadWorkspacePageGraph(workspaceId);
  const pageIds = graph.getNestedPageIds(rootPageId, accessibleIds);

  return {
    databaseIds: graph.getDatabaseIdsForPageIds(pageIds, accessibleIds),
    pageIds,
  };
};
