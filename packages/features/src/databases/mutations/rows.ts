import { useMutation } from "@tanstack/react-query";
import { useZilobaseFeatures } from "../../shared/context";
import {
  addDatabaseRow,
  archiveDatabaseRow,
  restoreDatabaseRow,
  updateDatabasePropertyValue,
} from "./rows-operations";
export function useAddDatabaseRow() {
  const context = useZilobaseFeatures();
  return useMutation({
    networkMode: "always",
    mutationFn: (input: Parameters<typeof addDatabaseRow>[1]) => addDatabaseRow(context, input),
  });
}
export function useUpdateDatabasePropertyValue() {
  const context = useZilobaseFeatures();
  return useMutation({
    networkMode: "always",
    mutationFn: (input: Parameters<typeof updateDatabasePropertyValue>[1]) =>
      updateDatabasePropertyValue(context, input),
  });
}
export function useArchiveDatabaseRow() {
  const context = useZilobaseFeatures();
  return useMutation({
    networkMode: "always",
    mutationFn: (input: Parameters<typeof archiveDatabaseRow>[1]) =>
      archiveDatabaseRow(context, input),
  });
}
export function useRestoreDatabaseRow() {
  const context = useZilobaseFeatures();
  return useMutation({
    networkMode: "always",
    mutationFn: (input: Parameters<typeof restoreDatabaseRow>[1]) =>
      restoreDatabaseRow(context, input),
  });
}
