import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import type { EditorState } from "@tiptap/pm/state";
import type { EditorView } from "@tiptap/pm/view";

export const protectedStructuralBlockTypes = ["databaseBlock", "meetingBlock"] as const;

export type ProtectedStructuralBlockType = (typeof protectedStructuralBlockTypes)[number];

export type ProtectedStructuralBlockTarget = {
  node: ProseMirrorNode;
  pos: number;
  type: ProtectedStructuralBlockType;
};

export function isProtectedStructuralBlockType(
  typeName: string,
): typeName is ProtectedStructuralBlockType {
  return protectedStructuralBlockTypes.includes(typeName as ProtectedStructuralBlockType);
}

function targetForNode(node: ProseMirrorNode, pos: number) {
  return isProtectedStructuralBlockType(node.type.name)
    ? { node, pos, type: node.type.name }
    : null;
}

export function getProtectedStructuralBlockForDelete(
  state: EditorState,
  direction: "backward" | "forward" = "backward",
): ProtectedStructuralBlockTarget | null {
  const { selection } = state;
  const selectedNode = (selection as { node?: ProseMirrorNode }).node;

  if (selectedNode) {
    return targetForNode(selectedNode, selection.from);
  }

  if (selection.empty) {
    const adjacent =
      direction === "forward" ? selection.$from.nodeAfter : selection.$from.nodeBefore;
    if (adjacent) {
      const target = targetForNode(
        adjacent,
        direction === "forward" ? selection.from : selection.from - adjacent.nodeSize,
      );
      if (target) return target;
    }
    const { $from } = selection;
    const atBoundary =
      direction === "forward"
        ? $from.parentOffset === $from.parent.content.size
        : $from.parentOffset === 0;
    if ($from.parent.isTextblock && atBoundary && $from.depth > 0) {
      const depth = $from.depth - 1;
      const index = $from.index(depth) + (direction === "forward" ? 1 : -1);
      const parent = $from.node(depth);
      if (index >= 0 && index < parent.childCount) {
        const sibling = parent.child(index);
        return targetForNode(
          sibling,
          direction === "forward"
            ? $from.after($from.depth)
            : $from.before($from.depth) - sibling.nodeSize,
        );
      }
    }
  }

  let found: ProtectedStructuralBlockTarget | null = null;

  if (!selection.empty) {
    state.doc.nodesBetween(selection.from, selection.to, (node, pos) => {
      const target = targetForNode(node, pos);

      if (target) {
        found = target;
        return false;
      }

      return found === null;
    });
  }

  return found;
}

export function focusProtectedStructuralBlockTitle(
  view: EditorView,
  target: ProtectedStructuralBlockTarget,
) {
  if (target.type === "databaseBlock" && target.node.attrs.showTitle === false) {
    view.dispatch(
      view.state.tr.setNodeMarkup(target.pos, undefined, {
        ...target.node.attrs,
        showTitle: true,
      }),
    );
  }

  window.setTimeout(() => {
    if (view.isDestroyed) return;
    const current = view.state.doc.nodeAt(target.pos);
    const id = target.type === "databaseBlock" ? "databaseId" : "meetingId";
    if (current?.type !== target.node.type || current.attrs[id] !== target.node.attrs[id]) return;
    const nodeDom = view.nodeDOM(target.pos);
    const root = nodeDom instanceof HTMLElement ? nodeDom : (nodeDom?.parentElement ?? null);
    const input = root?.querySelector<HTMLInputElement>("[data-structural-block-title]");

    input?.focus();
    input?.setSelectionRange(input.value.length, input.value.length);
  }, 0);
}

export function handleProtectedStructuralBlockDeleteKey(view: EditorView, event: KeyboardEvent) {
  const isDeleteKey = event.key === "Backspace" || event.key === "Delete";
  const hasCommandModifier = event.metaKey || event.ctrlKey || event.altKey;
  const replacesSelection =
    !view.state.selection.empty &&
    !hasCommandModifier &&
    (event.key === "Enter" || event.key.length === 1);

  if (!isDeleteKey && !replacesSelection) {
    return false;
  }

  const target = getProtectedStructuralBlockForDelete(
    view.state,
    event.key === "Delete" ? "forward" : "backward",
  );

  if (!target) {
    return false;
  }

  event.preventDefault();
  focusProtectedStructuralBlockTitle(view, target);
  return true;
}

export function handleProtectedStructuralBlockClipboardMutation(
  view: EditorView,
  event: ClipboardEvent,
) {
  if (view.state.selection.empty) {
    return false;
  }

  const target = getProtectedStructuralBlockForDelete(view.state);

  if (!target) {
    return false;
  }

  event.preventDefault();
  focusProtectedStructuralBlockTitle(view, target);
  return true;
}

export function handleProtectedStructuralBlockBeforeInput(view: EditorView, event: InputEvent) {
  if (view.state.selection.empty && !event.inputType.startsWith("delete")) return false;
  const target = getProtectedStructuralBlockForDelete(
    view.state,
    event.inputType.includes("Forward") ? "forward" : "backward",
  );
  if (!target) return false;
  event.preventDefault();
  focusProtectedStructuralBlockTitle(view, target);
  return true;
}
