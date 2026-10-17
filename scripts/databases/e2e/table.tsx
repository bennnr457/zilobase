import { useState } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient } from "@tanstack/react-query";
import { Toaster } from "sonner";
import { ZilobaseFeaturesProvider, type ZilobaseFeaturesConfig } from "@zilobase/features";
import { ShortcutProvider } from "@/app/shortcuts/shortcut-provider";
import {
  DatabaseViewProvider,
  type DatabaseViewProviderValue,
} from "@/sections/databases/views/state/components/database-view-context";
import {
  getDatabasePageDragPayload,
  hasDatabasePageDragPayload,
} from "@/sections/databases/interactions/lib/database-page-drop";
import { DatabaseTableView } from "@/sections/databases/views/table/components/database-table-view";
import type {
  DatabasePropertyListItem,
  DatabasePropertyValue,
  SortableDatabaseItem,
} from "@zilobase/features/databases";
import "@/styles/global.css";
import "@/styles/app.css";

const client = new QueryClient({
  defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
});
const session = {
  user: { id: "user" },
  session: { id: "table-proof", activeWorkspaceId: "workspace" },
  workspacePinned: true,
};
let activeSession = session;
client.setQueryData(["session"], session);
const writes: unknown[] = [],
  opened: string[] = [],
  actions: unknown[] = [];
let applyCommand = (_body: any) => {};
let failTitle = false;
const features = {
  queryClient: client,
  deployment: "table-proof",
  auth: { getSession: async () => activeSession },
  apiFetch: async (path: string, init?: RequestInit) => {
    if (!init?.body) return {};
    const body = JSON.parse(String(init.body));
    if (path.includes("command")) {
      if (failTitle && body.command?.title !== undefined) throw new Error("Title save rejected");
      writes.push(body);
      applyCommand(body);
      return {
        commandId: body.commandId,
        result: {},
        sourceVersions: { source: 2 },
        event: {
          actorId: "user",
          areas: ["records"],
          changes: {},
          commandId: body.commandId,
          committedAt: new Date().toISOString(),
          databaseId: "host",
          dataSourceId: "source",
          eventId: body.commandId,
          protocolVersion: 2,
          type: "database.mutation",
          version: 2,
        },
      };
    }
    return {};
  },
} as unknown as ZilobaseFeaturesConfig;
const field = (id: string, type: string, config = {}): DatabasePropertyListItem => ({
  id: `${id}-list`,
  position: 0,
  property: { id, name: id[0].toUpperCase() + id.slice(1), type, config },
});
const initialProperties = [
  field("text", "text"),
  field("number", "number"),
  field("status", "status", {
    options: [
      { id: "open", name: "Open", color: "blue" },
      { id: "done", name: "Done", color: "green" },
      { id: "empty", name: "Waiting", color: "gray" },
    ],
  }),
  field("date", "date"),
  field("check", "checkbox"),
  field("person", "person"),
  field("tags", "multi_select", {
    options: [
      { id: "a", name: "A", color: "blue" },
      { id: "b", name: "B", color: "green" },
    ],
  }),
  field("formula", "formula", { expression: "1 + 1" }),
  field("relation", "relation"),
  field("files", "files"),
];
const row = (index: number): SortableDatabaseItem => ({
  id: `row-${index}`,
  pageId: `page-${index}`,
  position: index,
  createdAt: "2026-10-17",
  updatedAt: "2026-10-17",
  page: { id: `page-${index}`, name: `Record ${index}` },
});
const proof = {
  writes,
  opened,
  actions,
  identity: (account: string) => {
    activeSession = {
      ...session,
      user: { id: account },
      session: { ...session.session, id: account },
    };
    client.setQueryData(["session"], activeSession);
  },
  schema: (_id: string, _type: string) => {},
  options: (_options: Record<string, unknown>) => {},
  values: () => ({}) as Record<string, DatabasePropertyValue>,
  rows: () => [] as SortableDatabaseItem[],
  remote: (_values: Record<string, DatabasePropertyValue>) => {},
  reset: () => {
    writes.length = 0;
    opened.length = 0;
    actions.length = 0;
  },
};
Object.assign(window, { tableProof: proof });
function Proof() {
  const [options, setOptions] = useState({
    count: 8,
    grouped: false,
    nested: false,
    wrap: false,
    editable: true,
    readOnlyProperties: false,
    embedded: false,
    filtered: false,
    sorted: false,
    failSave: false,
    failTitle: false,
    scope: "one",
    columns: ["text", "number", "status"],
  });
  const [properties, setProperties] = useState(initialProperties);
  const [columnOrder, setColumnOrder] = useState<string[]>([]);
  const [names, setNames] = useState<Record<string, string>>({});
  const [positions, setPositions] = useState<Record<string, number>>({});
  const [extra, setExtra] = useState<SortableDatabaseItem[]>([]);
  const [values, setValues] = useState<Record<string, DatabasePropertyValue>>(() =>
    Object.fromEntries(
      Array.from({ length: 10000 }, (_, i) => [
        [`page-${i}:text`, `Text ${i}`],
        [`page-${i}:number`, String(i)],
        [`page-${i}:status`, i % 2 === 0 ? "Open" : "Done"],
        [`page-${i}:date`, "2026-10-17"],
        [`page-${i}:check`, "false"],
        [`page-${i}:person`, ["ada"]],
        [`page-${i}:tags`, ["A"]],
      ]).flat(),
    ),
  );
  const rows = [...Array.from({ length: options.count }, (_, i) => row(i)), ...extra].map((r) => ({
    ...r,
    position: positions[r.id] ?? r.position,
    page: { ...r.page, name: names[r.id] ?? r.page.name },
  }));
  const visible = rows
    .filter((_, i) => !options.filtered || i % 2 === 0)
    .sort((a, b) =>
      options.sorted
        ? String(b.page.name).localeCompare(String(a.page.name))
        : a.position - b.position,
    );
  const configured = properties.map((p) => ({
    ...p,
    property: {
      ...p.property,
      config: { ...(p.property.config as object), wrapContent: options.wrap },
    },
  }));
  const status = configured.find((p) => p.property.id === "status")!;
  failTitle = options.failTitle;
  applyCommand = (body) => {
    const command = body.command;
    if (!command) return;
    if (command.title !== undefined)
      setNames((current) => ({ ...current, [command.rowId]: command.title }));
    if (command.valuesByPropertyId)
      setValues((current) => ({
        ...current,
        ...Object.fromEntries(
          Object.entries(command.valuesByPropertyId).map(([id, value]) => [
            `${rows.find((r) => r.id === command.rowId)?.pageId}:${id}`,
            value as DatabasePropertyValue,
          ]),
        ),
      }));
    if (command.placement) {
      const rest = visible.filter((r) => r.id !== command.rowId);
      const before = rest.findIndex((r) => r.id === command.placement.beforeRowId);
      const after = rest.findIndex((r) => r.id === command.placement.afterRowId);
      rest.splice(
        before >= 0 ? before : after >= 0 ? after + 1 : rest.length,
        0,
        rows.find((r) => r.id === command.rowId)!,
      );
      setPositions(Object.fromEntries(rest.map((r, i) => [r.id, i])));
    }
  };
  proof.schema = (id, type) =>
    setProperties((current) =>
      current.map((p) => (p.property.id === id ? { ...p, property: { ...p.property, type } } : p)),
    );
  proof.options = (patch) => setOptions((current) => ({ ...current, ...patch }));
  proof.values = () => values;
  proof.rows = () => rows;
  proof.remote = (patch) => setValues((current) => ({ ...current, ...patch }));
  const action = (...args: unknown[]) => {
    actions.push(args);
  };
  const value = {
    databaseId: "source",
    hostDatabaseId: "host",
    databaseWorkspaceId: "workspace",
    workspaceId: "workspace",
    databaseName: "Table proof",
    databaseConfig: { propertyOrder: columnOrder, nameColumn: { wrapContent: options.wrap } },
    editable: options.editable,
    canAddDatabaseProperties: !options.readOnlyProperties,
    realtimeEnabled: false,
    activeView: { id: options.scope, type: "table", config: {} },
    activeConditionalColors: [],
    activeDatabaseFilters: options.filtered ? [{ id: "filter" }] : [],
    activeDatabaseSorts: options.sorted
      ? [{ id: "sort", field: "name", direction: "descending" }]
      : [],
    properties: configured,
    visibleProperties: configured.filter((p) => options.columns.includes(p.property.id)),
    propertyValuesByKey: values,
    items: rows,
    sortedItems: visible,
    groupProperty: options.grouped ? status : null,
    personOptions: [
      { id: "ada", name: "Ada" },
      { id: "lin", name: "Lin" },
    ],
    layoutSettings: { showVerticalLines: true },
    showPageIconInTitle: true,
    titlePropertyLabel: "Name",
    headerMenusEnabled: true,
    subItemsSettings: {
      enabled: options.nested,
      display: "nested",
      parentPropertyId: "parent",
      subItemPropertyId: "children",
    },
    subItemChildRowIdsByParentId: options.nested ? { "row-0": ["row-1"] } : {},
    subItemDepthByRowId: options.nested ? { "row-1": 1 } : {},
    subItemParentRowIdsByRowId: options.nested ? { "row-1": ["row-0"] } : {},
    hasNextPage: false,
    isFetchingNextPage: false,
    fetchNextPage: async () => {},
    savePropertyValue: (
      id: string,
      propertyId: string,
      type: string,
      previous: DatabasePropertyValue,
      next: DatabasePropertyValue,
    ) => {
      writes.push({ rowId: id, propertyId, type, previous, next });
      if (options.failSave) return;
      const page = rows.find((r) => r.id === id)?.pageId;
      if (page) setValues((current) => ({ ...current, [`${page}:${propertyId}`]: next }));
    },
    onOpenPage: (id: string) => {
      opened.push(id);
    },
    addDatabaseRow: (group?: string, _property?: unknown, parent?: string) => {
      const created = row(10000 + extra.length);
      setExtra((current) => [...current, created]);
      actions.push({ create: true, group, parent });
      if (group) setValues((current) => ({ ...current, [`${created.pageId}:status`]: group }));
    },
    addDraggedPageRow: (
      payload: { pageId: string; title: string },
      position: number,
      group?: string,
    ) => {
      const created = {
        ...row(20000 + extra.length),
        pageId: payload.pageId,
        page: { id: payload.pageId, name: payload.title },
        position,
      };
      setExtra((current) => [...current, created]);
      actions.push({ external: payload, group });
      if (group) setValues((current) => ({ ...current, [`${payload.pageId}:status`]: group }));
    },
    saveDatabasePropertyOrder: (ids: string[]) => {
      setColumnOrder(ids);
      action("columns", ids);
    },
    updateNameColumnConfig: action,
    renameDatabaseProperty: (id: string, name: string) =>
      setProperties((current) =>
        current.map((p) => (p.id === id ? { ...p, property: { ...p.property, name } } : p)),
      ),
    getDatabasePageDragPayload,
    hasDatabasePageDragPayload,
    addDatabaseProperty: action,
    updateDatabasePropertyConfig: action,
    setViewGroupProperty: action,
    saveDatabaseSorts: async () => {
      setOptions((current) => ({ ...current, sorted: false }));
    },
  } as unknown as DatabaseViewProviderValue;
  return (
    <ZilobaseFeaturesProvider value={features}>
      <ShortcutProvider>
        <Toaster />
        <div data-page-scroll-viewport style={{ height: "100vh", overflow: "auto" }}>
          <main
            className="tiptap-editor"
            contentEditable={options.embedded ? true : undefined}
            suppressContentEditableWarning
            data-editor-surface={options.embedded ? "" : undefined}
            style={{ margin: "100px 80px", maxWidth: options.embedded ? 780 : 1100 }}
          >
            <div className="database-scroll-section relative" contentEditable={false}>
              <DatabaseViewProvider value={value}>
                <DatabaseTableView />
              </DatabaseViewProvider>
            </div>
          </main>
        </div>
      </ShortcutProvider>
    </ZilobaseFeaturesProvider>
  );
}
createRoot(document.getElementById("table-proof")!).render(<Proof />);
