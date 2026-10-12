export function getTeamspacePrincipalCandidates(
  principals: { principalId: string }[],
  targets:
    | {
        members: { id: string; name: string; email: string }[];
        teams: { id: string; name: string }[];
      }
    | undefined,
) {
  const memberIds = new Set(principals.map((principal) => principal.principalId));
  return [
    ...(targets?.members ?? [])
      .filter((member) => !memberIds.has(member.id))
      .map((member) => ({
        id: member.id,
        label: `${member.name} · ${member.email}`,
        type: "user" as const,
      })),
    ...(targets?.teams ?? [])
      .filter((team) => !memberIds.has(team.id))
      .map((team) => ({
        id: team.id,
        label: `${team.name} · group`,
        type: "team" as const,
      })),
  ];
}
