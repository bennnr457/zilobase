import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
export function ScrollViewport({
  children,
  className,
  edgeFadeClassName,
  scrollClassName,
}: {
  children: ReactNode;
  className?: string;
  edgeFadeClassName?: string;
  scrollClassName?: string;
}) {
  return (
    <div className={cn("relative min-h-0 min-w-0 overflow-hidden", className)}>
      <div
        className={cn(
          "flex h-full min-h-0 min-w-0 flex-col overflow-y-auto [scrollbar-gutter:stable]",
          scrollClassName,
        )}
        data-page-scroll-viewport
      >
        {children}
      </div>
      <div
        aria-hidden="true"
        className={cn(
          "pointer-events-none absolute inset-x-0 bottom-0 z-20 h-5 bg-gradient-to-t from-surface-canvas to-transparent",
          edgeFadeClassName,
        )}
      />
    </div>
  );
}
