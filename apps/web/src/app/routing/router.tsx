import { Effect } from "effect";
import {
  createRootRoute,
  createRoute,
  createRouter,
  lazyRouteComponent,
  Outlet,
  redirect,
} from "@tanstack/react-router";
import { editionWebModule } from "@zilobase/edition-web";
import { isBootstrapRequiredAuthError } from "@zilobase/features/auth";
import { isOAuthLoginSearch, pickOAuthSearch } from "@zilobase/features/oauth";

import { getAuthReturnPath } from "@/components/auth/google-auth";
import { isDesktopApp } from "@/components/desktop/index";
import { isFeatureEnabled } from "@/platform/environment";
import { isHostedDemoRuntime } from "@/app/demo";
import { apiFetch } from "@/platform/network/api";
import {
  applyDatabaseShareAccess,
  applyPageShareAccess,
  getDefaultAppPath,
  getFreshSession,
  getWorkspaces,
} from "./guards";
import { PendingPage, RootRouteShell } from "./route-shell";
import {
  validateCalendarSearch,
  validateDatabaseSearch,
  validateLibrarySearch,
  validateLoginSearch,
  validateMeetingSearch,
  validateOAuthConsentSearch,
  validateSignupSearch,
  validateTeamSettingsSearch,
  validateTeamspaceSettingsSearch,
} from "./search-validators";

const rootRoute = createRootRoute({ component: RootRouteShell });

const appRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: "app",
  beforeLoad: () =>
    Effect.runPromise(
      Effect.gen(function* () {
        const session = yield* getFreshSession();
        if (!session.user) return yield* Effect.fail(redirect({ to: "/login" }));
        const workspaces = yield* getWorkspaces();
        if (workspaces.length === 0) return yield* Effect.fail(redirect({ to: "/onboarding" }));
      }),
    ),
  component: Outlet,
  pendingComponent: PendingPage,
});

// Public routes
const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  beforeLoad: () =>
    Effect.runPromise(
      Effect.gen(function* () {
        const session = yield* getFreshSession({ optional: true });
        if (!session.user) return yield* Effect.fail(redirect({ to: "/login" }));
        const workspaces = yield* getWorkspaces();
        if (isHostedDemoRuntime()) {
          const { startPath } = yield* Effect.tryPromise({
            try: () =>
              apiFetch<{ startPath: string }>("/demo/bootstrap", {
                method: "GET",
              }),
            catch: (error) => error,
          });
          return yield* Effect.fail(redirect({ href: startPath }));
        }
        if (workspaces.length === 0) return yield* Effect.fail(redirect({ to: "/onboarding" }));
        return yield* Effect.fail(
          redirect({ href: yield* getDefaultAppPath(session, workspaces) }),
        );
      }),
    ),
});

const loginRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/login",
  validateSearch: validateLoginSearch,
  beforeLoad: ({ search }) =>
    Effect.runPromise(
      Effect.gen(function* () {
        if (isBootstrapRequiredAuthError(search.error)) {
          return yield* Effect.fail(redirect({ to: "/setup" }));
        }
        const session = yield* getFreshSession({ optional: true });
        if (!session.user) return;
        if (isOAuthLoginSearch(search)) {
          return yield* Effect.fail(
            redirect({
              search: pickOAuthSearch(search),
              to: "/oauth/consent",
            }),
          );
        }
        if (search.returnTo) {
          return yield* Effect.fail(
            redirect({
              href: getAuthReturnPath(
                "/recents",
                new URLSearchParams({ returnTo: search.returnTo }).toString(),
              ),
            }),
          );
        }
        const workspaces = yield* getWorkspaces();
        return yield* Effect.fail(
          redirect({ to: workspaces.length > 0 ? "/recents" : "/onboarding" }),
        );
      }),
    ),
  component: lazyRouteComponent(() => import("@/components/auth/login")),
});

const connectRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/connect",
  beforeLoad: () =>
    Effect.runSync(
      Effect.suspend(() =>
        isDesktopApp() ? Effect.void : Effect.fail(redirect({ to: "/login" })),
      ),
    ),
  component: lazyRouteComponent(() => import("@/components/desktop/pages/connect")),
});

const signupRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/signup",
  validateSearch: validateSignupSearch,
  beforeLoad: ({ search }) =>
    Effect.runPromise(
      Effect.gen(function* () {
        const session = yield* getFreshSession({ optional: true });
        if (!session.user) return;
        if (search.returnTo) {
          return yield* Effect.fail(
            redirect({
              href: getAuthReturnPath(
                "/recents",
                `?returnTo=${encodeURIComponent(search.returnTo)}`,
              ),
            }),
          );
        }
        const workspaces = yield* getWorkspaces();
        return yield* Effect.fail(
          redirect({ to: workspaces.length > 0 ? "/recents" : "/onboarding" }),
        );
      }),
    ),
  component: lazyRouteComponent(() => import("@/components/auth/signup")),
});

const onboardingRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/onboarding",
  beforeLoad: () =>
    Effect.runPromise(
      Effect.gen(function* () {
        const session = yield* getFreshSession();
        if (!session.user) return yield* Effect.fail(redirect({ to: "/login" }));
        const workspaces = yield* getWorkspaces();
        if (workspaces.length > 0) return yield* Effect.fail(redirect({ to: "/recents" }));
      }),
    ),
  component: lazyRouteComponent(() => import("@/components/auth/onboarding")),
});

const otpRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/otp",
  beforeLoad: () =>
    Effect.runPromise(
      Effect.suspend(() =>
        isDesktopApp() ? Effect.fail(redirect({ to: "/login" })) : Effect.void,
      ),
    ),
  component: lazyRouteComponent(() => import("@/components/auth/otp")),
});

const oauthConsentRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/oauth/consent",
  validateSearch: validateOAuthConsentSearch,
  beforeLoad: ({ search }) =>
    Effect.runPromise(
      Effect.gen(function* () {
        const session = yield* getFreshSession({ optional: true });
        if (!session.user) {
          return yield* Effect.fail(
            redirect({
              search: pickOAuthSearch(search),
              to: "/login",
            }),
          );
        }
      }),
    ),
  component: lazyRouteComponent(() => import("@/components/oauth/consent")),
});

const oauthCallbackRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/oauth/callback",
  component: lazyRouteComponent(() => import("@/components/oauth/callback")),
});

const publicRoutes = [
  indexRoute,
  connectRoute,
  loginRoute,
  signupRoute,
  onboardingRoute,
  otpRoute,
  oauthConsentRoute,
  oauthCallbackRoute,
  createRoute({
    getParentRoute: () => rootRoute,
    path: "/accept-invitation",
    component: lazyRouteComponent(() => import("@/components/workspaces/accept-invitation")),
  }),
  createRoute({
    getParentRoute: () => rootRoute,
    path: "/accept-page-invitation",
    component: lazyRouteComponent(() => import("@/components/pages/accept-page-invitation")),
  }),
  createRoute({
    getParentRoute: () => rootRoute,
    path: "/setup",
    component: lazyRouteComponent(() => import("@/components/auth/setup")),
  }),
];

// Application routes
const appRoutes = [
  createRoute({
    getParentRoute: () => appRoute,
    path: "/calendar",
    validateSearch: validateCalendarSearch,
    component: lazyRouteComponent(() => import("@/components/calendar/calendar")),
  }),
  createRoute({
    getParentRoute: () => appRoute,
    path: "/ai",
    beforeLoad: () =>
      Effect.runSync(
        Effect.suspend(() =>
          isFeatureEnabled("askAi")
            ? Effect.void
            : Effect.fail(redirect({ to: "/recents", search: { view: "recents" } })),
        ),
      ),
    component: lazyRouteComponent(() => import("@/components/ai/ai")),
  }),
  createRoute({
    getParentRoute: () => appRoute,
    path: "/canvas",
    component: lazyRouteComponent(() => import("@/components/canvas/canvas")),
  }),
  createRoute({
    getParentRoute: () => appRoute,
    path: "/recents",
    validateSearch: validateLibrarySearch,
    component: lazyRouteComponent(() => import("@/components/library/recents")),
  }),
  createRoute({
    getParentRoute: () => appRoute,
    path: "/tasks",
    component: lazyRouteComponent(() => import("@/components/tasks/tasks")),
  }),
  createRoute({
    getParentRoute: () => appRoute,
    path: "/trash",
    beforeLoad: () =>
      Effect.runSync(Effect.fail(redirect({ search: { view: "trash" }, to: "/recents" }))),
  }),
];

// Settings routes
const settingsRoutes = [
  createRoute({
    getParentRoute: () => appRoute,
    path: "/settings",
    beforeLoad: () => Effect.runSync(Effect.fail(redirect({ to: "/settings/preferences" }))),
  }),
  createRoute({
    getParentRoute: () => appRoute,
    path: "/settings/preferences",
    component: lazyRouteComponent(() => import("@/components/settings/preferences")),
  }),
  createRoute({
    getParentRoute: () => appRoute,
    path: "/settings/profile",
    component: lazyRouteComponent(() => import("@/components/settings/profile")),
  }),
  createRoute({
    getParentRoute: () => appRoute,
    path: "/settings/security",
    component: lazyRouteComponent(() => import("@/components/settings/security")),
  }),
  createRoute({
    getParentRoute: () => appRoute,
    path: "/settings/workspace",
    component: lazyRouteComponent(() => import("../shell/content/workspace-settings")),
  }),
  createRoute({
    getParentRoute: () => appRoute,
    path: "/settings/api-keys",
    component: lazyRouteComponent(() => import("@/components/settings/api-keys")),
  }),
  createRoute({
    getParentRoute: () => appRoute,
    path: "/settings/connected-apps",
    component: lazyRouteComponent(() => import("@/components/settings/connected-apps")),
  }),
  createRoute({
    getParentRoute: () => appRoute,
    path: "/settings/oauth-apps",
    component: lazyRouteComponent(() => import("@/components/settings/oauth-apps")),
  }),
  createRoute({
    getParentRoute: () => appRoute,
    path: "/settings/team",
    validateSearch: validateTeamSettingsSearch,
    component: lazyRouteComponent(() => import("@/components/workspaces/workspace-members")),
  }),
  createRoute({
    getParentRoute: () => appRoute,
    path: "/settings/calendar",
    component: lazyRouteComponent(() => import("@/components/settings/calendar")),
  }),
  createRoute({
    getParentRoute: () => appRoute,
    path: "/settings/teamspaces",
    validateSearch: validateTeamspaceSettingsSearch,
    component: lazyRouteComponent(() => import("@/components/teamspaces/teamspaces")),
  }),
  createRoute({
    getParentRoute: () => appRoute,
    path: `${editionWebModule.routePrefix}/$`,
    component: lazyRouteComponent(() => import("./route-shell"), "EditionRouteHost"),
  }),
];

// Content routes
const contentRoutes = [
  createRoute({
    getParentRoute: () => rootRoute,
    path: "/p/$pageId",
    validateSearch: validateMeetingSearch,
    beforeLoad: ({ params }) =>
      Effect.runPromise(
        applyPageShareAccess(params.pageId).pipe(
          Effect.map((publishedShare) => ({ publishedShare })),
        ),
      ),
    component: lazyRouteComponent(() => import("@/components/pages/page")),
    pendingComponent: PendingPage,
  }),
  createRoute({
    getParentRoute: () => rootRoute,
    path: "/m/$meetingId",
    beforeLoad: () =>
      Effect.runPromise(
        getFreshSession({ optional: true }).pipe(
          Effect.map((session) => ({ authenticatedMeeting: Boolean(session.user) })),
        ),
      ),
    component: lazyRouteComponent(() => import("@/components/meetings/meeting")),
    pendingComponent: PendingPage,
  }),
  createRoute({
    getParentRoute: () => rootRoute,
    path: "/d/$databaseId",
    validateSearch: validateDatabaseSearch,
    beforeLoad: ({ params }) =>
      Effect.runPromise(
        applyDatabaseShareAccess(params.databaseId).pipe(
          Effect.map((publishedShare) => ({ publishedShare })),
        ),
      ),
    component: lazyRouteComponent(() => import("@/components/databases/core/database-screen")),
    pendingComponent: PendingPage,
  }),
];

const routeTree = rootRoute.addChildren([
  ...publicRoutes,
  appRoute.addChildren([...appRoutes, ...settingsRoutes]),
  ...contentRoutes,
]);
export const router = createRouter({
  routeTree,
  defaultErrorComponent: lazyRouteComponent(() => import("./route-error-page")),
  defaultPendingComponent: PendingPage,
  defaultPendingMinMs: 300,
  defaultPendingMs: 250,
  defaultPreload: "intent",
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
