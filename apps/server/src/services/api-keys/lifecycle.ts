import { and, eq } from "drizzle-orm";
import { db } from "../../infrastructure/database/index";
import { apikey } from "../../infrastructure/database/schema";
import { type RuntimeEnv } from "../../shared/config/config";
import { type EditionExtensionOptions } from "../../shared/contracts/edition";
import { createAuth } from "../auth/auth";
import {
  API_KEY_DEFAULT_EXPIRES_IN_SECONDS,
  API_KEY_PREFIX,
  readApiKeyWorkspaceId,
} from "./api-keys";
export async function getOwnedApiKey(id: string, userId: string) {
  const [record] = await db
    .select()
    .from(apikey)
    .where(and(eq(apikey.id, id), eq(apikey.referenceId, userId)))
    .limit(1);

  return record ?? null;
}

type ApiKeyRecord = Omit<typeof apikey.$inferSelect, "metadata"> & {
  metadata: unknown;
};

export function toApiKeyPayload(record: ApiKeyRecord) {
  return {
    createdAt: record.createdAt.toISOString(),
    enabled: record.enabled,
    expiresAt: record.expiresAt?.toISOString() ?? null,
    id: record.id,
    lastRequest: record.lastRequest?.toISOString() ?? null,
    name: record.name ?? "",
    workspaceId: readApiKeyWorkspaceId(readMetadata(record.metadata)),
    prefix: record.prefix,
    requestCount: record.requestCount,
    start: record.start,
    updatedAt: record.updatedAt.toISOString(),
  };
}

export function readMetadata(value: unknown) {
  if (value && typeof value === "object") {
    return value;
  }

  if (typeof value !== "string") {
    return null;
  }

  if (!value) {
    return null;
  }

  try {
    return JSON.parse(value) as unknown;
  } catch {
    return null;
  }
}

export function readApiKeyCreateError(error: unknown) {
  if (error && typeof error === "object") {
    const body = (error as { body?: { message?: unknown } }).body;
    const message = body?.message;

    if (typeof message === "string" && message.length > 0) {
      return message;
    }
  }

  return "Failed to create API key.";
}

export function listOwnedApiKeys(userId: string) {
  return db.select().from(apikey).where(eq(apikey.referenceId, userId));
}
export async function updateOwnedApiKey(
  id: string,
  userId: string,
  patch: { enabled?: boolean; name?: string },
) {
  const [updated] = await db
    .update(apikey)
    .set({
      ...patch,
      updatedAt: new Date(),
    })
    .where(and(eq(apikey.id, id), eq(apikey.referenceId, userId)))
    .returning();

  return updated;
}
export async function deleteOwnedApiKey(id: string, userId: string) {
  await db.delete(apikey).where(and(eq(apikey.id, id), eq(apikey.referenceId, userId)));
}

export async function createOwnedApiKey(
  input: { expiresIn?: number | null; workspaceId: string; name: string },
  userId: string,
  env: RuntimeEnv,
  request: Request,
  options: EditionExtensionOptions,
) {
  const auth = await createAuth(env, request, undefined, {
    editionExtension: options.editionExtension,
    policy: options.policy,
  });
  const key = await auth.api
    .createApiKey({
      body: {
        expiresIn:
          input.expiresIn === undefined ? API_KEY_DEFAULT_EXPIRES_IN_SECONDS : input.expiresIn,
        metadata: { workspaceId: input.workspaceId },
        name: input.name,
        prefix: API_KEY_PREFIX,
        userId: userId,
      },
    })
    .catch((error: unknown) => {
      return {
        error: readApiKeyCreateError(error),
      };
    });

  return key;
}
