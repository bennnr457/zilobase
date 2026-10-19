import { and, eq, sql } from "drizzle-orm";
import { db } from "../../../infrastructure/database/index";
import { invitation, user, workspace } from "../../../infrastructure/database/schema";
import { sendEmail } from "../../../infrastructure/email/email";
import type { RuntimeEnv } from "../../../shared/config/config";
import { getPrimaryClientOrigin } from "../../../shared/config/config";
import { ServiceMutationError } from "../../../shared/errors/service-mutation-error";
import { getMembership } from "../../access/principal-access";
import { expireTemporaryMemberships } from "../../memberships/temporary-membership";

export async function createWorkspaceInvitation(
  workspaceId: string,
  requestUser: { id: string; name: string; email: string },
  input: { email: string; role: "admin" | "member" | "temporary" },
  membershipExpiresAt: Date | null,
  env: RuntimeEnv,
) {
  const normalizedEmail = input.email.trim().toLowerCase();
  const [existingUser] = await db
    .select({ id: user.id })
    .from(user)
    .where(sql`lower(${user.email}) = ${normalizedEmail}`)
    .limit(1);

  if (existingUser) {
    await expireTemporaryMemberships(db, { userId: existingUser.id });

    if (await getMembership(workspaceId, existingUser.id)) {
      throw new ServiceMutationError("This user is already a workspace member.", 409);
    }
  }

  const [pendingInvitation] = await db
    .select({ id: invitation.id })
    .from(invitation)
    .where(
      and(
        eq(invitation.organizationId, workspaceId),
        eq(invitation.status, "pending"),
        sql`lower(${invitation.email}) = ${normalizedEmail}`,
        sql`${invitation.expiresAt} > now()`,
      ),
    )
    .limit(1);

  if (pendingInvitation) {
    throw new ServiceMutationError("This email already has a pending invitation.", 409);
  }

  const [workspaceRecord] = await db
    .select({ name: workspace.name })
    .from(workspace)
    .where(eq(workspace.id, workspaceId))
    .limit(1);

  if (!workspaceRecord) {
    throw new ServiceMutationError("Workspace not found.", 404);
  }

  const invitationExpiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000);
  const [created] = await db
    .insert(invitation)
    .values({
      id: crypto.randomUUID(),
      email: normalizedEmail,
      expiresAt: invitationExpiresAt,
      inviterId: requestUser.id,
      membershipExpiresAt,
      organizationId: workspaceId,
      role: input.role,
      status: "pending",
    })
    .returning();

  if (!created) {
    throw new ServiceMutationError("Invitation could not be created.", 500);
  }

  const inviteLink = `${getPrimaryClientOrigin(env)}/accept-invitation?id=${created.id}`;
  const temporaryDetails = membershipExpiresAt
    ? `\nTemporary access expires ${membershipExpiresAt.toISOString()}.`
    : "";

  await sendEmail(env, {
    to: normalizedEmail,
    subject: `Invitation to join ${workspaceRecord.name} on Zilobase`,
    text: [
      `${requestUser.name} (${requestUser.email}) invited you to ${workspaceRecord.name} as ${input.role}.`,
      temporaryDetails,
      "",
      `Accept the invitation: ${inviteLink}`,
      `This invitation link expires ${invitationExpiresAt.toISOString()}.`,
    ]
      .filter(Boolean)
      .join("\n"),
  });

  return created;
}
