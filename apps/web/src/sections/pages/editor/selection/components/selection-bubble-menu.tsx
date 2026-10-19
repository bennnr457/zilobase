import { isTextSelection } from "@tiptap/core";
import { BubbleMenu } from "@tiptap/react/menus";
import { useEffect } from "react";

import { ButtonGroup, ButtonGroupSeparator } from "@/components/ui/button-group";

import { blockSelectionPluginKey } from "../../extensions/lib/block-selection";

import { isFeatureEnabled } from "@/platform/environment";
import { ColorMenu } from "../../toolbar/components/color-menu";
import { ToolbarButton } from "../../toolbar/components/toolbar-button";
import type { EditorControlProps, RunToolbarCommand } from "../../toolbar/lib/toolbar";
import { toolbarGroups } from "../../toolbar/lib/toolbar";
import { SelectionAiMenu } from "./selection-ai-menu";

const SELECTION_BUBBLE_MENU_PLUGIN_KEY = "selectionBubbleMenu";

export function SelectionBubbleMenu({
  editor,
  runCommand,
}: EditorControlProps & {
  runCommand: RunToolbarCommand;
}) {
  useEffect(() => {
    if (!editor || !editor.isInitialized || editor.isDestroyed) {
      return;
    }

    let frame: number | null = null;

    const updatePosition = () => {
      if (frame !== null) {
        return;
      }

      frame = window.requestAnimationFrame(() => {
        frame = null;

        if (!editor.isInitialized || editor.isDestroyed) {
          return;
        }

        editor.view.dispatch(
          editor.state.tr.setMeta(SELECTION_BUBBLE_MENU_PLUGIN_KEY, "updatePosition"),
        );
      });
    };

    // The editor can move while page/side-pane width transitions settle without
    // causing a window resize. Keep the selection anchor live through reflow.
    const resizeObserver = new ResizeObserver(updatePosition);
    let layoutElement: HTMLElement | null = editor.view.dom;

    while (layoutElement && layoutElement !== document.body) {
      resizeObserver.observe(layoutElement);
      layoutElement = layoutElement.parentElement;
    }

    editor.on("selectionUpdate", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    window.visualViewport?.addEventListener("scroll", updatePosition);
    window.visualViewport?.addEventListener("resize", updatePosition);
    updatePosition();

    return () => {
      if (frame !== null) {
        window.cancelAnimationFrame(frame);
      }

      resizeObserver.disconnect();
      editor.off("selectionUpdate", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
      window.visualViewport?.removeEventListener("scroll", updatePosition);
      window.visualViewport?.removeEventListener("resize", updatePosition);
    };
  }, [editor]);

  if (!editor || !editor.isInitialized || editor.isDestroyed) {
    return null;
  }

  return (
    <BubbleMenu
      className="selection-toolbar-layer"
      editor={editor}
      pluginKey={SELECTION_BUBBLE_MENU_PLUGIN_KEY}
      resizeDelay={0}
      updateDelay={0}
      options={{
        placement: "top",
        offset: 8,
        strategy: "fixed",
      }}
      shouldShow={({ editor, element, view, state, from, to }) => {
        const { selection } = state;
        const blockSelectionMode = blockSelectionPluginKey.getState(state)?.mode ?? "none";

        if (
          !editor.isEditable ||
          !(view.hasFocus() || element.contains(element.ownerDocument.activeElement)) ||
          view.dom.classList.contains("dragging") ||
          blockSelectionMode === "all" ||
          !isTextSelection(selection) ||
          selection.empty ||
          state.doc.textBetween(from, to).trim().length === 0
        ) {
          return false;
        }

        // Check the whole range: a selection can cross code even when both
        // endpoints are in ordinary text. Code blocks do not support these marks.
        let containsCode = false;
        state.doc.nodesBetween(from, to, (node) => {
          if (node.type.spec.code) {
            containsCode = true;
            return false;
          }
        });

        return !containsCode;
      }}
    >
      <ButtonGroup aria-label="Text selection actions" role="toolbar" variant="floating">
        {toolbarGroups[0].map((item) => (
          <ToolbarButton
            editor={editor}
            item={item}
            key={item.label}
            runCommand={runCommand}
            useMouseDown
          />
        ))}
        {isFeatureEnabled("askAi") ? (
          <>
            <ButtonGroupSeparator />
            <SelectionAiMenu />
            <ButtonGroupSeparator />
          </>
        ) : (
          <ButtonGroupSeparator />
        )}
        <ColorMenu editor={editor} />
        <ButtonGroupSeparator />
        {toolbarGroups[2].map((item) => (
          <ToolbarButton
            editor={editor}
            item={item}
            key={item.label}
            runCommand={runCommand}
            useMouseDown
          />
        ))}
      </ButtonGroup>
    </BubbleMenu>
  );
}
