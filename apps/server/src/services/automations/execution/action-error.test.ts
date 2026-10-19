import { expect, it } from "vitest";
import { AutomationActionError, isRetryableAutomationDatabaseError } from "./action-error";

it.each(["ECONNRESET", "ECONNREFUSED", "57P03", "40001", "40P01"])(
  "recognizes nested retryable database error %s",
  (code) => {
    const wrapped = Object.assign(new Error("query failed"), {
      code: "WRAPPER",
      cause: new AggregateError([Object.assign(new Error("database"), { code })]),
    });
    expect(isRetryableAutomationDatabaseError(wrapped)).toBe(true);
  },
);
it("terminates on cycles and preserves permanent business failures", () => {
  const cyclic: { cause?: unknown } = {};
  cyclic.cause = cyclic;
  expect(isRetryableAutomationDatabaseError(cyclic)).toBe(false);
  expect(
    isRetryableAutomationDatabaseError(new AutomationActionError("Access denied", "FORBIDDEN")),
  ).toBe(false);
  expect(isRetryableAutomationDatabaseError({ code: "23505" })).toBe(false);
});
