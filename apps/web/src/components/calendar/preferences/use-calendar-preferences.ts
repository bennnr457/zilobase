import { useCalendarPreferences as usePreferences } from "@zilobase/features/calendar/react";
import { getApiErrorMessage } from "@zilobase/features";
import { toast } from "sonner";
export function useCalendarPreferences(workspaceId: string) {
  return usePreferences(workspaceId, (error) => toast.error(getApiErrorMessage(error)));
}
