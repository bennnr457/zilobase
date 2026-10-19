import { useMutation } from "@tanstack/react-query";
import { useZilobaseFeatures } from "../../shared/context";
import { addDatabaseView, deleteDatabaseView, updateDatabaseView } from "./views-operations";
export function useUpdateDatabaseView() {
  const context = useZilobaseFeatures();
  return useMutation({
    mutationFn: (input: Parameters<typeof updateDatabaseView>[1]) =>
      updateDatabaseView(context, input),
  });
}
export function useAddDatabaseView() {
  const context = useZilobaseFeatures();
  return useMutation({
    mutationFn: (input: Parameters<typeof addDatabaseView>[1]) => addDatabaseView(context, input),
  });
}
export function useDeleteDatabaseView() {
  const context = useZilobaseFeatures();
  return useMutation({
    mutationFn: (input: Parameters<typeof deleteDatabaseView>[1]) =>
      deleteDatabaseView(context, input),
  });
}
