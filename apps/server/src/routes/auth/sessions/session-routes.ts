import type { Context } from "hono";
import { Hono } from "hono";
import { getSessionOperation } from "../../../services/auth/sessions/operations";
import type { AppBindings } from "../../../shared/contracts/http";
import { serverOperationContext } from "../../http/operation-context";
import { attachServiceErrorHandler } from "../../http/route-error";

export const sessionRoutes = attachServiceErrorHandler(new Hono<AppBindings>());

sessionRoutes.get("/", (c) =>
  timed(c, "route_session_total", async () => {
    return c.json(
      await getSessionOperation(serverOperationContext(c), {}, (name, run) => timed(c, name, run)),
    );
  }),
);

async function timed<T>(c: Context<AppBindings>, name: string, run: () => Promise<T>) {
  const startedAt = performance.now();

  try {
    return await run();
  } finally {
    c.get("serverTimings").push(
      `zilobase_${name};dur=${Math.round(performance.now() - startedAt)}`,
    );
  }
}
