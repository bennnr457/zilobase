import { normalizeAccessLevel, type AccessLevel } from "../access/access-level";
export class PageGuestServiceError extends Error {
  constructor(
    message: string,
    readonly status: 400 | 403 | 404 | 409,
  ) {
    super(message);
    this.name = "PageGuestServiceError";
  }
}

export function normalizeGuestEmail(value: string) {
  return value.trim().toLowerCase();
}

export function parseGuestAccessLevel(value: unknown): Exclude<AccessLevel, "none"> {
  const accessLevel = normalizeAccessLevel(value);

  if (!accessLevel || accessLevel === "none") {
    throw new PageGuestServiceError("Guest access must be view, comment, edit, or full.", 400);
  }

  return accessLevel;
}

export type GuestInviteMode = "direct" | "owners_only" | "request";

export function resolveGuestInviteSubmission(mode: GuestInviteMode, role: string | null) {
  if (!role) return "forbidden" as const;
  if (role === "owner" || mode === "direct") return "invitation" as const;
  if (mode === "request") return "request" as const;
  return "forbidden" as const;
}
