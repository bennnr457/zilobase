import { and, asc, eq } from "drizzle-orm";
import { db } from "../../../infrastructure/database/index";
import {
  page,
  pageAccess,
  user,
  workspace,
  workspaceGuest,
} from "../../../infrastructure/database/schema";
import type { ZilobaseEditionExtension } from "../../../shared/contracts/edition";
import { getMembership } from "../../access/principal-access";
import { MembershipService } from "../../memberships/membership-grants";
import { GuestInviteMode, PageGuestServiceError } from "../policy";
export async function getWorkspaceGuestInvitePolicy(workspaceId: string, userId: string) {
  const membership = await getMembership(workspaceId, userId);

  if (!membership) {
    throw new PageGuestServiceError("Workspace membership is required.", 403);
  }

  const [record] = await db
    .select({ guestInviteMode: workspace.guestInviteMode })
    .from(workspace)
    .where(eq(workspace.id, workspaceId))
    .limit(1);

  if (!record) throw new PageGuestServiceError("Workspace not found.", 404);

  return {
    canApprove: membership.role === "owner",
    mode: record.guestInviteMode as GuestInviteMode,
  };
}

export async function updateWorkspaceGuestInvitePolicy(input: {
  mode: GuestInviteMode;
  userId: string;
  workspaceId: string;
}) {
  const membership = await getMembership(input.workspaceId, input.userId);

  if (!membership || membership.role !== "owner") {
    throw new PageGuestServiceError(
      "Only workspace owners can change guest invitation policy.",
      403,
    );
  }

  const [record] = await db
    .update(workspace)
    .set({ guestInviteMode: input.mode, updatedAt: new Date() })
    .where(eq(workspace.id, input.workspaceId))
    .returning({ guestInviteMode: workspace.guestInviteMode });

  if (!record) throw new PageGuestServiceError("Workspace not found.", 404);
  return { canApprove: true, mode: record.guestInviteMode as GuestInviteMode };
}

export async function listWorkspaceGuests(workspaceId: string) {
  const rows = await db
    .select({
      accessLevel: pageAccess.accessLevel,
      createdAt: workspaceGuest.createdAt,
      email: user.email,
      name: user.name,
      pageId: pageAccess.pageId,
      pageName: page.name,
      userId: user.id,
    })
    .from(workspaceGuest)
    .innerJoin(user, eq(user.id, workspaceGuest.userId))
    .leftJoin(
      pageAccess,
      and(
        eq(pageAccess.workspaceId, workspaceGuest.workspaceId),
        eq(pageAccess.targetType, "user"),
        eq(pageAccess.targetId, workspaceGuest.userId),
      ),
    )
    .leftJoin(page, eq(page.id, pageAccess.pageId))
    .where(eq(workspaceGuest.workspaceId, workspaceId))
    .orderBy(asc(user.name), asc(user.email), asc(page.name));
  const guests = new Map<
    string,
    {
      createdAt: Date;
      email: string;
      name: string;
      pages: { accessLevel: string; id: string; name: string }[];
      userId: string;
    }
  >();

  for (const row of rows) {
    const guest = guests.get(row.userId) ?? {
      createdAt: row.createdAt,
      email: row.email,
      name: row.name,
      pages: [],
      userId: row.userId,
    };

    if (row.pageId && row.pageName && row.accessLevel) {
      guest.pages.push({
        accessLevel: row.accessLevel,
        id: row.pageId,
        name: row.pageName,
      });
    }

    guests.set(row.userId, guest);
  }

  return [...guests.values()];
}

export async function revokeWorkspaceGuest(workspaceId: string, targetUserId: string) {
  return db.transaction(async (tx) => {
    await tx
      .delete(pageAccess)
      .where(
        and(
          eq(pageAccess.workspaceId, workspaceId),
          eq(pageAccess.targetType, "user"),
          eq(pageAccess.targetId, targetUserId),
        ),
      );
    const [guest] = await tx
      .delete(workspaceGuest)
      .where(
        and(eq(workspaceGuest.workspaceId, workspaceId), eq(workspaceGuest.userId, targetUserId)),
      )
      .returning();

    if (!guest) {
      throw new PageGuestServiceError("Workspace guest not found.", 404);
    }

    return guest;
  });
}

export async function promoteWorkspaceGuest(input: {
  editionExtension?: ZilobaseEditionExtension;
  targetUserId: string;
  workspaceId: string;
}) {
  const [guest] = await db
    .select({ id: workspaceGuest.id })
    .from(workspaceGuest)
    .where(
      and(
        eq(workspaceGuest.workspaceId, input.workspaceId),
        eq(workspaceGuest.userId, input.targetUserId),
      ),
    )
    .limit(1);
  if (!guest) {
    throw new PageGuestServiceError("Workspace guest not found.", 404);
  }

  const result = await new MembershipService(db, input.editionExtension).grantMembership({
    role: "member",
    source: "admin",
    userId: input.targetUserId,
    workspaceId: input.workspaceId,
  });
  await db
    .delete(workspaceGuest)
    .where(
      and(
        eq(workspaceGuest.workspaceId, input.workspaceId),
        eq(workspaceGuest.userId, input.targetUserId),
      ),
    );
  return result.membership;
}
