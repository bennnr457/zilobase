import { type ClientOperationContext } from "../shared/operation-context";
import { clientMutation, runClientMutation } from "../shared/operation-mutation";
import type { InstanceSettingsResponse, RegistrationMode } from "./contracts";
import { instanceSettingsQueryOptions } from "./queries";

function defineUpdateInstanceSettingsMutation(context: ClientOperationContext) {
  const { apiFetch, queryClient } = context;
  return clientMutation({
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
export type UpdateInstanceSettingsOperationInput = Parameters<
  NonNullable<ReturnType<typeof defineUpdateInstanceSettingsMutation>["mutationFn"]>
>[0];
export type UpdateInstanceSettingsOperationResult = Awaited<
  ReturnType<NonNullable<ReturnType<typeof defineUpdateInstanceSettingsMutation>["mutationFn"]>>
>;
export function updateInstanceSettings(
  context: ClientOperationContext,
  input: UpdateInstanceSettingsOperationInput,
): Promise<UpdateInstanceSettingsOperationResult> {
  return runClientMutation(context, input, (context) =>
    defineUpdateInstanceSettingsMutation(context),
  );
}
