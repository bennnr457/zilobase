import type { Dispatch, SetStateAction } from "react";
import { createDatabaseViewCommands } from "@zilobase/features/databases/models";

type DomainInput = Parameters<typeof createDatabaseViewCommands>[0];
export type DatabaseViewCommands = ReturnType<typeof getDatabaseViewCommands>;
export function getDatabaseViewCommands(
  input: Omit<DomainInput, "onViewCreated" | "onSortsChanged"> & {
    copyViewLink: (databaseId: string) => Promise<void> | undefined;
    setActiveViewId: Dispatch<SetStateAction<string | null>>;
    setFilterPickerOpen: Dispatch<SetStateAction<boolean>>;
    setShowFilterPill: Dispatch<SetStateAction<boolean>>;
    setShowSortPill: Dispatch<SetStateAction<boolean>>;
    setSortPickerOpen: Dispatch<SetStateAction<boolean>>;
  },
) {
  const {
    copyViewLink,
    setActiveViewId,
    setFilterPickerOpen,
    setShowFilterPill,
    setShowSortPill,
    setSortPickerOpen,
    ...domain
  } = input;
  const commands = createDatabaseViewCommands({
    ...domain,
    onViewCreated: setActiveViewId,
    onSortsChanged: setShowSortPill,
  });
  return {
    ...commands,
    createDatabaseSort(field: string) {
      commands.createDatabaseSort(field);
      setSortPickerOpen(false);
    },
    createDatabaseFilter(field: string) {
      commands.createDatabaseFilter(field);
      setShowFilterPill(true);
      setFilterPickerOpen(false);
    },
    toggleSortPillVisibility: () => setShowSortPill((visible) => !visible),
    toggleFilterPillVisibility: () => setShowFilterPill((visible) => !visible),
    copyDatabaseViewLink() {
      if (!domain.databaseId) return;
      void copyViewLink(domain.databaseId)
        ?.then(() => domain.notify.success("Copied link to view"))
        .catch(() => domain.notify.error("Couldn't copy link to view"));
    },
  };
}
