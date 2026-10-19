import { CONTEXT_VERSION, type WorkspaceContext } from "./contracts";

export function contextFixture(): WorkspaceContext {
  const provenance = {
    capturedAt: "2026-10-20T00:00:00Z",
    origin: "saved" as const,
    revision: "1",
  };
  return {
    version: CONTEXT_VERSION,
    roots: [
      { type: "page", id: "page-project" },
      { type: "database", id: "db-linked" },
    ],
    pages: [
      {
        id: "page-project",
        title: "Project",
        path: "/Project",
        provenance,
        coverage: { complete: true, reasons: [] },
        databaseIds: ["db-project"],
        content: {
          type: "doc",
          content: [
            { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "Overview" }] },
            {
              type: "details",
              content: [
                { type: "detailsSummary", content: [{ type: "text", text: "Decisions" }] },
                {
                  type: "detailsContent",
                  content: [{ type: "paragraph", content: [{ type: "text", text: "Ship it" }] }],
                },
              ],
            },
            { type: "databaseBlock", attrs: { databaseId: "db-project" } },
            { type: "pageBlock", attrs: { pageId: "page-child", title: "Child" } },
          ],
        },
      },
    ],
    databases: ["db-project", "db-linked"].map((id) => ({
      id,
      name: id,
      pageId: null,
      sourceIds: ["source-tasks", "source-empty"],
      provenance,
      coverage: { complete: true, reasons: [] },
      views: ["table", "kanban", "timeline"].map((type, position) => ({
        id: `${id}-${type}`,
        type,
        name: type,
        dataSourceId: "source-tasks",
        position,
        config: {
          hiddenPropertyIds: ["binding-cost"],
          filters: [
            {
              type: "group",
              operator: "or",
              filters: [
                { propertyId: "prop-cost", operator: "gt", values: [10] },
                { propertyId: "prop-done", operator: "eq", values: [false] },
              ],
            },
          ],
          sorts: [{ column: "prop-cost", direction: "descending" }],
          groupPropertyId: "prop-done",
        },
      })),
    })),
    sources: [
      {
        id: "source-tasks",
        name: "Tasks",
        parentDatabaseId: "db-project",
        hostDatabaseIds: ["db-project", "db-linked"],
        provenance,
        coverage: { complete: true, totalRows: 2, includedRows: 2, omittedRows: 0, reasons: [] },
        properties: [
          {
            id: "binding-cost",
            propertyId: "prop-cost",
            position: 0,
            property: { id: "prop-cost", name: "Cost", type: "number" },
          },
          {
            id: "binding-done",
            propertyId: "prop-done",
            position: 1,
            property: { id: "prop-done", name: "Done", type: "checkbox" },
          },
          {
            id: "binding-relation",
            propertyId: "prop-relation",
            position: 2,
            property: {
              id: "prop-relation",
              name: "Related",
              type: "relation",
              config: { targetDatabaseId: "db-linked" },
            },
          },
        ],
        rows: [
          { id: "row-parent", pageId: "page-task", position: 0, name: "Parent | task" },
          {
            id: "row-child",
            pageId: "page-subtask",
            parentRowId: "row-parent",
            position: 1,
            name: "Child\ntask",
          },
        ],
        values: [
          { pageId: "page-task", propertyId: "prop-cost", value: 0 },
          { pageId: "page-task", propertyId: "prop-done", value: false },
          {
            pageId: "page-task",
            propertyId: "prop-relation",
            value: [{ pageId: "page-other", name: "Other" }],
          },
          { pageId: "page-subtask", propertyId: "prop-relation", value: "" },
        ],
      },
      {
        id: "source-empty",
        name: "No views",
        parentDatabaseId: "db-project",
        hostDatabaseIds: ["db-project", "db-linked"],
        provenance,
        coverage: { complete: true, totalRows: 0, includedRows: 0, omittedRows: 0, reasons: [] },
        properties: [],
        rows: [],
        values: [],
      },
    ],
    unavailable: [],
  };
}
