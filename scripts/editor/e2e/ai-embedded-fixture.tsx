import "@/styles/global.css";
import "@/styles/app.css";
import "@/sections/databases/styles/database.css";
import { useState } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ZilobaseFeaturesProvider, type ZilobaseAuthClient } from "@zilobase/features";
import { DatabaseSetupCard } from "@/sections/databases/setup/components/database-setup-card";
import { demoDatabaseFixture } from "../../../apps/web/test/support/demo-database-fixture";

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
function Fixture() {
  const [selection, setSelection] = useState<unknown>(null);
  return (
    <div className="mx-auto max-w-4xl p-4" aria-label="Database setup fixture">
      <DatabaseSetupCard
        databaseId="demo-db"
        workspaceId="demo-workspace"
        onComplete={() => {}}
        onDismiss={() => {}}
        onSelectDataSource={async (value) => setSelection(value)}
      />
      <output aria-label="Database setup selection">{JSON.stringify(selection)}</output>
    </div>
  );
}
createRoot(document.getElementById("root")!).render(
  <QueryClientProvider client={queryClient}>
    <ZilobaseFeaturesProvider
      value={{
        deployment: "ai-embedded-test",
        queryClient,
        auth: {
          getSession: async () => ({
            user: { id: "actor" },
            session: { id: "session", userId: "actor", activeWorkspaceId: "demo-workspace" },
          }),
        } as ZilobaseAuthClient,
        apiFetch: async () => demoDatabaseFixture().bootstrap as never,
      }}
    >
      <Fixture />
    </ZilobaseFeaturesProvider>
  </QueryClientProvider>,
);
