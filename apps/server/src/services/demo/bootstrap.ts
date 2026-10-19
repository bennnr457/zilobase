import { eq } from "drizzle-orm";
import { db } from "../../infrastructure/database/index";
import { workspace } from "../../infrastructure/database/schema";
import { DEMO_IDS } from "./constants";

export async function getDemoWorkspace() {
  const [demoWorkspace] = await db
    .select()
    .from(workspace)
    .where(eq(workspace.id, DEMO_IDS.workspace))
    .limit(1);

  return demoWorkspace;
}
