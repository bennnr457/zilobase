import type { ResourceRef } from "@zilobase/page-context";
import { useChatAttachmentMetadata } from "@zilobase/features/ai/react";
import { Attachment, AttachmentAction, AttachmentTitle } from "@/components/ui/attachment";
import { PageIconDisplay } from "@/sections/pages/appearance/components/page-icon";
import {
  DEFAULT_DATABASE_ITEM_ICON,
  DEFAULT_PAGE_ITEM_ICON,
} from "@/components/navigation/lib/navigation-icons";

export function ContextAttachment({
  item,
  workspaceId,
  onRemove,
}: {
  item: ResourceRef;
  workspaceId: string | null;
  onRemove: () => void;
}) {
  const { title, emoji } = useChatAttachmentMetadata(workspaceId, item);
  return (
    <Attachment className="contents" size="xs">
      <AttachmentAction
        type="button"
        size="sm"
        variant="outline"
        className="max-w-full justify-start"
        onClick={onRemove}
        aria-label={`Remove ${title}`}
        title={title}
      >
        <span aria-hidden="true" className="inline-flex shrink-0">
          <PageIconDisplay
            size="sm"
            value={
              emoji ??
              (item.type === "database" ? DEFAULT_DATABASE_ITEM_ICON : DEFAULT_PAGE_ITEM_ICON)
            }
          />
        </span>
        <AttachmentTitle>{title}</AttachmentTitle>
        <span aria-hidden="true">×</span>
      </AttachmentAction>
    </Attachment>
  );
}
