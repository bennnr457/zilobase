import { useMutation } from "@tanstack/react-query";
import { useZilobaseFeatures } from "../../shared/context";
import {
  addDatabaseProperty,
  applyDatabaseTemplate,
  deleteDatabaseProperty,
  duplicateDatabaseProperty,
  updateDatabaseProperty,
} from "./properties-operations";
export type { ApplyDatabaseTemplateInput } from "./properties-operations";
export function useAddDatabaseProperty() {
  const context = useZilobaseFeatures();
  return useMutation({
    mutationFn: (input: Parameters<typeof addDatabaseProperty>[1]) =>
      addDatabaseProperty(context, input),
  });
}
export function useApplyDatabaseTemplate() {
  const context = useZilobaseFeatures();
  return useMutation({
    mutationFn: (input: Parameters<typeof applyDatabaseTemplate>[1]) =>
      applyDatabaseTemplate(context, input),
  });
}
export function useUpdateDatabaseProperty() {
  const context = useZilobaseFeatures();
  return useMutation({
    mutationFn: (input: Parameters<typeof updateDatabaseProperty>[1]) =>
      updateDatabaseProperty(context, input),
  });
}
export function useDeleteDatabaseProperty() {
  const context = useZilobaseFeatures();
  return useMutation({
    mutationFn: (input: Parameters<typeof deleteDatabaseProperty>[1]) =>
      deleteDatabaseProperty(context, input),
  });
}
export function useDuplicateDatabaseProperty() {
  const context = useZilobaseFeatures();
  return useMutation({
    mutationFn: (input: Parameters<typeof duplicateDatabaseProperty>[1]) =>
      duplicateDatabaseProperty(context, input),
  });
}
