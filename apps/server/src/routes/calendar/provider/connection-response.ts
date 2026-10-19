import { calendarConnectionReturnPath } from "@zilobase/features/runtime";
import type { Context } from "hono";
import { getZilobaseDiscoveryDocument } from "../../../services/instance/discovery/discovery";
import { getCanonicalWebOrigin } from "../../../shared/config/config";
import type { AppBindings } from "../../../shared/contracts/http";
export async function finishCalendarConnection(
  c: Context<AppBindings>,
  attempt: { clientKind: string; workspaceId: string },
  outcome: "success" | "cancelled",
) {
  const path = calendarConnectionReturnPath(attempt.workspaceId, outcome);
  if (attempt.clientKind !== "desktop")
    return c.redirect(new URL(path, getCanonicalWebOrigin(c.env)).toString());
  const discovery = await getZilobaseDiscoveryDocument(c.env),
    url = new URL("zilobase://open");
  url.search = new URLSearchParams({
    instance: discovery.instanceId,
    server: discovery.apiOrigin,
    path,
  }).toString();
  const safe = url.toString().replaceAll("&", "&amp;").replaceAll('"', "&quot;");
  const title = outcome === "success" ? "Calendar connected" : "Calendar connection cancelled";
  c.header(
    "Content-Security-Policy",
    "default-src 'none'; base-uri 'none'; frame-ancestors 'none'",
  );
  return c.html(
    `<!doctype html><title>${title}</title><p>${title}.</p><a href="${safe}">Open Zilobase Desktop</a>`,
  );
}
