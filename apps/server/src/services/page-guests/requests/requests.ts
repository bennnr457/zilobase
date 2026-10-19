import { and, asc, eq, isNull, sql } from "drizzle-orm";
import { db } from "../../../infrastructure/database/index";
import { page, pageGuestRequest, user } from "../../../infrastructure/database/schema";
import { hasAccess } from "../../access/access-level";
import { getEffectivePageAccessInWorkspace } from "../../access/effective-access";
import { getMembership } from "../../access/principal-access";
import { createPageGuestInvitation } from "../invitations/invitations";
import { normalizeGuestEmail, PageGuestServiceError, parseGuestAccessLevel } from "../policy";
import { getWorkspaceGuestInvitePolicy } from "../workspace/workspace-guests";
export async function createPageGuestRequest(input: {
  accessLevel: unknown;
  email: string;
  pageId: string;
  requesterId: string;
}) {
  const [pageRecord] = await db
    .select({ id: page.id, workspaceId: page.workspaceId })
    .from(page)
    .where(and(eq(page.id, input.pageId), isNull(page.deletedAt)))
    .limit(1);

  if (!pageRecord) throw new PageGuestServiceError("Page not found.", 404);
  const [membership, access] = await Promise.all([
    getMembership(pageRecord.workspaceId, input.requesterId),
    getEffectivePageAccessInWorkspace(pageRecord.id, pageRecord.workspaceId, input.requesterId),
  ]);

  if (!membership || !hasAccess(access, "full")) {
    throw new PageGuestServiceError("Full page access and workspace membership are required.", 403);
  }
  const policy = await getWorkspaceGuestInvitePolicy(pageRecord.workspaceId, input.requesterId);

  if (policy.mode !== "request" || membership.role === "owner") {
    throw new PageGuestServiceError("A guest invitation request is not required.", 409);
  }

  const email = normalizeGuestEmail(input.email);
  const accessLevel = parseGuestAccessLevel(input.accessLevel);
  const [existing] = await db
    .select({ id: pageGuestRequest.id })
    .from(pageGuestRequest)
    .where(
      and(
        eq(pageGuestRequest.pageId, pageRecord.id),
        eq(pageGuestRequest.status, "pending"),
        sql`lower(${pageGuestRequest.email}) = ${email}`,
      ),
    )
    .limit(1);

  if (existing) {
    throw new PageGuestServiceError(
      "This email already has a pending guest request for the page.",
      409,
    );
  }

  const [request] = await db
    .insert(pageGuestRequest)
    .values({
      accessLevel,
      email,
      id: crypto.randomUUID(),
      pageId: pageRecord.id,
      requesterId: input.requesterId,
      status: "pending",
      workspaceId: pageRecord.workspaceId,
    })
    .returning();

  if (!request) {
    throw new Error("Guest invitation request could not be created.");
  }
  return request;
}

export async function listPageGuestRequests(pageId: string, userId: string) {
  const [pageRecord] = await db
    .select({ id: page.id, workspaceId: page.workspaceId })
    .from(page)
    .where(and(eq(page.id, pageId), isNull(page.deletedAt)))
    .limit(1);

  if (!pageRecord) throw new PageGuestServiceError("Page not found.", 404);
  const access = await getEffectivePageAccessInWorkspace(
    pageRecord.id,
    pageRecord.workspaceId,
    userId,
  );
  if (!hasAccess(access, "full")) {
    throw new PageGuestServiceError("Forbidden", 403);
  }

  return db
    .select({
      accessLevel: pageGuestRequest.accessLevel,
      createdAt: pageGuestRequest.createdAt,
      email: pageGuestRequest.email,
      id: pageGuestRequest.id,
      pageId: pageGuestRequest.pageId,
      requesterId: pageGuestRequest.requesterId,
      requesterEmail: user.email,
      requesterName: user.name,
      status: pageGuestRequest.status,
      workspaceId: pageGuestRequest.workspaceId,
    })
    .from(pageGuestRequest)
    .innerJoin(user, eq(user.id, pageGuestRequest.requesterId))
    .where(eq(pageGuestRequest.pageId, pageId))
    .orderBy(asc(pageGuestRequest.createdAt));
}

export async function listWorkspaceGuestRequests(workspaceId: string, userId: string) {
  const membership = await getMembership(workspaceId, userId);
  if (!membership || membership.role !== "owner") {
    throw new PageGuestServiceError("Only workspace owners can review guest requests.", 403);
  }

  return db
    .select({
      accessLevel: pageGuestRequest.accessLevel,
      createdAt: pageGuestRequest.createdAt,
      email: pageGuestRequest.email,
      id: pageGuestRequest.id,
      pageId: pageGuestRequest.pageId,
      pageName: page.name,
      requesterEmail: user.email,
      requesterId: pageGuestRequest.requesterId,
      requesterName: user.name,
      status: pageGuestRequest.status,
      workspaceId: pageGuestRequest.workspaceId,
    })
    .from(pageGuestRequest)
    .innerJoin(page, eq(page.id, pageGuestRequest.pageId))
    .innerJoin(user, eq(user.id, pageGuestRequest.requesterId))
    .where(eq(pageGuestRequest.workspaceId, workspaceId))
    .orderBy(asc(pageGuestRequest.createdAt));
}

export async function rejectPageGuestRequest(input: {
  requestId: string;
  reviewerId: string;
  workspaceId: string;
}) {
  const membership = await getMembership(input.workspaceId, input.reviewerId);
  if (!membership || membership.role !== "owner") {
    throw new PageGuestServiceError("Only workspace owners can review guest requests.", 403);
  }
  const now = new Date();
  const [request] = await db
    .update(pageGuestRequest)
    .set({
      reviewedAt: now,
      reviewerId: input.reviewerId,
      status: "rejected",
      updatedAt: now,
    })
    .where(
      and(
        eq(pageGuestRequest.id, input.requestId),
        eq(pageGuestRequest.workspaceId, input.workspaceId),
        eq(pageGuestRequest.status, "pending"),
      ),
    )
    .returning();
  if (!request) {
    throw new PageGuestServiceError("Pending guest request not found.", 404);
  }
  return request;
}

export async function approvePageGuestRequest(input: {
  requestId: string;
  reviewerId: string;
  workspaceId: string;
}) {
  const membership = await getMembership(input.workspaceId, input.reviewerId);
  if (!membership || membership.role !== "owner") {
    throw new PageGuestServiceError("Only workspace owners can review guest requests.", 403);
  }
  const [request] = await db
    .select()
    .from(pageGuestRequest)
    .where(
      and(
        eq(pageGuestRequest.id, input.requestId),
        eq(pageGuestRequest.workspaceId, input.workspaceId),
        eq(pageGuestRequest.status, "pending"),
      ),
    )
    .limit(1);
  if (!request) {
    throw new PageGuestServiceError("Pending guest request not found.", 404);
  }

  const invitation = await createPageGuestInvitation({
    accessLevel: request.accessLevel,
    email: request.email,
    inviterId: input.reviewerId,
    pageId: request.pageId,
  });
  const now = new Date();
  const [approved] = await db
    .update(pageGuestRequest)
    .set({
      reviewedAt: now,
      reviewerId: input.reviewerId,
      status: "approved",
      updatedAt: now,
    })
    .where(and(eq(pageGuestRequest.id, request.id), eq(pageGuestRequest.status, "pending")))
    .returning();
  if (!approved) {
    throw new PageGuestServiceError("Guest request was already reviewed.", 409);
  }
  return { ...invitation, request: approved };
}
