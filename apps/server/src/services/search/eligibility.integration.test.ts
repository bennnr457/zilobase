import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { db, runWithDbEnv } from "../../infrastructure/database";
import {
  getEffectivePageAccessInWorkspace,
  getEffectiveDatabaseAccessInWorkspace,
} from "../access/effective-access";
import { authorizedSearchIdentities, authorizedSearchChunks } from "./eligibility";
import { SEARCH_PROFILE } from "./vector-contracts";

const url = process.env.ZILOBASE_SEARCH_TEST_DATABASE_URL;
describe.skipIf(!url)("live candidate search authorization", () => {
  let w: string, u: string, other: string, guest: string, pages: string[], databases: string[];
  const within = <T>(fn: () => Promise<T>) => runWithDbEnv({ DATABASE_URL: url }, fn);
  const page = async (owner: string | null = u, teamspace: string | null = null) => {
    const id = randomUUID();
    pages.push(id);
    await db.execute(
      sql`insert into page(id,workspace_id,name,created_by_id,teamspace_id,created_at,updated_at) values(${id},${w},'Page',${owner},${teamspace},now(),now())`,
    );
    return id;
  };
  const placement = async (child: string, parent: string, kind = "primary") =>
    db.execute(
      sql`insert into page_item_placement(id,workspace_id,parent_kind,parent_id,item_kind,item_id,placement_kind,created_at,updated_at) values(${randomUUID()},${w},'page',${parent},'page',${child},${kind},now(),now())`,
    );
  const grant = async (p: string, user: string = u) =>
    db.execute(
      sql`insert into page_access(id,workspace_id,page_id,target_type,target_id,access_level,created_at,updated_at) values(${randomUUID()},${w},${p},'user',${user},'view',now(),now())`,
    );
  const host = async (p: string | null, owner: string | null = other) => {
    const id = randomUUID();
    databases.push(id);
    await db.execute(
      sql`insert into database(id,workspace_id,page_id,name,created_by_id,created_at,updated_at) values(${id},${w},${p},'Host',${owner},now(),now())`,
    );
    const source = randomUUID();
    await db.execute(
      sql`insert into data_source(id,workspace_id,parent_database_id,name) values(${source},${w},${id},'Source')`,
    );
    return { id, source };
  };
  const row = async (p: string, source: string) =>
    db.execute(
      sql`insert into database_row(id,page_id,data_source_id,order_key,created_at,updated_at) values(${randomUUID()},${p},${source},1,now(),now())`,
    );
  const compare = async (user: string = u) => {
    const actual = await authorizedSearchIdentities(w, user, pages, databases);
    for (const id of pages)
      expect(actual.pages.has(id), id).toBe(
        (await getEffectivePageAccessInWorkspace(id, w, user)) !== "none",
      );
    for (const id of databases)
      expect(actual.databases.has(id), id).toBe(
        (await getEffectiveDatabaseAccessInWorkspace(id, w, user)) !== "none",
      );
  };
  beforeAll(() => {
    if (!["localhost", "127.0.0.1"].includes(new URL(url!).hostname))
      throw new Error("Isolated loopback database required");
  });
  beforeEach(async () =>
    within(async () => {
      w = randomUUID();
      u = randomUUID();
      other = randomUUID();
      guest = randomUUID();
      pages = [];
      databases = [];
      await db.execute(sql`insert into workspace(id,name,slug) values(${w},'Access test',${w})`);
      for (const id of [u, other, guest])
        await db.execute(
          sql`insert into "user"(id,name,email) values(${id},'Test',${id + "@example.test"})`,
        );
      for (const id of [u, other])
        await db.execute(
          sql`insert into member(id,workspace_id,user_id,role) values(${randomUUID()},${w},${id},'member')`,
        );
      await db.execute(
        sql`insert into workspace_guest(id,workspace_id,user_id) values(${randomUUID()},${w},${guest})`,
      );
    }),
  );
  afterEach(async () =>
    within(async () => {
      await db.execute(sql`delete from workspace where id=${w}`);
      for (const id of [u, other, guest]) await db.execute(sql`delete from "user" where id=${id}`);
    }),
  );
  it("matches existing ownership, primary ancestry, linked database and hosted row rules", async () =>
    within(async () => {
      const root = await page(),
        nested = await page(other),
        linked = await page(other),
        databasePage = await page(other),
        record = await page(other);
      await placement(nested, root);
      await placement(linked, root, "linked");
      await placement(databasePage, root, "linked");
      const database = await host(databasePage);
      await row(record, database.source);
      await compare();
      const allowed = await authorizedSearchIdentities(w, u, pages);
      expect(allowed.pages.has(linked)).toBe(false);
      expect(allowed.pages.has(record)).toBe(true);
    }));
  it("matches explicit grants, team grants, guests and temporary expiry", async () =>
    within(async () => {
      const root = await page(other),
        child = await page(other);
      await placement(child, root);
      await grant(root);
      await grant(root, guest);
      const team = randomUUID();
      await db.execute(sql`insert into team(id,workspace_id,name) values(${team},${w},'Team')`);
      await db.execute(
        sql`insert into "teamMember"(id,user_id,team_id) values(${randomUUID()},${u},${team})`,
      );
      const teamPage = await page(other);
      await db.execute(
        sql`insert into page_access(id,workspace_id,page_id,target_type,target_id,access_level,created_at,updated_at) values(${randomUUID()},${w},${teamPage},'team',${team},'edit',now(),now())`,
      );
      await compare();
      await compare(guest);
      await db.execute(
        sql`update member set role='temporary',access_expires_at=now()-interval '1 second' where workspace_id=${w} and user_id=${u}`,
      );
      expect((await authorizedSearchIdentities(w, u, pages)).pages.size).toBe(0);
      await compare();
    }));
  it("matches teamspace grants and guest security policy", async () =>
    within(async () => {
      const ts = randomUUID();
      await db.execute(
        sql`insert into teamspace(id,workspace_id,name,created_at,updated_at) values(${ts},${w},'Teamspace',now(),now())`,
      );
      const p = await page(u, ts);
      await grant(p, guest);
      await compare();
      await compare(guest);
      await db.execute(
        sql`insert into teamspace_principal(id,teamspace_id,principal_type,principal_id,created_at,updated_at) values(${randomUUID()},${ts},'user',${u},now(),now())`,
      );
      await compare();
      expect((await authorizedSearchIdentities(w, u, [p])).pages.has(p)).toBe(true);
      await db.execute(sql`update teamspace set guests_enabled=false where id=${ts}`);
      await compare(guest);
      await db.execute(sql`update teamspace set archived_at=now() where id=${ts}`);
      await compare();
    }));
  it("matches standalone database access while rejecting cross-workspace identities and cycles", async () =>
    within(async () => {
      const p = await page(other);
      const d = await host(null);
      await row(p, d.source);
      await db.execute(
        sql`insert into database_access(id,workspace_id,database_id,target_type,target_id,access_level,created_at,updated_at) values(${randomUUID()},${w},${d.id},'user',${u},'view',now(),now())`,
      );
      await compare();
      expect((await authorizedSearchIdentities(randomUUID(), u, pages, databases)).pages.size).toBe(
        0,
      );
      const a = await page(),
        b = await page();
      await placement(a, b);
      await placement(b, a);
      await grant(a);
      expect((await authorizedSearchIdentities(w, u, [a, b])).pages.size).toBe(0);
    }));
  it("matches generated acyclic graphs against authoritative access decisions", async () =>
    within(async () => {
      for (let n = 0; n < 24; n++) {
        const p = await page(n % 5 === 0 ? u : other);
        if (n > 0 && n % 3 !== 0) await placement(p, pages[Math.floor((n - 1) / 2)]);
        if (n % 7 === 0) await grant(p);
      }
      await compare();
      await compare(other);
      await compare(guest);
    }));
  it("requires live property/source access, revisions, freshness and workspace enablement", async () =>
    within(async () => {
      const p = await page(u),
        d = await host(null),
        prop = randomUUID(),
        value = randomUUID(),
        generation = randomUUID(),
        chunk = randomUUID();
      await row(p, d.source);
      await db.execute(
        sql`insert into page_property(id,workspace_id,name,type,created_at,updated_at) values(${prop},${w},'Secret','text',now(),now())`,
      );
      await db.execute(
        sql`insert into database_property(id,data_source_id,property_id,created_at,updated_at) values(${randomUUID()},${d.source},${prop},now(),now())`,
      );
      await db.execute(
        sql`insert into page_property_value(id,page_id,property_id,value,created_at,updated_at) values(${value},${p},${prop},'"secret"',now(),now())`,
      );
      await db.execute(
        sql`insert into workspace_search_settings(workspace_id,cell_id,enabled,profile_id) values(${w},'test',true,${SEARCH_PROFILE.id})`,
      );
      await db.execute(
        sql`insert into page_search_index(workspace_id,page_id,profile_id,index_epoch,requested_revision,indexed_revision,status,active_generation_id) values(${w},${p},${SEARCH_PROFILE.id},1,1,1,'ready',${generation}::uuid)`,
      );
      await db.execute(
        sql`insert into search_chunk(id,workspace_id,page_id,profile_id,index_epoch,generation_id,source_revision,chunk_kind,source_key,chunk_index,content_markdown,embedding_input_hash,embedding,is_active,byte_count,metadata) values(${chunk}::uuid,${w},${p},${SEARCH_PROFILE.id},1,${generation}::uuid,1,'property',${prop},0,'secret','hash',array_fill(1::real,array[1536])::vector,true,6,'{"definitionRevision":"1","valueRevision":"1"}')`,
      );
      expect((await authorizedSearchChunks(w, u, [chunk])).size).toBe(0);
      await db.execute(
        sql`insert into database_access(id,workspace_id,database_id,target_type,target_id,access_level,created_at,updated_at) values(${randomUUID()},${w},${d.id},'user',${u},'view',now(),now())`,
      );
      expect((await authorizedSearchChunks(w, u, [chunk])).has(chunk)).toBe(true);
      await db.execute(sql`update page_property set name='Renamed' where id=${prop}`);
      expect((await authorizedSearchChunks(w, u, [chunk])).size).toBe(0);
      await db.execute(
        sql`update search_chunk set metadata='{"definitionRevision":"2","valueRevision":"1"}' where workspace_id=${w}`,
      );
      expect((await authorizedSearchChunks(w, u, [chunk])).has(chunk)).toBe(true);
      await db.execute(sql`delete from database_access where database_id=${d.id}`);
      expect((await authorizedSearchChunks(w, u, [chunk])).size).toBe(0);
      await db.execute(
        sql`update workspace_search_settings set enabled=false,index_epoch=2 where workspace_id=${w}`,
      );
      expect((await authorizedSearchChunks(w, u, [chunk])).size).toBe(0);
    }));
});
