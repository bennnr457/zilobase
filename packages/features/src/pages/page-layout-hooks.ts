import { useMutation, useQuery } from "@tanstack/react-query";
import { useZilobaseFeatures } from "../shared/context";
import {
  resetPageLayout,
  resolvedPageLayoutQueryOptions,
  savePageLayout,
} from "./page-layout-operations";
import type { PageLayoutTarget } from "./page-layouts";
export function useResolvedPageLayout(target: PageLayoutTarget) {
  const { apiFetch } = useZilobaseFeatures();

  return useQuery(resolvedPageLayoutQueryOptions(apiFetch, target));
}
export function useSavePageLayout() {
  const context = useZilobaseFeatures();
  return useMutation({
    mutationFn: (input: Parameters<typeof savePageLayout>[1]) => savePageLayout(context, input),
  });
}
export function useResetPageLayout() {
  const context = useZilobaseFeatures();
  return useMutation({
    mutationFn: (input: Parameters<typeof resetPageLayout>[1]) => resetPageLayout(context, input),
  });
}
export { pageLayoutKeys } from "./page-layout-operations";
