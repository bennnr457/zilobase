import type { BetterAuthPlugin } from "better-auth";
import type { Hono } from "hono";
import type { AppPolicy, Ports } from "@zilobase/runtime-ports";

import type { Auth } from "../features/auth";
// The public edition contract exposes the canonical Drizzle database type.
import type { Database } from "../infrastructure/database";

type AuthSession = Auth["$Infer"]["Session"]["session"] & {
  activeWorkspaceId?: string | null;
  activeTeamId?: string | null;
};

type ApiKeyContext = {
  id: string;
  workspaceId: string;
  referenceId: string;
};

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

export type AppErrorReport = {
  code: string;
  error: Error;
  method: string;
  requestId: string;
  route: string;
  status: 500 | 503;
  userId: string | null;
  workspaceId: string | null;
};

export type AppErrorReporter = (
  report: AppErrorReport,
  env: AppBindings["Bindings"],
) => Promise<void> | void;

export type AppBindings = {
  Bindings: {
    BETTER_AUTH_SECRET: string;
    BETTER_AUTH_URL: string;
    CLIENT_URL: string;
    COLLABORATION_SECRET?: string;
    COLLABORATION_WEBSOCKET_URL?: string;
    DATABASE_REALTIME_WEBSOCKET_URL?: string;
    DATABASE_AUTOMATIONS_ENABLED?: string;
    DATABASE_URL?: string;
    EMAIL_FROM?: string;
    GOOGLE_CLIENT_ID?: string;
    GOOGLE_CLIENT_SECRET?: string;
    OPENAI_API_KEY?: string;
    POSTHOG_HOST?: string;
    POSTHOG_PROJECT_TOKEN?: string;
    SMTP_HOST?: string;
    SMTP_PASSWORD?: string;
    SMTP_PORT?: string;
    SMTP_SECURE?: string;
    SMTP_USER?: string;
    IMAGE_READ_URL_TTL_SECONDS?: string;
    IMAGE_STORAGE_MODE?: "s3" | "binding";
    IMAGE_UPLOAD_MAX_BYTES?: string;
    IMAGE_UPLOAD_URL_TTL_SECONDS?: string;
    MEETING_BLOCK_ENABLED?: string;
    MEETING_AUDIO_WEBSOCKET_URL?: string;
    MEETING_COLLABORATION_WEBSOCKET_URL?: string;
    OPENAI_REALTIME_TRANSCRIPTION_MODEL?: string;
    REALTIME_REDIS_URL?: string;
    ZILOBASE_DEMO_ENABLED?: string;
    ZILOBASE_INSTANCE_NAME?: string;
    ZILOBASE_ENVIRONMENT?: string;
    ZILOBASE_BOOTSTRAP_TOKEN?: string;
    ZILOBASE_MINIMUM_DESKTOP_VERSION?: string;
    S3_ACCESS_KEY_ID?: string;
    S3_BUCKET_NAME?: string;
    S3_ENDPOINT?: string;
    S3_PUBLIC_ENDPOINT?: string;
    S3_SECRET_ACCESS_KEY?: string;
  };
  Variables: {
    apiKey: ApiKeyContext | null;
    authMethod: "apiKey" | "demo" | "oauth" | "session" | null;
    oauthScopes: string[] | null;
    requestId: string;
    editionExtension: ZilobaseEditionExtension | null;
    appPolicy: AppPolicy;
    runtimePorts: Partial<Ports<any>>;
    serverTimings: string[];
    user: Auth["$Infer"]["Session"]["user"] | null;
    session: AuthSession | null;
  };
};
