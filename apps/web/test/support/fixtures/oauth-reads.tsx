import { createElement } from "react";
import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";
import { QueryClient } from "@tanstack/react-query";
import { ZilobaseFeaturesProvider, type ZilobaseFeaturesConfig } from "@zilobase/features";
import {
  useOAuthApps,
  useOAuthConsents,
  usePublicOAuthClient,
} from "@zilobase/features/oauth/react";

export function mountOAuthReads(container: HTMLElement) {
  const requests: string[] = [];
  let fail = false;
  const queryClient = new QueryClient();
  const output: {
    apps?: ReturnType<typeof useOAuthApps>;
    consents?: ReturnType<typeof useOAuthConsents>;
    client?: ReturnType<typeof usePublicOAuthClient>;
  } = {};
  const value: ZilobaseFeaturesConfig = {
    queryClient,
    deployment: "oauth-test",
    auth: {
      getSession: async () => ({ user: null, session: null }),
    } as ZilobaseFeaturesConfig["auth"],
    apiFetch: async <T,>(path: string) => {
      requests.push(path);
      if (fail) throw new Error("Offline");
      return (
        path.endsWith("get-clients")
          ? { clients: [{ client_id: "app" }] }
          : path.endsWith("get-consents")
            ? [{ id: "consent" }]
            : { client_name: "Client" }
      ) as T;
    },
  };
  function Probe({ clientId }: { clientId: string | null }) {
    output.apps = useOAuthApps();
    output.consents = useOAuthConsents();
    output.client = usePublicOAuthClient(clientId);
    return null;
  }
  const root = createRoot(container);
  const render = (clientId: string | null) =>
    flushSync(() =>
      root.render(
        createElement(ZilobaseFeaturesProvider, { value }, createElement(Probe, { clientId })),
      ),
    );
  render("client");
  return {
    output,
    requests,
    render,
    fail() {
      fail = true;
    },
    close() {
      flushSync(() => root.unmount());
      queryClient.clear();
    },
  };
}
