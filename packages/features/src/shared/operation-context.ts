import type { QueryClient } from "@tanstack/react-query";
import { sharedClient } from "../data/client";
import { databaseController } from "../databases/interactions/store";
import type { ApiFetcher } from "./api-fetcher";
import type { ZilobaseAuthClient } from "./auth-client";
import type { ClientLifecycle } from "./lifecycle";

/** The same ports are supplied by React composition and imperative callers. */
export type ClientOperationContext = {
  chatReceipts?: import("../ai/durable").ChatReceiptStorage;
  apiFetch: ApiFetcher;
  streamFetch?: (path: string, init: RequestInit) => Promise<Response>;
  queryClient: QueryClient;
  lifecycle?: ClientLifecycle;
  preferredActiveWorkspaceId?: string | null;
  setPreferredActiveWorkspaceId?: (workspaceId: string | null) => void;
};

export type AuthenticatedClientOperationContext = ClientOperationContext & {
  auth: ZilobaseAuthClient;
};

export class ExpiredClientOperationError extends Error {
  constructor() {
    super("Client operation belongs to an expired identity");
    this.name = "ExpiredClientOperationError";
  }
}

const operationTransports = new WeakMap<ApiFetcher, ApiFetcher>();
const operationAuths = new WeakMap<ZilobaseAuthClient, ZilobaseAuthClient>();

/** The reusable session query must keep the underlying port after a guarded refresh. */
export function clientAuthPort(auth: ZilobaseAuthClient) {
  return operationAuths.get(auth) ?? auth;
}

/** Capture before any asynchronous work, including optimistic preparation. */
export function captureClientOperation<TContext extends ClientOperationContext>(context: TContext) {
  const client = sharedClient(context.queryClient);
  const read = client.capture();
  const isCurrent = () => {
    try {
      return sharedClient(context.queryClient) === client && client.isCurrent(read);
    } catch {
      return false;
    }
  };
  const assertCurrent = () => {
    if (!isCurrent()) throw new ExpiredClientOperationError();
  };
  const apiFetch: ApiFetcher = async <T>(path: string, init?: RequestInit & { auth?: boolean }) => {
    assertCurrent();
    const result = await context.apiFetch<T>(path, init);
    assertCurrent();
    return result;
  };
  operationTransports.set(apiFetch, operationTransports.get(context.apiFetch) ?? context.apiFetch);
  const guarded = { ...context, apiFetch };
  if ("auth" in context && context.auth) {
    const auth = context.auth as ZilobaseAuthClient;
    const guardedAuth = new Proxy(auth, {
      get(target, property: keyof ZilobaseAuthClient) {
        const method = target[property];
        if (typeof method !== "function") return method;
        return async (...args: unknown[]) => {
          assertCurrent();
          const value = await Reflect.apply(method, target, args);
          assertCurrent();
          return value;
        };
      },
    });
    operationAuths.set(guardedAuth, clientAuthPort(auth));
    Object.assign(guarded, { auth: guardedAuth });
  }
  return { read, isCurrent, assertCurrent, context: guarded };
}

export function clientDatabaseController(context: ClientOperationContext) {
  const { read } = captureClientOperation(context);
  const viewer = read.identity.viewer;
  return databaseController(
    context.queryClient,
    viewer.kind === "account" ? viewer.sessionId : "public",
    operationTransports.get(context.apiFetch) ?? context.apiFetch,
    context.lifecycle,
  );
}
