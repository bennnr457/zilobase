import type { Context } from "hono";
import { Hono } from "hono";
import { getUserHasPassword } from "../../../services/auth/sessions/password";
import { ensurePinnedWorkspaceMembership } from "../../../services/auth/sessions/pinned-membership";
import { isCommunityRegistration } from "../../../shared/config/app-policy";
import type { AppBindings } from "../../../shared/contracts/http";

export const sessionRoutes = new Hono<AppBindings>();

sessionRoutes.get("/", (c) =>
  timed(c, "route_session_total", async () => {
    const user = c.get("user");
    const session = c.get("session");

    if (!user) {
      return c.json({ user: null, session: null }, 401);
    }

    const [selfHostedWorkspaceId, hasPassword] = await Promise.all([
      timed(c, "route_session_pin", () =>
        ensurePinnedWorkspaceMembership(
          c.env,
          user.id,
          user.emailVerified,
          session?.id,
          c.get("editionExtension") ?? undefined,
          isCommunityRegistration(c.get("appPolicy")),
        ),
      ),
      timed(c, "route_session_has_password", () => getUserHasPassword(user.id)),
    ]);
    const responseSession =
      session && selfHostedWorkspaceId && session.activeWorkspaceId !== selfHostedWorkspaceId
        ? { ...session, activeWorkspaceId: selfHostedWorkspaceId }
        : session;

    return c.json({
      demoMode: c.get("authMethod") === "demo",
      session: responseSession,
      workspacePinned: c.get("appPolicy").workspaceSelection === "pinned",
      user: {
        ...user,
        hasPassword,
      },
    });
  }),
);

async function timed<T>(c: Context<AppBindings>, name: string, run: () => Promise<T>) {
  const startedAt = performance.now();

  try {
    return await run();
  } finally {
    c.get("serverTimings").push(
      `zilobase_${name};dur=${Math.round(performance.now() - startedAt)}`,
    );
  }
}
