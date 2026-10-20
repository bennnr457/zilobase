import type { Node as ProseMirrorNode, ResolvedPos } from "@tiptap/pm/model";
import { Selection } from "@tiptap/pm/state";
import type { Mappable } from "@tiptap/pm/transform";

// Exact, contiguous block boundaries can cross list depths. NodeRangeSelection
// expands such a range to the shared parent, selecting unhit list siblings.
export class BlockRangeSelection extends Selection {
  constructor($from: ResolvedPos, $to: ResolvedPos) {
    super($from, $to);
  }

  eq(other: Selection) {
    return other instanceof BlockRangeSelection && this.from === other.from && this.to === other.to;
  }

  map(doc: ProseMirrorNode, mapping: Mappable): Selection {
    return this.getBookmark().map(mapping).resolve(doc);
  }

  toJSON() {
    return { type: "blockRange", anchor: this.from, head: this.to };
  }

  static fromJSON(doc: ProseMirrorNode, json: { anchor: number; head: number }) {
    return new BlockRangeSelection(doc.resolve(json.anchor), doc.resolve(json.head));
  }

  getBookmark(): BlockRangeBookmark {
    return new BlockRangeBookmark(this.from, this.to);
  }
}

class BlockRangeBookmark {
  constructor(
    readonly from: number,
    readonly to: number,
  ) {}

  map(mapping: Mappable): BlockRangeBookmark {
    return new BlockRangeBookmark(mapping.map(this.from, 1), mapping.map(this.to, -1));
  }

  resolve(doc: ProseMirrorNode): Selection {
    const from = Math.min(this.from, doc.content.size);
    const to = Math.min(this.to, doc.content.size);
    const $from = doc.resolve(from);
    const $to = doc.resolve(to);
    // Deleting a range across list depths can leave closing wrapper tokens
    // between the mapped endpoints. Those tokens are not a selected block.
    return from < to && $from.nodeAfter?.isBlock && $to.nodeBefore?.isBlock
      ? new BlockRangeSelection($from, $to)
      : Selection.near($from);
  }
}

BlockRangeSelection.prototype.visible = false;
Selection.jsonID("blockRange", BlockRangeSelection);
