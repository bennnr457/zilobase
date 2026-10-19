import { eq } from "drizzle-orm";
import { db } from "../../../infrastructure/database/index";
import { user } from "../../../infrastructure/database/schema";
import { getUserHasPassword } from "../../auth/sessions/password";

export async function updateUserProfile(
  currentUser: { id: string; email: string; name: string },
  patch: { name?: string; email?: string },
) {
  const nextName = patch.name;
  const nextEmail = patch.email;

  if (nextEmail && nextEmail !== currentUser.email) {
    const [existingUser] = await db
      .select({ id: user.id })
      .from(user)
      .where(eq(user.email, nextEmail))
      .limit(1);

    if (existingUser && existingUser.id !== currentUser.id) {
      return { conflict: true as const };
    }
  }

  const [updatedUser] = await db
    .update(user)
    .set({
      email: nextEmail ?? currentUser.email,
      name: nextName ?? currentUser.name,
      updatedAt: new Date(),
    })
    .where(eq(user.id, currentUser.id))
    .returning({
      email: user.email,
      emailVerified: user.emailVerified,
      id: user.id,
      image: user.image,
      name: user.name,
    });

  return {
    user: {
      ...updatedUser,
      hasPassword: await getUserHasPassword(currentUser.id),
    },
  };
}
