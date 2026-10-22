import { randomUUID } from "node:crypto";
import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { SEARCH_PROFILE } from "./vector-contracts";

const url = process.env.ZILOBASE_SEARCH_TEST_DATABASE_URL;
describe.skipIf(!url)("vector schema with real PostgreSQL", () => {
  const client = new Client({ connectionString: url });
  const workspace = `search-test-${randomUUID()}`;
  const otherWorkspace = `${workspace}-other`;
  const page = randomUUID();
  beforeAll(async () => {
    const parsed = new URL(url!);
    if (!["localhost", "127.0.0.1"].includes(parsed.hostname))
      throw new Error("Search tests require an isolated loopback database");
    await client.connect();
    await client.query("begin");
    await client.query(
      "insert into workspace(id,name,slug) values($1,'Search test',$1),($2,'Other',$2)",
      [workspace, otherWorkspace],
    );
    await client.query(
      "insert into page(id,workspace_id,name,content,created_at,updated_at) values($1,$2,'Vector notes',$3,now(),now())",
      [
        page,
        workspace,
        JSON.stringify({
          type: "doc",
          content: [{ type: "paragraph", content: [{ type: "text", text: "Credentials expire" }] }],
        }),
      ],
    );
  });
  afterAll(async () => {
    await client.query("rollback");
    await client.end();
  });
  it("keeps keyword indexing and creates no obsolete singleton chunk", async () => {
    const keyword = await client.query(
      "select title from search_document where source_id=$1 and search_vector @@ plainto_tsquery('simple','Credentials')",
      [page],
    );
    expect(keyword.rows).toHaveLength(1);
    expect(
      (await client.query("select 1 from search_chunk where page_id=$1", [page])).rows,
    ).toHaveLength(0);
  });
  it("has 32 partitions and immutable profiles", async () => {
    expect(
      Number(
        (
          await client.query(
            "select count(*) from pg_inherits where inhparent='search_chunk'::regclass",
          )
        ).rows[0].count,
      ),
    ).toBe(32);
    await client.query("savepoint invalid_profile");
    await expect(
      client.query("update search_embedding_profile set dimensions=768 where id=$1", [
        SEARCH_PROFILE.id,
      ]),
    ).rejects.toThrow("immutable");
    await client.query("rollback to savepoint invalid_profile");
  });
  it("rejects cross-workspace chunks and cascades page deletion", async () => {
    const statement =
      "insert into search_chunk(workspace_id,page_id,profile_id,index_epoch,generation_id,source_revision,chunk_kind,source_key,chunk_index,content_markdown,embedding_input_hash,byte_count) values($1,$2,$3,1,$4,1,'body','body',0,'test','hash',4)";
    await client.query("savepoint invalid_owner");
    await expect(
      client.query(statement, [otherWorkspace, page, SEARCH_PROFILE.id, randomUUID()]),
    ).rejects.toThrow("foreign key");
    await client.query("rollback to savepoint invalid_owner");
    await client.query(statement, [workspace, page, SEARCH_PROFILE.id, randomUUID()]);
    expect(
      (
        await client.query("select 1 from search_chunk where workspace_id=$1 and page_id=$2", [
          workspace,
          page,
        ])
      ).rows,
    ).toHaveLength(1);
    await client.query("delete from page where id=$1", [page]);
    expect(
      (
        await client.query("select 1 from search_chunk where workspace_id=$1 and page_id=$2", [
          workspace,
          page,
        ])
      ).rows,
    ).toHaveLength(0);
  });
});
