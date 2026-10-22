import { parseArgs } from "node:util";
import { createDbClient, runWithDbEnv } from "../infrastructure/database";
import { runSearchOperator, type SearchOperatorCommand } from "../services/search/operator";
const { positionals, values } = parseArgs({
  allowPositionals: true,
  options: { cell: { type: "string" }, workspace: { type: "string" } },
});
const commands = ["status", "backfill", "retry", "reindex", "repair", "cleanup"];
if (positionals.length !== 1 || !commands.includes(positionals[0]))
  throw new Error(
    "Use search-ops status|backfill|retry|reindex|repair|cleanup --cell CELL [--workspace ID]",
  );
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL_REQUIRED");
try {
  console.info(
    JSON.stringify(
      await runWithDbEnv(process.env, () =>
        runSearchOperator(process.env, {
          command: positionals[0] as SearchOperatorCommand,
          cell: values.cell ?? "",
          workspaceId: values.workspace,
        }),
      ),
      null,
      2,
    ),
  );
} finally {
  await createDbClient(process.env).client.end();
}
