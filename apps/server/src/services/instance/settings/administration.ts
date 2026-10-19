import { eq } from "drizzle-orm";
import { db } from "../../../infrastructure/database/index";
import { instanceSettings } from "../../../infrastructure/database/schema";
import { type RuntimeEnv } from "../../../shared/config/config";
import { INSTANCE_SETTINGS_ROW_ID } from "../contracts";
import { RegistrationMode, parseRegistrationMode } from "../registration/policy";
import { ensureInstanceSettings } from "./instance-settings";
export type InstanceAdministrationSettings = {
  bootstrapCompleted: boolean;
  displayName: string;
  instanceId: string;
  pinnedWorkspaceId: string | null;
  registrationMode: RegistrationMode;
};

export async function getInstanceAdministrationSettings(env: RuntimeEnv) {
  await ensureInstanceSettings(env);

  const [settings] = await db
    .select({
      bootstrapCompletedAt: instanceSettings.bootstrapCompletedAt,
      displayName: instanceSettings.displayName,
      instanceId: instanceSettings.instanceId,
      pinnedWorkspaceId: instanceSettings.pinnedWorkspaceId,
      registrationMode: instanceSettings.registrationMode,
    })
    .from(instanceSettings)
    .where(eq(instanceSettings.id, INSTANCE_SETTINGS_ROW_ID))
    .limit(1);

  if (!settings) {
    throw new Error("Instance settings are unavailable");
  }

  return {
    bootstrapCompleted: Boolean(settings.bootstrapCompletedAt),
    displayName: settings.displayName,
    instanceId: settings.instanceId,
    pinnedWorkspaceId: settings.pinnedWorkspaceId,
    registrationMode: parseRegistrationMode(settings.registrationMode),
  } satisfies InstanceAdministrationSettings;
}

export async function updateInstanceAdministrationSettings(input: {
  displayName?: string;
  registrationMode?: RegistrationMode;
}) {
  const [settings] = await db
    .update(instanceSettings)
    .set({
      ...(input.displayName === undefined ? {} : { displayName: input.displayName }),
      ...(input.registrationMode === undefined ? {} : { registrationMode: input.registrationMode }),
      updatedAt: new Date(),
    })
    .where(eq(instanceSettings.id, INSTANCE_SETTINGS_ROW_ID))
    .returning({
      displayName: instanceSettings.displayName,
      registrationMode: instanceSettings.registrationMode,
    });

  if (!settings) {
    throw new Error("Instance settings are unavailable");
  }

  return {
    displayName: settings.displayName,
    registrationMode: parseRegistrationMode(settings.registrationMode),
  };
}

export function canManageInstanceSettings(role: string | null | undefined) {
  return role === "owner";
}
