import { useNavigate } from "@tanstack/react-router";
import {
  MainPaneHeaderLeadingControl,
  PageHeader,
  PageSidePaneCollapseButton,
} from "@/sections/pages/header/components/page-header";

/** Fallback chrome for non-page screens, including auxiliary AI workspace panels. */
export function AppHeader({
  pathname,
  isSettingsPage,
  auxiliarySidePaneOpen = false,
  auxiliarySidePanePageId,
  onCloseAuxiliarySidePane,
}: {
  pathname: string;
  isSettingsPage: boolean;
  auxiliarySidePaneOpen?: boolean;
  auxiliarySidePanePageId?: string | null;
  onCloseAuxiliarySidePane?: () => void;
}) {
  const navigate = useNavigate();
  return (
    <>
      <PageHeader
        leadingControl={<MainPaneHeaderLeadingControl />}
        pathname={pathname}
        showActions={!isSettingsPage}
      />
      {auxiliarySidePaneOpen ? (
        <div className="absolute top-0 right-0 z-30 flex h-12 w-[var(--page-side-pane-width)] items-center border-l bg-surface-canvas dark:bg-surface-navigation">
          {auxiliarySidePanePageId ? (
            <PageHeader
              className="min-w-0 flex-1"
              pageId={auxiliarySidePanePageId}
              pathname={`/p/${encodeURIComponent(auxiliarySidePanePageId)}`}
              placement="pane"
              showBreadcrumb={false}
              onClose={onCloseAuxiliarySidePane}
              onOpenFullPage={() => {
                void navigate({ to: "/p/$pageId", params: { pageId: auxiliarySidePanePageId } });
              }}
            />
          ) : onCloseAuxiliarySidePane ? (
            <div className="px-3">
              <PageSidePaneCollapseButton
                label="Close AI settings"
                onClick={onCloseAuxiliarySidePane}
              />
            </div>
          ) : null}
        </div>
      ) : null}
    </>
  );
}
