import * as React from "react";
import { Effect } from "effect";
import { ThemeProvider, useTheme } from "next-themes";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import {
  PageEditorCommentsProvider,
  PageCommentsRegistryProvider,
} from "@/components/pages/editor/comments/comments-context";
import { PageEditorRegistryProvider } from "@/components/pages/editor/runtime/page-editor-registry";

import { DesktopUpdater } from "@/components/desktop/updates/desktop-updater";
import { WebFeaturesProvider } from "@/app/providers/features-provider";
import { queryClient } from "@/app/query-client";
import { ShortcutProvider } from "@/app/shortcuts/shortcut-provider";
import { getThemeColorScheme, selectableThemeIds } from "@/lib/themes";
import { ThemeFamilyProvider, useThemeFamily } from "@/app/providers/theme-family-provider";
import { AppIconProvider } from "@/components/icons";
import { DemoExperience } from "@/components/demo/demo-experience";
import { installDemoCache } from "@/app/demo/runtime";
import { resolvePageDetailReference, type PageDetailReference } from "@zilobase/features/pages";
import { useActiveWorkspaceId } from "@zilobase/features/workspaces/react";
import { useSession } from "@zilobase/features/auth/react";
import { useDatabaseController } from "@zilobase/features/databases/react";
import { guardPendingDatabaseWrites } from "@/components/databases/lifecycle/beforeunload";

import posthog from "@/lib/posthog";

Effect.runSync(
  Effect.sync(() =>
    installDemoCache({
      getQueriesData: (filters) => queryClient.getQueriesData(filters),
      getQueryData: <T,>(key: readonly unknown[]) => {
        if (key[0] === "page")
          return resolvePageDetailReference(
            queryClient,
            queryClient.getQueryData<PageDetailReference | null>(key),
          ) as T | undefined;
        return queryClient.getQueryData<T>(key);
      },
    }),
  ),
);

export function AppProviders({ children }: React.PropsWithChildren) {
  return (
    <AppIconProvider>
      <WebFeaturesProvider>
        <DatabaseUnloadGuard />
        <PostHogIdentitySync />
        <ShortcutProvider>
          <ThemeProvider
            attribute="class"
            defaultTheme="system"
            enableSystem
            disableTransitionOnChange
            themes={selectableThemeIds}
          >
            <ThemeFamilyProvider>
              <ThemeDocumentSync />
              <DemoExperience>
                <TooltipProvider>
                  <PageEditorRegistryProvider>
                    <PageCommentsRegistryProvider>
                      <PageEditorCommentsProvider>{children}</PageEditorCommentsProvider>
                    </PageCommentsRegistryProvider>
                  </PageEditorRegistryProvider>
                  <DesktopUpdater />
                  <Toaster />
                </TooltipProvider>
              </DemoExperience>
            </ThemeFamilyProvider>
          </ThemeProvider>
        </ShortcutProvider>
      </WebFeaturesProvider>
    </AppIconProvider>
  );
}

function DatabaseUnloadGuard() {
  const controller = useDatabaseController();
  React.useEffect(() => {
    const dispose = Effect.runSync(
      Effect.sync(() => guardPendingDatabaseWrites(window, controller.commandState)),
    );
    return () => Effect.runSync(Effect.sync(dispose));
  }, [controller]);
  return null;
}

function PostHogIdentitySync() {
  const { data: session } = useSession();
  const workspaceId = useActiveWorkspaceId();
  const previousUserId = React.useRef<string | null | undefined>(undefined);
  const user = session?.user;

  React.useEffect(() => {
    const client = posthog;
    if (!client || session === undefined) return;

    Effect.runSync(
      Effect.gen(function* () {
        if (!user) {
          yield* resetSignedOutPostHogIdentity(client, previousUserId);
          return;
        }
        yield* syncSignedInPostHogIdentity(client, previousUserId, user.id);
        yield* syncPostHogWorkspace(client, workspaceId);
      }),
    );
  }, [session, user, workspaceId]);

  return null;
}

type ConfiguredPostHog = NonNullable<typeof posthog>;

function resetSignedOutPostHogIdentity(
  client: ConfiguredPostHog,
  previousUserId: React.MutableRefObject<string | null | undefined>,
) {
  return Effect.sync(() => {
    if (previousUserId.current && client.get_distinct_id() === previousUserId.current) {
      client.reset();
    }
    previousUserId.current = null;
  });
}

function syncSignedInPostHogIdentity(
  client: ConfiguredPostHog,
  previousUserId: React.MutableRefObject<string | null | undefined>,
  userId: string,
) {
  return Effect.sync(() => {
    if (previousUserId.current !== userId) {
      if (previousUserId.current) client.reset();
      client.identify(userId);
      previousUserId.current = userId;
      return;
    }
    if (client.get_distinct_id() !== userId) client.identify(userId);
  });
}

function syncPostHogWorkspace(client: ConfiguredPostHog, workspaceId: string | null | undefined) {
  return Effect.sync(() => {
    if (workspaceId) client.group("workspace", workspaceId);
    else client.resetGroups();
  });
}

function ThemeDocumentSync() {
  const { resolvedTheme } = useTheme();
  const { themeFamily } = useThemeFamily();

  React.useEffect(() => {
    Effect.runSync(
      Effect.sync(() => {
        const colorScheme = getThemeColorScheme(resolvedTheme);
        if (!colorScheme) return;
        const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
        document.documentElement.dataset.themeFamily = themeFamily;
        document.documentElement.style.colorScheme = colorScheme;
        meta?.setAttribute("content", getComputedStyle(document.body).backgroundColor);
      }),
    );
  }, [resolvedTheme, themeFamily]);

  return null;
}
