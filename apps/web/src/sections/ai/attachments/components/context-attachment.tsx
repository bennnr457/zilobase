import type { ResourceRef } from "@zilobase/page-context";
import type { ReactElement, ReactNode } from "react";
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
  disabled,
}: {
  item: ResourceRef;
  workspaceId: string | null;
  onRemove: () => void;
  disabled?: boolean;
}) {
  const { title, emoji } = useChatAttachmentMetadata(workspaceId, item);
  return (
    <AttachmentPill
      title={title}
      emoji={emoji}
      type={item.type}
      onRemove={onRemove}
      disabled={disabled}
    />
  );
}

/** The same pill surface is used in the composer, messages, and source lists. */
export function AttachmentPill({
  title,
  emoji,
  type,
  onRemove,
  disabled,
  render,
}: {
  title: string;
  emoji?: string | null;
  type: ResourceRef["type"];
  onRemove?: () => void;
  disabled?: boolean;
  render?: (content: ReactNode) => ReactElement;
}) {
  const content = (
    <>
      <span aria-hidden="true" className="inline-flex shrink-0">
        <PageIconDisplay
          size="sm"
          value={
            emoji ?? (type === "database" ? DEFAULT_DATABASE_ITEM_ICON : DEFAULT_PAGE_ITEM_ICON)
          }
        />
      </span>
      <AttachmentTitle>{title}</AttachmentTitle>
      {onRemove && (
        <AttachmentAction
          type="button"
          size="icon-xs"
          variant="ghost"
          className="size-4 shrink-0"
          onMouseDown={(event) => event.preventDefault()}
          onClick={onRemove}
          disabled={disabled}
          aria-label={`Remove ${title}`}
        >
          <span aria-hidden="true">×</span>
        </AttachmentAction>
      )}
    </>
  );
  return (
    <Attachment
      asChild
      className="inline-flex h-6 min-w-0 max-w-full flex-nowrap items-center gap-1 border-stroke-default bg-surface-secondary px-1.5 align-middle dark:bg-control-background"
      size="xs"
    >
      {render ? render(content) : <span title={title}>{content}</span>}
    </Attachment>
  );
}
