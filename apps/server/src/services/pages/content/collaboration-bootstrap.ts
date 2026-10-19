import type { RuntimeEnv } from "../../../shared/config/config";
import type { AccessLevel } from "../../access/access-level";
import { hasAccess } from "../../access/access-level";
import { getWorkspaceRealtimeAccessExpiration } from "../../access/principal-access";
import { documentNameForPage } from "../../collaboration/documents/documents";
import { getOrCreateCollaborationDocumentState } from "../../collaboration/persistence/document-persistence";
import { createCollaborationTicket } from "../../collaboration/tickets/ticket-security";
import type { PageRecord } from "../read/page-records";
export async function preparePageCollaboration(
  existing: PageRecord,
  user: { id: string },
  accessLevel: AccessLevel,
  includeState: boolean,
  env: RuntimeEnv,
) {
  const [maxExpiresAt, initialState] = await Promise.all([
    getWorkspaceRealtimeAccessExpiration(existing.workspaceId, user.id),
    includeState ? getOrCreateCollaborationDocumentState(existing.id) : Promise.resolve(null),
  ]);
  const ticket = await createCollaborationTicket(
    {
      pageId: existing.id,
      scope: hasAccess(accessLevel, "edit")
        ? "read-write"
        : hasAccess(accessLevel, "comment")
          ? "comment"
          : "readonly",
      userId: user.id,
      workspaceId: existing.workspaceId,
    },
    env,
    { maxExpiresAt },
  );
  const documentName = documentNameForPage(existing.id);

  return {
    documentName,
    ...(initialState ? { initialState: Buffer.from(initialState).toString("base64") } : {}),
    ...ticket,
  };
}
