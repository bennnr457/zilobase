import { and, eq, gt, isNull } from "drizzle-orm";
import { db, runWithDb, runWithDbEnv, type Database } from "../../infrastructure/database/index";
import { desktopAuthorizationCode } from "../../infrastructure/database/schema";
import type { RuntimeEnv } from "../../shared/config/config";
import type { EditionExtensionOptions } from "../../shared/contracts/edition";
import { createAuth } from "../auth/auth";
import { getZilobaseDiscoveryDocument } from "../instance/discovery/discovery";
import {
  consumeDesktopAuthorizationCode,
  createDesktopAuthorizationCode,
  DESKTOP_AUTH_CODE_TTL_MS,
  hashDesktopAuthorizationCode,
  parseDesktopTokenRequest,
  type DesktopAuthorizationRequest,
} from "./authorization";
export async function issueDesktopAuthorizationCode(
  authorizationRequest: DesktopAuthorizationRequest,
  userId: string,
  activeWorkspaceId: string | null,
) {
  const code = createDesktopAuthorizationCode();
  const expiresAt = new Date(Date.now() + DESKTOP_AUTH_CODE_TTL_MS);

  await db.insert(desktopAuthorizationCode).values({
    id: crypto.randomUUID(),
    codeChallenge: authorizationRequest.codeChallenge,
    codeHash: hashDesktopAuthorizationCode(code),
    redirectUri: authorizationRequest.redirectUri,
    userId: userId,
    activeWorkspaceId: activeWorkspaceId,
    expiresAt,
  });

  return code;
}

export async function exchangeDesktopToken(
  tokenRequest: ReturnType<typeof parseDesktopTokenRequest>,
  env: RuntimeEnv,
  request: Request,
  options: EditionExtensionOptions,
) {
  return runWithDbEnv(env, async () => {
    const now = new Date();
    const result = await db.transaction(async (transaction) =>
      runWithDb(transaction as unknown as Database, async () => {
        const authorizationCode = await consumeDesktopAuthorizationCode(
          tokenRequest,
          {
            async consume(input) {
              const [consumed] = await db
                .update(desktopAuthorizationCode)
                .set({ consumedAt: input.now })
                .where(
                  and(
                    eq(desktopAuthorizationCode.codeHash, input.codeHash),
                    eq(desktopAuthorizationCode.codeChallenge, input.codeChallenge),
                    eq(desktopAuthorizationCode.redirectUri, input.redirectUri),
                    isNull(desktopAuthorizationCode.consumedAt),
                    gt(desktopAuthorizationCode.expiresAt, input.now),
                  ),
                )
                .returning({
                  activeWorkspaceId: desktopAuthorizationCode.activeWorkspaceId,
                  userId: desktopAuthorizationCode.userId,
                });

              return consumed ?? null;
            },
          },
          now,
        );

        if (!authorizationCode) return null;

        const auth = await createAuth(env, request, undefined, {
          editionExtension: options.editionExtension,
          policy: options.policy,
        });
        const authContext = await auth.$context;
        const session = await authContext.internalAdapter.createSession(
          authorizationCode.userId,
          false,
          {
            activeWorkspaceId: authorizationCode.activeWorkspaceId,
            userAgent: "Zilobase Desktop",
          },
        );

        return { authorizationCode, session };
      }),
    );

    if (!result) {
      return null;
    }

    const discovery = await getZilobaseDiscoveryDocument(env);

    return {
      access_token: result.session.token,
      expires_at: result.session.expiresAt.toISOString(),
      instance_id: discovery.instanceId,
      issuer: discovery.issuer,
      token_type: "Bearer",
      user: { id: result.authorizationCode.userId },
    };
  });
}
