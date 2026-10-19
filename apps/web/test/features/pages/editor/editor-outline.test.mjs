export function register({ assert, loadModule, test }) {
  test("page outlines include headings through level four and resource blocks in document order", async () => {
    const { getEditorOutline } = await loadModule(
      "/src/sections/pages/editor/toolbar/hooks/use-editor-outline.ts",
      ["getEditorOutline"],
    );
    const { Schema } = await import("@tiptap/pm/model");
    const schema = new Schema({
      nodes: {
        doc: { content: "block+" },
        text: {},
        heading: {
          group: "block",
          content: "text*",
          attrs: { level: {}, "data-toc-id": { default: null } },
        },
        databaseBlock: { group: "block", atom: true, attrs: { databaseId: { default: null } } },
        meetingBlock: { group: "block", atom: true, attrs: { meetingId: { default: null } } },
      },
    });
    const heading = (level, title) =>
      schema.node(
        "heading",
        { level, "data-toc-id": title || null },
        title ? schema.text(title) : null,
      );
    const doc = schema.node("doc", null, [
      heading(1, "Overview"),
      heading(2, "Section"),
      heading(3, "Details"),
      heading(4, "Subsection"),
      heading(5, "Excluded five"),
      heading(6, "Excluded six"),
      heading(2, ""),
      schema.node("databaseBlock", { databaseId: "database" }),
      schema.node("meetingBlock", { meetingId: "meeting" }),
      schema.node("databaseBlock", { databaseId: "database" }),
      heading(1, "Next"),
    ]);
    const outline = getEditorOutline({ state: { doc } });
    assert.deepEqual(
      outline.map(({ kind, level, originalLevel, textContent, resourceId }) => ({
        kind,
        level,
        originalLevel,
        textContent,
        resourceId,
      })),
      [
        { kind: "heading", level: 1, originalLevel: 1, textContent: "Overview", resourceId: null },
        { kind: "heading", level: 2, originalLevel: 2, textContent: "Section", resourceId: null },
        { kind: "heading", level: 3, originalLevel: 3, textContent: "Details", resourceId: null },
        {
          kind: "heading",
          level: 4,
          originalLevel: 4,
          textContent: "Subsection",
          resourceId: null,
        },
        {
          kind: "database",
          level: 2,
          originalLevel: 2,
          textContent: "Database",
          resourceId: "database",
        },
        {
          kind: "meeting",
          level: 2,
          originalLevel: 2,
          textContent: "Meeting",
          resourceId: "meeting",
        },
        {
          kind: "database",
          level: 2,
          originalLevel: 2,
          textContent: "Database",
          resourceId: "database",
        },
        { kind: "heading", level: 1, originalLevel: 1, textContent: "Next", resourceId: null },
      ],
    );
    assert.equal(new Set(outline.map(({ id }) => id)).size, outline.length);
    assert.deepEqual(
      outline.map(({ pos }) => doc.nodeAt(pos).type.name),
      [
        "heading",
        "heading",
        "heading",
        "heading",
        "databaseBlock",
        "meetingBlock",
        "databaseBlock",
        "heading",
      ],
    );
  });
}
