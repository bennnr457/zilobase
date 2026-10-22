import {
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
  type HTMLAttributes,
} from "react";
import { useAppSearchResults } from "@zilobase/features/search/react";
import type { AppSearchResult } from "@zilobase/features/search";
import { PageIconDisplay } from "@/sections/pages/appearance/components/page-icon";
import { Popover, PopoverAnchor, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { DEFAULT_DATABASE_ITEM_ICON, DEFAULT_PAGE_ITEM_ICON } from "../lib/navigation-icons";
import { PageDatabasePicker } from "./page-database-picker";

type SearchInputProps = Pick<
  HTMLAttributes<HTMLElement>,
  "aria-controls" | "aria-expanded" | "aria-autocomplete" | "aria-activedescendant" | "onKeyDown"
>;

type PageDatabaseSearchPopoverProps = {
  workspaceId: string | null;
  /** Defaults to both. Filtering is applied to the server requests. */
  types?: ("page" | "database")[];
  onSelect: (item: AppSearchResult) => void;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Supply a query and input ref for an inline mention picker. */
  query?: string;
  inputRef?: RefObject<HTMLElement | null>;
  children: ReactNode | ((inputProps: SearchInputProps) => ReactNode);
  side?: "top" | "bottom" | "left" | "right";
};

export function PageDatabaseSearchPopover({
  workspaceId,
  types = ["database", "page"],
  onSelect,
  open: controlledOpen,
  onOpenChange,
  query: externalQuery,
  inputRef,
  children,
  side = "bottom",
}: PageDatabaseSearchPopoverProps) {
  const [internalOpen, setInternalOpen] = useState(false);
  const [internalQuery, setInternalQuery] = useState("");
  const [selected, setSelected] = useState(0);
  const open = controlledOpen ?? internalOpen;
  const inline = typeof children === "function";
  const query = externalQuery ?? internalQuery;
  const [debouncedQuery, setDebouncedQuery] = useState(query);
  const list = useRef<HTMLDivElement>(null);
  const activeOption = useRef<HTMLDivElement>(null);
  const [listId, setListId] = useState<string>();
  const [activeOptionId, setActiveOptionId] = useState<string>();
  const changeOpen = (value: boolean) => {
    setInternalOpen(value);
    if (!value) setInternalQuery("");
    onOpenChange?.(value);
  };
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query), 180);
    return () => clearTimeout(timer);
  }, [query]);
  useEffect(() => setSelected(0), [query, open, workspaceId]);

  // Separate requests prevent pages from exhausting the shared search limit.
  const databases = useAppSearchResults(
    workspaceId,
    debouncedQuery,
    open && types.includes("database"),
    ["database"],
    "keyword",
  );
  const pages = useAppSearchResults(
    workspaceId,
    debouncedQuery,
    open && types.includes("page"),
    ["page"],
    "keyword",
  );
  const groups = [
    { type: "database" as const, heading: "Databases", search: databases },
    { type: "page" as const, heading: "Pages", search: pages },
  ]
    .filter((group) => types.includes(group.type))
    .map(({ type, heading, search }) => {
      const items = query === debouncedQuery ? (search.data ?? []).slice(0, 8) : [];
      const error = search.isError && query === debouncedQuery;
      return {
        heading,
        options: items.map((item) => ({
          value: `${item.type}:${item.id}`,
          label: item.title.trim() || "Untitled",
          detail: type === "database" ? "Database" : "Page",
          item,
          icon: (
            <PageIconDisplay
              size="sm"
              value={
                item.emoji ??
                (type === "database" ? DEFAULT_DATABASE_ITEM_ICON : DEFAULT_PAGE_ITEM_ICON)
              }
            />
          ),
        })),
        emptyContent: (
          <p role={error ? "alert" : "status"} className="px-2 py-3 text-xs text-content-secondary">
            {error
              ? `Could not search ${heading.toLowerCase()}. Try again.`
              : search.isFetching || query !== debouncedQuery
                ? "Searching…"
                : `No matching ${heading.toLowerCase()}`}
          </p>
        ),
      };
    });
  const options = groups.flatMap((group) => group.options);
  const selectedIndex = Math.min(selected, options.length - 1);
  const selectedValue = options[selectedIndex]?.value;
  useEffect(() => {
    setListId(open ? list.current?.id : undefined);
    setActiveOptionId(open ? activeOption.current?.id : undefined);
    activeOption.current?.scrollIntoView({ block: "nearest" });
  }, [open, selectedValue]);
  const choose = (item: AppSearchResult) => {
    onSelect(item);
    changeOpen(false);
  };
  const inputProps: SearchInputProps = {
    "aria-controls": listId,
    "aria-expanded": open,
    "aria-autocomplete": "list",
    "aria-activedescendant": activeOptionId,
    onKeyDown: (event) => {
      if (!open || event.nativeEvent.isComposing) return;
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        changeOpen(false);
      } else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        setSelected(
          Math.max(
            0,
            Math.min(options.length - 1, selectedIndex + (event.key === "ArrowDown" ? 1 : -1)),
          ),
        );
      } else if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        const option = options[selectedIndex];
        if (option) choose(option.item);
      }
    },
  };
  const label =
    types.length === 1
      ? `Search ${types[0] === "page" ? "pages" : "databases"}`
      : "Search pages and databases";
  return (
    <Popover open={open} onOpenChange={changeOpen}>
      {typeof children === "function" ? (
        <PopoverAnchor asChild>{children(inputProps)}</PopoverAnchor>
      ) : (
        <PopoverTrigger asChild>{children}</PopoverTrigger>
      )}
      <PopoverContent
        side={side}
        align="start"
        sideOffset={8}
        variant="menu"
        width="xl"
        padding="none"
        aria-label={label}
        onOpenAutoFocus={inline ? (event) => event.preventDefault() : undefined}
        onCloseAutoFocus={inline ? (event) => event.preventDefault() : undefined}
        onInteractOutside={(event) => {
          if (inputRef?.current?.contains(event.target as Node)) event.preventDefault();
        }}
      >
        <PageDatabasePicker
          ariaLabel={label}
          emptyMessage="No matching pages or databases"
          loadingMessage="Searching…"
          placeholder={`${label}…`}
          filterOptions={false}
          groups={groups}
          query={query}
          onQueryChange={setInternalQuery}
          onSelect={(option) => choose(option.item)}
          hideSearchInput={inline}
          activeValue={inline ? (selectedValue ?? "") : undefined}
          onActiveValueChange={
            inline
              ? (value) => {
                  const index = options.findIndex((option) => option.value === value);
                  if (index >= 0) setSelected(index);
                }
              : undefined
          }
          listRef={list}
          activeOptionRef={activeOption}
        />
      </PopoverContent>
    </Popover>
  );
}
