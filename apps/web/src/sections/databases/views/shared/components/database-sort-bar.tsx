import { ButtonGroup } from "@/components/ui/button-group";
import type { DatabaseSortDirection } from "@zilobase/features/databases";
import { ArrowDownUp, Plus, X } from "@/components/icons";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { DropDrawer, DropDrawerContent, DropDrawerTrigger } from "@/components/ui/dropdrawer";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import type { DatabaseSortMenuProps } from "./database-sort-menu";
import { DatabaseSearchableMenuItems } from "./database-searchable-menu-items";

const chipControlClassName =
  "h-7 min-w-0 max-w-36 rounded-none border-0 bg-transparent px-2 text-xs shadow-none hover:bg-action-neutral-pressed focus-visible:ring-inset";

export function DatabaseSortBar({
  activeDatabaseSorts,
  addableSortFieldOptions,
  canAddDatabaseSort,
  onCreateDatabaseSort,
  onRemoveDatabaseSort,
  onUpdateDatabaseSort,
  sortFieldOptions,
}: DatabaseSortMenuProps) {
  const [pickerOpen, setPickerOpen] = useState(false);

  return (
    <div
      aria-label="Database sorts"
      className="flex min-w-0 flex-wrap items-center gap-2"
      role="group"
    >
      {activeDatabaseSorts.map((sort, index) => {
        const availableSortOptions = sortFieldOptions.filter(
          (option) =>
            option.value === sort.column ||
            !activeDatabaseSorts.some((active) => active.column === option.value),
        );

        return (
          <ButtonGroup
            aria-label={`${sort.label} sort`}
            variant="segmented"
            key={sort.column}
            role="group"
          >
            <Select
              onValueChange={(column) => onUpdateDatabaseSort(index, { column })}
              value={sort.column}
            >
              <SelectTrigger
                aria-label={`${sort.label} sort property`}
                className={chipControlClassName}
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent align="start">
                {availableSortOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.icon ?? <ArrowDownUp className="size-3.5" />}
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              onValueChange={(direction) =>
                onUpdateDatabaseSort(index, { direction: direction as DatabaseSortDirection })
              }
              value={sort.direction}
            >
              <SelectTrigger
                aria-label={`${sort.label} sort direction`}
                className={`${chipControlClassName} text-content-secondary`}
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent align="start">
                <SelectItem value="ascending">Ascending</SelectItem>
                <SelectItem value="descending">Descending</SelectItem>
              </SelectContent>
            </Select>
            <button
              aria-label={`Remove ${sort.label} sort`}
              className="flex size-7 shrink-0 items-center justify-center text-content-secondary transition-colors hover:bg-action-neutral-pressed hover:text-content-primary focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-action-focus-ring focus-visible:outline-none"
              onClick={() => onRemoveDatabaseSort(index)}
              type="button"
            >
              <X className="size-3.5" />
            </button>
          </ButtonGroup>
        );
      })}
      {canAddDatabaseSort ? (
        <DropDrawer open={pickerOpen} onOpenChange={setPickerOpen}>
          <DropDrawerTrigger asChild>
            <Button
              aria-label="Add another sort"
              className="h-7 gap-1.5 text-xs text-content-secondary"
              type="button"
              variant="ghost"
            >
              <Plus className="size-3.5" />
              Add sort
            </Button>
          </DropDrawerTrigger>
          <DropDrawerContent
            align="start"
            className="w-72"
            onCloseAutoFocus={(event) => event.preventDefault()}
          >
            <DatabaseSearchableMenuItems
              emptyMessage="No properties available."
              inputAriaLabel="Add sort property"
              inputPlaceholder="Sort by..."
              onSelect={(field) => {
                onCreateDatabaseSort(field);
                setPickerOpen(false);
              }}
              open={pickerOpen}
              options={addableSortFieldOptions}
            />
          </DropDrawerContent>
        </DropDrawer>
      ) : null}
    </div>
  );
}
