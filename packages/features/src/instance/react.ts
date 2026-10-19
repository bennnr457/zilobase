import { useMutation, useQuery } from "@tanstack/react-query";
import { useZilobaseFeatures } from "../shared/context";
import type { RegistrationMode } from "./contracts";
import { updateInstanceSettings } from "./operations";
import { instanceSettingsQueryOptions } from "./queries";
export function useInstanceSettings() {
  const { apiFetch } = useZilobaseFeatures();
  return useQuery(instanceSettingsQueryOptions(apiFetch));
}
export function useUpdateInstanceSettings() {
  const context = useZilobaseFeatures();
  return useMutation({
    mutationFn: (variables: RegistrationMode) => updateInstanceSettings(context, variables),
  });
}
