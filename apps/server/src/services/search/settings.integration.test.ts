import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { db, runWithDbEnv } from "../../infrastructure/database";
import type { ServerOperationContext } from "../operations/context";
import {
  getSearchSettingsOperation,
  reindexSearchWorkspaceOperation,
  updateSearchSettingsOperation,
} from "./settings";

const url = process.env.ZILOBASE_SEARCH_TEST_DATABASE_URL;
describe.skipIf(!url)("workspace search operations", () => {
  let w: string, u: string, context: ServerOperationContext;
  const within = <T>(fn: () => Promise<T>) => runWithDbEnv({ DATABASE_URL: url }, fn);
  const epoch = async () =>
    (
      await db.execute<{ index_epoch: string }>(
        sql`select index_epoch::text from workspace_search_settings where workspace_id=${w}`,
      )
    ).rows[0]?.index_epoch;
  const enable = () =>
    updateSearchSettingsOperation(context, { workspaceId: w, body: { enabled: true } });
  beforeAll(() => {
    if (!["localhost", "127.0.0.1"].includes(new URL(url!).hostname))
      throw new Error("Isolated loopback database required");
  });
  beforeEach(async () =>
    within(async () => {
      w = randomUUID();
      u = randomUUID();
      await db.execute(sql`insert into workspace(id,name,slug) values(${w},'Settings test',${w})`);
      await db.execute(
        sql`insert into "user"(id,name,email) values(${u},'Test',${u + "@example.test"})`,
      );
      await db.execute(
        sql`insert into member(id,workspace_id,user_id,role) values(${randomUUID()},${w},${u},'owner')`,
      );
      context = {
        authentication: {
          user: { id: u } as never,
          authMethod: "session",
          apiKey: null,
          oauthScopes: [],
          session: null,
        },
        activeWorkspaceId: w,
        pinnedWorkspaceId: null,
        env: {
          SEARCH_EMBEDDINGS_ENABLED: "true",
          GEMINI_API_KEY: "test-key-unused",
          ZILOBASE_CELL_ID: "search-settings-test",
        },
        policy: {} as never,
        editionExtension: null,
        runtimePorts: {
          readiness: {
            background: () => ({
              producerReady: true,
              consumerReady: true,
              maintenanceFresh: true,
            }),
            realtime: () => true,
          },
        },
        requestId: "search-settings-test",
      };
    }),
  );
  afterEach(async () =>
    within(async () => {
      await db.execute(
        sql`delete from background_dispatch where cell_id='search-settings-test' and resource_id=${w}`,
      );
      await db.execute(sql`delete from workspace where id=${w}`);
      await db.execute(sql`delete from "user" where id=${u}`);
    }),
  );
  it("defaults to disabled, enables durably, and treats repeated enablement idempotently", async () =>
    within(async () => {
      expect(await getSearchSettingsOperation(context, { workspaceId: w })).toMatchObject({
        enabled: false,
        canManage: true,
        capability: { available: true },
      });
      const result = await enable();
      expect(result.enabled).toBe(true);
      const first = await epoch();
      expect(
        (
          await db.execute(
            sql`select 1 from background_dispatch where cell_id='search-settings-test' and resource_id=${w} and kind='search.workspace_scan'`,
          )
        ).rows,
      ).toHaveLength(1);
      await enable();
      expect(await epoch()).toBe(first);
      expect(JSON.stringify(result)).not.toContain("test-key-unused");
    }));
  it("allows admins and rejects ordinary members, temporary members, guests and foreign scopes", async () =>
    within(async () => {
      await db.execute(sql`update member set role='admin' where workspace_id=${w}`);
      await enable();
      for (const role of ["member", "temporary"]) {
        await db.execute(
          sql`update member set role=${role},access_expires_at=case when ${role}='temporary' then now()+interval '1 hour' else null end where workspace_id=${w}`,
        );
        await expect(enable()).rejects.toMatchObject({ status: 403 });
      }
      await db.execute(sql`delete from member where workspace_id=${w}`);
      await db.execute(
        sql`insert into workspace_guest(id,workspace_id,user_id) values(${randomUUID()},${w},${u})`,
      );
      await expect(enable()).rejects.toMatchObject({ status: 403 });
      await expect(getSearchSettingsOperation(context, { workspaceId: w })).rejects.toMatchObject({
        status: 403,
      });
      await expect(
        updateSearchSettingsOperation(
          { ...context, pinnedWorkspaceId: "other" },
          { workspaceId: w, body: { enabled: true } },
        ),
      ).rejects.toMatchObject({ status: 403 });
    }));
  it("rejects unavailable deployment and invalid input but always permits authorized disablement", async () =>
    within(async () => {
      await expect(
        updateSearchSettingsOperation(
          { ...context, env: {} },
          { workspaceId: w, body: { enabled: true } },
        ),
      ).rejects.toMatchObject({ status: 409 });
      await expect(
        updateSearchSettingsOperation(context, { workspaceId: w, body: { enabled: "true" } }),
      ).rejects.toMatchObject({ status: 400 });
      await enable();
      const first = Number(await epoch());
      expect(
        (
          await updateSearchSettingsOperation(
            { ...context, env: { ...context.env, SEARCH_EMBEDDINGS_ENABLED: "false" } },
            { workspaceId: w, body: { enabled: false } },
          )
        ).enabled,
      ).toBe(false);
      expect(Number(await epoch())).toBe(first + 1);
      await updateSearchSettingsOperation(context, { workspaceId: w, body: { enabled: false } });
      expect(Number(await epoch())).toBe(first + 1);
    }));
  it("fences reset work and retains active backfill cursor on repeated reindex requests", async () =>
    within(async () => {
      await enable();
      await db.execute(
        sql`update workspace_search_settings set backfill_completed_at=now() where workspace_id=${w}`,
      );
      const first = Number(await epoch());
      await reindexSearchWorkspaceOperation(context, { workspaceId: w });
      expect(Number(await epoch())).toBe(first + 1);
      await reindexSearchWorkspaceOperation(context, { workspaceId: w });
      expect(Number(await epoch())).toBe(first + 1);
      await db.execute(
        sql`update workspace_search_settings set last_error_code='TRANSPORT_RETRIES_EXHAUSTED' where workspace_id=${w}`,
      );
      await reindexSearchWorkspaceOperation(context, { workspaceId: w });
      expect(Number(await epoch())).toBe(first + 2);
    }));
  it("does not grant OAuth or demo write privileges", async () =>
    within(async () => {
      for (const authMethod of ["oauth", "demo"] as const)
        await expect(
          updateSearchSettingsOperation(
            {
              ...context,
              authentication: {
                ...context.authentication,
                authMethod,
                oauthScopes: ["workspaces.read"],
              },
            },
            { workspaceId: w, body: { enabled: true } },
          ),
        ).rejects.toMatchObject({ status: 403 });
    }));
});
