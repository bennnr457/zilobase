import type { DatabaseExportPayload } from "../databases/index";
import { type TaskRow, getTaskDatabaseSchema, getTaskStatusForCompletion } from "./model";
import type { DatabasePropertyValue } from "../databases/schema/property-values";
import { STATUS_PROPERTY_ID, ASSIGNEE_PROPERTY_ID, DUE_DATE_PROPERTY_ID } from "./view-data";

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
