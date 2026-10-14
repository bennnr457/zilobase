import { createRoute, lazyRouteComponent, redirect } from "@tanstack/react-router";
import { editionWebModule } from "@zilobase/edition-web";
import { appRoute } from "../route-roots";
import { validateTeamSettingsSearch, validateTeamspaceSettingsSearch } from "../search-validators";

export const settingsRoutes = [
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
    component: lazyRouteComponent(() => import("../../shell/content/workspace-settings")),
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
    component: lazyRouteComponent(() => import("../edition-route-host")),
  }),
];
