import { Hono } from "hono";
import { expect, test } from "vitest";
import type { AppBindings } from "../../shared/contracts/http";
import { ServiceMutationError } from "../../shared/errors/service-mutation-error";
import { attachServiceErrorHandler } from "./route-error";

test("extracted service denials retain their original HTTP body and status", async () => {
  const child = attachServiceErrorHandler(new Hono<AppBindings>());
  child.get("/", () => {
    throw new ServiceMutationError("The workspace must keep at least one owner.", 409);
  });
  const app = new Hono<AppBindings>().route("/workspace", child);
  const response = await app.request("/workspace");
  expect(response.status).toBe(409);
  expect(await response.json()).toEqual({ error: "The workspace must keep at least one owner." });
});

test("unexpected service failures reach the application error handler", async () => {
  const failure = new Error("database unavailable");
  const child = attachServiceErrorHandler(new Hono<AppBindings>());
  child.get("/", () => {
    throw failure;
  });
  let reported: Error | undefined;
  const app = new Hono<AppBindings>().route("/workspace", child).onError((error, c) => {
    reported = error;
    c.header("Retry-After", "5");
    return c.json({ code: "DATABASE_UNAVAILABLE" }, 503);
  });
  const response = await app.request("/workspace");
  expect(reported).toBe(failure);
  expect(response.status).toBe(503);
  expect(response.headers.get("Retry-After")).toBe("5");
});
