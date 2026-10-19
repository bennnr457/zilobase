export const REGISTRATION_MODES = ["invite-only", "open"] as const;

export type RegistrationMode = (typeof REGISTRATION_MODES)[number];

export function parseRegistrationMode(value: string): RegistrationMode {
  if (value === "invite-only" || value === "open") {
    return value;
  }

  throw new Error("Instance registration mode is invalid");
}
