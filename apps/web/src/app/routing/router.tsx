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
  beforeLoad: async () => {
    const session = await getFreshSession();
    if (!session.user) throw redirect({ to: "/login" });

    const workspaces = await getWorkspaces();
    if (workspaces.length === 0) throw redirect({ to: "/onboarding" });
  },
  component: Outlet,
  pendingComponent: PendingPage,
});

// Public routes
const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  beforeLoad: async () => {
    const session = await getFreshSession({ optional: true });
    if (!session.user) throw redirect({ to: "/login" });

    const workspaces = await getWorkspaces();
    if (isHostedDemoRuntime()) {
      const { startPath } = await apiFetch<{ startPath: string }>("/demo/bootstrap", {
        method: "GET",
      });
      throw redirect({ href: startPath });
    }
    if (workspaces.length === 0) throw redirect({ to: "/onboarding" });
    throw redirect({ href: await getDefaultAppPath(session, workspaces) });
  },
});

const loginRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/login",
  validateSearch: validateLoginSearch,
  beforeLoad: async ({ search }) => {
    if (isBootstrapRequiredAuthError(search.error)) {
      throw redirect({ to: "/setup" });
    }

    const session = await getFreshSession({ optional: true });
    if (!session.user) return;

    if (isOAuthLoginSearch(search)) {
      throw redirect({
        search: pickOAuthSearch(search),
        to: "/oauth/consent",
      });
    }

    if (search.returnTo) {
      throw redirect({
        href: getAuthReturnPath(
          "/recents",
          new URLSearchParams({ returnTo: search.returnTo }).toString(),
        ),
      });
    }

    const workspaces = await getWorkspaces();
    throw redirect({ to: workspaces.length > 0 ? "/recents" : "/onboarding" });
  },
  component: lazyRouteComponent(() => import("@/components/auth/login")),
});

const connectRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/connect",
  beforeLoad: () => {
    if (!isDesktopApp()) throw redirect({ to: "/login" });
  },
  component: lazyRouteComponent(() => import("@/components/desktop/pages/connect")),
});

const signupRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/signup",
  validateSearch: validateSignupSearch,
  beforeLoad: async ({ search }) => {
    const session = await getFreshSession({ optional: true });
    if (!session.user) return;

    if (search.returnTo) {
      throw redirect({
        href: getAuthReturnPath("/recents", `?returnTo=${encodeURIComponent(search.returnTo)}`),
      });
    }

    const workspaces = await getWorkspaces();
    throw redirect({ to: workspaces.length > 0 ? "/recents" : "/onboarding" });
  },
  component: lazyRouteComponent(() => import("@/components/auth/signup")),
});

const onboardingRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/onboarding",
  beforeLoad: async () => {
    const session = await getFreshSession();
    if (!session.user) throw redirect({ to: "/login" });

    const workspaces = await getWorkspaces();
    if (workspaces.length > 0) throw redirect({ to: "/recents" });
  },
  component: lazyRouteComponent(() => import("@/components/auth/onboarding")),
});

const otpRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/otp",
  beforeLoad: async () => {
    if (isDesktopApp()) throw redirect({ to: "/login" });
  },
  component: lazyRouteComponent(() => import("@/components/auth/otp")),
});

const oauthConsentRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/oauth/consent",
  validateSearch: validateOAuthConsentSearch,
  beforeLoad: async ({ search }) => {
    const session = await getFreshSession({ optional: true });
    if (!session.user) {
      throw redirect({
        search: pickOAuthSearch(search),
        to: "/login",
      });
    }
  },
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
    beforeLoad: () => {
      if (!isFeatureEnabled("askAi")) {
        throw redirect({ to: "/recents", search: { view: "recents" } });
      }
    },
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
    beforeLoad: () => {
      throw redirect({ search: { view: "trash" }, to: "/recents" });
    },
  }),
];

// Settings routes
const settingsRoutes = [
  createRoute({
    getParentRoute: () => appRoute,
    path: "/settings",
    beforeLoad: () => {
      throw redirect({ to: "/settings/preferences" });
    },
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
    component: lazyRouteComponent(() => import("./edition-route-host")),
  }),
];

// Content routes
const contentRoutes = [
  createRoute({
    getParentRoute: () => rootRoute,
    path: "/p/$pageId",
    validateSearch: validateMeetingSearch,
    beforeLoad: async ({ params }) => ({
      publishedShare: await applyPageShareAccess(params.pageId),
    }),
    component: lazyRouteComponent(() => import("@/components/pages/page")),
    pendingComponent: PendingPage,
  }),
  createRoute({
    getParentRoute: () => rootRoute,
    path: "/m/$meetingId",
    beforeLoad: async () => ({
      authenticatedMeeting: Boolean((await getFreshSession({ optional: true })).user),
    }),
    component: lazyRouteComponent(() => import("@/components/meetings/meeting")),
    pendingComponent: PendingPage,
  }),
  createRoute({
    getParentRoute: () => rootRoute,
    path: "/d/$databaseId",
    validateSearch: validateDatabaseSearch,
    beforeLoad: async ({ params }) => ({
      publishedShare: await applyDatabaseShareAccess(params.databaseId),
    }),
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
