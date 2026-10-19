import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ZilobaseEditionExtension } from "../../../shared/contracts/edition";
import { removeWorkspaceMember, updateWorkspaceMember } from "./workspace-members";

const state = vi.hoisted(() => ({
  target: null as null | { id: string; userId: string; role: string },
  ownerCount: 1,
  events: [] as string[],
  recordSecurityEvent: vi.fn(),
}));
vi.mock("../../../infrastructure/database", () => ({
  db: {
    transaction: async (run: (tx: unknown) => Promise<unknown>) => {
      let selects = 0;
      const tx = {
        select: () => ({
          from: () => ({
            where: () =>
              ++selects === 1
                ? { for: () => ({ limit: async () => (state.target ? [state.target] : []) }) }
                : Promise.resolve([{ count: state.ownerCount }]),
          }),
        }),
        update: () => ({
          set: (values: object) => ({
            where: () => ({
              returning: async () => {
                state.events.push("write");
                return [{ ...state.target, ...values }];
              },
            }),
          }),
        }),
      };
      const result = await run(tx);
      state.events.push("commit");
      return result;
    },
  },
}));

beforeEach(() => {
  state.target = { id: "member", userId: "target", role: "owner" };
  state.ownerCount = 1;
  state.events.length = 0;
  state.recordSecurityEvent.mockReset().mockImplementation(async () => {
    state.events.push("audit");
  });
});
const extension = {
  recordSecurityEvent: state.recordSecurityEvent,
} as unknown as ZilobaseEditionExtension;

describe("workspace membership operations", () => {
  it("prevents demoting or removing the last owner without writing or auditing", async () => {
    await expect(
      updateWorkspaceMember(
        "workspace",
        "member",
        { id: "actor" },
        { role: "owner" },
        { role: "member" },
        null,
        extension,
      ),
    ).rejects.toMatchObject({ status: 409 });
    await expect(
      removeWorkspaceMember("workspace", "member", { id: "actor" }, extension),
    ).rejects.toMatchObject({ status: 409 });
    expect(state.events).not.toContain("write");
    expect(state.recordSecurityEvent).not.toHaveBeenCalled();
  });

  it("requires an owner to change owner roles", async () => {
    await expect(
      updateWorkspaceMember(
        "workspace",
        "member",
        { id: "actor" },
        { role: "admin" },
        { role: "member" },
        null,
        extension,
      ),
    ).rejects.toMatchObject({ status: 403 });
    expect(state.events).not.toContain("write");
  });

  it("records the security event only after the member update commits", async () => {
    state.target!.role = "member";
    const expiresAt = new Date("2026-12-01T00:00:00Z");
    const result = await updateWorkspaceMember(
      "workspace",
      "member",
      { id: "actor" },
      { role: "owner" },
      { role: "temporary" },
      expiresAt,
      extension,
    );
    expect(result.role).toBe("temporary");
    expect(state.events).toEqual(["write", "commit", "audit"]);
    expect(state.recordSecurityEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "membership.updated",
        userId: "target",
        details: { role: "temporary", accessExpiresAt: expiresAt.toISOString() },
      }),
    );
  });
});
