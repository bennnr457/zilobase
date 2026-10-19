import {
  captureClientOperation,
  type ClientOperationContext,
} from "../../shared/operation-context";
import {
  createDatabaseDataSource,
  linkDatabaseDataSource,
  replaceDatabaseViewDataSource,
} from "../mutations/data-sources-operations";
import { applyDatabaseTemplate } from "../mutations/properties-operations";
import { getDatabaseSetupTemplate } from "../templates/definitions";
import { databaseCsvPayload, databaseTemplateRows } from "../templates/payload";
import { getMergedDatabaseConfig } from "../views/configuration";
import type { DatabaseSetupSelection } from "./source-commands";

export type DatabaseSourceSetupInput = {
  databaseId: string;
  selection: DatabaseSetupSelection;
  createSampleRowContent: (markdown: string) => unknown;
};
export type DatabaseSourceSetupResult = Awaited<ReturnType<typeof createDatabaseDataSource>>;
export class DatabaseSourceSetupError extends Error {
  constructor(
    cause: unknown,
    readonly created: DatabaseSourceSetupResult,
  ) {
    super(cause instanceof Error ? cause.message : "Could not finish setting up the data source.", {
      cause,
    });
    this.name = "DatabaseSourceSetupError";
  }
}

/** Each step is independently committed. Preserve the created source on later failure. */
export async function setupDatabaseSource(
  context: ClientOperationContext,
  input: DatabaseSourceSetupInput,
): Promise<DatabaseSourceSetupResult> {
  const scope = captureClientOperation(context);
  const { selection, databaseId } = input;
  if (selection.sourceView)
    return linkDatabaseDataSource(context, {
      databaseId,
      config: selection.sourceView.viewConfig,
      dataSourceId: selection.sourceView.dataSourceId,
      name: selection.sourceView.viewName,
      type: selection.sourceView.viewType,
    });
  const template = selection.templateId ? getDatabaseSetupTemplate(selection.templateId) : null;
  const name =
    selection.databaseName || selection.csvImport?.name || template?.name || "New data source";
  const created = await createDatabaseDataSource(context, { databaseId, name });
  try {
    scope.assertCurrent();
    if (selection.csvImport)
      await applyDatabaseTemplate(context, {
        config: getMergedDatabaseConfig(created.dataSource.config, { setupDismissed: true }),
        databaseId: created.dataSource.id,
        hostDatabaseId: databaseId,
        name,
        ...databaseCsvPayload(selection.csvImport),
      });
    else if (template)
      await applyDatabaseTemplate(context, {
        config: getMergedDatabaseConfig(created.dataSource.config, {
          emoji: template.emoji,
          setupDismissed: true,
        }),
        databaseId: created.dataSource.id,
        hostDatabaseId: databaseId,
        name,
        properties: template.properties,
        rows: databaseTemplateRows(
          template,
          new Map(template.properties.map((p) => [p.name.toLowerCase(), p.type])),
          input.createSampleRowContent,
          (emoji) => ({ emoji }),
        ),
      });
    return created;
  } catch (cause) {
    throw new DatabaseSourceSetupError(cause, created);
  }
}

export async function replaceDatabaseSource(
  context: ClientOperationContext,
  input: { databaseId: string; databaseViewId: string; dataSourceId: string },
) {
  return replaceDatabaseViewDataSource(context, input);
}
