import { useCallback, useEffect, useState } from "react";
import { useZilobaseFeatures } from "../shared/context";
import { getApiErrorMessage } from "../shared/api-error";
import { listOAuthApps, listOAuthConsents, publicOAuthClient } from "./queries";
import { createOAuthApp, deleteOAuthApp, revokeOAuthConsent, submitOAuthConsent } from "./queries";
import type { CreateOAuthAppInput, OAuthApp, OAuthConsent, PublicOAuthClient } from "./contracts";

// Keep the existing explicit loading policy: read once, then reload after writes.
// Automatic retries, background refetches and retained query data change these flows.
export function useOAuthApps() {
  const { apiFetch } = useZilobaseFeatures();
  const [apps, setApps] = useState<OAuthApp[]>([]);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setError(null);
    try {
      setApps(await listOAuthApps(apiFetch));
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
  const { apiFetch } = useZilobaseFeatures();
  const [consents, setConsents] = useState<OAuthConsent[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      setConsents(await listOAuthConsents(apiFetch));
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
  const { apiFetch } = useZilobaseFeatures();
  return useCallback((input: CreateOAuthAppInput) => createOAuthApp(apiFetch, input), [apiFetch]);
}

export function useDeleteOAuthApp() {
  const { apiFetch } = useZilobaseFeatures();
  return useCallback((clientId: string) => deleteOAuthApp(apiFetch, clientId), [apiFetch]);
}

export function useRevokeOAuthConsent() {
  const { apiFetch } = useZilobaseFeatures();
  return useCallback((id: string) => revokeOAuthConsent(apiFetch, id), [apiFetch]);
}

export function useSubmitOAuthConsent() {
  const { apiFetch, auth } = useZilobaseFeatures();
  return useCallback(
    (input: Parameters<typeof submitOAuthConsent>[2]) => submitOAuthConsent(apiFetch, auth, input),
    [apiFetch, auth],
  );
}

export function usePublicOAuthClient(clientId: string | null) {
  const { apiFetch } = useZilobaseFeatures();
  const [client, setClient] = useState<PublicOAuthClient>();
  useEffect(() => {
    if (!clientId) return;
    void publicOAuthClient(apiFetch, clientId)
      .then(setClient)
      .catch(() => setClient(undefined));
  }, [clientId]);
  return client;
}
