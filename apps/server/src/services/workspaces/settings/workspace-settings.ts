import { eq } from "drizzle-orm";
import { db } from "../../../infrastructure/database/index";
import { workspace } from "../../../infrastructure/database/schema";
import { ServiceMutationError } from "../../../shared/errors/service-mutation-error";

export async function updateWorkspaceSettings(
  workspaceId: string,
  input: { slug?: string; logo?: string | null; metadata?: string | null; name?: string },
) {
  const nextSlug = input.slug?.trim().toLowerCase();

  if (nextSlug) {
    const [existingWorkspace] = await db
      .select({ id: workspace.id })
      .from(workspace)
      .where(eq(workspace.slug, nextSlug))
      .limit(1);

    if (existingWorkspace && existingWorkspace.id !== workspaceId) {
      throw new ServiceMutationError("That workspace slug is already in use.", 409);
    }
  }

  const [updatedWorkspace] = await db
    .update(workspace)
    .set({
      logo: input.logo !== undefined ? input.logo?.trim() || null : undefined,
      metadata: input.metadata !== undefined ? input.metadata?.trim() || null : undefined,
      name: input.name?.trim(),
      slug: nextSlug,
      updatedAt: new Date(),
    })
    .where(eq(workspace.id, workspaceId))
    .returning();

  if (!updatedWorkspace) {
    throw new ServiceMutationError("Workspace not found.", 404);
  }

  return updatedWorkspace;
}
