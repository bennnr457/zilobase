import { getHostedEditorAuthToken } from "@/platform/auth/hosted-editor-auth";
import { ApiError } from "@zilobase/features";
export { ApiError, getApiErrorMessage } from "@zilobase/features";
import {
  clearDesktopAuthToken,
  getDesktopAuthToken,
  setDesktopAuthToken,
} from "@/platform/auth/desktop-auth-token";
import {
  getSelectedDesktopServer,
  resolveRuntimeApiOrigin,
  resolveRuntimeWebSocketUrl,
  type DesktopServer,
} from "@/platform/server/desktop-server";
import { desktopNetworkFetch } from "@/platform/network/desktop-network";
import { getRequestPolicy } from "./request-policy";

declare global {
  interface Window {
    __ZILOBASE_MOBILE_AUTH_COOKIE__?: string;
  }
}

type ApiFetchOptions = RequestInit & {
  auth?: boolean;
  timeoutMs?: number;
};

type ApiErrorBody = {
  code?: string;
  error?: string | { message?: string };
  message?: string;
};

export class NetworkUnavailableError extends Error {
  constructor(message = "Zilobase is offline. This action requires a connection.") {
    super(message);
    this.name = "NetworkUnavailableError";
  }
}

export async function apiFetch<T>(
  path: string,
  { auth = true, headers, body, timeoutMs, ...init }: ApiFetchOptions = {},
) {
  const method = (init.method ?? "GET").toUpperCase();
  const policy = getRequestPolicy();
  const intercepted = policy.intercept(path, method, body);
  if (intercepted.handled) return intercepted.value as T;

  const requestHeaders = getApiRequestHeaders(headers);

  if (body && !requestHeaders.has("content-type")) {
    requestHeaders.set("content-type", "application/json");
  }

  const requestTimeout = createRequestTimeout(init.signal, timeoutMs);
  let response: Response;
  try {
    response = await desktopNetworkFetch(toApiUrl(path), {
      ...init,
      body,
      credentials: getHostedEditorAuthToken() ? "omit" : auth ? "include" : "same-origin",
      headers: requestHeaders,
      signal: requestTimeout.signal,
    });
  } catch (error) {
    if (requestTimeout.didTimeout()) {
      throw new NetworkUnavailableError("Zilobase did not respond in time.");
    }
    if (isRequestAbort(error)) {
      throw error;
    }

    policy.observe({ type: "network-error", error });
    throw error;
  } finally {
    requestTimeout.cleanup();
  }

  policy.observe({ type: "response", status: response.status });

  const desktopAuthToken = response.headers.get("set-auth-token");
  if (desktopAuthToken) await setDesktopAuthToken(desktopAuthToken);

  const text = await response.text();
  const data = text ? parseJson(text) : null;

  if (!response.ok) {
    throw new ApiError(readErrorMessage(data, response.status), response.status, data);
  }

  return policy.transformResponse(path, resolveRuntimeResponse(path, data)) as T;
}

/** Same deployment, authentication and request policy as JSON reads; leaves the body streaming. */
export async function apiStreamFetch(path: string, init: RequestInit) {
  const policy = getRequestPolicy();
  const intercepted = policy.intercept(path, (init.method ?? "GET").toUpperCase(), init.body);
  if (intercepted.handled) throw new Error("Streaming chat is unavailable in this workspace");
  const headers = getApiRequestHeaders(init.headers);
  if (init.body && !headers.has("content-type")) headers.set("content-type", "application/json");
  let response: Response;
  try {
    response = await desktopNetworkFetch(toApiUrl(path), {
      ...init,
      headers,
      credentials: getHostedEditorAuthToken() ? "omit" : "include",
    });
  } catch (error) {
    if (!isRequestAbort(error)) policy.observe({ type: "network-error", error });
    throw error;
  }
  policy.observe({ type: "response", status: response.status });
  const token = response.headers.get("set-auth-token");
  if (token) await setDesktopAuthToken(token);
  if (!response.ok) {
    const data = parseJson(await response.text());
    throw new ApiError(readErrorMessage(data, response.status), response.status, data);
  }
  return response;
}

function resolveRuntimeResponse(path: string, data: unknown) {
  const server = getSelectedDesktopServer();
  if (!server || !data || typeof data !== "object") return data;

  const response = data as { websocketUrl?: unknown };
  if (typeof response.websocketUrl !== "string") return data;

  if (/\/pages\/[^/]+\/collaboration-bootstrap(?:\?|$)/.test(path)) {
    return {
      ...response,
      websocketUrl: resolveRuntimeWebSocketUrl(response.websocketUrl, "collaboration", server),
    };
  }

  if (/\/meetings\/[^/]+\/collaboration-ticket(?:\?|$)/.test(path)) {
    return {
      ...response,
      websocketUrl: resolveRuntimeWebSocketUrl(response.websocketUrl, "meeting", server),
    };
  }

  if (/\/meetings\/[^/]+\/recorder\/(?:claim|heartbeat)(?:\?|$)/.test(path)) {
    return {
      ...response,
      websocketUrl: resolveRuntimeWebSocketUrl(response.websocketUrl, "audio", server),
    };
  }

  if (/\/databases\/[^/]+\/realtime-ticket(?:\?|$)/.test(path)) {
    return {
      ...response,
      websocketUrl: resolveRuntimeWebSocketUrl(response.websocketUrl, "realtime", server),
    };
  }

  return data;
}

function createRequestTimeout(signal: AbortSignal | null | undefined, timeoutMs?: number) {
  if (!timeoutMs || timeoutMs <= 0) {
    return {
      cleanup: () => undefined,
      didTimeout: () => false,
      signal: signal ?? undefined,
    };
  }

  const controller = new AbortController();
  let timedOut = false;
  const abortFromCaller = () => controller.abort(signal?.reason);

  if (signal?.aborted) abortFromCaller();
  else signal?.addEventListener("abort", abortFromCaller, { once: true });

  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);

  return {
    cleanup: () => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", abortFromCaller);
    },
    didTimeout: () => timedOut,
    signal: controller.signal,
  };
}

export function isRequestAbort(error: unknown) {
  return (
    typeof error === "object" && error !== null && "name" in error && error.name === "AbortError"
  );
}

export function getApiRequestHeaders(headers?: HeadersInit) {
  const requestHeaders = new Headers(headers);
  const mobileViewerCookie = readEmbeddedMobileAuthCookie();
  const desktopAuthToken = getHostedEditorAuthToken() ?? getDesktopAuthToken();

  if (desktopAuthToken && !requestHeaders.has("authorization")) {
    requestHeaders.set("authorization", `Bearer ${desktopAuthToken}`);
  }

  if (mobileViewerCookie && !requestHeaders.has("x-mobile-auth-cookie")) {
    requestHeaders.set("x-mobile-auth-cookie", mobileViewerCookie);
  }

  return requestHeaders;
}

export async function clearApiAuthToken() {
  await clearDesktopAuthToken();
}

export function authFetch<T>(path: string, body?: unknown, init?: RequestInit) {
  return apiFetch<T>(`/api/auth${path}`, {
    ...init,
    method: init?.method ?? "POST",
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

export function toApiUrl(path: string) {
  if (/^https?:\/\//.test(path)) {
    return path;
  }

  const normalizedPath = path.startsWith("/") ? path : `/${path}`;

  const apiOrigin = resolveApiBaseUrl();

  return apiOrigin ? `${apiOrigin}${normalizedPath}` : normalizedPath;
}

export function resolveApiBaseUrl(
  location = typeof window !== "undefined" ? window.location : undefined,
  desktopServer?: DesktopServer | null,
) {
  return resolveRuntimeApiOrigin(location, desktopServer);
}

function readEmbeddedMobileAuthCookie() {
  if (typeof window === "undefined") {
    return null;
  }

  const cookie = window.__ZILOBASE_MOBILE_AUTH_COOKIE__;

  return typeof cookie === "string" && cookie.trim() ? cookie : null;
}

function parseJson(value: string) {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return value;
  }
}

function readErrorMessage(body: unknown, status: number) {
  if (typeof body === "string" && body.trim()) {
    return body;
  }

  if (body && typeof body === "object") {
    const errorBody = body as ApiErrorBody;

    if (typeof errorBody.message === "string") {
      return errorBody.message;
    }

    if (typeof errorBody.error === "string") {
      return errorBody.error;
    }

    if (errorBody.error?.message) {
      return errorBody.error.message;
    }
  }

  if (status === 401) {
    return "Please sign in to continue.";
  }

  return "Something went wrong. Please try again.";
}
