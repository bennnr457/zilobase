import { createRoute, lazyRouteComponent, redirect } from "@tanstack/react-router";
import { isDesktopApp } from "@/components/desktop/index";

import { getAuthReturnPath } from "@/components/auth/google-auth";
import { isBootstrapRequiredAuthError } from "@zilobase/features/auth";
import { getDefaultAppPath, getFreshSession, getWorkspaces } from "../guards";
import { rootRoute } from "../route-roots";
import { isOAuthLoginSearch, pickOAuthSearch } from "@zilobase/features/oauth";
import {
  validateLoginSearch,
  validateOAuthConsentSearch,
  validateSignupSearch,
} from "../search-validators";
import { isHostedDemoRuntime } from "@/app/demo";
import { apiFetch } from "@/platform/network/api";

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

export const publicRoutes = [
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
