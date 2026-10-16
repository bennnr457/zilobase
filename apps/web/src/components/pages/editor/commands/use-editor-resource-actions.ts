import { useCreateMeeting } from "@zilobase/features/meetings/react";
import { useEditorWorkspace } from "../runtime/page-editor-registry";
import { useCallback } from "react";
import { useAddDatabaseRow, useCreateDatabase } from "@zilobase/features/databases/react";
import { toast } from "sonner";
import { dropPageOnDatabase } from "../drag-drop/database-page-drag";

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
