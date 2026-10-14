import { SettingsHeader } from "./settings-header";
import { Button } from "@/components/ui/button";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemTitle,
} from "@/components/ui/item";
import { getApiErrorMessage } from "@zilobase/features";
import { useOAuthConsents, useRevokeOAuthConsent } from "@zilobase/features/oauth/react";
import { labelForScope } from "@zilobase/features/oauth";

export default function ConnectedAppsSettingsPage() {
  const { consents, error, setError, loading, load } = useOAuthConsents();
  const revokeConsent = useRevokeOAuthConsent();

  async function revoke(id: string) {
    setError(null);
    try {
      await revokeConsent(id);
      await load();
    } catch (cause) {
      setError(getApiErrorMessage(cause));
    }
  }

  return (
    <main className="flex flex-1 flex-col gap-6 px-4 py-8">
      <SettingsHeader
        title="Connected apps"
        description="Apps that can access your Zilobase account. Revoking stops refresh tokens."
      />
      <div className="mx-auto grid w-full max-w-3xl gap-4">
        {error ? <p className="text-sm text-content-secondary">{error}</p> : null}
        {loading ? (
          <p className="text-sm text-content-secondary">Loading…</p>
        ) : consents.length === 0 ? (
          <p className="text-sm text-content-secondary">No connected apps yet.</p>
        ) : (
          <ItemGroup>
            {consents.map((consent) => {
              const client = consent.name ?? consent.clientId ?? consent.client_id ?? "App";
              const scopes = (consent.scopes ?? [])
                .map((scope) => labelForScope(scope).title)
                .join(", ");
              return (
                <Item key={consent.id}>
                  <ItemContent>
                    <ItemTitle>{client}</ItemTitle>
                    <ItemDescription>{scopes || "No scopes"}</ItemDescription>
                  </ItemContent>
                  <ItemActions>
                    <Button onClick={() => void revoke(consent.id)} variant="destructive">
                      Revoke
                    </Button>
                  </ItemActions>
                </Item>
              );
            })}
          </ItemGroup>
        )}
      </div>
    </main>
  );
}
