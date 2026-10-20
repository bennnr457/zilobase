import { renderDatabaseHost, renderDataSource } from "../database/build-database-markdown";
import { prosemirrorToMarkdown } from "../markdown/prosemirror-to-markdown";
import type { PageDocumentNode } from "../document/page-document";
import {
  CONTEXT_VERSION,
  type BuildContextInput,
  type BuildContextResult,
  type ContextCoverage,
  type ContextManifestEntry,
} from "./contracts";

export function buildContextMarkdown({
  context,
  maxChars = 48_000,
  maxBytes = Infinity,
}: BuildContextInput): BuildContextResult {
  const unique = <T extends { id: string }>(items: T[]) => [
    ...new Map(items.map((item) => [item.id, item])).values(),
  ];
  const pages = unique(context.pages);
  const databases = unique(context.databases);
  const sources = unique(context.sources);
  const blocks = pages.map((page) => {
    const doc = page.content as PageDocumentNode | null;
    return (doc?.type === "doc" ? (doc.content ?? []) : [doc])
      .map(prosemirrorToMarkdown)
      .filter(Boolean);
  });
  const pageCounts = pages.map(() => 0);
  const rowCounts = sources.map(() => 0);
  const sourceRows = sources.map((source) =>
    [...source.rows].sort((a, b) => a.position - b.position || a.id.localeCompare(b.id)),
  );
  const coverage = (base: ContextCoverage, reason?: string): ContextCoverage => ({
    ...base,
    complete: base.complete && !reason,
    reasons: [...base.reasons, ...(reason ? [reason] : [])],
  });
  const render = () => {
    const manifest: ContextManifestEntry[] = [];
    const omissions = context.unavailable.map(
      ({ parent, reason }) => `${parent.type} ${parent.id}: ${reason}`,
    );
    const sections = pages.map((page, index) => {
      const reason =
        pageCounts[index]! < blocks[index]!.length
          ? "Page body blocks omitted by context budget"
          : undefined;
      const pageCoverage = coverage(page.coverage, reason);
      omissions.push(...pageCoverage.reasons.map((r) => `Page ${page.id}: ${r}`));
      manifest.push({
        key: `page:${page.id}`,
        type: "page",
        id: page.id,
        title: page.title,
        emoji: page.emoji,
        pageId: page.id,
        provenance: page.provenance,
        coverage: pageCoverage,
      });
      return [
        `## [Attached] ${page.title.replace(/\r?\n/g, " ")} (page)`,
        `Page ID: ${page.id}`,
        `Captured: ${page.provenance.capturedAt}; Origin: ${page.provenance.origin}; Revision: ${page.provenance.revision ?? "unknown"}`,
        `Database IDs: ${page.databaseIds.join(", ") || "none"}`,
        `Path: ${page.path}`,
        ...blocks[index]!.slice(0, pageCounts[index]),
        "<!-- end-page -->",
      ].join("\n\n");
    });
    for (const database of databases) {
      manifest.push({
        key: `database:${database.id}`,
        type: "database",
        id: database.id,
        title: database.name,
        emoji: database.emoji,
        databaseId: database.id,
        provenance: database.provenance,
        coverage: database.coverage,
      });
      omissions.push(...database.coverage.reasons.map((r) => `Database ${database.id}: ${r}`));
      sections.push(renderDatabaseHost(database));
    }
    sources.forEach((source, index) => {
      const rows = sourceRows[index]!.slice(0, rowCounts[index]);
      const total = source.coverage.totalRows;
      const omitted = Math.max(0, (total ?? source.rows.length) - rows.length);
      const sourceCoverage = {
        ...coverage(
          source.coverage,
          rows.length < source.rows.length ? "Records omitted by context budget" : undefined,
        ),
        includedRows: rows.length,
        omittedRows: omitted,
      };
      manifest.push({
        key: `source:${source.id}`,
        type: "source",
        id: source.id,
        title: source.name,
        emoji: source.emoji,
        sourceId: source.id,
        databaseId: source.hostDatabaseIds[0],
        provenance: source.provenance,
        coverage: sourceCoverage,
      });
      for (const row of rows)
        manifest.push({
          key: `record:${source.id}:${row.id}`,
          type: "record",
          id: row.id,
          title: row.name,
          emoji: row.emoji,
          sourceId: source.id,
          pageId: row.pageId,
          databaseId: source.hostDatabaseIds[0],
          provenance: source.provenance,
        });
      omissions.push(...sourceCoverage.reasons.map((r) => `Source ${source.id}: ${r}`));
      sections.push(renderDataSource({ ...source, rows, coverage: sourceCoverage }));
      sections.push(
        `Source ${source.id} coverage: ${rows.length}/${total ?? "unknown"} rows included; ${omitted} omitted; ${sourceCoverage.complete ? "complete" : "partial"}.`,
      );
    });
    const markdown = [
      "# Zilobase workspace context",
      ...sections,
      ...(omissions.length
        ? ["## Context limitations", ...omissions.map((reason) => `- ${reason}`)]
        : []),
    ].join("\n\n");
    return { markdown, manifest, omissions };
  };
  const encoder = new TextEncoder();
  const fits = (markdown: string) =>
    markdown.length <= maxChars && encoder.encode(markdown).length <= maxBytes;
  // Metadata and omission notices are mandatory. Never silently slice them or a table row.
  if (!Number.isFinite(maxChars) || maxChars < 0 || !fits(render().markdown))
    return {
      version: CONTEXT_VERSION,
      markdown: "",
      charCount: 0,
      manifest: [],
      status: "blocked",
      omissions: ["Selected resource metadata exceeds the context budget. Remove an attachment."],
      trimmedAttachmentIds: context.roots.map((root) => root.id),
    };
  for (let i = 0; i < pages.length; i++) {
    for (let j = 0; j < blocks[i]!.length; j++) {
      pageCounts[i]!++;
      if (!fits(render().markdown)) {
        pageCounts[i]!--;
        break;
      }
    }
  }
  // Allocate rows across sources so one large source cannot consume every record slot.
  const exhausted = new Set<number>();
  while (exhausted.size < sources.length)
    for (let i = 0; i < sources.length; i++) {
      if (exhausted.has(i)) continue;
      if (rowCounts[i]! >= sourceRows[i]!.length) {
        exhausted.add(i);
        continue;
      }
      rowCounts[i]!++;
      if (!fits(render().markdown)) {
        rowCounts[i]!--;
        exhausted.add(i);
      }
    }
  const result = render();
  return {
    ...result,
    version: CONTEXT_VERSION,
    charCount: result.markdown.length,
    status:
      result.omissions.length || result.manifest.some((e) => e.coverage?.complete === false)
        ? "partial"
        : "complete",
    trimmedAttachmentIds: pages
      .filter((_, index) => pageCounts[index]! < blocks[index]!.length)
      .map((page) => page.id),
  };
}
