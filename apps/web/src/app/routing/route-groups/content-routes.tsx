import { createRoute, lazyRouteComponent } from "@tanstack/react-router";
import { applyDatabaseShareAccess, applyPageShareAccess, getFreshSession } from "../guards";
import { PendingPage } from "../route-shell";
import { rootRoute } from "../route-roots";
import { validateDatabaseSearch, validateMeetingSearch } from "../search-validators";

export const contentRoutes = [
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
