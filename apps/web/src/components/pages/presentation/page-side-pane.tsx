import {
  useContext,
  useEffect,
  useRef,
  type CSSProperties,
  type KeyboardEvent,
  type ReactNode,
  type PointerEvent as ReactPointerEvent,
} from "react";

import { isMobileViewport, useIsMobile } from "@/lib/hooks/use-mobile";
import { cn } from "@/lib/utils";

import { ScrollViewport } from "@/components/ui/scroll-viewport";
import {
  PageSidePaneContext,
  SIDE_PANE_DEFAULT_WIDTH,
  SIDE_PANE_KEYBOARD_RESIZE_STEP,
  SIDE_PANE_MIN_MAIN_WIDTH,
  SIDE_PANE_MIN_WIDTH,
  SIDE_PANE_READABLE_MIN_WIDTH,
  useOptionalPageSidePane,
  WORKSPACE_SIDE_PANE_TRANSITION_MS,
} from "./page-presentation";
export const pageSidePaneGridShellClass =
  "grid min-h-0 flex-1 overflow-hidden [grid-template-rows:3rem_minmax(0,1fr)]";

export const pageSidePaneMobilePanelTransitionClass =
  "transition-transform duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] motion-reduce:transition-none";

export function getPageSidePaneGridStyle(_visible: boolean, _open: boolean): CSSProperties {
  return {
    "--page-side-pane-width": SIDE_PANE_DEFAULT_WIDTH,
    gridTemplateColumns: "minmax(0, 1fr)",
  } as CSSProperties;
}

export function getPageSidePaneMobilePanelClassName(open: boolean) {
  return cn(
    "max-md:w-full max-md:border-l-0",
    pageSidePaneMobilePanelTransitionClass,
    open
      ? "[transform:translate3d(0,0,0)]"
      : "pointer-events-none [transform:translate3d(100%,0,0)]",
  );
}

export function PageSidePaneShell({
  body,
  className,
  header,
  open,
  visible,
}: {
  body: ReactNode;
  className?: string;
  header?: ReactNode;
  open: boolean;
  visible: boolean;
}) {
  const shellRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (open) return;

    const timer = window.setTimeout(() => {
      shellRef.current?.style.setProperty("--page-side-pane-width", SIDE_PANE_DEFAULT_WIDTH);
    }, WORKSPACE_SIDE_PANE_TRANSITION_MS);

    return () => window.clearTimeout(timer);
  }, [open]);

  return (
    <div
      className={cn(
        "relative isolate max-md:[grid-template-columns:minmax(0,1fr)!important]",
        header
          ? pageSidePaneGridShellClass
          : "grid min-h-0 flex-1 overflow-hidden [grid-template-rows:minmax(0,1fr)]",
        className,
      )}
      data-page-side-pane-open={open ? "true" : "false"}
      data-page-side-pane-shell
      ref={shellRef}
      style={getPageSidePaneGridStyle(visible, open)}
    >
      {header ? (
        <header className="relative col-span-full h-12 overflow-hidden">{header}</header>
      ) : null}
      <div
        className={cn(
          "relative col-span-full min-h-0 overflow-hidden",
          header ? "row-start-2" : "row-start-1",
        )}
      >
        {body}
      </div>
    </div>
  );
}

export function PageSidePaneMainCell({
  children,
  className,
  header,
  scroll = true,
}: {
  children: ReactNode;
  className?: string;
  header?: ReactNode;
  scroll?: boolean;
}) {
  return (
    <div className="h-full min-h-0 w-full min-w-0" data-page-side-pane-main>
      <div className="flex h-full min-h-0 w-full min-w-0 flex-col" data-page-side-pane-main-content>
        {header}
        {scroll ? (
          <ScrollViewport className="min-h-0 flex-1" scrollClassName={className}>
            {children}
          </ScrollViewport>
        ) : (
          children
        )}
      </div>
    </div>
  );
}

export function PageSidePaneSideCell({
  children,
  className,
  open,
  show,
}: {
  children?: ReactNode;
  className?: string;
  open: boolean;
  show?: boolean;
}) {
  const isMobile = useIsMobile();
  const panelRef = useRef<HTMLElement | null>(null);
  const pointerCleanupRef = useRef<() => void>(() => {});
  const promotionTimerRef = useRef<number | null>(null);
  const promotionPendingRef = useRef(false);
  const sidePaneContext = useContext(PageSidePaneContext);

  useEffect(
    () => () => {
      pointerCleanupRef.current();
      if (promotionTimerRef.current !== null) {
        window.clearTimeout(promotionTimerRef.current);
      }
    },
    [],
  );

  if (!show || isMobile || isMobileViewport()) {
    return null;
  }

  const setPanelWidth = (width: number) => {
    const panel = panelRef.current;
    const shell = panel?.closest<HTMLElement>("[data-page-side-pane-shell]");
    if (!panel || !shell) return null;

    const shellWidth = shell.getBoundingClientRect().width;
    const maxWidth = Math.max(SIDE_PANE_MIN_WIDTH, shellWidth - SIDE_PANE_MIN_MAIN_WIDTH);
    const nextWidth = Math.min(Math.max(width, SIDE_PANE_MIN_WIDTH), maxWidth);
    shell.style.setProperty("--page-side-pane-width", `${nextWidth}px`);

    return {
      mainWidth: shellWidth - nextWidth,
      sideWidth: nextWidth,
    };
  };

  const promoteSidePaneToFullPage = () => {
    if (!sidePaneContext || promotionPendingRef.current) return;

    const panel = panelRef.current;
    const shell = panel?.closest<HTMLElement>("[data-page-side-pane-shell]");
    if (!panel || !shell) {
      sidePaneContext.openSidePaneAsFullPage();
      return;
    }

    promotionPendingRef.current = true;
    shell.dataset.pageSidePanePromoting = "true";
    shell.style.setProperty("--page-side-pane-width", `${shell.getBoundingClientRect().width}px`);

    promotionTimerRef.current = window.setTimeout(() => {
      promotionTimerRef.current = null;
      delete shell.dataset.pageSidePanePromoting;
      shell.dataset.pageSidePanePromoted = "true";
      promotionPendingRef.current = false;
      sidePaneContext.openSidePaneAsFullPage();
    }, WORKSPACE_SIDE_PANE_TRANSITION_MS);
  };

  const expandUnreadablePane = (
    layout: { mainWidth: number; sideWidth: number },
    resizedSide: "main" | "side",
  ) => {
    if (!open || !sidePaneContext) return false;

    const mainIsUnreadable = layout.mainWidth < SIDE_PANE_READABLE_MIN_WIDTH;
    const sideIsUnreadable = layout.sideWidth < SIDE_PANE_READABLE_MIN_WIDTH;

    if (!mainIsUnreadable && !sideIsUnreadable) return false;

    if (mainIsUnreadable && sideIsUnreadable) {
      if (resizedSide === "side") {
        sidePaneContext.closeSidePane();
      } else {
        promoteSidePaneToFullPage();
      }
      return true;
    }

    if (sideIsUnreadable) {
      sidePaneContext.closeSidePane();
      return true;
    }

    promoteSidePaneToFullPage();
    return true;
  };

  const handleResizePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;

    const panel = panelRef.current;
    const shell = panel?.closest<HTMLElement>("[data-page-side-pane-shell]");
    if (!panel || !shell) return;

    event.preventDefault();
    pointerCleanupRef.current();
    shell.dataset.pageSidePaneResizing = "true";
    const startPanelWidth = panel.getBoundingClientRect().width;
    const previousCursor = document.body.style.cursor;
    const previousUserSelect = document.body.style.userSelect;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";

    const cleanup = () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
      window.removeEventListener("pointercancel", handlePointerCancel);
      delete shell.dataset.pageSidePaneResizing;
      document.body.style.cursor = previousCursor;
      document.body.style.userSelect = previousUserSelect;
      pointerCleanupRef.current = () => {};
    };

    const handlePointerMove = (moveEvent: PointerEvent) => {
      const shellRect = shell.getBoundingClientRect();
      const layout = setPanelWidth(shellRect.right - moveEvent.clientX);
      if (!layout) return;

      const resizedSide = layout.sideWidth < startPanelWidth ? "side" : "main";
      const crossedReadableLimit =
        layout.mainWidth < SIDE_PANE_READABLE_MIN_WIDTH ||
        layout.sideWidth < SIDE_PANE_READABLE_MIN_WIDTH;

      if (!crossedReadableLimit) return;

      cleanup();
      window.requestAnimationFrame(() => {
        expandUnreadablePane(layout, resizedSide);
      });
    };

    const handlePointerUp = cleanup;
    const handlePointerCancel = cleanup;

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
    window.addEventListener("pointercancel", handlePointerCancel);
    pointerCleanupRef.current = handlePointerCancel;
  };

  const handleResizeKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const panel = panelRef.current;
    if (!panel || (event.key !== "ArrowLeft" && event.key !== "ArrowRight")) {
      return;
    }

    event.preventDefault();
    const direction = event.key === "ArrowLeft" ? 1 : -1;
    const layout = setPanelWidth(
      panel.getBoundingClientRect().width + direction * SIDE_PANE_KEYBOARD_RESIZE_STEP,
    );
    if (layout) {
      expandUnreadablePane(layout, event.key === "ArrowRight" ? "side" : "main");
    }
  };

  return (
    <aside
      aria-hidden={!open}
      className={cn(
        "absolute inset-y-0 right-0 z-30 flex min-h-0 w-[var(--page-side-pane-width)] min-w-0 flex-col overflow-hidden border-l border-stroke-default bg-surface-canvas shadow-none dark:bg-surface-navigation",
        getPageSidePaneMobilePanelClassName(open),
        className,
      )}
      data-page-side-pane-panel
      inert={open ? undefined : true}
      ref={panelRef}
    >
      <div
        aria-label="Resize side pane"
        aria-orientation="vertical"
        className="group absolute inset-y-0 -left-1 z-40 hidden w-2 cursor-col-resize touch-none md:block"
        data-page-side-pane-resize-handle
        onKeyDown={handleResizeKeyDown}
        onPointerDown={handleResizePointerDown}
        role="separator"
        tabIndex={open ? 0 : -1}
      >
        <span className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-transparent transition-colors group-focus-visible:bg-action-focus-ring group-hover:bg-stroke-default" />
      </div>
      {children}
    </aside>
  );
}

export function PageSidePaneLayout({
  className,
  main,
  mainScrollClassName,
  mainOwnsLayout = false,
  sidePane,
  sidePaneClassName,
  sidePaneOpen,
  sidePaneVisible,
  standalone = false,
  viewportHeightClass = "h-[calc(100svh-3rem)]",
}: {
  className?: string;
  main: ReactNode;
  mainScrollClassName?: string;
  mainOwnsLayout?: boolean;
  sidePane: ReactNode | null;
  sidePaneClassName?: string;
  sidePaneOpen: boolean;
  sidePaneVisible: boolean;
  standalone?: boolean;
  viewportHeightClass?: string;
}) {
  const context = useOptionalPageSidePane();
  const split = (
    <>
      <PageSidePaneMainCell
        className={cn(!standalone && "min-h-0", mainScrollClassName)}
        header={mainOwnsLayout ? undefined : context?.mainHeader}
        scroll={!mainOwnsLayout}
      >
        {main}
      </PageSidePaneMainCell>
      <PageSidePaneSideCell
        className={sidePaneClassName}
        open={sidePaneOpen}
        show={sidePaneVisible}
      >
        {sidePane}
      </PageSidePaneSideCell>
    </>
  );

  if (!standalone) {
    return split;
  }

  return (
    <PageSidePaneShell
      body={split}
      className={cn(viewportHeightClass, className)}
      open={sidePaneOpen}
      visible={sidePaneVisible}
    />
  );
}

export function getPageSidePaneWidthClass() {
  return "min-w-0";
}
