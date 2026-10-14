import { ChevronRightIcon } from "@/components/icons";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { SidebarGroup, SidebarGroupContent, SidebarGroupLabel } from "@/components/ui/sidebar";
import { useSidebarSectionOpen } from "../model/local-state";

export function AiChatsSection({ storageKey }: { storageKey: string }) {
  const [open, setOpen] = useSidebarSectionOpen(storageKey);

  return (
    <Collapsible asChild onOpenChange={setOpen} open={open}>
      <SidebarGroup className="group/collapsible min-h-0">
        <CollapsibleTrigger asChild>
          <SidebarGroupLabel
            asChild
            className="hover:bg-action-neutral-hover hover:text-action-on-neutral"
          >
            <button className="group/section-label w-full cursor-pointer" type="button">
              <span>AI chats</span>
              <ChevronRightIcon className="ml-1 size-3 text-content-secondary transition-transform group-data-[state=open]/section-label:rotate-90" />
            </button>
          </SidebarGroupLabel>
        </CollapsibleTrigger>
        <CollapsibleContent className="pb-4 pt-0.5">
          <SidebarGroupContent>
            <p className="text-xs text-content-secondary">No chats yet</p>
          </SidebarGroupContent>
        </CollapsibleContent>
      </SidebarGroup>
    </Collapsible>
  );
}
