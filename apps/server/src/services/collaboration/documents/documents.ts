import { isPageBodyEmpty } from "@zilobase/features/runtime";
import { materializePageContentFromYjs } from "./document-codec";
export const DOCUMENT_PREFIX = "page:";

export const MEETING_DOCUMENT_PREFIX = "meeting:";

export function documentNameForPage(pageId: string) {
  return `${DOCUMENT_PREFIX}${pageId}`;
}

export function pageIdFromDocumentName(documentName: string) {
  return documentName.startsWith(DOCUMENT_PREFIX)
    ? documentName.slice(DOCUMENT_PREFIX.length)
    : null;
}

export function documentNameForMeeting(meetingId: string) {
  return `${MEETING_DOCUMENT_PREFIX}${meetingId}`;
}

export function meetingIdFromDocumentName(documentName: string) {
  return documentName.startsWith(MEETING_DOCUMENT_PREFIX)
    ? documentName.slice(MEETING_DOCUMENT_PREFIX.length)
    : null;
}

export function isEmptyPageContent(content: unknown): boolean {
  return isPageBodyEmpty(content);
}

export function isPlaceholderCollaborationState(state: Uint8Array): boolean {
  if (state.length === 0) {
    return true;
  }

  if (state.length === 2 && state[0] === 0 && state[1] === 0) {
    return true;
  }

  try {
    return isEmptyPageContent(materializePageContentFromYjs(state));
  } catch {
    return true;
  }
}
