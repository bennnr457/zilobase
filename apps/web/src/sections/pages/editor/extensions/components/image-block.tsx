import { useEditorState } from "@tiptap/react";
import { Node, mergeAttributes } from "@tiptap/core";
import { NodeViewWrapper, ReactNodeViewRenderer, type ReactNodeViewProps } from "@tiptap/react";
import { Image as ImageIcon } from "@/components/icons";
import { useRef, useState } from "react";

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ImageSourcePicker } from "@/sections/pages/appearance/components/image-source-picker";

const minImageWidth = 160;

function ImageBlockView({ editor, extension, node, updateAttributes }: ReactNodeViewProps) {
  const isEditable = useEditorState({ editor, selector: ({ editor }) => editor.isEditable });
  const options = extension.options as ImageBlockOptions;
  const resizeStateRef = useRef<{
    startX: number;
    startWidth: number;
    side: "left" | "right";
  } | null>(null);
  const [open, setOpen] = useState(false);
  const src = node.attrs.src as string | null;
  const alt = (node.attrs.alt as string | null) ?? "Image";
  const width = node.attrs.width as number | null;

  const setImageSrc = (nextSrc: string) => {
    if (!editor.isEditable || editor.isDestroyed) return;
    updateAttributes({
      src: nextSrc,
      alt: alt === "Image" ? "Uploaded image" : alt,
    });
    setOpen(false);
  };

  const startResize = (event: React.PointerEvent<HTMLSpanElement>, side: "left" | "right") => {
    if (!editor.isEditable || editor.isDestroyed) return;
    const preview = event.currentTarget.closest("[data-image-block-preview]");

    if (!(preview instanceof HTMLElement)) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    resizeStateRef.current = {
      side,
      startX: event.clientX,
      startWidth: preview.getBoundingClientRect().width,
    };
  };

  const updateResize = (event: React.PointerEvent<HTMLSpanElement>) => {
    if (!editor.isEditable || editor.isDestroyed) return;
    const resizeState = resizeStateRef.current;

    if (!resizeState) {
      return;
    }

    const editorWidth = editor.view.dom.clientWidth;
    const delta =
      resizeState.side === "right"
        ? event.clientX - resizeState.startX
        : resizeState.startX - event.clientX;
    const nextWidth = Math.round(
      Math.min(editorWidth, Math.max(minImageWidth, resizeState.startWidth + delta)),
    );

    if (!editor.isEditable || editor.isDestroyed) return;
    updateAttributes({ width: nextWidth });
  };

  const stopResize = (event: React.PointerEvent<HTMLSpanElement>) => {
    if (resizeStateRef.current) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }

    resizeStateRef.current = null;
  };

  return (
    <NodeViewWrapper className="image-block" data-src={src ? "true" : "false"}>
      <Popover onOpenChange={setOpen} open={open}>
        <PopoverTrigger asChild>
          <button
            className="flex h-10 w-full items-center gap-2 rounded-md bg-surface-subtle px-3 text-left text-sm font-medium text-content-secondary transition-colors hover:bg-action-neutral-hover hover:text-action-on-neutral active:bg-action-neutral-pressed active:text-action-on-neutral focus-visible:ring-2 focus-visible:ring-action-focus-ring focus-visible:outline-none disabled:hidden [&_svg]:size-4 [&_svg]:shrink-0"
            contentEditable={false}
            disabled={!isEditable || Boolean(src)}
            type="button"
          >
            <ImageIcon />
            <span>Add an image</span>
          </button>
        </PopoverTrigger>
        <PopoverContent
          align="start"
          className="w-[min(42rem,calc(100vw-2rem))] p-4"
          onMouseDown={(event) => {
            event.stopPropagation();
          }}
          onPointerDown={(event) => {
            event.stopPropagation();
          }}
          side="bottom"
          sideOffset={8}
        >
          <ImageSourcePicker
            initialLinkUrl={src ?? ""}
            onSelect={setImageSrc}
            workspaceId={options.workspaceId}
            pageId={options.pageId}
          />
        </PopoverContent>
      </Popover>
      {src ? (
        <button
          aria-label="Image"
          className="group/image-preview relative mx-auto block max-w-full overflow-hidden rounded-md border bg-surface-muted p-0 focus-visible:ring-2 focus-visible:ring-action-focus-ring focus-visible:outline-none [&>img]:block [&>img]:w-full"
          contentEditable={false}
          data-image-block-preview
          style={width ? { width: `${width}px` } : undefined}
          type="button"
        >
          <span
            aria-hidden="true"
            className="absolute left-1 top-1/2 z-10 hidden h-14 w-4 -translate-y-1/2 cursor-ew-resize items-center justify-center touch-none before:block before:h-10 before:w-0.5 before:rounded-full before:bg-action-selected-subtle before:content-[''] group-focus-visible/image-preview:flex group-hover/image-preview:flex"
            onPointerDown={(event) => startResize(event, "left")}
            onPointerMove={updateResize}
            onPointerUp={stopResize}
          />
          <img alt={alt} src={src} title={node.attrs.title ?? undefined} />
          <span
            aria-hidden="true"
            className="absolute right-1 top-1/2 z-10 hidden h-14 w-4 -translate-y-1/2 cursor-ew-resize items-center justify-center touch-none before:block before:h-10 before:w-0.5 before:rounded-full before:bg-action-selected-subtle before:content-[''] group-focus-visible/image-preview:flex group-hover/image-preview:flex"
            onPointerDown={(event) => startResize(event, "right")}
            onPointerMove={updateResize}
            onPointerUp={stopResize}
          />
        </button>
      ) : null}
    </NodeViewWrapper>
  );
}

type ImageBlockOptions = {
  workspaceId?: string | null;
  pageId?: string | null;
};

export const ImageBlock = Node.create<ImageBlockOptions>({
  name: "imageBlock",
  markdownTokenName: "image",
  parseMarkdown: (token, helpers) =>
    helpers.createNode("imageBlock", {
      src: token.href,
      alt: token.text || "",
      title: token.title || null,
    }),
  renderMarkdown: (node) =>
    `![${String(node.attrs?.alt ?? "").replace(/[\\[\]]/g, "\\$&")}](${String(node.attrs?.src ?? "").replace(/ /g, "%20")}${node.attrs?.title ? ` ${JSON.stringify(String(node.attrs.title))}` : ""})`,

  group: "block",

  atom: true,

  draggable: true,

  selectable: true,

  addOptions() {
    return {
      workspaceId: null,
      pageId: null,
    };
  },

  addAttributes() {
    return {
      src: {
        default: null,
        parseHTML: (element) => element.getAttribute("data-src") ?? element.getAttribute("src"),
        renderHTML: (attributes) => (attributes.src ? { "data-src": attributes.src } : {}),
      },
      alt: {
        default: null,
        parseHTML: (element) => element.getAttribute("data-alt") ?? element.getAttribute("alt"),
        renderHTML: (attributes) => (attributes.alt ? { "data-alt": attributes.alt } : {}),
      },
      title: {
        default: null,
        parseHTML: (element) => element.getAttribute("data-title"),
        renderHTML: (attributes) => (attributes.title ? { "data-title": attributes.title } : {}),
      },
      width: {
        default: null,
        parseHTML: (element) => {
          const width = element.getAttribute("data-width");

          return width ? Number.parseInt(width, 10) : null;
        },
        renderHTML: (attributes) => (attributes.width ? { "data-width": attributes.width } : {}),
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'div[data-type="imageBlock"]',
      },
      {
        tag: "img[src]",
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    if (!HTMLAttributes.src) {
      return ["div", mergeAttributes(HTMLAttributes, { "data-type": "imageBlock" })];
    }

    return [
      "img",
      mergeAttributes(HTMLAttributes, {
        "data-type": "imageBlock",
      }),
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(ImageBlockView);
  },
});
