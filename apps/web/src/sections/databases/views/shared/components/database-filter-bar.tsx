import { ButtonGroup } from "@/components/ui/button-group";
import {
  conditionOperatorNeedsValue,
  getDatabaseFilterOperatorsForType,
  getNextConditionValuesForOperator,
  isDateLikePropertyType,
  parseRelativeDateFilterValue,
  type DatabaseActiveFilter,
  type DatabaseFilterUpdatePatch,
  type DatabasePropertyFilterOperator,
} from "@zilobase/features/databases";
import { Plus, SlidersHorizontalIcon, X } from "@/components/icons";
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
import { getColorTokenBadgeClassName } from "@/lib/color-tokens";

import type { DatabaseSearchableMenuOption } from "../../lib/menu-option-contracts";
import { DatabaseConditionValueControl } from "./database-condition-editor";
import { DatabaseFilterPopover, type DatabaseFilterMenuProps } from "./database-filter-menu";
import { DatabaseSearchableMenuItems } from "./database-searchable-menu-items";

const chipControlClassName =
  "h-7 min-w-0 max-w-36 rounded-none border-0 bg-transparent px-2 text-xs shadow-none hover:bg-action-neutral-pressed focus-visible:ring-inset";

function DatabaseFilterChip({
  filter,
  fieldOptions,
  valueOptions,
  onRemove,
  onUpdate,
}: {
  filter: DatabaseActiveFilter;
  fieldOptions: DatabaseSearchableMenuOption[];
  valueOptions: DatabaseSearchableMenuOption[];
  onRemove: () => void;
  onUpdate: (patch: DatabaseFilterUpdatePatch) => void;
}) {
  const needsValue = conditionOperatorNeedsValue(filter.operator);
  const choiceType = ["multi_select", "person", "select", "status"].includes(filter.propertyType);
  const selectedOptions = filter.values.filter(Boolean).map(
    (value) =>
      valueOptions.find((option) => option.value === value) ?? {
        value,
        label: choiceType
          ? filter.propertyType === "person"
            ? "Unavailable item"
            : "Deleted option"
          : isDateLikePropertyType(filter.propertyType)
            ? value.slice(0, 10)
            : value,
      },
  );
  const relativeDate =
    filter.operator === "is_relative_to_today"
      ? parseRelativeDateFilterValue(filter.values[0])
      : null;

  return (
    <ButtonGroup aria-label={`${filter.label} filter`} variant="segmented" role="group">
      <Select onValueChange={(propertyId) => onUpdate({ propertyId })} value={filter.propertyId}>
        <SelectTrigger
          aria-label={`${filter.label} filter property`}
          className={chipControlClassName}
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent align="start">
          {fieldOptions.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.icon}
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select
        onValueChange={(value) => {
          const operator = value as DatabasePropertyFilterOperator;
          onUpdate({ operator, values: getNextConditionValuesForOperator(filter, operator) });
        }}
        value={filter.operator}
      >
        <SelectTrigger
          aria-label={`${filter.label} filter operator`}
          className={`${chipControlClassName} text-content-secondary`}
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent align="start">
          {getDatabaseFilterOperatorsForType(filter.propertyType).map((operator) => (
            <SelectItem key={operator.value} value={operator.value}>
              {operator.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {needsValue ? (
        <DatabaseConditionValueControl
          condition={filter}
          onUpdate={onUpdate}
          valueOptions={valueOptions}
          trigger={
            <button
              aria-label={`Edit ${filter.label} filter value`}
              className="flex h-7 min-w-0 max-w-60 items-center gap-1 overflow-hidden px-2 text-xs transition-colors hover:bg-action-neutral-pressed focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-action-focus-ring focus-visible:outline-none"
              type="button"
            >
              {relativeDate ? (
                <span className="whitespace-nowrap capitalize">
                  {relativeDate.direction} {relativeDate.unit}
                </span>
              ) : selectedOptions.length > 0 ? (
                <>
                  {selectedOptions.slice(0, 2).map((option, index) => (
                    <span
                      className="flex min-w-0 items-center gap-1"
                      key={`${option.value}-${index}`}
                    >
                      {index > 0 ? (
                        <span className="text-content-secondary">
                          {filter.operator === "is_between" ? "–" : ","}
                        </span>
                      ) : null}
                      <span
                        className={
                          option.color
                            ? `${getColorTokenBadgeClassName(option.color)} max-w-36 truncate`
                            : "max-w-36 truncate"
                        }
                      >
                        {option.label}
                      </span>
                    </span>
                  ))}
                  {selectedOptions.length > 2 ? (
                    <span className="text-content-secondary">+{selectedOptions.length - 2}</span>
                  ) : null}
                </>
              ) : (
                <span className="whitespace-nowrap text-content-secondary">Select value</span>
              )}
            </button>
          }
        />
      ) : null}
      <button
        aria-label={`Remove ${filter.label} filter`}
        className="flex size-7 shrink-0 items-center justify-center text-content-secondary transition-colors hover:bg-action-neutral-pressed hover:text-content-primary focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-action-focus-ring focus-visible:outline-none"
        onClick={onRemove}
        type="button"
      >
        <X className="size-3.5" />
      </button>
    </ButtonGroup>
  );
}

export function DatabaseFilterBar(props: DatabaseFilterMenuProps) {
  const [pickerOpen, setPickerOpen] = useState(false);
  return (
    <div
      aria-label="Database filters"
      className="flex min-w-0 flex-wrap items-center gap-2"
      role="group"
    >
      {props.activeDatabaseFilters.map((filter, index) => (
        <DatabaseFilterChip
          fieldOptions={props.filterFieldOptions.filter(
            (option) =>
              option.value === filter.propertyId ||
              !props.activeDatabaseFilters.some((active) => active.propertyId === option.value),
          )}
          filter={filter}
          key={filter.id}
          onRemove={() => props.onRemoveDatabaseFilter(index)}
          onUpdate={(patch) => props.onUpdateDatabaseFilter(index, patch)}
          valueOptions={props.filterValueOptionsByField[filter.propertyId] ?? []}
        />
      ))}
      {props.canAddDatabaseFilter ? (
        <DropDrawer open={pickerOpen} onOpenChange={setPickerOpen}>
          <DropDrawerTrigger asChild>
            <Button
              aria-label="Add another filter"
              className="h-7 gap-1.5 border border-dashed border-control-border text-xs text-content-secondary"
              type="button"
              variant="ghost"
            >
              <Plus className="size-3.5" />
              Add filter
            </Button>
          </DropDrawerTrigger>
          <DropDrawerContent
            align="start"
            className="w-72"
            onCloseAutoFocus={(event) => event.preventDefault()}
          >
            <DatabaseSearchableMenuItems
              emptyMessage="No properties available."
              inputAriaLabel="Add filter property"
              inputPlaceholder="Filter by..."
              onSelect={(field) => {
                props.onCreateDatabaseFilter(field);
                setPickerOpen(false);
              }}
              open={pickerOpen}
              options={props.addableFilterFieldOptions}
            />
          </DropDrawerContent>
        </DropDrawer>
      ) : null}
      <DatabaseFilterPopover {...props}>
        <Button
          aria-label="Manage filters"
          className="size-7 text-content-secondary"
          size="icon"
          type="button"
          variant="ghost"
        >
          <SlidersHorizontalIcon className="size-3.5" />
        </Button>
      </DatabaseFilterPopover>
      <Button
        className="h-7 px-2 text-xs text-content-secondary"
        onClick={props.onClearDatabaseFilter}
        type="button"
        variant="ghost"
      >
        Clear all
      </Button>
    </div>
  );
}
