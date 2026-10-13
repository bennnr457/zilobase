import type { useTeamspaceLifecycle } from "./hooks";

export async function archiveTeamspaces(
  mutate: ReturnType<typeof useTeamspaceLifecycle>["mutateAsync"],
  workspaceId: string,
  teamspaceIds: Iterable<string>,
) {
  for (const teamspaceId of teamspaceIds)
    await mutate({ action: "archive", teamspaceId, workspaceId });
}

export function readTeamspaceInvitation(search: string, workspaceId: string) {
  const params = new URLSearchParams(search);
  const token = params.get("invite");
  return token && params.get("workspace") === workspaceId ? { token, workspaceId } : null;
}
