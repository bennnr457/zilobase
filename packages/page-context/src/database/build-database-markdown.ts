import type {
  ContextDatabase,
  ContextDataSource,
  DatabaseContextPayload,
} from "../context/contracts";

export function escapeTableCell(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/\|/g, "\\|").replace(/\r?\n/g, "<br>");
}

export function configurationMarkdown(config: unknown): string {
  const json = JSON.stringify(config ?? {}, null, 2);
  const fence = "`".repeat(
    Math.max(3, ...[...json.matchAll(/`+/g)].map(([run]) => run.length + 1)),
  );
  return `${fence}json\n${json}\n${fence}`;
}

export function renderDatabaseHost(database: ContextDatabase) {
  return [
    `## Database: ${database.name.replace(/\r?\n/g, " ")}`,
    `Database ID: ${database.id}`,
    `Page ID: ${database.pageId ?? "none"}`,
    `Source IDs: ${database.sourceIds.join(", ") || "none"}`,
    "Database configuration:",
    configurationMarkdown(database.config),
    ...[...database.views]
      .sort((a, b) => a.position - b.position || a.id.localeCompare(b.id))
      .flatMap((view) => [
        `### View: ${view.name.replace(/\r?\n/g, " ")} (${view.type})`,
        `View ID: ${view.id}; Source ID: ${view.dataSourceId}`,
        configurationMarkdown(view.config),
      ]),
  ].join("\n\n");
}

export function renderDataSource(source: ContextDataSource) {
  const properties = [...source.properties].sort(
    (a, b) => a.position - b.position || a.id.localeCompare(b.id),
  );
  const values = new Map(
    source.values.map((value) => [JSON.stringify([value.pageId, value.propertyId]), value.value]),
  );
  const headers = [
    "Row ID",
    "Page ID",
    "Parent row ID",
    "Name",
    ...properties.map((p) => `${p.property.name} (${p.propertyId})`),
  ];
  return [
    `## Data source: ${source.name.replace(/\r?\n/g, " ")}`,
    `Source ID: ${source.id}; Parent database ID: ${source.parentDatabaseId}`,
    `Host database IDs: ${source.hostDatabaseIds.join(", ")}`,
    "Source configuration:",
    configurationMarkdown(source.config),
    "### Properties",
    ...properties.map((p) =>
      [
        `- ${p.property.name.replace(/\r?\n/g, " ")} (${p.property.type}); Property ID: ${p.propertyId}; Binding ID: ${p.id}`,
        configurationMarkdown(p.property.config),
      ].join("\n"),
    ),
    "### Records (page bodies excluded)",
    `| ${headers.map(escapeTableCell).join(" | ")} |`,
    `| ${headers.map(() => "---").join(" | ")} |`,
    ...[...source.rows]
      .sort((a, b) => a.position - b.position || a.id.localeCompare(b.id))
      .map((row) => {
        const cells = [
          row.id,
          row.pageId,
          row.parentRowId ?? "—",
          row.name,
          ...properties.map((p) => {
            const key = JSON.stringify([row.pageId, p.propertyId]);
            if (!values.has(key)) return "— (missing)";
            const value = values.get(key);
            // Structured values retain IDs and formula/relation metadata instead of being flattened.
            return typeof value === "string" && value.length > 0
              ? value
              : (JSON.stringify(value) ?? "null");
          }),
        ];
        return `| ${cells.map(escapeTableCell).join(" | ")} |`;
      }),
  ]
    .join("\n\n")
    .replace(/\|\n\n\|/g, "|\n|");
}

// Public legacy payload adapter. New context assembly renders hosts and sources separately.
export function buildDatabaseMarkdown(
  host: DatabaseContextPayload,
  schemas: Record<string, DatabaseContextPayload>,
): string {
  const provenance = { capturedAt: "", origin: "saved" as const };
  return [
    renderDatabaseHost({
      ...host.database,
      sourceIds: host.dataSources.map((s) => s.id),
      views: host.views,
      provenance,
      coverage: { complete: true, reasons: [] },
    }),
    ...host.dataSources.flatMap((source) => {
      const schema = host.activeDataSource?.id === source.id ? host : schemas[source.id];
      return schema
        ? [
            renderDataSource({
              ...source,
              hostDatabaseIds: [host.database.id],
              properties: schema.properties,
              rows: schema.rows,
              values: schema.values,
              provenance,
              coverage: {
                complete: schema.rows.length === schema.rowCount,
                totalRows: schema.rowCount,
                reasons: [],
              },
            }),
          ]
        : [];
    }),
  ].join("\n\n");
}

export function collectRequiredDataSourceRefs(schemas: DatabaseContextPayload[]) {
  const refs = new Map<string, { dataSourceId: string; parentDatabaseId: string }>();
  for (const schema of schemas)
    for (const source of schema.dataSources) {
      if (source.id !== schema.activeDataSource?.id)
        refs.set(source.id, { dataSourceId: source.id, parentDatabaseId: source.parentDatabaseId });
    }
  return [...refs.values()];
}
