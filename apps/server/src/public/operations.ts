import {
  createApiKeyOperation,
  deleteApiKeyOperation,
  listApiKeysOperation,
  updateApiKeyOperation,
} from "../services/api-keys/operations";
import {
  acceptWorkspaceInvitationAuthOperation,
  changePasswordAuthOperation,
  createOAuthAppAuthOperation,
  createWorkspaceAuthOperation,
  deleteAccountAuthOperation,
  deleteOAuthAppAuthOperation,
  getPublicOAuthClientAuthOperation,
  listOAuthAppsAuthOperation,
  listOAuthConsentsAuthOperation,
  listWorkspaceInvitationsAuthOperation,
  listWorkspacesAuthOperation,
  requestEmailVerificationOtpAuthOperation,
  requestSignInOtpAuthOperation,
  revokeOAuthConsentAuthOperation,
  setActiveWorkspaceAuthOperation,
  setPasswordAuthOperation,
  signInWithOtpAuthOperation,
  signInWithPasswordAuthOperation,
  signOutAuthOperation,
  signUpAuthOperation,
  submitOAuthConsentAuthOperation,
  verifyEmailOtpAuthOperation,
} from "../services/auth/operations";
import { getSessionOperation } from "../services/auth/sessions/operations";
import {
  createAutomationOperation,
  createAutomationSecretOperation,
  deleteAutomationOperation,
  duplicateAutomationOperation,
  listAutomationsOperation,
  readAutomationCapabilityOperation,
  readAutomationCatalogOperation,
  readAutomationOperation,
  updateAutomationOperation,
  validateAutomationOperation,
} from "../services/automations/definition/operations";
import {
  exportAutomationAuditOperation,
  listAutomationRunsOperation,
  readAutomationRunOperation,
} from "../services/automations/history/operations";
import { setAutomationPausedOperation } from "../services/automations/lifecycle-operations";
import {
  disconnectAutomationSlackOperation,
  listAutomationSlackChannelsOperation,
  startAutomationSlackConnectionOperation,
} from "../services/automations/slack-operations";
import {
  connectCalendarOperation,
  disconnectCalendarOperation,
  listCalendarConnectionsOperation,
  listCalendarSourcesOperation,
  listProviderCalendarsOperation,
} from "../services/calendar/connections/operations";
import {
  createCalendarEventOperation,
  mutateCalendarEventOperation,
  reconcileCalendarEventOperation,
} from "../services/calendar/events/operations";
import {
  getCalendarPreferencesOperation,
  saveCalendarPreferencesOperation,
} from "../services/calendar/preferences/operations";
import {
  getCalendarEventOperation,
  readCalendarCatalogOperation,
  readCalendarRangeOperation,
  searchCalendarOperation,
  syncCalendarOperation,
} from "../services/calendar/sync/application-operations";
import { createClipOperation, findDuplicateClipOperation } from "../services/clips/operations";
import {
  executeDatabaseApplicationCommand,
  type ExecuteDatabaseCommandInput,
} from "../services/databases/commands/operations";
import {
  readDatabaseAccess,
  readDatabaseBootstrap,
  readDatabaseExport,
  readDatabaseMutationHistory,
  readDatabaseRecordWindow,
} from "../services/databases/read/operations";
import {
  completeImageUploadOperation,
  createImageUploadOperation,
  getImageUrlOperation,
  removeImageOperation,
} from "../services/images/operations";
import {
  getInstanceSettingsOperation,
  updateInstanceSettingsOperation,
} from "../services/instance/operations";
import {
  claimMeetingRecorderOperation,
  createMeetingOperation,
  deleteMeetingOperation,
  getMeetingOperation,
  listMeetingsOperation,
  prepareMeetingCollaborationOperation,
  recordMeetingConsentOperation,
  releaseMeetingRecorderOperation,
  transitionMeetingOperation,
  updateMeetingOperation,
} from "../services/meetings/operations";
import {
  listNotificationsOperation,
  markNotificationReadOperation,
} from "../services/notifications/operations";
import { runServerOperation, type ServerOperationContext } from "../services/operations/context";
import {
  acceptPageGuestInvitationOperation,
  cancelPageGuestInvitationOperation,
  getPageGuestInvitationOperation,
  invitePageGuestOperation,
  listPageGuestInvitationsOperation,
  listPageGuestRequestsOperation,
  revokePageGuestOperation,
} from "../services/page-guests/operations";
import {
  approveWorkspaceGuestRequestOperation,
  getWorkspaceGuestPolicyOperation,
  listWorkspaceGuestRequestsOperation,
  listWorkspaceGuestsOperation,
  promoteWorkspaceGuestOperation,
  rejectWorkspaceGuestRequestOperation,
  revokeWorkspaceGuestOperation,
  updateWorkspaceGuestPolicyOperation,
} from "../services/page-guests/workspace/operations";
import { appendPageCommentOperation } from "../services/pages/content/comment-operation";
import {
  getPropertiesPageOperation,
  prepareCollaborationPageOperation,
  replaceContentPageOperation,
  updatePageOperation,
  updatePropertyPageOperation,
} from "../services/pages/content/operations";
import {
  convertToTeamspacePageOperation,
  createPageOperation,
  embedPageOperation,
  moveToTeamspacePageOperation,
  removeEmbedPageOperation,
} from "../services/pages/hierarchy/operations";
import {
  resetPageLayoutOperation,
  resolvePageLayoutOperation,
  savePageLayoutOperation,
} from "../services/pages/layouts/operations";
import { deletePageOperation, restorePageOperation } from "../services/pages/lifecycle/operations";
import {
  favoritePageOperation,
  recordVisitPageOperation,
  unfavoritePageOperation,
} from "../services/pages/navigation/operations";
import {
  getPageOperation,
  getPagePublishedOperation,
  listPagesOperation,
} from "../services/pages/read/operations";
import {
  getAccessPageOperation,
  getAccessTargetsPageOperation,
  removeAccessPageOperation,
  removePublicAccessPageOperation,
  upsertAccessPageOperation,
} from "../services/pages/sharing/operations";
import { searchWorkspaceOperation } from "../services/search/operations";
import {
  acceptTeamspaceInviteOperation,
  addTeamspacePrincipalOperation,
  createTeamspaceOperation,
  getTeamspaceOperation,
  getTeamspaceSettingsOperation,
  listTeamspacePrincipalsOperation,
  listTeamspacesOperation,
  removeTeamspacePrincipalOperation,
  setTeamspaceMembershipOperation,
  teamspaceLifecycleOperation,
  updateTeamspaceDefaultsOperation,
  updateTeamspaceInviteLinkOperation,
  updateTeamspaceOperation,
  updateTeamspacePrincipalOperation,
  updateTeamspaceSettingsOperation,
} from "../services/teamspaces/operations";
import {
  getUserSettingsOperation,
  updateUserProfileOperation,
  updateUserSettingsOperation,
} from "../services/user-settings/operations";
import {
  completeProfileImageUploadOperation,
  createProfileImageUploadOperation,
  removeProfileImageOperation,
} from "../services/user-settings/profile/images/operations";
import { inviteWorkspaceMemberOperation } from "../services/workspaces/invitations/operations";
import {
  getWorkspaceAccessTargetsOperation,
  removeWorkspaceMemberOperation,
  updateWorkspaceMemberOperation,
} from "../services/workspaces/members/operations";
import {
  deleteWorkspaceOperation,
  getWorkspaceOperation,
  listWorkspacesOperation,
} from "../services/workspaces/operations";
import { updateWorkspaceOperation } from "../services/workspaces/settings/operations";
export type { ExecuteDatabaseCommandInput } from "../services/databases/commands/operations";
export type {
  DatabaseBootstrapInput,
  DatabaseRecordWindowInput,
} from "../services/databases/read/operations";
export { ServerOperationError, type ServerOperationContext } from "../services/operations/context";

/** Trusted context is closed over; operation payloads cannot replace the actor. */
export function createServerOperations(context: ServerOperationContext) {
  function bind<Input, Result>(
    operation: (context: ServerOperationContext, input: Input) => Promise<Result>,
  ) {
    return (input: Input) => runServerOperation(context, () => operation(context, input));
  }

  return {
    workspaces: {
      list: bind(listWorkspacesOperation),
      get: bind(getWorkspaceOperation),
      delete: bind(deleteWorkspaceOperation),
      getAccessTargets: bind(getWorkspaceAccessTargetsOperation),
      updateMember: bind(updateWorkspaceMemberOperation),
      removeMember: bind(removeWorkspaceMemberOperation),
      inviteMember: bind(inviteWorkspaceMemberOperation),
      update: bind(updateWorkspaceOperation),
      listGuests: bind(listWorkspaceGuestsOperation),
      getGuestPolicy: bind(getWorkspaceGuestPolicyOperation),
      updateGuestPolicy: bind(updateWorkspaceGuestPolicyOperation),
      listGuestRequests: bind(listWorkspaceGuestRequestsOperation),
      rejectGuestRequest: bind(rejectWorkspaceGuestRequestOperation),
      approveGuestRequest: bind(approveWorkspaceGuestRequestOperation),
      revokeGuest: bind(revokeWorkspaceGuestOperation),
      promoteGuest: bind(promoteWorkspaceGuestOperation),
      create: bind(createWorkspaceAuthOperation),
      setActive: bind(setActiveWorkspaceAuthOperation),
      acceptInvitation: bind(acceptWorkspaceInvitationAuthOperation),
      listInvitations: bind(listWorkspaceInvitationsAuthOperation),
    },
    teamspaces: {
      getSettings: bind(getTeamspaceSettingsOperation),
      updateSettings: bind(updateTeamspaceSettingsOperation),
      updateDefaults: bind(updateTeamspaceDefaultsOperation),
      list: bind(listTeamspacesOperation),
      create: bind(createTeamspaceOperation),
      get: bind(getTeamspaceOperation),
      update: bind(updateTeamspaceOperation),
      setMembership: bind(setTeamspaceMembershipOperation),
      lifecycle: bind(teamspaceLifecycleOperation),
      updateInviteLink: bind(updateTeamspaceInviteLinkOperation),
      acceptInvite: bind(acceptTeamspaceInviteOperation),
      listPrincipals: bind(listTeamspacePrincipalsOperation),
      addPrincipal: bind(addTeamspacePrincipalOperation),
      updatePrincipal: bind(updateTeamspacePrincipalOperation),
      removePrincipal: bind(removeTeamspacePrincipalOperation),
    },
    uploads: {
      createPageImage: bind(createImageUploadOperation),
      completePageImage: bind(completeImageUploadOperation),
      removePageImage: bind(removeImageOperation),
      getImageUrl: bind(getImageUrlOperation),
      createProfileImage: bind(createProfileImageUploadOperation),
      completeProfileImage: bind(completeProfileImageUploadOperation),
      removeProfileImage: bind(removeProfileImageOperation),
    },
    clips: { create: bind(createClipOperation), findDuplicate: bind(findDuplicateClipOperation) },
    automations: {
      capability: bind(readAutomationCapabilityOperation),
      list: bind(listAutomationsOperation),
      validate: bind(validateAutomationOperation),
      createSecret: bind(createAutomationSecretOperation),
      create: bind(createAutomationOperation),
      get: bind(readAutomationOperation),
      update: bind(updateAutomationOperation),
      duplicate: bind(duplicateAutomationOperation),
      delete: bind(deleteAutomationOperation),
      catalog: bind(readAutomationCatalogOperation),
      exportAudit: bind(exportAutomationAuditOperation),
      listRuns: bind(listAutomationRunsOperation),
      getRun: bind(readAutomationRunOperation),
      setPaused: bind(setAutomationPausedOperation),
      startSlackConnection: bind(startAutomationSlackConnectionOperation),
      listSlackChannels: bind(listAutomationSlackChannelsOperation),
      disconnectSlack: bind(disconnectAutomationSlackOperation),
    },
    calendar: {
      createEvent: bind(createCalendarEventOperation),
      mutateEvent: bind(mutateCalendarEventOperation),
      reconcileEvent: bind(reconcileCalendarEventOperation),
      getPreferences: bind(getCalendarPreferencesOperation),
      savePreferences: bind(saveCalendarPreferencesOperation),
      listConnections: bind(listCalendarConnectionsOperation),
      listSources: bind(listCalendarSourcesOperation),
      connect: bind(connectCalendarOperation),
      disconnect: bind(disconnectCalendarOperation),
      listCalendars: bind(listProviderCalendarsOperation),
      sync: bind(syncCalendarOperation),
      readRange: bind(readCalendarRangeOperation),
      search: bind(searchCalendarOperation),
      getEvent: bind(getCalendarEventOperation),
      readCatalog: bind(readCalendarCatalogOperation),
    },
    meetings: {
      list: bind(listMeetingsOperation),
      create: bind(createMeetingOperation),
      get: bind(getMeetingOperation),
      prepareCollaboration: bind(prepareMeetingCollaborationOperation),
      claimRecorder: bind(claimMeetingRecorderOperation),
      recordConsent: bind(recordMeetingConsentOperation),
      releaseRecorder: bind(releaseMeetingRecorderOperation),
      update: bind(updateMeetingOperation),
      transition: bind(transitionMeetingOperation),
      delete: bind(deleteMeetingOperation),
    },
    userSettings: {
      get: bind(getUserSettingsOperation),
      update: bind(updateUserSettingsOperation),
      updateProfile: bind(updateUserProfileOperation),
    },
    instance: {
      getSettings: bind(getInstanceSettingsOperation),
      updateSettings: bind(updateInstanceSettingsOperation),
    },
    apiKeys: {
      list: bind(listApiKeysOperation),
      create: bind(createApiKeyOperation),
      update: bind(updateApiKeyOperation),
      delete: bind(deleteApiKeyOperation),
    },
    search: { workspace: bind(searchWorkspaceOperation) },
    notifications: {
      list: bind(listNotificationsOperation),
      markRead: bind(markNotificationReadOperation),
    },
    auth: {
      requestSignInOtp: bind(requestSignInOtpAuthOperation),
      signInWithOtp: bind(signInWithOtpAuthOperation),
      signInWithPassword: bind(signInWithPasswordAuthOperation),
      signUp: bind(signUpAuthOperation),
      requestEmailVerificationOtp: bind(requestEmailVerificationOtpAuthOperation),
      verifyEmailOtp: bind(verifyEmailOtpAuthOperation),
      signOut: bind(signOutAuthOperation),
      changePassword: bind(changePasswordAuthOperation),
      setPassword: bind(setPasswordAuthOperation),
      deleteAccount: bind(deleteAccountAuthOperation),
      createWorkspace: bind(createWorkspaceAuthOperation),
      setActiveWorkspace: bind(setActiveWorkspaceAuthOperation),
      acceptWorkspaceInvitation: bind(acceptWorkspaceInvitationAuthOperation),
      listWorkspaces: bind(listWorkspacesAuthOperation),
      listWorkspaceInvitations: bind(listWorkspaceInvitationsAuthOperation),
      listOAuthApps: bind(listOAuthAppsAuthOperation),
      createOAuthApp: bind(createOAuthAppAuthOperation),
      deleteOAuthApp: bind(deleteOAuthAppAuthOperation),
      listOAuthConsents: bind(listOAuthConsentsAuthOperation),
      revokeOAuthConsent: bind(revokeOAuthConsentAuthOperation),
      submitOAuthConsent: bind(submitOAuthConsentAuthOperation),
      getPublicOAuthClient: bind(getPublicOAuthClientAuthOperation),
      getSession: bind(getSessionOperation),
    },
    pages: {
      acceptPageGuestInvitation: (
        input: Parameters<typeof acceptPageGuestInvitationOperation>[1],
      ) => runServerOperation(context, () => acceptPageGuestInvitationOperation(context, input)),
      getPageGuestInvitation: (input: Parameters<typeof getPageGuestInvitationOperation>[1]) =>
        runServerOperation(context, () => getPageGuestInvitationOperation(context, input)),
      revokePageGuest: (input: Parameters<typeof revokePageGuestOperation>[1]) =>
        runServerOperation(context, () => revokePageGuestOperation(context, input)),
      cancelPageGuestInvitation: (
        input: Parameters<typeof cancelPageGuestInvitationOperation>[1],
      ) => runServerOperation(context, () => cancelPageGuestInvitationOperation(context, input)),
      listPageGuestInvitations: (input: Parameters<typeof listPageGuestInvitationsOperation>[1]) =>
        runServerOperation(context, () => listPageGuestInvitationsOperation(context, input)),
      listPageGuestRequests: (input: Parameters<typeof listPageGuestRequestsOperation>[1]) =>
        runServerOperation(context, () => listPageGuestRequestsOperation(context, input)),
      invitePageGuest: (input: {
        pageId: string;
        email: string;
        accessLevel: "view" | "comment" | "edit" | "full";
      }) =>
        runServerOperation(context, () =>
          invitePageGuestOperation(context, {
            pageId: input.pageId,
            body: { email: input.email, accessLevel: input.accessLevel },
          }),
        ),
      resetLayout: (input: Parameters<typeof resetPageLayoutOperation>[1]) =>
        runServerOperation(context, () => resetPageLayoutOperation(context, input)),
      saveLayout: (input: {
        scope: "workspace" | "database" | "page";
        scopeId: string;
        config: unknown;
        clearPageOverrides?: boolean;
      }) =>
        runServerOperation(context, () =>
          savePageLayoutOperation(context, {
            scope: input.scope,
            scopeId: input.scopeId,
            body: { config: input.config, clearPageOverrides: input.clearPageOverrides },
          }),
        ),
      resolveLayout: (input: Parameters<typeof resolvePageLayoutOperation>[1]) =>
        runServerOperation(context, () => resolvePageLayoutOperation(context, input)),
      appendComment: (input: Parameters<typeof appendPageCommentOperation>[1]) =>
        runServerOperation(context, () => appendPageCommentOperation(context, input)),
      getPublished: (input: Parameters<typeof getPagePublishedOperation>[1]) =>
        runServerOperation(context, () => getPagePublishedOperation(context, input)),
      get: (input: Parameters<typeof getPageOperation>[1]) =>
        runServerOperation(context, () => getPageOperation(context, input)),
      list: (input: Parameters<typeof listPagesOperation>[1]) =>
        runServerOperation(context, () => listPagesOperation(context, input)),
      create: (input: {
        workspaceId: string;
        name?: string;
        type?: string;
        url?: string;
        content?: unknown;
        metadata?: unknown;
        parentItemId?: string | null;
        teamspaceId?: string | null;
      }) => runServerOperation(context, () => createPageOperation(context, { body: input })),
      moveToTeamspace: (input: { pageId: string; teamspaceId: string | null }) =>
        runServerOperation(context, () =>
          moveToTeamspacePageOperation(context, {
            pageId: input.pageId,
            body: { teamspaceId: input.teamspaceId },
          }),
        ),
      convertToTeamspace: (input: {
        pageId: string;
        name?: string;
        accessMode?: "open" | "closed" | "private";
      }) =>
        runServerOperation(context, () =>
          convertToTeamspacePageOperation(context, {
            pageId: input.pageId,
            body: { name: input.name, accessMode: input.accessMode },
          }),
        ),
      embed: (input: { pageId: string; itemId: string; kind: "page" | "database" }) =>
        runServerOperation(context, () =>
          embedPageOperation(context, {
            pageId: input.pageId,
            body: { itemId: input.itemId, kind: input.kind },
          }),
        ),
      removeEmbed: (input: {
        pageId: string;
        itemId: string;
        kind: "page" | "database";
        placementId?: string;
      }) =>
        runServerOperation(context, () =>
          removeEmbedPageOperation(context, {
            pageId: input.pageId,
            body: { itemId: input.itemId, kind: input.kind, placementId: input.placementId },
          }),
        ),
      restore: (input: Parameters<typeof restorePageOperation>[1]) =>
        runServerOperation(context, () => restorePageOperation(context, input)),
      delete: (input: Parameters<typeof deletePageOperation>[1]) =>
        runServerOperation(context, () => deletePageOperation(context, input)),
      recordVisit: (input: {
        itemId: string;
        itemKind: "page" | "database";
        workspaceId: string;
      }) => runServerOperation(context, () => recordVisitPageOperation(context, { body: input })),
      favorite: (input: Parameters<typeof favoritePageOperation>[1]) =>
        runServerOperation(context, () => favoritePageOperation(context, input)),
      unfavorite: (input: Parameters<typeof unfavoritePageOperation>[1]) =>
        runServerOperation(context, () => unfavoritePageOperation(context, input)),
      getAccess: (input: Parameters<typeof getAccessPageOperation>[1]) =>
        runServerOperation(context, () => getAccessPageOperation(context, input)),
      getAccessTargets: (input: Parameters<typeof getAccessTargetsPageOperation>[1]) =>
        runServerOperation(context, () => getAccessTargetsPageOperation(context, input)),
      upsertAccess: (input: {
        pageId: string;
        targetType: "public" | "user" | "team";
        targetId: string;
        accessLevel: "view" | "comment" | "edit" | "full";
      }) =>
        runServerOperation(context, () =>
          upsertAccessPageOperation(context, { pageId: input.pageId, body: input }),
        ),
      removePublicAccess: (input: Parameters<typeof removePublicAccessPageOperation>[1]) =>
        runServerOperation(context, () => removePublicAccessPageOperation(context, input)),
      removeAccess: (input: Parameters<typeof removeAccessPageOperation>[1]) =>
        runServerOperation(context, () => removeAccessPageOperation(context, input)),
      getProperties: (input: Parameters<typeof getPropertiesPageOperation>[1]) =>
        runServerOperation(context, () => getPropertiesPageOperation(context, input)),
      updateProperty: (input: { pageId: string; propertyId: string; value: unknown }) =>
        runServerOperation(context, () =>
          updatePropertyPageOperation(context, {
            pageId: input.pageId,
            propertyId: input.propertyId,
            body: { value: input.value },
          }),
        ),
      prepareCollaboration: (input: { pageId: string; includeState: boolean }) =>
        runServerOperation(context, () =>
          prepareCollaborationPageOperation(context, {
            pageId: input.pageId,
            body: { includeState: input.includeState },
          }),
        ),
      replaceContent: (input: { pageId: string; content: unknown; baseUpdatedAt?: string }) =>
        runServerOperation(context, () =>
          replaceContentPageOperation(context, {
            pageId: input.pageId,
            body: { content: input.content, baseUpdatedAt: input.baseUpdatedAt },
          }),
        ),
      update: (input: {
        pageId: string;
        patch: {
          type?: unknown;
          name?: unknown;
          url?: unknown;
          content?: unknown;
          metadata?: unknown;
        };
      }) =>
        runServerOperation(context, () =>
          updatePageOperation(context, { pageId: input.pageId, body: input.patch }),
        ),
    },
    databases: {
      getAccess: (input: Parameters<typeof readDatabaseAccess>[1]) =>
        runServerOperation(context, () => readDatabaseAccess(context, input)),
      getMutationHistory: (input: Parameters<typeof readDatabaseMutationHistory>[1]) =>
        runServerOperation(context, () => readDatabaseMutationHistory(context, input)),
      getRecordWindow: (input: Parameters<typeof readDatabaseRecordWindow>[1]) =>
        runServerOperation(context, () => readDatabaseRecordWindow(context, input)),
      getExport: (input: Parameters<typeof readDatabaseExport>[1]) =>
        runServerOperation(context, () => readDatabaseExport(context, input)),
      getBootstrap: (input: Parameters<typeof readDatabaseBootstrap>[1]) =>
        runServerOperation(context, () => readDatabaseBootstrap(context, input)),
      executeCommand: (input: ExecuteDatabaseCommandInput) =>
        runServerOperation(context, () => executeDatabaseApplicationCommand(context, input)),
    },
  };
}

export type ServerOperations = ReturnType<typeof createServerOperations>;
