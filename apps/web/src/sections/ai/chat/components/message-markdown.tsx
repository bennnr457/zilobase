"use client";

import { cjk } from "@streamdown/cjk";
import { code } from "@streamdown/code";
import { math } from "@streamdown/math";
import { mermaid } from "@streamdown/mermaid";
import { cloneElement, isValidElement, type ComponentProps } from "react";
import { Streamdown, type Components, type IconMap } from "streamdown";
import { MessageCodeBlock } from "./message-code-block";
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
const markdownComponents = {
  pre: ({ children }) => {
    if (!isValidElement<ComponentProps<"code">>(children)) return <pre>{children}</pre>;
    const language = children.props.className?.match(/language-([^\s]+)/)?.[1] ?? "text";
    // Mermaid retains Streamdown's diagram renderer and its existing controls.
    if (language === "mermaid") {
      return cloneElement(children, { "data-block": "true" } as ComponentProps<"code">);
    }
    return <MessageCodeBlock code={String(children.props.children ?? "")} language={language} />;
  },
} satisfies Components;
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
  isAnimating = false,
  ...props
}: ComponentProps<typeof Streamdown>) {
  return (
    <Streamdown
      animated={{ animation: "fadeIn", duration: 180, easing: "ease-out" }}
      isAnimating={isAnimating}
      className={cn("size-full [&>*:first-child]:mt-0 [&>*:last-child]:mb-0", className)}
      plugins={streamdownPlugins}
      components={markdownComponents}
      icons={streamdownIcons}
      {...props}
    />
  );
}
