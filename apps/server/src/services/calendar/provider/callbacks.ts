import { runWithDbEnv } from "../../../infrastructure/database/index";
import type { RuntimeEnv } from "../../../shared/config/config";
import { dispatchCalendarWebhook } from "../background";
import { acceptCalendarWebhook } from "../realtime/watches";
import { completeCalendarOAuth, consumeCalendarOAuthAttempt } from "./oauth";
export function cancelCalendarConnection(env: RuntimeEnv, state: string) {
  return runWithDbEnv(env, () => consumeCalendarOAuthAttempt(state));
}
export function completeCalendarConnection(env: RuntimeEnv, state: string, code: string) {
  return runWithDbEnv(env, () => completeCalendarOAuth(env, state, code));
}
export function receiveCalendarWebhook(env: RuntimeEnv, headers: Headers) {
  return runWithDbEnv(env, () =>
    acceptCalendarWebhook(
      headers,
      (accountId, calendarId) => dispatchCalendarWebhook(env, accountId, calendarId),
      env,
    ),
  );
}
