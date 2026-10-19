import { and, asc, eq, inArray, isNotNull, isNull, sql } from "drizzle-orm";
import { TeamspaceManagementError, TeamspaceUpdateInput } from "./contracts";
import { getDatabaseErrorCode } from "./errors";
import { acceptInvite, updateInviteLink } from "./invitations/invitations";
import { join, leave } from "./membership/membership";
import {
  addPrincipal,
  listPrincipals,
  removePrincipal,
  updatePrincipal,
} from "./principals/principals";
import { getWorkspaceSettings, updateDefaults, updateWorkspaceSettings } from "./settings/settings";

import { db, type Database } from "../../infrastructure/database";
import {
  teamMember,
  teamspace,
  teamspacePrincipal,
  workspace,
} from "../../infrastructure/database/schema";
import type { RuntimeEnv } from "../../shared/config/config";
import type { ZilobaseEditionExtension } from "../../shared/contracts/edition";
import { getMembership } from "../access/principal-access";

import {
  canCreateTeamspace,
  canDiscoverTeamspace,
  canManageTeamspace,
  type TeamspaceAccessMode,
  type TeamspaceCreationPolicy,
  type TeamspaceRole,
} from "./policy";

export class TeamspaceManagementService {
  constructor(
    private readonly database: Database = db,
    private readonly editionExtension?: ZilobaseEditionExtension,
    private readonly env?: RuntimeEnv,
  ) {}

  async list(input: { includeArchived?: boolean; userId: string; workspaceId: string }) {
    const membership = await getMembership(input.workspaceId, input.userId);
    if (!membership) throw new TeamspaceManagementError("Forbidden", 403);
    const records = await this.database
      .select()
      .from(teamspace)
      .where(
        and(
          eq(teamspace.workspaceId, input.workspaceId),
          input.includeArchived ? isNotNull(teamspace.archivedAt) : isNull(teamspace.archivedAt),
        ),
      )
      .orderBy(asc(teamspace.name));
    const [principalRows, teamRows] = await Promise.all([
      records.length > 0
        ? this.database
            .select()
            .from(teamspacePrincipal)
            .where(
              inArray(
                teamspacePrincipal.teamspaceId,
                records.map((record) => record.id),
              ),
            )
        : Promise.resolve([]),
      this.database
        .select({ teamId: teamMember.teamId })
        .from(teamMember)
        .where(eq(teamMember.userId, input.userId)),
    ]);
    const visible = records.filter((record) => {
      const role = getEffectiveRole(
        principalRows,
        record.id,
        input.userId,
        teamRows.map((row) => row.teamId),
      );
      return canDiscoverTeamspace({
        accessMode: record.accessMode as TeamspaceAccessMode,
        isTeamspacePrincipal: Boolean(role),
        isWorkspaceOwner: membership.role === "owner",
      });
    });

    return visible.map((record) => ({
      ...record,
      currentUserRole: getEffectiveRole(
        principalRows,
        record.id,
        input.userId,
        teamRows.map((row) => row.teamId),
      ),
      memberCount: principalRows.filter((principal) => principal.teamspaceId === record.id).length,
      ownerIds: principalRows
        .filter((principal) => principal.teamspaceId === record.id && principal.role === "owner")
        .map((principal) => principal.principalId),
    }));
  }

  async get(input: { teamspaceId: string; userId: string; workspaceId: string }) {
    const { record, role } = await this.requireVisible(input);
    return { ...record, currentUserRole: role };
  }

  async create(input: {
    accessMode: TeamspaceAccessMode;
    description?: string | null;
    icon?: unknown;
    name: string;
    userId: string;
    workspaceId: string;
  }) {
    const [membership, workspaceRecord] = await Promise.all([
      getMembership(input.workspaceId, input.userId),
      this.database
        .select({ creationPolicy: workspace.teamspaceCreationPolicy })
        .from(workspace)
        .where(eq(workspace.id, input.workspaceId))
        .then((rows) => rows[0] ?? null),
    ]);
    if (!membership || !workspaceRecord) {
      throw new TeamspaceManagementError("Forbidden", 403);
    }
    if (
      !canCreateTeamspace({
        creationPolicy: workspaceRecord.creationPolicy as TeamspaceCreationPolicy,
        isActiveWorkspaceMember: true,
        workspaceRole: membership.role,
      })
    ) {
      throw new TeamspaceManagementError("Only workspace owners can create teamspaces.", 403);
    }

    try {
      const { record: result } = await this.database.transaction(async (transaction) => {
        const [created] = await transaction
          .insert(teamspace)
          .values({
            accessMode: input.accessMode,
            createdById: input.userId,
            description: input.description ?? null,
            icon: input.icon ?? null,
            id: crypto.randomUUID(),
            name: input.name,
            workspaceId: input.workspaceId,
          })
          .returning();
        if (!created) throw new Error("Teamspace could not be created");
        await transaction.insert(teamspacePrincipal).values({
          addedById: input.userId,
          id: crypto.randomUUID(),
          membershipSource: "creator",
          principalId: input.userId,
          principalType: "user",
          role: "owner",
          teamspaceId: created.id,
        });
        return {
          record: created,
        };
      });

      await this.audit("teamspace.created", input, {
        accessMode: result.accessMode,
        teamspaceId: result.id,
      });
      return { ...result, currentUserRole: "owner" as const };
    } catch (error) {
      if (getDatabaseErrorCode(error) === "23505") {
        throw new TeamspaceManagementError("An active teamspace already uses this name.", 409);
      }
      throw error;
    }
  }

  async update(
    input: {
      teamspaceId: string;
      userId: string;
      workspaceId: string;
    } & TeamspaceUpdateInput,
  ) {
    const { membership, record, role } = await this.requireManage(input);
    if (
      input.accessMode === "private" &&
      membership.role !== "owner" &&
      record.accessMode !== "private"
    ) {
      throw new TeamspaceManagementError(
        "Only workspace owners can make a teamspace private.",
        403,
      );
    }
    const updated = await this.updateRecord(input.workspaceId, record.id, {
      ...(input.accessMode !== undefined ? { accessMode: input.accessMode } : {}),
      ...(input.description !== undefined ? { description: input.description } : {}),
      ...(input.icon !== undefined ? { icon: input.icon } : {}),
      ...(input.invitePolicy !== undefined ? { invitePolicy: input.invitePolicy } : {}),
      ...(input.memberAccessLevel !== undefined
        ? { memberAccessLevel: input.memberAccessLevel }
        : {}),
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.exportEnabled !== undefined ? { exportEnabled: input.exportEnabled } : {}),
      ...(input.guestsEnabled !== undefined ? { guestsEnabled: input.guestsEnabled } : {}),
      ...(input.publicSharingEnabled !== undefined
        ? { publicSharingEnabled: input.publicSharingEnabled }
        : {}),
      ...(input.sidebarEditPolicy !== undefined
        ? { sidebarEditPolicy: input.sidebarEditPolicy }
        : {}),
      updatedAt: new Date(),
    });
    await this.audit("teamspace.updated", input, {
      teamspaceId: record.id,
    });
    return { ...updated!, currentUserRole: role };
  }

  async archive(input: { teamspaceId: string; userId: string; workspaceId: string }) {
    const { record } = await this.requireManage(input);
    if (record.isDefault) {
      throw new TeamspaceManagementError(
        "Choose another default teamspace before archiving this one.",
        409,
      );
    }
    const updated = await this.updateRecord(input.workspaceId, record.id, {
      archivedAt: new Date(),
      archivedById: input.userId,
      updatedAt: new Date(),
    });
    await this.audit("teamspace.archived", input, { teamspaceId: record.id });
    return updated!;
  }

  async restore(input: { teamspaceId: string; userId: string; workspaceId: string }) {
    const membership = await getMembership(input.workspaceId, input.userId);
    if (membership?.role !== "owner") {
      throw new TeamspaceManagementError("Only workspace owners can restore teamspaces.", 403);
    }
    const record = await this.getRecord(input.workspaceId, input.teamspaceId);
    if (!record) throw new TeamspaceManagementError("Teamspace not found.", 404);
    try {
      const updated = await this.updateRecord(input.workspaceId, record.id, {
        archivedAt: null,
        archivedById: null,
        updatedAt: new Date(),
      });
      await this.audit("teamspace.restored", input, { teamspaceId: record.id });
      return updated!;
    } catch (error) {
      if (getDatabaseErrorCode(error) === "23505") {
        throw new TeamspaceManagementError(
          "Rename the active teamspace with this name before restoring.",
          409,
        );
      }
      throw error;
    }
  }

  async recoverOwner(input: { teamspaceId: string; userId: string; workspaceId: string }) {
    const membership = await getMembership(input.workspaceId, input.userId);
    const record = await this.getRecord(input.workspaceId, input.teamspaceId);
    if (membership?.role !== "owner" || !record) {
      throw new TeamspaceManagementError("Forbidden", 403);
    }
    const [{ count }] = await this.database
      .select({ count: sql<number>`count(*)::integer` })
      .from(teamspacePrincipal)
      .where(
        and(eq(teamspacePrincipal.teamspaceId, record.id), eq(teamspacePrincipal.role, "owner")),
      );
    if ((count ?? 0) > 0) {
      throw new TeamspaceManagementError("This teamspace already has an owner.", 409);
    }
    const [principal] = await this.database
      .insert(teamspacePrincipal)
      .values({
        addedById: input.userId,
        id: crypto.randomUUID(),
        membershipSource: "explicit",
        principalId: input.userId,
        principalType: "user",
        role: "owner",
        teamspaceId: record.id,
      })
      .onConflictDoUpdate({
        set: { role: "owner", updatedAt: new Date() },
        target: [
          teamspacePrincipal.teamspaceId,
          teamspacePrincipal.principalType,
          teamspacePrincipal.principalId,
        ],
      })
      .returning();
    await this.audit("teamspace.owner_recovered", input, {
      teamspaceId: record.id,
    });
    return principal!;
  }

  async updateInviteLink(input: {
    enabled: boolean;
    teamspaceId: string;
    userId: string;
    workspaceId: string;
  }) {
    return updateInviteLink(this.operationContext(), input);
  }

  async acceptInvite(input: { token: string; userId: string; workspaceId: string }) {
    return acceptInvite(this.operationContext(), input);
  }

  async updateDefaults(input: {
    defaultTeamspaceIds: string[];
    userId: string;
    workspaceId: string;
  }) {
    return updateDefaults(this.operationContext(), input);
  }

  async join(input: { teamspaceId: string; userId: string; workspaceId: string }) {
    return join(this.operationContext(), input);
  }

  async leave(input: { teamspaceId: string; userId: string; workspaceId: string }) {
    return leave(this.operationContext(), input);
  }

  async listPrincipals(input: { teamspaceId: string; userId: string; workspaceId: string }) {
    return listPrincipals(this.operationContext(), input);
  }

  async addPrincipal(input: {
    accessLevelOverride?: "view" | "comment" | "edit" | "full" | null;
    principalType?: "user" | "team";
    role: TeamspaceRole;
    targetUserId: string;
    teamspaceId: string;
    userId: string;
    workspaceId: string;
  }) {
    return addPrincipal(this.operationContext(), input);
  }

  async updatePrincipal(input: {
    accessLevelOverride?: "view" | "comment" | "edit" | "full" | null;
    principalId: string;
    role: TeamspaceRole;
    teamspaceId: string;
    userId: string;
    workspaceId: string;
  }) {
    return updatePrincipal(this.operationContext(), input);
  }

  async removePrincipal(input: {
    principalId: string;
    teamspaceId: string;
    userId: string;
    workspaceId: string;
  }) {
    return removePrincipal(this.operationContext(), input);
  }

  async getWorkspaceSettings(workspaceId: string, userId: string) {
    return getWorkspaceSettings(this.operationContext(), workspaceId, userId);
  }

  async updateWorkspaceSettings(input: {
    creationPolicy: TeamspaceCreationPolicy;
    userId: string;
    workspaceId: string;
  }) {
    return updateWorkspaceSettings(this.operationContext(), input);
  }

  async getRole(teamspaceId: string, userId: string): Promise<TeamspaceRole | null> {
    const teamIds = (
      await this.database
        .select({ teamId: teamMember.teamId })
        .from(teamMember)
        .where(eq(teamMember.userId, userId))
    ).map((row) => row.teamId);
    const principals = await this.database
      .select()
      .from(teamspacePrincipal)
      .where(
        and(
          eq(teamspacePrincipal.teamspaceId, teamspaceId),
          inArray(teamspacePrincipal.principalType, ["user", "team"]),
          inArray(teamspacePrincipal.principalId, [userId, ...teamIds]),
        ),
      );
    return getEffectiveRole(principals, teamspaceId, userId, teamIds);
  }

  private operationContext() {
    return {
      database: this.database,
      get: this.get.bind(this),
      editionExtension: this.editionExtension,
      env: this.env,
      requireManage: this.requireManage.bind(this),
      requireVisible: this.requireVisible.bind(this),
      getRecord: this.getRecord.bind(this),
      getDirectPrincipal: this.getDirectPrincipal.bind(this),
      getPrincipal: this.getPrincipal.bind(this),
      assertOwnerRemains: this.assertOwnerRemains.bind(this),
      audit: this.audit.bind(this),
      getRole: this.getRole.bind(this),
      updateRecord: this.updateRecord.bind(this),
    };
  }

  private getRecord(workspaceId: string, teamspaceId: string) {
    return this.database
      .select()
      .from(teamspace)
      .where(and(eq(teamspace.id, teamspaceId), eq(teamspace.workspaceId, workspaceId)))
      .then((rows) => rows[0] ?? null);
  }

  private getDirectPrincipal(teamspaceId: string, userId: string) {
    return this.database
      .select()
      .from(teamspacePrincipal)
      .where(
        and(
          eq(teamspacePrincipal.teamspaceId, teamspaceId),
          eq(teamspacePrincipal.principalType, "user"),
          eq(teamspacePrincipal.principalId, userId),
        ),
      )
      .then((rows) => rows[0] ?? null);
  }

  private getPrincipal(teamspaceId: string, principalId: string) {
    return this.database
      .select()
      .from(teamspacePrincipal)
      .where(
        and(
          eq(teamspacePrincipal.id, principalId),
          eq(teamspacePrincipal.teamspaceId, teamspaceId),
        ),
      )
      .then((rows) => rows[0] ?? null);
  }

  private async updateRecord(
    workspaceId: string,
    teamspaceId: string,
    values: Partial<typeof teamspace.$inferInsert>,
  ) {
    const { updated } = await this.database.transaction(async (transaction) => {
      const [updated] = await transaction
        .update(teamspace)
        .set(values)
        .where(eq(teamspace.id, teamspaceId))
        .returning();
      return {
        updated,
      };
    });

    return updated;
  }

  private async requireVisible(input: {
    teamspaceId: string;
    userId: string;
    workspaceId: string;
  }) {
    const [membership, record] = await Promise.all([
      getMembership(input.workspaceId, input.userId),
      this.getRecord(input.workspaceId, input.teamspaceId),
    ]);
    if (!membership) throw new TeamspaceManagementError("Forbidden", 403);
    if (!record) throw new TeamspaceManagementError("Teamspace not found.", 404);
    const role = await this.getRole(record.id, input.userId);
    if (
      !canDiscoverTeamspace({
        accessMode: record.accessMode as TeamspaceAccessMode,
        isTeamspacePrincipal: Boolean(role),
        isWorkspaceOwner: membership.role === "owner",
      })
    ) {
      throw new TeamspaceManagementError("Teamspace not found.", 404);
    }
    return { membership, record, role };
  }

  private async requireManage(input: { teamspaceId: string; userId: string; workspaceId: string }) {
    const context = await this.requireVisible(input);
    if (
      !canManageTeamspace({
        isWorkspaceOwner: context.membership.role === "owner",
        teamspaceRole: context.role,
      })
    ) {
      throw new TeamspaceManagementError("Forbidden", 403);
    }
    return context;
  }

  private async assertOwnerRemains(
    teamspaceId: string,
    principal: typeof teamspacePrincipal.$inferSelect,
    nextRole: TeamspaceRole,
  ) {
    if (principal.role !== "owner" || nextRole === "owner") return;
    const [{ count }] = await this.database
      .select({ count: sql<number>`count(*)::integer` })
      .from(teamspacePrincipal)
      .where(
        and(eq(teamspacePrincipal.teamspaceId, teamspaceId), eq(teamspacePrincipal.role, "owner")),
      );
    if ((count ?? 0) <= 1) {
      throw new TeamspaceManagementError("The teamspace must keep at least one owner.", 409);
    }
  }

  private audit(
    type: string,
    input: { userId: string; workspaceId: string },
    details: Record<string, boolean | number | string | null>,
  ) {
    return this.editionExtension?.recordSecurityEvent({
      actorUserId: input.userId,
      database: this.database,
      details,
      occurredAt: new Date(),
      type,
      userId: input.userId,
      workspaceId: input.workspaceId,
    });
  }
}

function getEffectiveRole(
  principals: Array<typeof teamspacePrincipal.$inferSelect>,
  teamspaceId: string,
  userId: string,
  teamIds: string[],
): TeamspaceRole | null {
  const roles = principals.filter(
    (principal) =>
      principal.teamspaceId === teamspaceId &&
      ((principal.principalType === "user" && principal.principalId === userId) ||
        (principal.principalType === "team" && teamIds.includes(principal.principalId))),
  );
  if (roles.some((principal) => principal.role === "owner")) return "owner";
  return roles.length > 0 ? "member" : null;
}

export type TeamspaceOperationContext = ReturnType<TeamspaceManagementService["operationContext"]>;
