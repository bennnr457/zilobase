import {
  clientDatabaseController,
  type ClientOperationContext,
} from "../../shared/operation-context";
import { clientMutation, runClientMutation } from "../../shared/operation-mutation";
function defineSetDatabasePublished(context: ClientOperationContext) {
  const controller = clientDatabaseController(context);
  return clientMutation({
    mutationFn: async ({ databaseId, isPublished }: { databaseId: string; isPublished: boolean }) =>
      (
        await controller.execute({
          databaseId,
          command: { type: "database.publish", published: isPublished },
        })
      ).result,
  });
}
export type SetDatabasePublishedInput = Parameters<
  NonNullable<ReturnType<typeof defineSetDatabasePublished>["mutationFn"]>
>[0];
export type SetDatabasePublishedResult = Awaited<
  ReturnType<NonNullable<ReturnType<typeof defineSetDatabasePublished>["mutationFn"]>>
>;
export function setDatabasePublished(
  context: ClientOperationContext,
  input: SetDatabasePublishedInput,
) {
  return runClientMutation(context, input, defineSetDatabasePublished);
}
function defineDeleteDatabaseAccess(context: ClientOperationContext) {
  const controller = clientDatabaseController(context);
  return clientMutation({
    mutationFn: async ({ databaseId, ruleId }: { databaseId: string; ruleId: string }) =>
      (await controller.execute({ databaseId, command: { type: "access.remove", ruleId } })).result,
  });
}
export type DeleteDatabaseAccessInput = Parameters<
  NonNullable<ReturnType<typeof defineDeleteDatabaseAccess>["mutationFn"]>
>[0];
export type DeleteDatabaseAccessResult = Awaited<
  ReturnType<NonNullable<ReturnType<typeof defineDeleteDatabaseAccess>["mutationFn"]>>
>;
export function deleteDatabaseAccess(
  context: ClientOperationContext,
  input: DeleteDatabaseAccessInput,
) {
  return runClientMutation(context, input, defineDeleteDatabaseAccess);
}
function defineUpsertDatabaseAccess(context: ClientOperationContext) {
  const controller = clientDatabaseController(context);
  return clientMutation({
    mutationFn: async ({ databaseId, ...body }: DatabaseAccessInput) =>
      (await controller.execute({ databaseId, command: { type: "access.upsert", ...body } }))
        .result,
  });
}
export type UpsertDatabaseAccessInput = Parameters<
  NonNullable<ReturnType<typeof defineUpsertDatabaseAccess>["mutationFn"]>
>[0];
export type UpsertDatabaseAccessResult = Awaited<
  ReturnType<NonNullable<ReturnType<typeof defineUpsertDatabaseAccess>["mutationFn"]>>
>;
export function upsertDatabaseAccess(
  context: ClientOperationContext,
  input: UpsertDatabaseAccessInput,
) {
  return runClientMutation(context, input, defineUpsertDatabaseAccess);
}
export type DatabaseAccessInput = {
  accessLevel: "view" | "edit" | "full";
  databaseId: string;
  targetId: string;
  targetType: "public" | "user" | "team";
};
