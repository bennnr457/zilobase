import { useCreateMeeting } from "@zilobase/features/meetings/react";
import { useEditorWorkspace } from "../../runtime/components/page-editor-registry";
import { useCallback, useState, type MouseEvent as ReactMouseEvent } from "react";
import type { Editor as TiptapEditor } from "@tiptap/react";
import type { DragHandleTarget } from "../../toolbar/lib/toolbar";
import type { NodePlacement } from "../../lib/editor-types";
import { useAddDatabaseRow, useCreateDatabase } from "@zilobase/features/databases/react";
import { toast } from "sonner";
import { dropPageOnDatabase } from "../../drag-drop/lib/database-page-drag";

export const useEditorResourceActions = (workspaceId?: string | null, pageId?: string | null) => {
  const workspace = useEditorWorkspace();
  const createDatabase = useCreateDatabase();
  const createMeeting = useCreateMeeting();
  const addDatabaseRow = useAddDatabaseRow();

  const createEditorDatabase = useCallback(async () => {
    if (!workspaceId || !pageId) return null;
    const payload = await createDatabase.mutateAsync({
      name: "New database",
      workspaceId,
      pageId: pageId,
    });
    return payload.database.id;
  }, [createDatabase, workspaceId, pageId]);

  const handleDatabasePageDrop = useCallback(
    (event: DragEvent) =>
      dropPageOnDatabase(event, {
        workspace,
        addDatabaseRow,
        onError: (message) => toast.error(message),
      }),
    [workspace, addDatabaseRow],
  );

  const createEditorMeeting = useCallback(async () => {
    if (!workspaceId || !pageId) return null;
    const payload = await createMeeting.mutateAsync({
      pageId,
      title: "Meeting",
      workspaceId,
    });
    return payload.meeting.id;
  }, [createMeeting, pageId, workspaceId]);

  return { createEditorDatabase, createEditorMeeting, handleDatabasePageDrop };
};

const isMobileViewport = () => window.matchMedia("(max-width: 767px)").matches;

const getTargetPlacement = (
  editor: TiptapEditor,
  target: DragHandleTarget,
): NodePlacement | null => {
  let placement: NodePlacement | null = null;
  editor.state.doc.descendants((node, pos, parent, index) => {
    if (pos !== target.pos || node.type !== target.node.type) return;
    placement = { index, parent, pos };
    return false;
  });
  return placement;
};

export const useMobileNodeActions = (
  editor: TiptapEditor | null,
  resolveDragTargetFromPoint: (clientX: number, clientY: number) => DragHandleTarget | null,
) => {
  const [mobileNodeTarget, setMobileNodeTarget] = useState<DragHandleTarget | null>(null);

  const canMoveMobileTarget = useCallback(
    (direction: "up" | "down") => {
      if (!editor || !mobileNodeTarget) return false;
      const placement = getTargetPlacement(editor, mobileNodeTarget);
      if (!placement?.parent) return false;
      if (direction === "up") return placement.index > 0;
      return placement.index < placement.parent.childCount - 1;
    },
    [editor, mobileNodeTarget],
  );

  const moveMobileTarget = useCallback(
    (direction: "up" | "down") => {
      if (!editor || !mobileNodeTarget) return;
      const placement = getTargetPlacement(editor, mobileNodeTarget);
      if (!placement?.parent) return;

      const source = editor.state.doc.nodeAt(placement.pos);
      if (!source) return setMobileNodeTarget(null);

      const siblingIndex = direction === "up" ? placement.index - 1 : placement.index + 1;
      if (siblingIndex < 0 || siblingIndex >= placement.parent.childCount) return;

      const sibling = placement.parent.child(siblingIndex);
      const sourceEnd = placement.pos + source.nodeSize;
      const nextPos =
        direction === "up" ? placement.pos - sibling.nodeSize : placement.pos + sibling.nodeSize;

      const tr = editor.state.tr.delete(placement.pos, sourceEnd).insert(nextPos, source);

      editor.view.dispatch(tr.scrollIntoView());
      editor.view.focus();
      setMobileNodeTarget({ node: source, pos: nextPos });
    },
    [editor, mobileNodeTarget],
  );

  const handleMobileNodeClick = useCallback(
    (event: ReactMouseEvent<HTMLElement>) => {
      if (!editor || !isMobileViewport()) return setMobileNodeTarget(null);
      const targetElement = event.target;
      if (
        !(targetElement instanceof HTMLElement) ||
        targetElement.closest(
          "[data-mobile-action-bar], button, input, textarea, select, [role='button']",
        )
      ) {
        return;
      }
      setMobileNodeTarget(resolveDragTargetFromPoint(event.clientX, event.clientY));
    },
    [editor, resolveDragTargetFromPoint],
  );

  return {
    mobileNodeTarget,
    canMoveMobileTarget,
    moveMobileTarget,
    handleMobileNodeClick,
  };
};
