import { useMutation, useQuery } from "@tanstack/react-query";
import {
  claimMeetingRecorder,
  createMeeting,
  deleteMeeting,
  meetingLifecycle,
  recordMeetingConsent,
  releaseMeetingRecorder,
  updateMeeting,
} from "./operations";

import { useZilobaseFeatures } from "../shared/context";
import type {
  CreateMeetingInput,
  MeetingLifecycleAction,
  MeetingPatch,
  MeetingResponse,
} from "./contracts";
import { meetingKeys, meetingQueryOptions, workspaceMeetingsQueryOptions } from "./queries";

export function useMeeting(meetingId: string | null | undefined) {
  const { apiFetch } = useZilobaseFeatures();
  return useQuery(meetingQueryOptions(apiFetch, meetingId));
}

export function useWorkspaceMeetings(workspaceId: string | null | undefined) {
  const { apiFetch } = useZilobaseFeatures();
  return useQuery(workspaceMeetingsQueryOptions(apiFetch, workspaceId));
}

export function useCreateMeeting() {
  const context = useZilobaseFeatures();
  return useMutation({
    mutationFn: (variables: CreateMeetingInput) => createMeeting(context, variables),
  });
}

export function useDeleteMeeting() {
  const context = useZilobaseFeatures();
  return useMutation({ mutationFn: (variables: string) => deleteMeeting(context, variables) });
}

export function useUpdateMeeting(meetingId: string) {
  const context = useZilobaseFeatures();
  return useMutation({
    mutationFn: (variables: MeetingPatch) => updateMeeting(context, { meetingId, ...variables }),
  });
}

export function useMeetingLifecycle(meetingId: string) {
  const context = useZilobaseFeatures();
  return useMutation({
    mutationFn: (variables: {
      action: MeetingLifecycleAction;
      durationMs?: number;
      leaseId?: string;
    }) => meetingLifecycle(context, { meetingId, ...variables }),
  });
}

export function useMeetingRecorder(meetingId: string) {
  const context = useZilobaseFeatures();
  const claim = useMutation({ mutationFn: () => claimMeetingRecorder(context, { meetingId }) });
  const release = useMutation({
    mutationFn: (leaseId: string) => releaseMeetingRecorder(context, { meetingId, leaseId }),
  });
  return { claim, release };
}

export function useGenerateMeetingSummary(meetingId: string) {
  const { apiFetch, queryClient } = useZilobaseFeatures();
  return useMutation({
    mutationFn: async () => {
      const accepted = await apiFetch<{
        job: { error: string | null; id: string; progress: number; status: string };
      }>(`/meetings/${meetingId}/summary`, {
        body: "{}",
        method: "POST",
      });
      await waitForAiJob(apiFetch, accepted.job.id);
      return apiFetch<MeetingResponse>(`/meetings/${meetingId}`);
    },
    onSuccess: (payload) => {
      queryClient.setQueryData<MeetingResponse>(meetingKeys.detail(meetingId), {
        meeting: payload.meeting,
      });
      return queryClient.invalidateQueries({ queryKey: meetingKeys.lists() });
    },
    onSettled: async () => {
      await queryClient.invalidateQueries({ queryKey: meetingKeys.detail(meetingId) });
    },
  });
}

async function waitForAiJob(
  apiFetch: ReturnType<typeof useZilobaseFeatures>["apiFetch"],
  jobId: string,
) {
  const deadline = Date.now() + 10 * 60 * 1_000;
  while (Date.now() < deadline) {
    const { job } = await apiFetch<{
      job: { error: string | null; status: string };
    }>(`/ai/jobs/${encodeURIComponent(jobId)}`);
    if (job.status === "succeeded") return;
    if (job.status === "failed" || job.status === "cancelled") {
      throw new Error(job.error || "Meeting summary failed.");
    }
    await new Promise((resolve) => setTimeout(resolve, 1_000));
  }
  throw new Error("Meeting summary is still processing. Try again shortly.");
}

export function useRecordMeetingConsent(meetingId: string) {
  const context = useZilobaseFeatures();
  return useMutation({
    mutationFn: (variables: "confirmed" | "played") =>
      recordMeetingConsent(context, { meetingId, mode: variables }),
  });
}
