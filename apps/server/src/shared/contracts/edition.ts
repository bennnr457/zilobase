import type { AppPolicy, Ports } from "@zilobase/runtime-ports";
import type { BetterAuthPlugin } from "better-auth";
import type { Hono } from "hono";
import type { Database } from "../../infrastructure/database";
import type { AppErrorReporter } from "./error-reporting";
import type { AppBindings } from "./http";
const MEMBERSHIP_GRANT_SOURCES = [
  "bootstrap",
  "open-registration",
  "invitation",
  "admin",
  "extension",
  "scim",
] as const;

export type MembershipGrantSource = (typeof MEMBERSHIP_GRANT_SOURCES)[number];

export type MembershipGrantInput = {
  database: Database;
  role: string;
  source: MembershipGrantSource;
  userId: string;
  workspaceId: string;
};

export type InvitationPolicyInput = {
  database: Database;
  email: string;
  role: string;
  workspaceId: string;
};

export type SecurityEvent = {
  actorUserId?: string | null;
  database: Database;
  details?: Record<string, boolean | number | string | null>;
  occurredAt: Date;
  type: string;
  userId?: string | null;
  workspaceId?: string | null;
};

export type SessionPolicyDenial = {
  code: string;
  message: string;
  status: 401 | 403;
};

export type ZilobaseEditionExtension = {
  readonly id: string;
  readonly capabilities: readonly string[];
  createAuthPlugins(input: {
    database: Database;
    env: Record<string, unknown>;
    request: Request;
  }): Promise<readonly BetterAuthPlugin[]>;
  registerRoutes(app: Hono<AppBindings>): void;
  beforeMembershipGrant(input: MembershipGrantInput): Promise<void>;
  beforeInvitationCreate?(input: InvitationPolicyInput): Promise<void>;
  assertSession?(input: {
    authMethod: "session";
    database: Database;
    request: Request;
    session: { activeWorkspaceId?: string | null; id: string };
    user: { email?: string | null; id: string };
  }): Promise<SessionPolicyDenial | void>;
  recordSecurityEvent(event: SecurityEvent): Promise<void>;
};

export type EditionExtensionOptions = {
  editionExtension?: ZilobaseEditionExtension;
  errorReporter?: AppErrorReporter;
  policy?: AppPolicy;
  ports?: Partial<Ports<any>>;
};

/**
 * The database value is intentionally opaque to external editions. Core owns
 * its schema and is the only package that interprets this handle.
 */
export type EditionDatabase = unknown;

export type EditionInstance = {
  instanceId: string;
  pinnedWorkspaceId: string | null;
};

export type EditionMembership = {
  role: string;
};

export type EditionPersistencePort = {
  countWorkspaceMemberships(
    database: EditionDatabase,
    input: {
      excludedUserIds?: readonly string[];
      roles: readonly string[];
      workspaceId: string;
    },
  ): Promise<number>;
  findVerifiedUsersByEmail(
    database: EditionDatabase,
    normalizedEmail: string,
  ): Promise<Array<{ emailVerified: boolean; id: string }>>;
  hasEnabledMembershipTrigger(database: EditionDatabase, triggerName: string): Promise<boolean>;
  readInstance(database: EditionDatabase): Promise<EditionInstance | null>;
  readWorkspaceMembership(
    database: EditionDatabase,
    input: { userId: string; workspaceId: string },
  ): Promise<EditionMembership | null>;
};
