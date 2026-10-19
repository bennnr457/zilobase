import { useMutation } from "@tanstack/react-query";
import { useZilobaseFeatures } from "../../shared/context";
import {
  createDatabaseDataSource,
  linkDatabaseDataSource,
  replaceDatabaseViewDataSource,
  unlinkDatabaseDataSource,
  updateDataSource,
} from "./data-sources-operations";
export function useUpdateDataSource() {
  const context = useZilobaseFeatures();
  return useMutation({
    mutationFn: (input: Parameters<typeof updateDataSource>[1]) => updateDataSource(context, input),
  });
}
export function useLinkDatabaseDataSource() {
  const context = useZilobaseFeatures();
  return useMutation({
    mutationFn: (input: Parameters<typeof linkDatabaseDataSource>[1]) =>
      linkDatabaseDataSource(context, input),
  });
}
export function useCreateDatabaseDataSource() {
  const context = useZilobaseFeatures();
  return useMutation({
    mutationFn: (input: Parameters<typeof createDatabaseDataSource>[1]) =>
      createDatabaseDataSource(context, input),
  });
}
export function useReplaceDatabaseViewDataSource() {
  const context = useZilobaseFeatures();
  return useMutation({
    mutationFn: (input: Parameters<typeof replaceDatabaseViewDataSource>[1]) =>
      replaceDatabaseViewDataSource(context, input),
  });
}
export function useUnlinkDatabaseDataSource() {
  const context = useZilobaseFeatures();
  return useMutation({
    mutationFn: (input: Parameters<typeof unlinkDatabaseDataSource>[1]) =>
      unlinkDatabaseDataSource(context, input),
  });
}
