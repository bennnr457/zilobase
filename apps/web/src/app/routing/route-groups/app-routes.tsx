import { createRoute, lazyRouteComponent, redirect } from "@tanstack/react-router";
import { isFeatureEnabled } from "@/shared/config/feature-flags";
import { appRoute } from "../route-roots";
import {
  validateCalendarSearch,
  validateAiSearch,
  validateLibrarySearch,
} from "../search-validators";

export const appRoutes = [
  createRoute({
    getParentRoute: () => appRoute,
    path: "/calendar",
    validateSearch: validateCalendarSearch,
    component: lazyRouteComponent(() => import("@/features/calendar/screens/calendar")),
  }),
  createRoute({
    getParentRoute: () => appRoute,
    path: "/ai",
    validateSearch: validateAiSearch,
    beforeLoad: () => {
      if (!isFeatureEnabled("askAi")) {
        throw redirect({ to: "/recents", search: { view: "recents" } });
      }
    },
    component: lazyRouteComponent(() => import("@/features/ai/screens/ai")),
  }),
  createRoute({
    getParentRoute: () => appRoute,
    path: "/canvas",
    component: lazyRouteComponent(() => import("@/features/canvas/screens/canvas")),
  }),
  createRoute({
    getParentRoute: () => appRoute,
    path: "/recents",
    validateSearch: validateLibrarySearch,
    component: lazyRouteComponent(() => import("@/features/library/recents")),
  }),
  createRoute({
    getParentRoute: () => appRoute,
    path: "/tasks",
    component: lazyRouteComponent(() => import("@/features/tasks/tasks")),
  }),
  createRoute({
    getParentRoute: () => appRoute,
    path: "/trash",
    beforeLoad: () => {
      throw redirect({ search: { view: "trash" }, to: "/recents" });
    },
  }),
];
