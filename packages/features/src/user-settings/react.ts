import { useMutation, useQuery } from "@tanstack/react-query";
import { updateUserSettings } from "./operations";

import { useZilobaseFeatures } from "../shared/context";
import type { UserSettings } from "./contracts";
import { userSettingsQueryOptions } from "./queries";

type UpdateUserSettingsInput = Partial<UserSettings>;

export function useUserSettings() {
  const { apiFetch } = useZilobaseFeatures();

  return useQuery(userSettingsQueryOptions(apiFetch));
}

export function useUpdateUserSettings() {
  const context = useZilobaseFeatures();
  return useMutation({
    mutationFn: (variables: UpdateUserSettingsInput) => updateUserSettings(context, variables),
  });
}
