import { useMutation } from "@tanstack/react-query";
import { useZilobaseFeatures } from "../../shared/context";
import {
  createDatabase,
  deleteDatabase,
  restoreDatabase,
  setDatabaseFavorite,
  updateDatabase,
} from "./databases-operations";
export type { UpdateDatabaseInput } from "./databases-operations";
export function useCreateDatabase() {
  const context = useZilobaseFeatures();
  return useMutation({
    mutationFn: (input: Parameters<typeof createDatabase>[1]) => createDatabase(context, input),
  });
}
export function useUpdateDatabase() {
  const context = useZilobaseFeatures();
  return useMutation({
    mutationFn: (input: Parameters<typeof updateDatabase>[1]) => updateDatabase(context, input),
  });
}
export function useDeleteDatabase() {
  const context = useZilobaseFeatures();
  return useMutation({
    mutationFn: (input: Parameters<typeof deleteDatabase>[1]) => deleteDatabase(context, input),
  });
}
export function useRestoreDatabase() {
  const context = useZilobaseFeatures();
  return useMutation({
    mutationFn: (input: Parameters<typeof restoreDatabase>[1]) => restoreDatabase(context, input),
  });
}
export function useSetDatabaseFavorite() {
  const context = useZilobaseFeatures();
  return useMutation({
    mutationFn: (input: Parameters<typeof setDatabaseFavorite>[1]) =>
      setDatabaseFavorite(context, input),
  });
}
