import { useMutation } from "@tanstack/react-query";
import { useZilobaseFeatures } from "../shared/context";
import { createPage, deletePage, restorePage, updatePage } from "./content-operations";
export function useCreatePage() {
  const context = useZilobaseFeatures();
  return useMutation({
    mutationFn: (input: Parameters<typeof createPage>[1]) => createPage(context, input),
  });
}
export function useUpdatePage() {
  const context = useZilobaseFeatures();
  return useMutation({
    mutationFn: (input: Parameters<typeof updatePage>[1]) => updatePage(context, input),
  });
}
export function useDeletePage() {
  const context = useZilobaseFeatures();
  return useMutation({
    mutationFn: (input: Parameters<typeof deletePage>[1]) => deletePage(context, input),
  });
}
export function useRestorePage() {
  const context = useZilobaseFeatures();
  return useMutation({
    mutationFn: (input: Parameters<typeof restorePage>[1]) => restorePage(context, input),
  });
}
