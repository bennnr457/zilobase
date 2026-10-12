import type { DatabaseAccessRule } from "../databases/access/access-contracts";
import type { AccessLevel, PageAccessRule } from "./contracts";
export function getGuestPageId(
  databaseId: string | null | undefined,
  pageId: string | null | undefined,
) {
  return databaseId ? null : pageId;
}
export function isSharingWorkspaceMember(
  targets: { members: { id: string }[] } | undefined,
  session: { user?: { id: string } | null } | null | undefined,
) {
  return Boolean(targets?.members.some((member) => member.id === session?.user?.id));
}
export function getSharingAccessLevel(
  isDatabase: boolean,
  database: { database: { accessLevel?: AccessLevel | null } } | null | undefined,
  pageLevel: AccessLevel | null | undefined,
) {
  return isDatabase ? database?.database.accessLevel : pageLevel;
}
export function getSharingRules(
  isDatabase: boolean,
  database: { access: DatabaseAccessRule[] } | undefined,
  page: { access: PageAccessRule[] } | undefined,
) {
  return isDatabase ? (database?.access ?? []) : (page?.access ?? []);
}
export function getPendingItems<T extends { status: string }>(items: T[] | undefined) {
  return (items ?? []).filter((item) => item.status === "pending");
}
export function getGuestActionLabel(
  policy: { mode: string; canApprove: boolean } | null | undefined,
) {
  return policy?.mode === "request" && !policy.canApprove ? "Request" : "Invite";
}
