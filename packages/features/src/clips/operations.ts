import { captureClientOperation, type ClientOperationContext } from "../shared/operation-context";
import type { ClipDuplicateRecord, CreateClipRequest, CreateClipResponse } from "./contracts";
export type CreateClipInput = CreateClipRequest;
export type CreateClipResult = CreateClipResponse;
export function createClip(
  context: ClientOperationContext,
  input: CreateClipInput,
): Promise<CreateClipResult> {
  return captureClientOperation(context).context.apiFetch<CreateClipResponse>("/clips", {
    method: "POST",
    body: JSON.stringify(input),
  });
}
export function findDuplicateClip(
  context: ClientOperationContext,
  input: { workspaceId: string; url: string },
) {
  const query = new URLSearchParams(input);
  return captureClientOperation(context).context.apiFetch<{
    duplicate: ClipDuplicateRecord | null;
  }>(`/clips/duplicates?${query}`);
}

export type FindDuplicateClipInput = Parameters<typeof findDuplicateClip>[1];
export type FindDuplicateClipResult = Awaited<ReturnType<typeof findDuplicateClip>>;
