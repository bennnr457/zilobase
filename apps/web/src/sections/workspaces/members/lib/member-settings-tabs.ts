export function getTeamSettingsTabCounts(input: {
  guests: number;
  members: number;
  pendingGuestRequests: number;
  pendingInvitations: number;
}) {
  return {
    guests: input.guests + input.pendingGuestRequests,
    team: input.members + input.pendingInvitations,
  };
}
