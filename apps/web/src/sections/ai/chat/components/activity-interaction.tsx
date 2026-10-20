// https://ui.shadcn.com/docs/ai-elements/radix/confirmation
// https://ui.shadcn.com/docs/ai-elements/radix/checkpoint
// https://ui.shadcn.com/docs/ai-elements/radix/file-tree
import { Button } from "@/components/ui/button";
import { Item, ItemActions, ItemContent, ItemDescription, ItemTitle } from "@/components/ui/item";
import { Marker, MarkerContent } from "@/components/ui/marker";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChevronRightIcon, FileIcon, FolderIcon } from "@/components/icons";
import type { ActivityActions, ActivityFile, AgentActivity } from "../lib/agent-activity";

export function ActivityConfirmation({
  activity,
  onApproval,
}: {
  activity: Extract<AgentActivity, { type: "confirmation" }>;
  onApproval?: ActivityActions["onApproval"];
}) {
  return (
    <Item variant="outline" size="sm" role="group" aria-label={activity.title}>
      <ItemContent>
        <ItemTitle>{activity.title}</ItemTitle>
        <ItemDescription>{activity.description}</ItemDescription>
      </ItemContent>
      {activity.decision ? (
        <p className="text-xs text-content-secondary">
          {activity.decision === "approved" ? "Approved" : "Denied"}
        </p>
      ) : activity.status === "pending" && onApproval ? (
        <ItemActions>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => onApproval(activity.id, false)}
          >
            Deny
          </Button>
          <Button type="button" size="sm" onClick={() => onApproval(activity.id, true)}>
            Approve
          </Button>
        </ItemActions>
      ) : (
        <p className="text-xs text-content-secondary">
          {activity.status === "pending" ? "Awaiting confirmation" : activity.status}
        </p>
      )}
    </Item>
  );
}

export function ActivityCheckpoint({
  activity,
  onRestore,
}: {
  activity: Extract<AgentActivity, { type: "checkpoint" }>;
  onRestore?: ActivityActions["onRestore"];
}) {
  return (
    <Marker variant="separator">
      <MarkerContent className="inline-flex flex-wrap items-center justify-center gap-2">
        {activity.title}
        {activity.canRestore && onRestore && (
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => onRestore(activity.id)}
            aria-label={`Restore to ${activity.title}`}
          >
            Restore
          </Button>
        )}
      </MarkerContent>
    </Marker>
  );
}

export function ActivityFiles({
  files,
  selectedPath,
  onOpenFile,
}: {
  files: ActivityFile[];
  selectedPath?: string;
  onOpenFile?: ActivityActions["onOpenFile"];
}) {
  return (
    <div className="flex min-w-0 flex-col">
      {files.map((node) =>
        node.type === "folder" ? (
          <Collapsible key={node.path} defaultOpen className="group/activity-folder">
            <CollapsibleTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="w-full justify-start font-normal"
              >
                <ChevronRightIcon className="group-data-[state=open]/activity-folder:rotate-90" />
                <FolderIcon />
                <span className="truncate">{node.name}</span>
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div className="ml-4">
                <ActivityFiles
                  files={node.children}
                  selectedPath={selectedPath}
                  onOpenFile={onOpenFile}
                />
              </div>
            </CollapsibleContent>
          </Collapsible>
        ) : (
          <Button
            key={node.path}
            type="button"
            variant="ghost"
            size="sm"
            className="w-full justify-start font-normal"
            aria-current={selectedPath === node.path ? "true" : undefined}
            disabled={!onOpenFile}
            onClick={() => onOpenFile?.(node.path)}
          >
            <FileIcon />
            <span className="truncate">{node.name}</span>
          </Button>
        ),
      )}
    </div>
  );
}
