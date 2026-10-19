import { Schema, SchemaTransformation } from "effect";
import { parseOperationBody } from "../../shared/validation";
import {
  requireOperationActor,
  requireOperationPolicy,
  requireOperationWorkspace,
  ServerOperationError,
  type ServerOperationContext,
} from "../operations/context";
import { TeamspaceManagementService } from "./management";
const strictJson = { onExcessProperty: "error" as const };
const TeamspaceAccessMode = Schema.Literals(["open", "closed", "private"]);
const TeamspaceRole = Schema.Literals(["owner", "member"]);
const MemberAccessLevel = Schema.Literals(["view", "comment", "edit", "full"]);
const PrincipalType = Schema.Literals(["user", "team"]);
const InvitePolicy = Schema.Literals(["owners", "owners_and_members"]);
const SidebarEditPolicy = Schema.Literals(["owners", "owners_and_members"]);
const CreationPolicy = Schema.Literals(["workspace_owners", "workspace_members"]);
const CreateTeamspaceInput = Schema.Struct({
  accessMode: TeamspaceAccessMode,
  description: Schema.optionalKey(
    Schema.NullOr(
      Schema.String.pipe(
        Schema.decode(SchemaTransformation.trim()),
        Schema.check(Schema.isMaxLength(2000)),
      ),
    ),
  ),
  exportEnabled: Schema.optionalKey(Schema.Boolean),
  guestsEnabled: Schema.optionalKey(Schema.Boolean),
  icon: Schema.optionalKey(Schema.Unknown),
  name: Schema.String.pipe(
    Schema.decode(SchemaTransformation.trim()),
    Schema.check(Schema.isMinLength(1), Schema.isMaxLength(120)),
  ),
});
const UpdateTeamspaceInput = Schema.Struct({
  accessMode: Schema.optionalKey(TeamspaceAccessMode),
  description: Schema.optionalKey(
    Schema.NullOr(
      Schema.String.pipe(
        Schema.decode(SchemaTransformation.trim()),
        Schema.check(Schema.isMaxLength(2000)),
      ),
    ),
  ),
  icon: Schema.optionalKey(Schema.Unknown),
  invitePolicy: Schema.optionalKey(InvitePolicy),
  memberAccessLevel: Schema.optionalKey(MemberAccessLevel),
  name: Schema.optionalKey(
    Schema.String.pipe(
      Schema.decode(SchemaTransformation.trim()),
      Schema.check(Schema.isMinLength(1), Schema.isMaxLength(120)),
    ),
  ),
  publicSharingEnabled: Schema.optionalKey(Schema.Boolean),
  sidebarEditPolicy: Schema.optionalKey(SidebarEditPolicy),
}).check(
  Schema.makeFilter((value) =>
    Object.keys(value).length > 0 ? undefined : "Provide a field to update.",
  ),
);
const AddPrincipalInput = Schema.Struct({
  accessLevelOverride: Schema.optionalKey(Schema.NullOr(MemberAccessLevel)),
  principalType: Schema.optionalKey(PrincipalType),
  role: TeamspaceRole,
  userId: Schema.String.pipe(Schema.check(Schema.isMinLength(1))),
});
const UpdatePrincipalInput = Schema.Struct({
  accessLevelOverride: Schema.optionalKey(Schema.NullOr(MemberAccessLevel)),
  role: TeamspaceRole,
});
const UpdateTeamspaceSettingsInput = Schema.Struct({
  creationPolicy: CreationPolicy,
});
const UpdateTeamspaceDefaultsInput = Schema.Struct({
  defaultTeamspaceIds: Schema.Array(Schema.String.pipe(Schema.check(Schema.isMinLength(1)))).pipe(
    Schema.check(Schema.isMinLength(1)),
  ),
});
const UpdateInviteLinkInput = Schema.Struct({
  enabled: Schema.Boolean,
});
export type GetTeamspaceSettingsOperationInput = { workspaceId: string };
export async function getTeamspaceSettingsOperation(
  context: ServerOperationContext,
  operationInput: GetTeamspaceSettingsOperationInput,
) {
  requireOperationPolicy(context, { write: false, oauthScope: undefined });
  requireOperationWorkspace(context, operationInput.workspaceId);

  return ((service, userId, workspaceId) => service.getWorkspaceSettings(workspaceId, userId))(
    new TeamspaceManagementService(undefined, context.editionExtension ?? undefined, context.env),
    requireOperationActor(context).id,
    operationInput.workspaceId,
  );
}

export type UpdateTeamspaceSettingsOperationInput = { workspaceId: string; body?: unknown };
export async function updateTeamspaceSettingsOperation(
  context: ServerOperationContext,
  operationInput: UpdateTeamspaceSettingsOperationInput,
  readBody: () => Promise<unknown> = async () => operationInput.body,
) {
  requireOperationPolicy(context, { write: true, oauthScope: undefined });
  requireOperationWorkspace(context, operationInput.workspaceId);

  const parsed = await parseOperationBody(UpdateTeamspaceSettingsInput, readBody, strictJson);
  if (!parsed.ok) return deny({ error: parsed.message }, 400);
  return ((service, userId, workspaceId) =>
    service.updateWorkspaceSettings({ ...parsed.data, userId, workspaceId }))(
    new TeamspaceManagementService(undefined, context.editionExtension ?? undefined, context.env),
    requireOperationActor(context).id,
    operationInput.workspaceId,
  );
}

export type UpdateTeamspaceDefaultsOperationInput = { workspaceId: string; body?: unknown };
export async function updateTeamspaceDefaultsOperation(
  context: ServerOperationContext,
  operationInput: UpdateTeamspaceDefaultsOperationInput,
  readBody: () => Promise<unknown> = async () => operationInput.body,
) {
  requireOperationPolicy(context, { write: true, oauthScope: undefined });
  requireOperationWorkspace(context, operationInput.workspaceId);

  const parsed = await parseOperationBody(UpdateTeamspaceDefaultsInput, readBody, strictJson);
  if (!parsed.ok) return deny({ error: parsed.message }, 400);
  return ((service, userId, workspaceId) =>
    service.updateDefaults({
      defaultTeamspaceIds: [...parsed.data.defaultTeamspaceIds],
      userId,
      workspaceId,
    }))(
    new TeamspaceManagementService(undefined, context.editionExtension ?? undefined, context.env),
    requireOperationActor(context).id,
    operationInput.workspaceId,
  );
}

export type ListTeamspacesOperationInput = { workspaceId: string; status?: string };
export async function listTeamspacesOperation(
  context: ServerOperationContext,
  operationInput: ListTeamspacesOperationInput,
) {
  requireOperationPolicy(context, { write: false, oauthScope: undefined });
  requireOperationWorkspace(context, operationInput.workspaceId);

  return (async (service, userId, workspaceId) => ({
    teamspaces: await service.list({
      includeArchived: operationInput.status === "archived",
      userId,
      workspaceId,
    }),
  }))(
    new TeamspaceManagementService(undefined, context.editionExtension ?? undefined, context.env),
    requireOperationActor(context).id,
    operationInput.workspaceId,
  );
}

export type CreateTeamspaceOperationInput = { workspaceId: string; body?: unknown };
export async function createTeamspaceOperation(
  context: ServerOperationContext,
  operationInput: CreateTeamspaceOperationInput,
  readBody: () => Promise<unknown> = async () => operationInput.body,
) {
  requireOperationPolicy(context, { write: true, oauthScope: undefined });
  requireOperationWorkspace(context, operationInput.workspaceId);

  const parsed = await parseOperationBody(CreateTeamspaceInput, readBody, strictJson);
  if (!parsed.ok) return deny({ error: parsed.message }, 400);
  return ((service, userId, workspaceId) =>
    service.create({ ...parsed.data, userId, workspaceId }))(
    new TeamspaceManagementService(undefined, context.editionExtension ?? undefined, context.env),
    requireOperationActor(context).id,
    operationInput.workspaceId,
  );
}

export type GetTeamspaceOperationInput = { workspaceId: string; teamspaceId: string };
export async function getTeamspaceOperation(
  context: ServerOperationContext,
  operationInput: GetTeamspaceOperationInput,
) {
  requireOperationPolicy(context, { write: false, oauthScope: undefined });
  requireOperationWorkspace(context, operationInput.workspaceId);

  return ((service, userId, workspaceId) =>
    service.get({
      teamspaceId: operationInput.teamspaceId,
      userId,
      workspaceId,
    }))(
    new TeamspaceManagementService(undefined, context.editionExtension ?? undefined, context.env),
    requireOperationActor(context).id,
    operationInput.workspaceId,
  );
}

export type UpdateTeamspaceOperationInput = {
  workspaceId: string;
  teamspaceId: string;
  body?: unknown;
};
export async function updateTeamspaceOperation(
  context: ServerOperationContext,
  operationInput: UpdateTeamspaceOperationInput,
  readBody: () => Promise<unknown> = async () => operationInput.body,
) {
  requireOperationPolicy(context, { write: true, oauthScope: undefined });
  requireOperationWorkspace(context, operationInput.workspaceId);

  const parsed = await parseOperationBody(UpdateTeamspaceInput, readBody, strictJson);
  if (!parsed.ok) return deny({ error: parsed.message }, 400);
  return ((service, userId, workspaceId) =>
    service.update({
      ...parsed.data,
      teamspaceId: operationInput.teamspaceId,
      userId,
      workspaceId,
    }))(
    new TeamspaceManagementService(undefined, context.editionExtension ?? undefined, context.env),
    requireOperationActor(context).id,
    operationInput.workspaceId,
  );
}

export type SetTeamspaceMembershipOperationInput = {
  action: "join" | "leave";
  workspaceId: string;
  teamspaceId: string;
};
export async function setTeamspaceMembershipOperation(
  context: ServerOperationContext,
  operationInput: SetTeamspaceMembershipOperationInput,
) {
  requireOperationPolicy(context, { write: true, oauthScope: undefined });
  requireOperationWorkspace(context, operationInput.workspaceId);

  return ((service, userId, workspaceId) =>
    service[operationInput.action]({
      teamspaceId: operationInput.teamspaceId,
      userId,
      workspaceId,
    }))(
    new TeamspaceManagementService(undefined, context.editionExtension ?? undefined, context.env),
    requireOperationActor(context).id,
    operationInput.workspaceId,
  );
}

export type TeamspaceLifecycleOperationInput = {
  action: "archive" | "restore" | "recover-owner";
  workspaceId: string;
  teamspaceId: string;
};
export async function teamspaceLifecycleOperation(
  context: ServerOperationContext,
  operationInput: TeamspaceLifecycleOperationInput,
) {
  requireOperationPolicy(context, { write: true, oauthScope: undefined });
  requireOperationWorkspace(context, operationInput.workspaceId);

  return ((service, userId, workspaceId) =>
    service[operationInput.action === "recover-owner" ? "recoverOwner" : operationInput.action]({
      teamspaceId: operationInput.teamspaceId,
      userId,
      workspaceId,
    }))(
    new TeamspaceManagementService(undefined, context.editionExtension ?? undefined, context.env),
    requireOperationActor(context).id,
    operationInput.workspaceId,
  );
}

export type UpdateTeamspaceInviteLinkOperationInput = {
  workspaceId: string;
  teamspaceId: string;
  body?: unknown;
};
export async function updateTeamspaceInviteLinkOperation(
  context: ServerOperationContext,
  operationInput: UpdateTeamspaceInviteLinkOperationInput,
  readBody: () => Promise<unknown> = async () => operationInput.body,
) {
  requireOperationPolicy(context, { write: true, oauthScope: undefined });
  requireOperationWorkspace(context, operationInput.workspaceId);

  const parsed = await parseOperationBody(UpdateInviteLinkInput, readBody, strictJson);
  if (!parsed.ok) return deny({ error: parsed.message }, 400);
  return ((service, userId, workspaceId) =>
    service.updateInviteLink({
      enabled: parsed.data.enabled,
      teamspaceId: operationInput.teamspaceId,
      userId,
      workspaceId,
    }))(
    new TeamspaceManagementService(undefined, context.editionExtension ?? undefined, context.env),
    requireOperationActor(context).id,
    operationInput.workspaceId,
  );
}

export type AcceptTeamspaceInviteOperationInput = { workspaceId: string; token: string };
export async function acceptTeamspaceInviteOperation(
  context: ServerOperationContext,
  operationInput: AcceptTeamspaceInviteOperationInput,
) {
  requireOperationPolicy(context, { write: true, oauthScope: undefined });
  requireOperationWorkspace(context, operationInput.workspaceId);

  return ((service, userId, workspaceId) =>
    service.acceptInvite({
      token: operationInput.token,
      userId,
      workspaceId,
    }))(
    new TeamspaceManagementService(undefined, context.editionExtension ?? undefined, context.env),
    requireOperationActor(context).id,
    operationInput.workspaceId,
  );
}

export type ListTeamspacePrincipalsOperationInput = { workspaceId: string; teamspaceId: string };
export async function listTeamspacePrincipalsOperation(
  context: ServerOperationContext,
  operationInput: ListTeamspacePrincipalsOperationInput,
) {
  requireOperationPolicy(context, { write: false, oauthScope: undefined });
  requireOperationWorkspace(context, operationInput.workspaceId);

  return (async (service, userId, workspaceId) => ({
    principals: await service.listPrincipals({
      teamspaceId: operationInput.teamspaceId,
      userId,
      workspaceId,
    }),
  }))(
    new TeamspaceManagementService(undefined, context.editionExtension ?? undefined, context.env),
    requireOperationActor(context).id,
    operationInput.workspaceId,
  );
}

export type AddTeamspacePrincipalOperationInput = {
  workspaceId: string;
  teamspaceId: string;
  body?: unknown;
};
export async function addTeamspacePrincipalOperation(
  context: ServerOperationContext,
  operationInput: AddTeamspacePrincipalOperationInput,
  readBody: () => Promise<unknown> = async () => operationInput.body,
) {
  requireOperationPolicy(context, { write: true, oauthScope: undefined });
  requireOperationWorkspace(context, operationInput.workspaceId);

  const parsed = await parseOperationBody(AddPrincipalInput, readBody, strictJson);
  if (!parsed.ok) return deny({ error: parsed.message }, 400);
  return ((service, userId, workspaceId) =>
    service.addPrincipal({
      role: parsed.data.role,
      accessLevelOverride: parsed.data.accessLevelOverride,
      principalType: parsed.data.principalType ?? "user",
      targetUserId: parsed.data.userId,
      teamspaceId: operationInput.teamspaceId,
      userId,
      workspaceId,
    }))(
    new TeamspaceManagementService(undefined, context.editionExtension ?? undefined, context.env),
    requireOperationActor(context).id,
    operationInput.workspaceId,
  );
}

export type UpdateTeamspacePrincipalOperationInput = {
  workspaceId: string;
  principalId: string;
  teamspaceId: string;
  body?: unknown;
};
export async function updateTeamspacePrincipalOperation(
  context: ServerOperationContext,
  operationInput: UpdateTeamspacePrincipalOperationInput,
  readBody: () => Promise<unknown> = async () => operationInput.body,
) {
  requireOperationPolicy(context, { write: true, oauthScope: undefined });
  requireOperationWorkspace(context, operationInput.workspaceId);

  const parsed = await parseOperationBody(UpdatePrincipalInput, readBody, strictJson);
  if (!parsed.ok) return deny({ error: parsed.message }, 400);
  return ((service, userId, workspaceId) =>
    service.updatePrincipal({
      principalId: operationInput.principalId,
      role: parsed.data.role,
      accessLevelOverride: parsed.data.accessLevelOverride,
      teamspaceId: operationInput.teamspaceId,
      userId,
      workspaceId,
    }))(
    new TeamspaceManagementService(undefined, context.editionExtension ?? undefined, context.env),
    requireOperationActor(context).id,
    operationInput.workspaceId,
  );
}

export type RemoveTeamspacePrincipalOperationInput = {
  workspaceId: string;
  principalId: string;
  teamspaceId: string;
};
export async function removeTeamspacePrincipalOperation(
  context: ServerOperationContext,
  operationInput: RemoveTeamspacePrincipalOperationInput,
) {
  requireOperationPolicy(context, { write: true, oauthScope: undefined });
  requireOperationWorkspace(context, operationInput.workspaceId);

  return ((service, userId, workspaceId) =>
    service.removePrincipal({
      principalId: operationInput.principalId,
      teamspaceId: operationInput.teamspaceId,
      userId,
      workspaceId,
    }))(
    new TeamspaceManagementService(undefined, context.editionExtension ?? undefined, context.env),
    requireOperationActor(context).id,
    operationInput.workspaceId,
  );
}

function deny(body: Record<string, unknown>, status: number): never {
  throw new ServerOperationError(body, status);
}
