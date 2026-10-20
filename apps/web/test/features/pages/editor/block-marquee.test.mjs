export function register({ assert, loadModule, test }) {
  test("marquee geometry normalizes reverse drags and excludes boundary-only contact", async () => {
    const { getMarqueeBounds, intersectsMarquee } = await loadModule(
      "/src/sections/pages/editor/selection/lib/block-marquee.ts",
    );
    const bounds = getMarqueeBounds({ x: 100, y: 80 }, { x: 20, y: 10 });
    assert.deepEqual(bounds, { left: 20, top: 10, right: 100, bottom: 80 });
    assert.equal(intersectsMarquee(bounds, { left: 90, top: 70, right: 120, bottom: 100 }), true);
    assert.equal(intersectsMarquee(bounds, { left: 100, top: 10, right: 120, bottom: 80 }), false);
    assert.equal(intersectsMarquee(bounds, { left: 20, top: 80, right: 100, bottom: 90 }), false);
  });

  test("block range selections preserve partial lists through serialization, edits, and deletion", async () => {
    const { Schema } = await import("@tiptap/pm/model");
    const { Transform } = await import("@tiptap/pm/transform");
    const { BlockRangeSelection } = await loadModule(
      "/src/sections/pages/editor/selection/lib/block-range-selection.ts",
    );
    const schema = new Schema({
      nodes: {
        doc: { content: "block+" },
        text: { group: "inline" },
        paragraph: { content: "inline*", group: "block" },
        bulletList: { content: "listItem+", group: "block" },
        listItem: { content: "paragraph+" },
      },
    });
    const p = (text) => schema.node("paragraph", null, schema.text(text));
    const item = (text) => schema.node("listItem", null, [p(text)]);
    const doc = schema.node("doc", null, [
      schema.node("bulletList", null, [item("Keep"), item("Select")]),
      p("Also select"),
      p("After"),
    ]);
    const from = 1 + item("Keep").nodeSize;
    const to = doc.firstChild.nodeSize + p("Also select").nodeSize;
    const selection = new BlockRangeSelection(doc.resolve(from), doc.resolve(to));
    assert.equal(selection.visible, false);
    assert.equal(selection.from, from);
    assert.equal(selection.to, to);
    assert.equal(
      selection.content().content.textBetween(0, selection.content().content.size),
      "SelectAlso select",
    );
    assert.equal(BlockRangeSelection.fromJSON(doc, selection.toJSON()).eq(selection), true);

    const inserted = new Transform(doc).insert(0, p("Before"));
    const mapped = selection.map(inserted.doc, inserted.mapping);
    assert.equal(mapped.from, from + p("Before").nodeSize);
    assert.equal(mapped.to, to + p("Before").nodeSize);
    assert.equal(
      selection.getBookmark().map(inserted.mapping).resolve(inserted.doc).eq(mapped),
      true,
    );

    const removed = new Transform(doc).delete(from, to);
    const collapsed = selection.map(removed.doc, removed.mapping);
    assert.equal(collapsed.empty, true);
    assert.ok(collapsed.from <= removed.doc.content.size);
  });
}
