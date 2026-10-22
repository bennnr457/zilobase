import { publishBackgroundDispatches } from "../../infrastructure/background/publication";
import type { RuntimeEnv } from "../../shared/config/config";

/** Best effort publication after the mutation commits. SQL dirty state is durable. */
export async function nudgeSearchIndexing(env: RuntimeEnv) {
  if (env.SEARCH_EMBEDDINGS_ENABLED !== "true") return;
  await publishBackgroundDispatches(env).catch(() => undefined);
}
