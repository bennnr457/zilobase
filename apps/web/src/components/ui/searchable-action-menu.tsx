import { useRef, type ComponentProps } from "react";
import { DropDrawerContent, DropDrawerSeparator } from "@/components/ui/dropdrawer";
import { Input } from "@/components/ui/input";

/** Shared search chrome for editor and record action menus. Operations stay with consumers. */
export function SearchableActionMenuContent({
  search,
  onSearchChange,
  searchLabel,
  onOpenAutoFocus,
  children,
  ...props
}: ComponentProps<typeof DropDrawerContent> & {
  search: string;
  onSearchChange: (value: string) => void;
  searchLabel: string;
  onOpenAutoFocus?: (event: Event) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <DropDrawerContent
      align="start"
      className="w-72"
      {...props}
      onOpenAutoFocus={(event) => {
        onOpenAutoFocus?.(event);
        if (!event.defaultPrevented) {
          event.preventDefault();
          input.current?.focus();
        }
      }}
    >
      <div className="flex items-center gap-1.5 px-1.5 py-1">
        <Input
          ref={input}
          aria-label={searchLabel}
          autoComplete="off"
          className="h-auto rounded-none border-0 bg-transparent px-0 py-0 text-sm font-medium shadow-none focus-visible:border-transparent focus-visible:ring-0 dark:bg-transparent"
          onChange={(event) => onSearchChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "ArrowDown" || event.key === "ArrowUp") {
              event.preventDefault();
              const items = event.currentTarget
                .closest('[role="menu"]')
                ?.querySelectorAll<HTMLElement>('[role="menuitem"]:not([data-disabled])');
              (event.key === "ArrowUp"
                ? items?.item((items?.length ?? 1) - 1)
                : items?.item(0)
              )?.focus();
            }
            if (event.key !== "Escape") event.stopPropagation();
          }}
          placeholder="Search actions..."
          value={search}
        />
      </div>
      <DropDrawerSeparator />
      {children}
    </DropDrawerContent>
  );
}
