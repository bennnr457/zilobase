import { Hono } from "hono";
import {
  disconnectAutomationSlackOperation,
  listAutomationSlackChannelsOperation,
  startAutomationSlackConnectionOperation,
} from "../../services/automations/slack-operations";
import { getDatabaseRecord } from "../../services/databases/access/database-access";
import { pinnedResourceMiddleware } from "../auth/pinned-resource-middleware";
import { serverOperationContext } from "../http/operation-context";
import { attachServiceErrorHandler } from "../http/route-error";

import {
  completeSlackOauth,
  SlackProviderError,
} from "../../services/automations/actions/slack/slack-provider";
import { getCanonicalWebOrigin } from "../../shared/config/config";
import type { AppBindings } from "../../shared/contracts/http";

export const automationSlackRoutes = attachServiceErrorHandler(new Hono<AppBindings>());
const resourceWorkspace = pinnedResourceMiddleware(
  (id) => getDatabaseRecord(id, { includeDeleted: true }),
  "databaseId",
);

export const automationSlackProviderRoutes = attachServiceErrorHandler(new Hono<AppBindings>());

automationSlackRoutes.post(
  "/:databaseId/automation-slack/oauth/start",
  resourceWorkspace,
  async (c) =>
    c.json(
      await startAutomationSlackConnectionOperation(
        serverOperationContext(c),
        { databaseId: c.req.param("databaseId")! },
        () => c.req.json(),
      ),
      200,
    ),
);

automationSlackRoutes.get(
  "/:databaseId/automation-slack/connections/:connectionId/channels",
  resourceWorkspace,
  async (c) =>
    c.json(
      await listAutomationSlackChannelsOperation(serverOperationContext(c), {
        databaseId: c.req.param("databaseId")!,
        dataSourceId: c.req.query("dataSourceId"),
        connectionId: c.req.param("connectionId")!,
      }),
      200,
    ),
);

automationSlackRoutes.delete(
  "/:databaseId/automation-slack/connections/:connectionId",
  resourceWorkspace,
  async (c) =>
    c.json(
      await disconnectAutomationSlackOperation(serverOperationContext(c), {
        databaseId: c.req.param("databaseId")!,
        dataSourceId: c.req.query("dataSourceId"),
        connectionId: c.req.param("connectionId")!,
      }),
      200,
    ),
);

automationSlackProviderRoutes.get("/automation-slack/oauth/callback", async (c) => {
  c.header(
    "Content-Security-Policy",
    "default-src 'none'; base-uri 'none'; frame-ancestors 'none'",
  );
  c.header("Cache-Control", "no-store, max-age=0");
  c.header("Referrer-Policy", "no-referrer");
  c.header("X-Content-Type-Options", "nosniff");
  const code = c.req.query("code");
  const state = c.req.query("state");
  if (!code || !state || c.req.query("error"))
    return c.html(resultPage("Slack connection was cancelled"), 400);
  try {
    await completeSlackOauth(c.env ?? {}, { code, state });
    const target = new URL("/?automationSlack=connected", getCanonicalWebOrigin(c.env ?? {}));
    return c.redirect(target.toString());
  } catch (error) {
    return c.html(
      resultPage(error instanceof Error ? error.message : "Slack could not be connected"),
      error instanceof SlackProviderError ? (error.status as 400) : 500,
    );
  }
});

function resultPage(message: string) {
  const escaped = message.replace(
    /[&<>"']/g,
    (character) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]!,
  );
  return `<!doctype html><meta charset="utf-8"><title>Slack connection</title><p>${escaped}</p>`;
}
