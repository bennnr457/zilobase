import { createRoute, lazyRouteComponent, redirect } from "@tanstack/react-router";
import { isFeatureEnabled } from "@/platform/environment";
import { appRoute } from "../route-roots";
import { validateCalendarSearch, validateLibrarySearch } from "../search-validators";

export const appRoutes = [
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
