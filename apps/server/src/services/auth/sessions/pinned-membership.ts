import { and, eq } from "drizzle-orm";
import { db } from "../../../infrastructure/database/index";
import { session as authSession, member } from "../../../infrastructure/database/schema";
import type { AppBindings } from "../../../shared/contracts/http";
import { shouldCreateOpenRegistrationMembership } from "../../instance/registration/registration";
import { getInstanceAdministrationSettings } from "../../instance/settings/administration";
import { MembershipService } from "../../memberships/membership-grants";
import { activeMembershipCondition } from "../../memberships/temporary-membership";
export async function ensurePinnedWorkspaceMembership(
  env: Record<string, unknown>,
  userId: string,
  emailVerified: boolean,
  sessionId?: string | null,
  editionExtension?: AppBindings["Variables"]["editionExtension"],
  workspacePinned = true,
) {
  if (!workspacePinned) {
    return null;
  }

  const settings = await getInstanceAdministrationSettings(env);
  const workspaceId = settings.pinnedWorkspaceId;

  if (!workspaceId) {
    return null;
  }

  const [existingMembership] = await db
    .select({ id: member.id })
    .from(member)
    .where(
      and(
        eq(member.organizationId, workspaceId),
        eq(member.userId, userId),
        activeMembershipCondition(),
      ),
    )
    .limit(1);

  if (!existingMembership) {
    if (
      !shouldCreateOpenRegistrationMembership({
        emailVerified,
        registrationMode: settings.registrationMode,
      })
    ) {
      return null;
    }

    await new MembershipService(db, editionExtension ?? undefined).grantMembership({
      role: "member",
      source: "open-registration",
      userId,
      workspaceId,
    });
  }

  if (sessionId) {
    await db
      .update(authSession)
      .set({ activeWorkspaceId: workspaceId, updatedAt: new Date() })
      .where(eq(authSession.id, sessionId));
  }

  return workspaceId;
}
