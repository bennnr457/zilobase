import { getBackgroundOperationalSnapshot } from "../../infrastructure/background/health";
import { runWithDbEnv } from "../../infrastructure/database";
import type { RuntimeEnv } from "../../shared/config/config";
export function readBackgroundHealth(env: RuntimeEnv) {
  return runWithDbEnv(env, () => getBackgroundOperationalSnapshot(env));
}
