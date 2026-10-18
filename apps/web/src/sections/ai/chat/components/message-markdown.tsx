"use client";

import { cjk } from "@streamdown/cjk";
import { code } from "@streamdown/code";
import { math } from "@streamdown/math";
import { mermaid } from "@streamdown/mermaid";
import type { ComponentProps } from "react";
import { Streamdown, type IconMap } from "streamdown";
import {
  CheckIcon,
  CopyIcon,
  DownloadIcon,
  ExternalLinkIcon,
  Loader2Icon,
  Maximize2,
  RotateCcwIcon,
  XIcon,
  ZoomInIcon,
  ZoomOutIcon,
} from "@/components/icons";

import { cn } from "@/lib/utils";

const streamdownPlugins = { cjk, code, math, mermaid };
const streamdownIcons = {
  CheckIcon,
  CopyIcon,
  DownloadIcon,
  ExternalLinkIcon,
  Loader2Icon,
  Maximize2Icon: Maximize2,
  RotateCcwIcon,
  XIcon,
  ZoomInIcon,
  ZoomOutIcon,
} satisfies IconMap;

export default function MessageMarkdown({
  className,
  ...props
}: ComponentProps<typeof Streamdown>) {
  return (
    <Streamdown
      className={cn("size-full [&>*:first-child]:mt-0 [&>*:last-child]:mb-0", className)}
      plugins={streamdownPlugins}
      icons={streamdownIcons}
      {...props}
    />
  );
}
