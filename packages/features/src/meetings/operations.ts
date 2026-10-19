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

function defineCreateMeetingMutation(context: ClientOperationContext) {
  const { apiFetch, queryClient } = context;
  return clientMutation({
    mutationFn: (input: CreateMeetingInput) =>
      apiFetch<MeetingResponse>("/meetings", {
        body: JSON.stringify(input),
        method: "POST",
      }),
    onSuccess: (payload) => {
      queryClient.setQueryData(meetingKeys.detail(payload.meeting.id), payload);
      return queryClient.invalidateQueries({ queryKey: meetingKeys.lists() });
    },
  });
}
export type CreateMeetingOperationInput = Parameters<
  NonNullable<ReturnType<typeof defineCreateMeetingMutation>["mutationFn"]>
>[0];
export type CreateMeetingOperationResult = Awaited<
  ReturnType<NonNullable<ReturnType<typeof defineCreateMeetingMutation>["mutationFn"]>>
>;
export function createMeeting(
  context: ClientOperationContext,
  input: CreateMeetingOperationInput,
): Promise<CreateMeetingOperationResult> {
  return runClientMutation(context, input, (context) => defineCreateMeetingMutation(context));
}

function defineDeleteMeetingMutation(context: ClientOperationContext) {
  const { apiFetch, queryClient } = context;

  return clientMutation({
    mutationFn: (meetingId: string) =>
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
}
export type DeleteMeetingOperationInput = Parameters<
  NonNullable<ReturnType<typeof defineDeleteMeetingMutation>["mutationFn"]>
>[0];
export type DeleteMeetingOperationResult = Awaited<
  ReturnType<NonNullable<ReturnType<typeof defineDeleteMeetingMutation>["mutationFn"]>>
>;
export function deleteMeeting(
  context: ClientOperationContext,
  input: DeleteMeetingOperationInput,
): Promise<DeleteMeetingOperationResult> {
  return runClientMutation(context, input, (context) => defineDeleteMeetingMutation(context));
}

function defineUpdateMeetingMutation(context: ClientOperationContext, meetingId: string) {
  const { apiFetch, queryClient } = context;
  const operationScope = captureClientOperation(context);
  const write = beginClientWrite(context, meetingKeys.detail(meetingId));
  return clientMutation({
    mutationFn: (patch: MeetingPatch) =>
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
}
export type UpdateMeetingOperationInput = { meetingId: string } & Parameters<
  NonNullable<ReturnType<typeof defineUpdateMeetingMutation>["mutationFn"]>
>[0];
export type UpdateMeetingOperationResult = Awaited<
  ReturnType<NonNullable<ReturnType<typeof defineUpdateMeetingMutation>["mutationFn"]>>
>;
export function updateMeeting(
  context: ClientOperationContext,
  input: UpdateMeetingOperationInput,
): Promise<UpdateMeetingOperationResult> {
  const { meetingId, ...variables } = input;
  return runClientMutation(context, variables, (context) =>
    defineUpdateMeetingMutation(context, meetingId),
  );
}

function defineMeetingLifecycleMutation(context: ClientOperationContext, meetingId: string) {
  const { apiFetch, queryClient } = context;
  return clientMutation({
    mutationFn: ({
      action,
      durationMs,
      leaseId,
    }: {
      action: MeetingLifecycleAction;
      durationMs?: number;
      leaseId?: string;
    }) =>
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
}
export type MeetingLifecycleOperationInput = { meetingId: string } & Parameters<
  NonNullable<ReturnType<typeof defineMeetingLifecycleMutation>["mutationFn"]>
>[0];
export type MeetingLifecycleOperationResult = Awaited<
  ReturnType<NonNullable<ReturnType<typeof defineMeetingLifecycleMutation>["mutationFn"]>>
>;
export function meetingLifecycle(
  context: ClientOperationContext,
  input: MeetingLifecycleOperationInput,
): Promise<MeetingLifecycleOperationResult> {
  const { meetingId, ...variables } = input;
  return runClientMutation(context, variables, (context) =>
    defineMeetingLifecycleMutation(context, meetingId),
  );
}

function defineRecordMeetingConsentMutation(context: ClientOperationContext, meetingId: string) {
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
}
export type RecordMeetingConsentOperationInput = { meetingId: string } & {
  mode: Parameters<
    NonNullable<ReturnType<typeof defineRecordMeetingConsentMutation>["mutationFn"]>
  >[0];
};
export type RecordMeetingConsentOperationResult = Awaited<
  ReturnType<NonNullable<ReturnType<typeof defineRecordMeetingConsentMutation>["mutationFn"]>>
>;
export function recordMeetingConsent(
  context: ClientOperationContext,
  input: RecordMeetingConsentOperationInput,
): Promise<RecordMeetingConsentOperationResult> {
  const { meetingId } = input;
  return runClientMutation(context, input.mode, (context) =>
    defineRecordMeetingConsentMutation(context, meetingId),
  );
}

function defineClaimMeetingRecorder(context: ClientOperationContext, meetingId: string) {
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
}
export type ClaimMeetingRecorderOperationInput = { meetingId: string };
export function claimMeetingRecorder(
  context: ClientOperationContext,
  input: ClaimMeetingRecorderOperationInput,
) {
  return runClientMutation(context, undefined, (context) =>
    defineClaimMeetingRecorder(context, input.meetingId),
  );
}

function defineReleaseMeetingRecorder(context: ClientOperationContext, meetingId: string) {
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
}
export type ReleaseMeetingRecorderOperationInput = { meetingId: string; leaseId: string };
export function releaseMeetingRecorder(
  context: ClientOperationContext,
  input: ReleaseMeetingRecorderOperationInput,
) {
  return runClientMutation(context, input.leaseId, (context) =>
    defineReleaseMeetingRecorder(context, input.meetingId),
  );
}

export type ClaimMeetingRecorderResult = Awaited<ReturnType<typeof claimMeetingRecorder>>;
export type ReleaseMeetingRecorderResult = Awaited<ReturnType<typeof releaseMeetingRecorder>>;
