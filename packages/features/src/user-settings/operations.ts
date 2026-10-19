import { captureClientOperation, type ClientOperationContext } from "../shared/operation-context";
import { beginClientWrite, clientMutation, runClientMutation } from "../shared/operation-mutation";

import type { UserSettings } from "./contracts";
import { defaultUserSettings, userSettingsQueryKey } from "./queries";

type UpdateUserSettingsInput = Partial<UserSettings>;

function defineUpdateUserSettingsMutation(context: ClientOperationContext) {
  const { apiFetch, queryClient } = context;
  const operationScope = captureClientOperation(context);
  const write = beginClientWrite(context, userSettingsQueryKey);

  return clientMutation({
    mutationFn: async (patch: UpdateUserSettingsInput) => {
      const result = await apiFetch<{ settings: UserSettings }>("/user-settings", {
        method: "PATCH",
        body: JSON.stringify(patch),
      });

      return result.settings;
    },
    onMutate: async (patch) => {
      await queryClient.cancelQueries({ queryKey: userSettingsQueryKey });
      operationScope.assertCurrent();

      const previous = queryClient.getQueryData<UserSettings>(userSettingsQueryKey);

      queryClient.setQueryData<UserSettings>(userSettingsQueryKey, (current) => ({
        ...defaultUserSettings,
        ...current,
        ...patch,
      }));

      return { previous };
    },
    onError: (_error, _patch, context) => {
      if (!write.isCurrent()) return;
      queryClient.setQueryData(userSettingsQueryKey, context?.previous ?? defaultUserSettings);
    },
    onSettled: () =>
      write.isCurrent()
        ? queryClient.invalidateQueries({ queryKey: userSettingsQueryKey })
        : undefined,
    onSuccess: (settings) => {
      if (!write.isCurrent()) return;
      queryClient.setQueryData(userSettingsQueryKey, settings);
    },
  });
}
export type UpdateUserSettingsOperationInput = Parameters<
  NonNullable<ReturnType<typeof defineUpdateUserSettingsMutation>["mutationFn"]>
>[0];
export type UpdateUserSettingsOperationResult = Awaited<
  ReturnType<NonNullable<ReturnType<typeof defineUpdateUserSettingsMutation>["mutationFn"]>>
>;
export function updateUserSettings(
  context: ClientOperationContext,
  input: UpdateUserSettingsOperationInput,
): Promise<UpdateUserSettingsOperationResult> {
  return runClientMutation(context, input, (context) => defineUpdateUserSettingsMutation(context));
}
