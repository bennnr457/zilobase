import { useMutation, useQuery } from "@tanstack/react-query";
import { useZilobaseFeatures } from "../shared/context";
import { updateInstanceSettings, type UpdateInstanceSettingsOperationInput } from "./operations";
import { instanceSettingsQueryOptions } from "./queries";
export function useInstanceSettings() {
  const { apiFetch } = useZilobaseFeatures();
  return useQuery(instanceSettingsQueryOptions(apiFetch));
}
export function useUpdateInstanceSettings() {
  const context = useZilobaseFeatures();
  return useMutation({
    mutationFn: (variables: UpdateInstanceSettingsOperationInput) =>
      updateInstanceSettings(context, variables),
  });
}
