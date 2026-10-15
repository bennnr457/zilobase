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

import { isDesktopApp } from "@/components/desktop/index";
import { isFeatureEnabled } from "@/platform/environment";
import {
  applyAppAccess,
  applyStartRedirect,
  applyLoginAccess,
  applySignupAccess,
  applyOnboardingAccess,
  applyOAuthConsentAccess,
  applyDatabaseShareAccess,
  applyPageShareAccess,
  getFreshSession,
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
  beforeLoad: () => Effect.runPromise(applyAppAccess()),
  component: Outlet,
  pendingComponent: PendingPage,
});

// Public routes
const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  beforeLoad: () => Effect.runPromise(applyStartRedirect()),
});

const loginRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/login",
  validateSearch: validateLoginSearch,
  beforeLoad: ({ search }) => Effect.runPromise(applyLoginAccess(search)),
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
  beforeLoad: ({ search }) => Effect.runPromise(applySignupAccess(search)),
  component: lazyRouteComponent(() => import("@/components/auth/signup")),
});

const onboardingRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/onboarding",
  beforeLoad: () => Effect.runPromise(applyOnboardingAccess()),
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
  beforeLoad: ({ search }) => Effect.runPromise(applyOAuthConsentAccess(search)),
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
    component: lazyRouteComponent(
      () => import("@/components/pages/access/accept-page-invitation-screen"),
    ),
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
    component: lazyRouteComponent(() => import("@/components/workspaces/workspace-settings")),
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
    component: lazyRouteComponent(() => import("@/components/pages/page-screen")),
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
