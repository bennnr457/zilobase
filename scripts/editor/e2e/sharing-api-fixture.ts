const parameters = new URLSearchParams(window.location.search);
export const sharingTarget = parameters.get("sharing");
export const sharingLevel = parameters.get("access") === "view" ? "view" : "full";
export const sharingWrites: Array<{ path: string; method: string; body: unknown }> = [];
let rules: unknown[] = [];
let version = 1;
const invitations: unknown[] = [];
const members = [
  { id: "owner", name: "Owner", email: "owner@example.test" },
  { id: "alice", name: "Alice", email: "alice@example.test" },
];

export const sharingAuth = {
  getSession: async () => ({
    user: { ...members[0], emailVerified: true, image: null },
    session: { id: "session", userId: "owner", activeWorkspaceId: "workspace" },
  }),
  listWorkspaces: async () => [{ id: "workspace", name: "Workspace", slug: "workspace" }],
};

export function sharingResponse(path: string, options?: RequestInit): unknown {
  if (!sharingTarget) return undefined;
  const method = options?.method ?? "GET";
  if (path.endsWith("/commands")) {
    const request = JSON.parse(String(options?.body));
    const command = request.command;
    const body =
      command.type === "database.publish"
        ? { accessLevel: "view", targetId: "*", targetType: "public" }
        : {
            accessLevel: command.accessLevel,
            targetId: command.targetId,
            targetType: command.targetType,
          };
    // Exercise the real database controller and its confirmation/invalidation path.
    sharingResponse("/databases/database/access", { method: "PUT", body: JSON.stringify(body) });
    return {
      commandId: request.commandId,
      event: {
        actorId: "owner",
        areas: ["databases"],
        changes: {},
        commandId: request.commandId,
        committedAt: "2026-10-15T00:00:00Z",
        databaseId: "database",
        dataSourceId: null,
        eventId: request.commandId,
        protocolVersion: 2,
        type: "database.mutation",
        version: ++version,
      },
      sourceVersions: {},
      result: { access: rules },
    };
  }
  if (path.endsWith("/access-targets")) return { members, teams: [], guests: [] };
  if (path.endsWith("/guest-policy")) return { policy: { mode: "allow", canApprove: true } };
  if (path.endsWith("/guest-requests")) return { requests: [] };
  if (path.endsWith("/guest-invitations")) {
    if (method === "POST") {
      const body = JSON.parse(String(options?.body));
      sharingWrites.push({ path, method, body });
      const invitation = { ...body, id: "invitation", pageId: "main", status: "pending" };
      invitations.push(invitation);
      return { invitation };
    }
    return { invitations };
  }
  if (path.endsWith("/access")) {
    if (method === "PUT") {
      const body = JSON.parse(String(options?.body));
      sharingWrites.push({ path, method, body });
      rules = [
        ...rules,
        {
          ...body,
          id: `rule-${sharingWrites.length}`,
          workspaceId: "workspace",
          ...(path.startsWith("/databases/") ? { databaseId: "database" } : { pageId: "main" }),
          createdAt: "2026-10-15T00:00:00Z",
          updatedAt: "2026-10-15T00:00:00Z",
        },
      ];
    }
    return { access: rules };
  }
  return undefined;
}
