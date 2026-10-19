import { Extension } from "@tiptap/core";
import type { CSSProperties } from "react";
import { getColorTokenValue, getPaletteBackgroundColor } from "@/lib/color-tokens";

const blockTypes = [
  "callout",
  "codeBlock",
  "blockMath",
  "bookmarkBlock",
  "fileBlock",
  "embedBlock",
  "imageBlock",
  "videoBlock",
  "tabsBlock",
];

export function hasBlockBackground(type: string) {
  return blockTypes.includes(type);
}

function backgroundColor(color: string | null | undefined) {
  return color === "gray"
    ? "var(--zb-color-surface-background-navigation)"
    : (getPaletteBackgroundColor(color) ?? "transparent");
}

export function blockBackgroundProps(color: string | null | undefined) {
  const value = color === undefined ? "gray" : getColorTokenValue(color);
  return {
    "data-background-color": value,
    style: { "--editor-block-background": backgroundColor(value) } as CSSProperties,
  };
}

/** One persisted fill contract for framed blocks, including atomic nodes. */
export const BlockBackground = Extension.create({
  name: "blockBackground",
  addGlobalAttributes() {
    return [
      {
        types: blockTypes,
        attributes: {
          backgroundColor: {
            default: "gray",
            parseHTML: (element: HTMLElement) => {
              const color = element.getAttribute("data-background-color");
              // Keep explicit no-fill distinct from legacy HTML without a choice.
              return color === null ? "gray" : getColorTokenValue(color);
            },
            renderHTML: (attrs: Record<string, unknown>) => {
              const color =
                typeof attrs.backgroundColor === "string" ? attrs.backgroundColor : "default";
              const props = blockBackgroundProps(color);
              return {
                "data-background-color": props["data-background-color"],
                style: `--editor-block-background: ${backgroundColor(props["data-background-color"])}`,
              };
            },
          },
        },
      },
    ];
  },
});
