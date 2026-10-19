import { useMutation } from "@tanstack/react-query";
import { useZilobaseFeatures } from "../../shared/context";
import {
  archiveDatabaseTemplate,
  createDatabaseTemplate,
  restoreDatabaseTemplate,
  updateDatabaseTemplate,
} from "./templates-operations";
export type { DatabaseStoredTemplate } from "./templates-operations";
export function useCreateDatabaseTemplate() {
  const context = useZilobaseFeatures();
  return useMutation({
    mutationFn: (input: Parameters<typeof createDatabaseTemplate>[1]) =>
      createDatabaseTemplate(context, input),
  });
}
export function useUpdateDatabaseTemplate() {
  const context = useZilobaseFeatures();
  return useMutation({
    mutationFn: (input: Parameters<typeof updateDatabaseTemplate>[1]) =>
      updateDatabaseTemplate(context, input),
  });
}
export function useArchiveDatabaseTemplate() {
  const context = useZilobaseFeatures();
  return useMutation({
    mutationFn: (input: Parameters<typeof archiveDatabaseTemplate>[1]) =>
      archiveDatabaseTemplate(context, input),
  });
}
export function useRestoreDatabaseTemplate() {
  const context = useZilobaseFeatures();
  return useMutation({
    mutationFn: (input: Parameters<typeof restoreDatabaseTemplate>[1]) =>
      restoreDatabaseTemplate(context, input),
  });
}
