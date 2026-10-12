import { useMutation, useQuery } from "@tanstack/react-query";
import { useZilobaseFeatures } from "../shared/context";
import { instanceSettingsQueryOptions } from "./queries";
import type { InstanceSettingsResponse, RegistrationMode } from "./contracts";
export function useInstanceSettings() {
  const { apiFetch } = useZilobaseFeatures();
  return useQuery(instanceSettingsQueryOptions(apiFetch));
}
export function useUpdateInstanceSettings() {
  const { apiFetch, queryClient } = useZilobaseFeatures();
  return useMutation({
    mutationFn: (registrationMode: RegistrationMode) =>
      apiFetch<InstanceSettingsResponse>("/api/instance/settings", {
        body: JSON.stringify({ registrationMode }),
        headers: { "content-type": "application/json" },
        method: "PATCH",
      }),
    onSuccess: (response) => {
      queryClient.setQueryData(instanceSettingsQueryOptions(apiFetch).queryKey, response);
    },
  });
}
