import { randomUUID } from "node:crypto";
import { Client } from "pg";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { SEARCH_PROFILE } from "./vector-contracts";
const url = process.env.ZILOBASE_SEARCH_TEST_DATABASE_URL;
describe.skipIf(!url)("transactional search invalidation", () => {
  const db = new Client({ connectionString: url });
  const w = randomUUID(),
    p = randomUUID(),
    prop = randomUUID();
  const state = async () =>
    (await db.query("select * from page_search_index where workspace_id=$1 and page_id=$2", [w, p]))
      .rows[0];
  beforeAll(async () => {
    if (!["localhost", "127.0.0.1"].includes(new URL(url!).hostname))
      throw new Error("Isolated loopback database required");
    await db.connect();
  });
  beforeEach(async () => {
    await db.query("begin");
    await db.query("insert into workspace(id,name,slug) values($1,'Test',$1)", [w]);
    await db.query(
      "insert into workspace_search_settings(workspace_id,cell_id,enabled,profile_id) values($1,'test',true,$2)",
      [w, SEARCH_PROFILE.id],
    );
    await db.query(
      "insert into page(id,workspace_id,name,created_at,updated_at) values($1,$2,'Title',now(),now())",
      [p, w],
    );
  });
  afterEach(async () => {
    await db.query("rollback");
  });
  afterAll(async () => {
    await db.end();
  });
  it("captures creation, ignores metadata/no-op saves, and increments content revisions", async () => {
    expect((await state()).requested_revision).toBe("1");
    await db.query("update page set name=name,metadata='{}',updated_at=now() where id=$1", [p]);
    expect((await state()).requested_revision).toBe("1");
    await db.query("update page set content=$2 where id=$1", [
      p,
      JSON.stringify({
        type: "doc",
        content: [{ type: "paragraph", content: [{ type: "text", text: "New" }] }],
      }),
    ]);
    expect((await state()).requested_revision).toBe("2");
    expect(
      new Date((await state()).not_before).getTime() -
        new Date((await state()).first_dirty_at).getTime(),
    ).toBeLessThanOrEqual(30000);
  });
  it("rolls back indexing intent with the source mutation", async () => {
    await db.query("savepoint edit");
    await db.query("update page set name='Changed' where id=$1", [p]);
    expect((await state()).requested_revision).toBe("2");
    await db.query("rollback to savepoint edit");
    expect((await state()).requested_revision).toBe("1");
  });
  it("tracks property values and creates one bounded definition fanout", async () => {
    await db.query(
      "insert into page_property(id,workspace_id,name,type,created_at,updated_at) values($1,$2,'Status','text',now(),now())",
      [prop, w],
    );
    const v = randomUUID();
    await db.query(
      "insert into page_property_value(id,page_id,property_id,value,created_at,updated_at) values($1,$2,$3,'\"Ready\"',now(),now())",
      [v, p, prop],
    );
    expect((await state()).requested_revision).toBe("2");
    await db.query("update page_property_value set value=value where id=$1", [v]);
    expect((await state()).requested_revision).toBe("2");
    await db.query("update page_property set name='Progress' where id=$1", [prop]);
    expect((await state()).requested_revision).toBe("2");
    expect(
      (await db.query("select revision from search_invalidation where resource_id=$1", [prop]))
        .rows,
    ).toEqual([{ revision: "2" }]);
    await db.query("delete from page_property_value where id=$1", [v]);
    expect((await state()).requested_revision).toBe("3");
  });
  it("captures soft deletion and restore while disabled workspaces create no intent", async () => {
    await db.query("update page set deleted_at=now() where id=$1", [p]);
    expect((await state()).requested_revision).toBe("2");
    await db.query("update page set deleted_at=null where id=$1", [p]);
    expect((await state()).requested_revision).toBe("3");
    await db.query("update workspace_search_settings set enabled=false where workspace_id=$1", [w]);
    await db.query("update page set name='Disabled' where id=$1", [p]);
    expect((await state()).requested_revision).toBe("3");
  });
  it("captures source membership changes without synchronous page fanout", async () => {
    const host = randomUUID(),
      source = randomUUID(),
      membership = randomUUID();
    await db.query(
      "insert into database(id,workspace_id,name,created_at,updated_at) values($1,$2,'Host',now(),now())",
      [host, w],
    );
    await db.query(
      "insert into data_source(id,workspace_id,parent_database_id,name) values($1,$2,$3,'Source')",
      [source, w, host],
    );
    await db.query(
      "insert into page_property(id,workspace_id,name,type,created_at,updated_at) values($1,$2,'Status','text',now(),now())",
      [prop, w],
    );
    await db.query(
      "insert into database_property(id,data_source_id,property_id,created_at,updated_at) values($1,$2,$3,now(),now())",
      [membership, source, prop],
    );
    expect(
      (await db.query("select revision from search_invalidation where resource_id=$1", [source]))
        .rows,
    ).toEqual([{ revision: "2" }]);
    await db.query("delete from database_property where id=$1", [membership]);
    expect(
      (
        await db.query(
          "select revision from search_invalidation where resource_id=$1 order by revision",
          [source],
        )
      ).rows,
    ).toEqual([{ revision: "2" }, { revision: "3" }]);
  });
});
