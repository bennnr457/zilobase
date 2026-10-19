import type { Context } from "hono";

import { DEMO_HEADER, DEMO_HEADER_VALUE } from "../../services/demo/constants";
import type { AppBindings } from "../../shared/contracts/http";

export function isHostedDemoEnabled(env?: AppBindings["Bindings"]) {
  return env?.ZILOBASE_DEMO_ENABLED?.trim().toLowerCase() === "true";
}

export function isHostedDemoRequest(env: AppBindings["Bindings"] | undefined, headers: Headers) {
  return isHostedDemoEnabled(env) && headers.get(DEMO_HEADER)?.trim() === DEMO_HEADER_VALUE;
}

export function requireDemoContext(c: Context<AppBindings>) {
  return c.get("authMethod") === "demo";
}
