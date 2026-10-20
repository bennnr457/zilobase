import { useDeferredValue, useMemo, useState, type ReactNode, type Ref } from "react";

import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Loader2 } from "@/components/icons";
import { cn } from "@/lib/utils";
import {
  filterPageDatabasePickerOptions,
  type PageDatabasePickerSearchOption,
} from "@zilobase/features/databases";

export type PageDatabasePickerOption = PageDatabasePickerSearchOption & {
  description?: string;
  disabled?: boolean;
  icon?: ReactNode;
  detail?: string;
};

export function PageDatabasePicker<TOption extends PageDatabasePickerOption>({
  ariaLabel,
  autoFocus = true,
  className,
  emptyMessage,
  filterOptions = true,
  heading,
  groups,
  hideSearchInput = false,
  activeValue,
  onActiveValueChange,
  listRef,
  activeOptionRef,
  isLoading = false,
  isSearching = false,
  loadingMessage,
  onQueryChange,
  onSelect,
  options = [],
  placeholder,
  query: controlledQuery,
  selectedValues = [],
  trailingContent,
}: {
  ariaLabel: string;
  autoFocus?: boolean;
  className?: string;
  emptyMessage: string;
  filterOptions?: boolean;
  heading?: string;
  groups?: { heading: string; options: TOption[]; emptyContent?: ReactNode }[];
  hideSearchInput?: boolean;
  activeValue?: string;
  onActiveValueChange?: (value: string) => void;
  listRef?: Ref<HTMLDivElement>;
  activeOptionRef?: Ref<HTMLDivElement>;
  isLoading?: boolean;
  isSearching?: boolean;
  loadingMessage: string;
  onQueryChange?: (query: string) => void;
  onSelect: (option: TOption) => void;
  options?: TOption[];
  placeholder: string;
  query?: string;
  selectedValues?: string[];
  trailingContent?: ReactNode;
}) {
  const [internalQuery, setInternalQuery] = useState("");
  const query = controlledQuery ?? internalQuery;
  const deferredQuery = useDeferredValue(query);
  const displayedGroups = useMemo(
    () =>
      (groups ?? [{ heading, options, emptyContent: undefined }]).map((group) => ({
        ...group,
        options: filterOptions
          ? filterPageDatabasePickerOptions(group.options, deferredQuery)
          : group.options,
      })),
    [deferredQuery, filterOptions, groups, heading, options],
  );
  const selected = useMemo(() => new Set(selectedValues), [selectedValues]);
  const updateQuery = (nextQuery: string) => {
    if (controlledQuery === undefined) setInternalQuery(nextQuery);
    onQueryChange?.(nextQuery);
  };

  return (
    <Command
      className={cn("min-h-0", className)}
      shouldFilter={false}
      variant="menu"
      value={activeValue}
      onValueChange={onActiveValueChange}
      onKeyDown={(event) => event.stopPropagation()}
    >
      {!hideSearchInput ? (
        <div className="relative shrink-0">
          <CommandInput
            aria-label={ariaLabel}
            autoFocus={autoFocus}
            className={isSearching ? "pr-6" : undefined}
            onValueChange={updateQuery}
            placeholder={placeholder}
            value={query}
          />
          {isSearching ? (
            <Loader2 className="pointer-events-none absolute right-3 top-1/2 size-3.5 -translate-y-1/2 animate-spin text-content-secondary" />
          ) : null}
        </div>
      ) : null}
      <CommandList
        ref={listRef}
        label={ariaLabel}
        className="max-h-[min(22rem,calc(100dvh-8rem))] min-h-0 overscroll-contain"
      >
        {isLoading ? (
          <div className="flex items-center justify-center gap-2 px-3 py-8 text-xs text-content-secondary">
            <Loader2 className="size-3.5 animate-spin" />
            <span>{loadingMessage}</span>
          </div>
        ) : (
          <>
            {!groups ? <CommandEmpty>{emptyMessage}</CommandEmpty> : null}
            {displayedGroups.map((group) => (
              <CommandGroup key={group.heading ?? "options"} heading={group.heading}>
                {group.options.map((option) => (
                  <CommandItem
                    ref={option.value === activeValue ? activeOptionRef : undefined}
                    onMouseDown={hideSearchInput ? (event) => event.preventDefault() : undefined}
                    data-checked={selected.has(option.value) ? "true" : undefined}
                    disabled={option.disabled}
                    key={option.value}
                    onSelect={() => onSelect(option)}
                    value={option.value}
                  >
                    {option.icon ? (
                      <span className="flex size-4 shrink-0 items-center justify-center text-content-secondary [&_svg]:size-4">
                        {option.icon}
                      </span>
                    ) : null}
                    <span className="min-w-0 flex-1">
                      <span className="block truncate">{option.label}</span>
                      {option.description ? (
                        <span className="block truncate text-[0.6875rem] text-content-secondary">
                          {option.description}
                        </span>
                      ) : null}
                    </span>
                    {option.detail ? (
                      <span data-slot="command-shortcut" className="text-xs text-content-secondary">
                        {option.detail}
                      </span>
                    ) : null}
                  </CommandItem>
                ))}
                {group.options.length === 0 ? group.emptyContent : null}
              </CommandGroup>
            ))}
            {trailingContent}
          </>
        )}
      </CommandList>
    </Command>
  );
}
