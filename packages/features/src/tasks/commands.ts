import { createSampleRowContent } from "../databases/templates/sample-content";
import type { useApplyDatabaseTemplate } from "../databases/mutations/properties";
import type { useCreateDatabase } from "../databases/mutations/databases";
import { getDatabaseSetupTemplate } from "../databases/templates/definitions";
import { defaultStatusOptions } from "../databases/schema/property-defaults";
import { getMergedDatabaseConfig } from "../databases/views/configuration";
import { serializePropertyValue } from "../databases/schema/property-values";
import type { DatabaseSetupSelection } from "../databases/records/source-commands";
import type { DatabaseExportPayload } from "../databases/core/export-payload";
import { type TaskRow, getTaskDatabaseSchema, getTaskStatusForCompletion } from "./model";
import type { DatabasePropertyValue } from "../databases/schema/property-values";
import { STATUS_PROPERTY_ID, ASSIGNEE_PROPERTY_ID, DUE_DATE_PROPERTY_ID } from "./view-data";
export async function createTaskDatabase({
  applyTemplate,
  createDatabase,
  saveTaskDatabaseIds,
  selection,
  selectedDatabaseIds,
  workspaceId,
}: {
  applyTemplate: ReturnType<typeof useApplyDatabaseTemplate>;
  createDatabase: ReturnType<typeof useCreateDatabase>;
  saveTaskDatabaseIds: (databaseIds: string[]) => Promise<void>;
  selection: DatabaseSetupSelection;
  selectedDatabaseIds: string[];
  workspaceId: string | null | undefined;
}) {
  if (!workspaceId) throw new Error("Choose a workspace first.");

  if (selection.sourceView) {
    if (selectedDatabaseIds.includes(selection.sourceView.parentDatabaseId)) {
      return "already-connected" as const;
    }

    await saveTaskDatabaseIds(
      [...selectedDatabaseIds, selection.sourceView.parentDatabaseId].slice(0, 10),
    );
    return "linked" as const;
  }

  const template = selection.templateId ? getDatabaseSetupTemplate(selection.templateId) : null;
  const name = selection.databaseName || template?.name || "New data source";
  const payload = await createDatabase.mutateAsync({
    name,
    standalone: true,
    workspaceId,
  });
  const requiredProperties = [
    {
      config: {
        defaultOptionId: defaultStatusOptions[0]?.id,
        options: defaultStatusOptions,
      },
      name: "Status",
      type: "status",
    },
    {
      config: { personLimit: "one_person" },
      name: "Assignee",
      type: "person",
    },
    { name: "Due date", type: "date" },
  ];
  const templateProperties = template?.properties ?? [];
  const templatePropertyTypes = new Set(templateProperties.map((property) => property.type));
  const properties = [
    ...templateProperties,
    ...requiredProperties.filter((property) => !templatePropertyTypes.has(property.type)),
  ];
  const propertyTypesByName = new Map(
    properties.map((property) => [property.name.toLowerCase(), property.type]),
  );

  if (!payload.activeDataSource) throw new Error("Created task database has no active source");
  await applyTemplate.mutateAsync({
    config: getMergedDatabaseConfig(payload.database.config, {
      emoji: template?.emoji ?? "✅",
      setupDismissed: true,
    }),
    databaseId: payload.activeDataSource.id,
    hostDatabaseId: payload.database.id,
    name,
    properties,
    rows: (template?.sampleRows ?? []).map((sampleRow) => ({
      content: createSampleRowContent(sampleRow.content),
      metadata: { emoji: sampleRow.emoji },
      title: sampleRow.title,
      values: Object.entries(sampleRow.values ?? {}).flatMap(([propertyName, value]) => {
        const propertyType = propertyTypesByName.get(propertyName.toLowerCase());

        return propertyType
          ? [
              {
                propertyName,
                value: serializePropertyValue(propertyType, value),
              },
            ]
          : [];
      }),
    })),
  });
  await saveTaskDatabaseIds([...selectedDatabaseIds, payload.database.id].slice(0, 10));
  return "created" as const;
}

export function getTaskPropertyUpdate(
  task: TaskRow | undefined,
  payload: DatabaseExportPayload | null | undefined,
  propertyId: string,
  nextValue: DatabasePropertyValue,
) {
  if (!task || !payload) return null;
  const schema = getTaskDatabaseSchema(payload);
  const property =
    propertyId === STATUS_PROPERTY_ID
      ? schema.status
      : propertyId === ASSIGNEE_PROPERTY_ID
        ? schema.assignee
        : propertyId === DUE_DATE_PROPERTY_ID
          ? schema.dueDate
          : null;
  if (!property) return null;
  return {
    databaseId: payload.activeDataSource?.id ?? task.databaseId,
    hostDatabaseId: payload.database.id,
    propertyId: property.property.id,
    rowId: task.rowId,
    value: nextValue || null,
  };
}

export function getTaskCreationInput(
  payload: DatabaseExportPayload | undefined,
  currentUserId: string | null,
) {
  if (!payload) return null;
  const schema = getTaskDatabaseSchema(payload);
  if (!schema.status || !schema.assignee) return null;
  const initialStatus = getTaskStatusForCompletion(payload, false);
  return {
    databaseId: payload.activeDataSource?.id ?? payload.database.id,
    hostDatabaseId: payload.database.id,
    initialValues: [
      ...(currentUserId
        ? [{ propertyId: schema.assignee.property.id, value: [currentUserId] }]
        : []),
      ...(initialStatus ? [{ propertyId: schema.status.property.id, value: initialStatus }] : []),
    ],
  };
}

export function getTaskCompletionUpdate(
  task: TaskRow | undefined,
  payload: DatabaseExportPayload | null | undefined,
  complete: boolean,
) {
  const property = payload ? getTaskDatabaseSchema(payload).status : null;
  const status = payload ? getTaskStatusForCompletion(payload, complete) : null;
  if (!task || !property || !status) return null;
  return {
    databaseId: payload?.activeDataSource?.id ?? task.databaseId,
    hostDatabaseId: payload?.database.id,
    propertyId: property.property.id,
    rowId: task.rowId,
    value: status,
  };
}
