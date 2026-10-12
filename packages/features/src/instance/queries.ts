import { queryOptions } from "@tanstack/react-query";
import type { ApiFetcher } from "../shared/api-fetcher";
import type { InstanceSettingsResponse } from "./contracts";
export const instanceSettingsQueryOptions = (apiFetch: ApiFetcher) =>
  queryOptions({
    queryFn: ({ signal }) =>
      apiFetch<InstanceSettingsResponse>("/api/instance/settings", { signal }),
    queryKey: ["instance", "settings"] as const,
  });
