// Source: https://ui.shadcn.com/r/styles/radix-mira/progress.json
// Retrieved 2026-10-20; SHA-256 0271e40d6ac242965d19b737a53ec5630a4c061dbbdb78e60a956f54edfa868a.
// Adaptations: local imports, semantic colors, accessible value on the root.
// MIT license: ./ai-elements.LICENSE
"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { Progress as ProgressPrimitive } from "radix-ui";

function Progress({
  className,
  value,
  ...props
}: React.ComponentProps<typeof ProgressPrimitive.Root>) {
  return (
    <ProgressPrimitive.Root
      data-slot="progress"
      value={value}
      className={cn(
        "relative flex h-1 w-full items-center overflow-x-hidden rounded-md bg-surface-secondary",
        className,
      )}
      {...props}
    >
      <ProgressPrimitive.Indicator
        data-slot="progress-indicator"
        className="size-full flex-1 bg-content-primary transition-all"
        style={{ transform: `translateX(-${100 - (value || 0)}%)` }}
      />
    </ProgressPrimitive.Root>
  );
}

export { Progress };
