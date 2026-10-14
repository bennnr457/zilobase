export * from "./adapter-api";
export {
  assertMigrationSets,
  createNodeRuntime,
  runMigrationSets,
  type MigrationSet,
  type NodeRuntimeOptions,
} from "@zilobase/runtime-adapter/node";

// Node-seam values consumed by `@zilobase/runtime-adapter/node`.
// The adapter package imports these (and only these) server surfaces;
// deep relative imports from the adapter package are banned by
// `community-boundary` tests.
export {
  getDefaultCollaborationHocuspocus,
  setCollaborationExtensionsFactory,
} from "../services/collaboration/service";
export { assertSelfHostedProductionConfiguration } from "../services/instance/registration";
export { getAppEditionExtension } from "../shared/edition-extension-registry";
export { renderPrometheusBackgroundMetrics } from "../infrastructure/background/telemetry";
export { renderPrometheusDatabaseMetrics } from "../services/databases/observability";
export { boundedErrorCode } from "../infrastructure/background/dispatch";
export { db, createDbClientForUrl, runWithIndependentDbEnv } from "../infrastructure/database";
export {
  databaseAutomationEventWindow,
  databaseAutomationRun,
  databaseRealtimeOutbox,
  inProductNotificationOutbox,
  calendarProviderCalendar,
  navigationRealtimeOutbox,
} from "../infrastructure/database/schema";
export { isBlockedAddress } from "../services/automations/actions/webhook-egress";
export {
  CALENDAR_REALTIME_AUTH_PROTOCOL_PREFIX,
  CALENDAR_REALTIME_PROTOCOL,
  createCalendarRealtimeTicket,
  verifyCalendarRealtimeTicket,
  type CalendarRealtimeTicketClaims,
} from "../services/calendar/realtime/calendar-realtime-ticket";
export {
  MEETING_AUDIO_SOURCES,
  meetingAudioSourceFromCode,
  type MeetingAudioSource,
} from "../services/meetings/audio/meeting-audio-ticket";
export { transitionMeeting } from "../services/meetings/lifecycle/meeting-service";
export { getStringEnv } from "../shared/config/config";

// Zilobase wiring owned by the server package: the core migration set points
// at `apps/server/drizzle`, so it lives here (not in the adapter package).
// The adapter consumes it through `NodeRuntimeOptions.migrationSets`.
import { fileURLToPath } from "node:url";
import type { MigrationSet } from "@zilobase/runtime-adapter/node";

export const CORE_MIGRATION_SET: MigrationSet = {
  id: "core",
  journalTable: "__zilobase_core_migrations",
  migrationsFolder: fileURLToPath(new URL("../../drizzle", import.meta.url)),
};
