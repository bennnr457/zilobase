import { useState, type ComponentProps, type ReactNode } from "react";
import { Check, Minus } from "@/components/icons";
import { cn } from "@/lib/utils";
import { ButtonGroupItem } from "@/components/ui/button-group";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

import { DatabasePropertyDate } from "../../../properties/editors/components/database-property-date";
import { DatabasePropertySelect } from "../../../properties/editors/components/database-property-select";
import { defaultStatusOption, defaultStatusOptions } from "@zilobase/features/databases";
import {
  getDatabasePropertyCellKind,
  getDatabasePropertyType,
} from "../../../properties/lib/property-catalog";
import type { DatabasePropertyValue as DatabasePropertyValueType } from "@zilobase/features/databases";
import { getPersonLimit } from "@zilobase/features/databases";
import type { DatabasePropertyListItem } from "@zilobase/features/databases";

function DatabaseSelectionPropertyTrigger({
  className,
  disabled = false,
  property,
  ...buttonProps
}: {
  property: DatabasePropertyListItem;
} & Omit<ComponentProps<typeof ButtonGroupItem>, "property">) {
  const PropertyIcon = getDatabasePropertyType(property.property.type).icon;

  return (
    <ButtonGroupItem
      aria-label={`Edit ${property.property.name} for selected rows`}
      className={cn("[&_span]:max-w-36 [&_span]:truncate", className)}
      disabled={disabled}
      title={disabled ? "This property can't be edited in bulk" : undefined}
      type="button"
      variant="ghost"
      {...buttonProps}
    >
      <PropertyIcon />
      <span>{property.property.name}</span>
    </ButtonGroupItem>
  );
}

export function DatabaseSelectionPropertyAction({
  mixed,
  onApply,
  onOpenChange,
  onUpdateConfig,
  open,
  personOptions,
  property,
  trigger: customTrigger,
  value,
}: {
  mixed: boolean;
  onApply: (value: DatabasePropertyValueType) => void;
  onOpenChange?: (open: boolean) => void;
  onUpdateConfig: (databasePropertyId: string, config: unknown) => Promise<unknown>;
  open?: boolean;
  personOptions: Array<{ id: string; name: string; suffix?: string }>;
  property: DatabasePropertyListItem;
  trigger?: ReactNode;
  value: DatabasePropertyValueType;
}) {
  const [inputOpen, setInputOpen] = useState(false);
  const [draftValue, setDraftValue] = useState(
    mixed ? "" : Array.isArray(value) ? (value[0] ?? "") : value,
  );
  const pageProperty = property.property;
  const cellKind = getDatabasePropertyCellKind(pageProperty.type);
  const scalarValue = Array.isArray(value) ? (value[0] ?? "") : value;
  const resolvedInputOpen = open ?? inputOpen;
  const trigger = customTrigger ?? <DatabaseSelectionPropertyTrigger property={property} />;

  if (cellKind === "select" || cellKind === "person") {
    const multiple =
      pageProperty.type === "multi_select" ||
      (cellKind === "person" && getPersonLimit(pageProperty.config) !== "one_person");
    const selectionValue =
      pageProperty.type === "status" && !mixed && !value ? defaultStatusOption.name : value;

    return (
      <DatabasePropertySelect
        allowCreate={cellKind !== "person"}
        defaultOptions={
          pageProperty.type === "status"
            ? defaultStatusOptions
            : cellKind === "person"
              ? personOptions
              : undefined
        }
        label={pageProperty.name}
        multiple={multiple}
        open={open}
        onOpenChange={onOpenChange}
        onPropertyConfigChange={(config) => onUpdateConfig(property.id, config)}
        onSelect={onApply}
        propertyConfig={pageProperty.config}
        showStatusDot={pageProperty.type === "status"}
        trigger={trigger}
        value={selectionValue}
        valueKey={cellKind === "person" ? "id" : "name"}
      />
    );
  }

  if (cellKind === "date") {
    return (
      <DatabasePropertyDate
        label={pageProperty.name}
        open={open}
        onOpenChange={onOpenChange}
        onPropertyConfigChange={(config) => onUpdateConfig(property.id, config)}
        onSelect={onApply}
        propertyConfig={pageProperty.config}
        trigger={trigger}
        value={value}
      />
    );
  }

  if (cellKind === "checkbox") {
    return (
      <Popover open={open} onOpenChange={onOpenChange}>
        <PopoverTrigger asChild>{trigger}</PopoverTrigger>
        <PopoverContent align="start" className="w-48 p-1" sideOffset={4}>
          {[
            { icon: Check, label: "Checked", value: "true" },
            { icon: Minus, label: "Unchecked", value: "false" },
          ].map((option) => {
            const OptionIcon = option.icon;
            const isCurrent = !mixed && scalarValue === option.value;

            return (
              <button
                className="database-selection-value-option"
                key={option.value}
                onClick={() => onApply(option.value)}
                type="button"
              >
                <OptionIcon />
                <span>{option.label}</span>
                {isCurrent ? <Check className="ml-auto" /> : null}
              </button>
            );
          })}
        </PopoverContent>
      </Popover>
    );
  }

  if (cellKind !== "input") {
    return customTrigger ?? <DatabaseSelectionPropertyTrigger disabled property={property} />;
  }

  return (
    <Popover
      open={resolvedInputOpen}
      onOpenChange={(nextOpen) => {
        if (open === undefined) setInputOpen(nextOpen);
        onOpenChange?.(nextOpen);

        if (nextOpen) {
          setDraftValue(mixed ? "" : scalarValue);
        }
      }}
    >
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent align="start" className="w-72 p-2" sideOffset={4}>
        <form
          className="flex gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            onApply(draftValue);
            if (open === undefined) setInputOpen(false);
            onOpenChange?.(false);
          }}
        >
          <Input
            aria-label={`${pageProperty.name} value for selected rows`}
            autoFocus
            onChange={(event) => setDraftValue(event.target.value)}
            placeholder={mixed ? "Replace mixed values" : "Enter a value"}
            type={pageProperty.type === "number" ? "number" : "text"}
            value={draftValue}
          />
          <button className="database-selection-apply" type="submit">
            Apply
          </button>
        </form>
      </PopoverContent>
    </Popover>
  );
}
