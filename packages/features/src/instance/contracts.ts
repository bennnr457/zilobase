export type RegistrationMode = "invite-only" | "open";

export type InstanceSettingsResponse = {
  settings: {
    bootstrapCompleted: boolean;
    displayName: string;
    instanceId: string;
    pinnedWorkspaceId: string | null;
    registrationMode: RegistrationMode;
  };
};

export type BootstrapInstanceInput = {
  email: string;
  password: string;
  name: string;
  workspaceName: string;
  bootstrapToken: string;
};
