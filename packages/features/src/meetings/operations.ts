import { captureClientOperation, type ClientOperationContext } from "../shared/operation-context";
import { beginClientWrite, clientMutation, runClientMutation } from "../shared/operation-mutation";
import type { MeetingRecorderClaim } from "./contracts";

import { pageQueryKey, pagesNavRootQueryKey } from "../pages/queries";
import type {
  CreateMeetingInput,
  MeetingLifecycleAction,
  MeetingPatch,
  MeetingResponse,
} from "./contracts";
import { meetingKeys } from "./queries";

export type CreateMeetingOperationInput = CreateMeetingInput;
export type CreateMeetingOperationResult = ReleaseMeetingRecorderResult;
export function createMeeting(
  context: ClientOperationContext,
  input: CreateMeetingOperationInput,
): Promise<CreateMeetingOperationResult> {
  return runClientMutation(context, input, (context) => {
    const { apiFetch, queryClient } = context;
    return clientMutation({
      mutationFn: (input: CreateMeetingOperationInput) =>
        apiFetch<MeetingResponse>("/meetings", {
          body: JSON.stringify(input),
          method: "POST",
        }),
      onSuccess: (payload) => {
        queryClient.setQueryData(meetingKeys.detail(payload.meeting.id), payload);
        return queryClient.invalidateQueries({ queryKey: meetingKeys.lists() });
      },
    });
  });
}

export type DeleteMeetingOperationInput = string;
export type DeleteMeetingOperationResult = ReleaseMeetingRecorderResult;
export function deleteMeeting(
  context: ClientOperationContext,
  input: DeleteMeetingOperationInput,
): Promise<DeleteMeetingOperationResult> {
  return runClientMutation(context, input, (context) => {
    const { apiFetch, queryClient } = context;

    return clientMutation({
      mutationFn: (meetingId: DeleteMeetingOperationInput) =>
        apiFetch<MeetingResponse>(`/meetings/${meetingId}`, {
          method: "DELETE",
        }),
      onSuccess: async ({ meeting }) => {
        queryClient.removeQueries({ queryKey: meetingKeys.detail(meeting.id) });
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: meetingKeys.lists() }),
          queryClient.invalidateQueries({
            queryKey: pagesNavRootQueryKey(meeting.workspaceId),
          }),
          meeting.notesPageId
            ? queryClient.invalidateQueries({
                queryKey: pageQueryKey(meeting.notesPageId),
              })
            : Promise.resolve(),
        ]);
      },
    });
  });
}

export type UpdateMeetingOperationInput = { meetingId: string } & MeetingPatch;
export type UpdateMeetingOperationResult = ReleaseMeetingRecorderResult;
export function updateMeeting(
  context: ClientOperationContext,
  input: UpdateMeetingOperationInput,
): Promise<UpdateMeetingOperationResult> {
  const { meetingId, ...variables } = input;
  return runClientMutation(context, variables, (context) => {
    const { apiFetch, queryClient } = context;
    const operationScope = captureClientOperation(context);
    const write = beginClientWrite(context, meetingKeys.detail(meetingId));
    return clientMutation({
      mutationFn: (patch: Omit<UpdateMeetingOperationInput, "meetingId">) =>
        apiFetch<MeetingResponse>(`/meetings/${meetingId}`, {
          body: JSON.stringify(patch),
          method: "PATCH",
        }),
      onMutate: async (patch) => {
        const queryKey = meetingKeys.detail(meetingId);
        await queryClient.cancelQueries({ queryKey });
        operationScope.assertCurrent();
        const previous = queryClient.getQueryData<MeetingResponse>(queryKey);
        if (previous) {
          queryClient.setQueryData<MeetingResponse>(queryKey, {
            meeting: { ...previous.meeting, ...patch },
          });
        }
        return { previous };
      },
      onError: (_error, _patch, context) => {
        if (!write.isCurrent()) return;
        if (context?.previous) {
          queryClient.setQueryData(meetingKeys.detail(meetingId), context.previous);
        }
      },
      onSuccess: async (payload, patch) => {
        if (!write.isCurrent()) return;
        queryClient.setQueryData(meetingKeys.detail(meetingId), payload);
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: meetingKeys.lists() }),
          patch.title !== undefined && payload.meeting.notesPageId
            ? queryClient.invalidateQueries({
                queryKey: pageQueryKey(payload.meeting.notesPageId),
              })
            : Promise.resolve(),
        ]);
      },
      onSettled: async () => {
        await queryClient.invalidateQueries({ queryKey: meetingKeys.detail(meetingId) });
      },
    });
  });
}

export type MeetingLifecycleOperationInput = {
  meetingId: string;
  action: MeetingLifecycleAction;
  durationMs?: number;
  leaseId?: string;
};
export type MeetingLifecycleOperationResult = ReleaseMeetingRecorderResult;
export function meetingLifecycle(
  context: ClientOperationContext,
  input: MeetingLifecycleOperationInput,
): Promise<MeetingLifecycleOperationResult> {
  const { meetingId, ...variables } = input;
  return runClientMutation(context, variables, (context) => {
    const { apiFetch, queryClient } = context;
    return clientMutation({
      mutationFn: ({
        action,
        durationMs,
        leaseId,
      }: Omit<MeetingLifecycleOperationInput, "meetingId">) =>
        apiFetch<MeetingResponse>(`/meetings/${meetingId}/${action}`, {
          body: JSON.stringify({
            ...(durationMs === undefined ? {} : { durationMs }),
            ...(leaseId ? { leaseId } : {}),
          }),
          method: "POST",
        }),
      onSuccess: (payload) => {
        queryClient.setQueryData(meetingKeys.detail(meetingId), payload);
        return queryClient.invalidateQueries({ queryKey: meetingKeys.lists() });
      },
      onSettled: async () => {
        await queryClient.invalidateQueries({ queryKey: meetingKeys.detail(meetingId) });
      },
    });
  });
}

export type RecordMeetingConsentOperationInput = {
  meetingId: string;
  mode: "confirmed" | "played";
};
export type RecordMeetingConsentOperationResult = { consent: { id: string } };
export function recordMeetingConsent(
  context: ClientOperationContext,
  input: RecordMeetingConsentOperationInput,
): Promise<RecordMeetingConsentOperationResult> {
  const { meetingId } = input;
  return runClientMutation(context, input.mode, (context) => {
    const { apiFetch } = context;
    return clientMutation({
      mutationFn: (mode: "confirmed" | "played") =>
        apiFetch<{ consent: { id: string } }>(`/meetings/${meetingId}/consent`, {
          body: JSON.stringify({
            metadata: { source: "meeting-block" },
            mode,
          }),
          method: "POST",
        }),
    });
  });
}

export type ClaimMeetingRecorderOperationInput = { meetingId: string };
export function claimMeetingRecorder(
  context: ClientOperationContext,
  input: ClaimMeetingRecorderOperationInput,
): Promise<ClaimMeetingRecorderResult> {
  return runClientMutation(context, undefined, (context) => {
    const meetingId = input.meetingId;
    const { apiFetch, queryClient } = context;
    return clientMutation({
      mutationFn: () =>
        apiFetch<MeetingRecorderClaim>(`/meetings/${meetingId}/recorder/claim`, {
          body: "{}",
          method: "POST",
        }),
      onSuccess: (payload) => {
        queryClient.setQueryData(meetingKeys.detail(meetingId), {
          meeting: payload.meeting,
        });
        return queryClient.invalidateQueries({ queryKey: meetingKeys.lists() });
      },
    });
  });
}

export type ReleaseMeetingRecorderOperationInput = { meetingId: string; leaseId: string };
export function releaseMeetingRecorder(
  context: ClientOperationContext,
  input: ReleaseMeetingRecorderOperationInput,
): Promise<ReleaseMeetingRecorderResult> {
  return runClientMutation(context, input.leaseId, (context) => {
    const meetingId = input.meetingId;
    const { apiFetch, queryClient } = context;
    return clientMutation({
      mutationFn: (leaseId: string) =>
        apiFetch<MeetingResponse>(`/meetings/${meetingId}/recorder/release`, {
          body: JSON.stringify({ leaseId }),
          method: "POST",
        }),
      onSuccess: (payload) => {
        queryClient.setQueryData(meetingKeys.detail(meetingId), payload);
        return queryClient.invalidateQueries({ queryKey: meetingKeys.lists() });
      },
    });
  });
}

export type ClaimMeetingRecorderResult = MeetingRecorderClaim;
export type ReleaseMeetingRecorderResult = MeetingResponse;
