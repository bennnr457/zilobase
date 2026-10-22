import pg from "pg";

// Run against a direct administrative database connection, outside transactional migrations.
// No queue, page, or workspace data is changed by this operation.
const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");
try {
  await client.connect();
  const { rows } = await client.query(
    `select n.nspname as schema,i.relname as name from pg_index x join pg_class i on i.oid=x.indexrelid join pg_class t on t.oid=x.indrelid join pg_am am on am.oid=i.relam join pg_namespace n on n.oid=i.relnamespace where n.nspname='public' and t.relname ~ '^search_chunk_p[0-9]{2}$' and am.amname='hnsw' order by i.relname`,
  );
  if (rows.length !== 32)
    throw new Error("Expected 32 vector partition indexes; run schema migrations first");
  for (const row of rows) {
    const identifier = (value) => '"' + value.replaceAll('"', '""') + '"';
    await client.query(
      `REINDEX INDEX CONCURRENTLY ${identifier(row.schema)}.${identifier(row.name)}`,
    );
    console.info(JSON.stringify({ event: "search.index_rebuilt", partitionIndex: row.name }));
  }
} finally {
  await client.end();
}
