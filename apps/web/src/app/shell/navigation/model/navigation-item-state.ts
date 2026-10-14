export function getNavigationPendingState(
  item: {
    isDatabase: boolean;
    hasDatabase: boolean;
    hasPage: boolean;
    hasPageId: boolean;
  },
  pending: {
    userSettings: boolean;
    pageUpdate: boolean;
    databaseUpdate: boolean;
    pageDelete: boolean;
    databaseDelete: boolean;
    pageFavorite: boolean;
    databaseFavorite: boolean;
  },
) {
  return {
    fullWidthUpdatePending: pending.userSettings || pending.pageUpdate,
    isDeleting: pending.pageDelete || pending.databaseDelete,
    lockUpdatePending: item.isDatabase ? pending.databaseUpdate : pending.pageUpdate,
    favoriteDisabled: item.isDatabase
      ? !item.hasDatabase || pending.databaseFavorite
      : !item.hasPageId || pending.pageFavorite,
    aiModeDisabled: !item.hasPage || pending.pageUpdate,
  };
}
