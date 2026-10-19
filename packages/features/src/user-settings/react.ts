import { useMutation, useQuery } from "@tanstack/react-query";
import { updateUserSettings, type UpdateUserSettingsOperationInput } from "./operations";

import { useZilobaseFeatures } from "../shared/context";
import { userSettingsQueryOptions } from "./queries";

export function useUserSettings() {
  const { apiFetch } = useZilobaseFeatures();

  return useQuery(userSettingsQueryOptions(apiFetch));
}

export function useUpdateUserSettings() {
  const context = useZilobaseFeatures();
  return useMutation({
    mutationFn: (variables: UpdateUserSettingsOperationInput) =>
      updateUserSettings(context, variables),
  });
}
