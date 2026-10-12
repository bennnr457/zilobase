import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useZilobaseFeatures } from "../shared/context";
import { integrationAvailabilityQueryOptions } from "./queries";
export function useIntegrationAvailability(workspaceId: string | null) {
  const { apiFetch } = useZilobaseFeatures();
  const enabled = Boolean(workspaceId);
  const calendar = useQuery(integrationAvailabilityQueryOptions(apiFetch, workspaceId));

  const calendarConfigured = calendar.data?.providerConfigured === true;
  const settled = !enabled || calendar.isFetched;
  return useMemo(() => ({ calendar: calendarConfigured, settled }), [calendarConfigured, settled]);
}
