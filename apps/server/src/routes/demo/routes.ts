import { Hono } from "hono";
import { getDemoWorkspace } from "../../services/demo/bootstrap";

import { DEMO_SEED_VERSION, DEMO_START_PATH } from "../../services/demo/constants";
import type { AppBindings } from "../../shared/contracts/http";
import { requireDemoContext } from "./request";

export const demoRoutes = new Hono<AppBindings>();

demoRoutes.get("/bootstrap", async (c) => {
  if (!requireDemoContext(c)) {
    return c.json({ error: "Not found" }, 404);
  }

  const demoWorkspace = await getDemoWorkspace();
  if (!demoWorkspace) {
    return c.json({ code: "DEMO_UNAVAILABLE", error: "The hosted demo is unavailable." }, 503);
  }

  return c.json({
    demoMode: true,
    seedVersion: DEMO_SEED_VERSION,
    startPath: DEMO_START_PATH,
    workspace: demoWorkspace,
  });
});
