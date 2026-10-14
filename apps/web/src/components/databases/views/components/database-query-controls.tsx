import { Filter, ArrowDownUp } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { DropDrawer, DropDrawerContent, DropDrawerTrigger } from "@/components/ui/dropdrawer";
import { DatabaseSearchableMenuItems } from "./database-searchable-menu-items";
import {
  useDatabaseActionsContext,
  useDatabaseDataContext,
  useDatabaseUiContext,
} from "../state/database-view-context";
export function DatabaseFilterControl() {
  const { createDatabaseFilter, setFilterPickerOpen, toggleFilterPillVisibility } =
    useDatabaseActionsContext();
  const { activeDatabaseFilters, filterFieldOptions } = useDatabaseDataContext();
  const { filterPickerOpen, showFilterPill } = useDatabaseUiContext();
  return activeDatabaseFilters.length === 0 ? (
    <DropDrawer open={filterPickerOpen} onOpenChange={setFilterPickerOpen}>
      <DropDrawerTrigger asChild>
        <Button
          aria-label="Add filter"
          className="text-content-secondary"
          size="icon"
          type="button"
          variant="ghost"
        >
          <Filter />
        </Button>
      </DropDrawerTrigger>
      <DropDrawerContent
        align="start"
        className="w-72"
        onCloseAutoFocus={(event) => event.preventDefault()}
      >
        <DatabaseSearchableMenuItems
          inputAriaLabel="Filter properties"
          inputIcon={<Filter className="size-4" />}
          inputPlaceholder="Filter by..."
          onSelect={createDatabaseFilter}
          open={filterPickerOpen}
          options={filterFieldOptions}
        />
      </DropDrawerContent>
    </DropDrawer>
  ) : (
    <Button
      aria-label={showFilterPill ? "Hide filter pill" : "Show filter pill"}
      className="text-action-primary hover:text-action-primary active:text-action-primary aria-expanded:text-action-primary"
      onClick={toggleFilterPillVisibility}
      size="icon"
      type="button"
      variant="ghost"
    >
      <Filter />
    </Button>
  );
}

export function DatabaseSortControl() {
  const { createDatabaseSort, setSortPickerOpen, toggleSortPillVisibility } =
    useDatabaseActionsContext();
  const { activeDatabaseSorts, sortFieldOptions } = useDatabaseDataContext();
  const { showSortPill, sortPickerOpen } = useDatabaseUiContext();
  return activeDatabaseSorts.length === 0 ? (
    <DropDrawer open={sortPickerOpen} onOpenChange={setSortPickerOpen}>
      <DropDrawerTrigger asChild>
        <Button
          aria-label="Add sort"
          className="text-content-secondary"
          size="icon"
          type="button"
          variant="ghost"
        >
          <ArrowDownUp />
        </Button>
      </DropDrawerTrigger>
      <DropDrawerContent
        align="start"
        className="w-72"
        onCloseAutoFocus={(event) => event.preventDefault()}
      >
        <DatabaseSearchableMenuItems
          inputAriaLabel="Sort properties"
          inputIcon={<ArrowDownUp className="size-4" />}
          inputPlaceholder="Sort by..."
          onSelect={createDatabaseSort}
          open={sortPickerOpen}
          options={sortFieldOptions}
        />
      </DropDrawerContent>
    </DropDrawer>
  ) : (
    <Button
      aria-label={showSortPill ? "Hide sort pill" : "Show sort pill"}
      className="text-action-primary hover:text-action-primary active:text-action-primary aria-expanded:text-action-primary"
      onClick={toggleSortPillVisibility}
      size="icon"
      type="button"
      variant="ghost"
    >
      <ArrowDownUp />
    </Button>
  );
}
