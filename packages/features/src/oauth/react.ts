import { useCallback, useEffect, useState } from "react";
import { getApiErrorMessage } from "../shared/api-error";
import { useZilobaseFeatures } from "../shared/context";
import type { CreateOAuthAppInput, OAuthApp, OAuthConsent, PublicOAuthClient } from "./contracts";
import {
  createOAuthApp,
  deleteOAuthApp,
  listOAuthApps,
  listOAuthConsents,
  publicOAuthClient,
  revokeOAuthConsent,
  submitOAuthConsent,
} from "./queries";

// Keep the existing explicit loading policy: read once, then reload after writes.
// Automatic retries, background refetches and retained query data change these flows.
export function useOAuthApps() {
  const context = useZilobaseFeatures();
  const [apps, setApps] = useState<OAuthApp[]>([]);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setError(null);
    try {
      setApps(await listOAuthApps(context));
    } catch (cause) {
      setError(getApiErrorMessage(cause));
    }
  }

  useEffect(() => {
    void load();
  }, []);

  return { apps, error, setError, load };
}

export function useOAuthConsents() {
  const context = useZilobaseFeatures();
  const [consents, setConsents] = useState<OAuthConsent[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      setConsents(await listOAuthConsents(context));
    } catch (cause) {
      setError(getApiErrorMessage(cause));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  return { consents, error, setError, loading, load };
}

export function useCreateOAuthApp() {
  const context = useZilobaseFeatures();
  return useCallback((input: CreateOAuthAppInput) => createOAuthApp(context, input), [context]);
}

export function useDeleteOAuthApp() {
  const context = useZilobaseFeatures();
  return useCallback((clientId: string) => deleteOAuthApp(context, clientId), [context]);
}

export function useRevokeOAuthConsent() {
  const context = useZilobaseFeatures();
  return useCallback((id: string) => revokeOAuthConsent(context, id), [context]);
}

export function useSubmitOAuthConsent() {
  const context = useZilobaseFeatures();
  return useCallback(
    (input: Parameters<typeof submitOAuthConsent>[2]) => submitOAuthConsent(context, input),
    [context],
  );
}

export function usePublicOAuthClient(clientId: string | null) {
  const context = useZilobaseFeatures();
  const [client, setClient] = useState<PublicOAuthClient>();
  useEffect(() => {
    if (!clientId) return;
    void publicOAuthClient(context, clientId)
      .then(setClient)
      .catch(() => setClient(undefined));
  }, [clientId]);
  return client;
}
