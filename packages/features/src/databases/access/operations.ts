import {
  clientDatabaseController,
  type ClientOperationContext,
} from "../../shared/operation-context";
import { clientMutation, runClientMutation } from "../../shared/operation-mutation";

export type SetDatabasePublishedInput = { databaseId: string; isPublished: boolean };
export type SetDatabasePublishedResult = unknown;
export function setDatabasePublished(
  context: ClientOperationContext,
  input: SetDatabasePublishedInput,
) {
  return runClientMutation(context, input, (context: ClientOperationContext) => {
    const controller = clientDatabaseController(context);
    return clientMutation({
      mutationFn: async ({ databaseId, isPublished }: SetDatabasePublishedInput) =>
        (
          await controller.execute({
            databaseId,
            command: { type: "database.publish", published: isPublished },
          })
        ).result,
    });
  });
}

export type DeleteDatabaseAccessInput = { databaseId: string; ruleId: string };
export type DeleteDatabaseAccessResult = unknown;
export function deleteDatabaseAccess(
  context: ClientOperationContext,
  input: DeleteDatabaseAccessInput,
) {
  return runClientMutation(context, input, (context: ClientOperationContext) => {
    const controller = clientDatabaseController(context);
    return clientMutation({
      mutationFn: async ({ databaseId, ruleId }: DeleteDatabaseAccessInput) =>
        (await controller.execute({ databaseId, command: { type: "access.remove", ruleId } }))
          .result,
    });
  });
}

export type UpsertDatabaseAccessInput = DatabaseAccessInput;
export type UpsertDatabaseAccessResult = unknown;
export function upsertDatabaseAccess(
  context: ClientOperationContext,
  input: UpsertDatabaseAccessInput,
) {
  return runClientMutation(context, input, (context: ClientOperationContext) => {
    const controller = clientDatabaseController(context);
    return clientMutation({
      mutationFn: async ({ databaseId, ...body }: UpsertDatabaseAccessInput) =>
        (await controller.execute({ databaseId, command: { type: "access.upsert", ...body } }))
          .result,
    });
  });
}
export type DatabaseAccessInput = {
  accessLevel: "view" | "edit" | "full";
  databaseId: string;
  targetId: string;
  targetType: "public" | "user" | "team";
};
