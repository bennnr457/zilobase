import { Link } from "@tanstack/react-router";
import { ArrowUpRightIcon } from "@/components/icons";

import { SidebarGroupAction } from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";
import type { LibraryView, SidebarSectionId } from "@zilobase/features/user-settings";

export function SidebarLibraryLink({
  className,
  label,
  sectionId,
  view: viewOverride,
}: {
  className?: string;
  label: string;
  sectionId: SidebarSectionId;
  view?: LibraryView;
}) {
  const view = viewOverride ?? getLibraryViewForSection(sectionId);

  return (
    <SidebarGroupAction
      asChild
      className={cn(
        "transition-opacity md:opacity-0 md:group-hover/section-header:opacity-100 md:focus-visible:opacity-100",
        className,
      )}
    >
      <Link
        aria-label={`Open ${label} in Library`}
        search={{ view }}
        title={`Open ${label} in Library`}
        to="/recents"
      >
        <ArrowUpRightIcon />
      </Link>
    </SidebarGroupAction>
  );
}

function getLibraryViewForSection(sectionId: SidebarSectionId): LibraryView {
  return sectionId === "favorites" ? "favourites" : sectionId;
}
