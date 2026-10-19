import { type ClientOperationContext } from "../shared/operation-context";
import { runClientMutation } from "../shared/operation-mutation";
import type { InstanceSettingsResponse, RegistrationMode } from "./contracts";
import { instanceSettingsQueryOptions } from "./queries";

export type UpdateInstanceSettingsOperationInput = RegistrationMode;
export type UpdateInstanceSettingsOperationResult = InstanceSettingsResponse;
export function updateInstanceSettings(
  context: ClientOperationContext,
  input: UpdateInstanceSettingsOperationInput,
): Promise<UpdateInstanceSettingsOperationResult> {
  return runClientMutation(context, input, ({ apiFetch, queryClient }) => ({
    mutationFn: (registrationMode: RegistrationMode) =>
      apiFetch<InstanceSettingsResponse>("/api/instance/settings", {
        body: JSON.stringify({ registrationMode }),
        headers: { "content-type": "application/json" },
        method: "PATCH",
      }),
    onSuccess: (response) => {
      queryClient.setQueryData(instanceSettingsQueryOptions(apiFetch).queryKey, response);
    },
  }));
}
