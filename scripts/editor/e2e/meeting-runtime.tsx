import "@/styles/app.css";
import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient } from "@tanstack/react-query";
import { ZilobaseFeaturesProvider } from "@zilobase/features";
import type { SessionUser } from "@zilobase/features/auth";
import type { Editor as TiptapEditor } from "@tiptap/core";
import { ShortcutProvider } from "@/app/shortcuts/shortcut-provider";
import { PageEditorRegistryProvider } from "@/sections/pages/editor/runtime/components/page-editor-registry";
import { useMeetingCollaboration } from "@/sections/pages/editor/extensions/meeting/hooks/use-meeting-collaboration";
import { Editor } from "@/sections/pages/editor/editor";
const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
function Probe({ account, name }: { account: string; name: string }) {
  const user = { id: account, name, email: `${account}@example.com`, image: null } as SessionUser;
  const connection = useMeetingCollaboration("m", user);
  useEffect(() => {
    Object.assign(window, {
      meetingSnapshot: () => ({
        guid: connection.document?.guid,
        status: connection.status,
        synced: connection.synced,
        unsyncedChanges: connection.unsyncedChanges,
        error: connection.error,
        text: connection.document?.getXmlFragment("notes").toJSON(),
      }),
      flushMeeting: connection.flushLocal,
    });
  }, [connection]);
  return connection.document ? (
    <Editor
      session={{
        kind: "meeting",
        documentId: connection.document.guid,
        meetingId: "m",
        pageId: "p",
        collaborationField: "notes",
        collaboration: {
          document: connection.document,
          provider: connection.provider ?? undefined,
          status: connection.status,
          unsyncedChanges: connection.unsyncedChanges,
          synced: connection.synced,
          flushLocal: connection.flushLocal,
          user: connection.user,
          users: [],
        },
      }}
      capabilities={{ content: connection.synced && !connection.error, comments: false }}
      presentation={{ hideMetadata: true, enableComments: false }}
      view={{
        onEditorReady: (editor: TiptapEditor | null) =>
          Object.assign(window, { meetingEditor: editor }),
      }}
    />
  ) : (
    <p>Connecting</p>
  );
}
function Runtime() {
  const [mounted, setMounted] = useState(true);
  const [account, setAccount] = useState("a");
  const [name, setName] = useState("Original");
  useEffect(() => {
    Object.assign(window, {
      mountMeeting: setMounted,
      changeAccount: setAccount,
      changeName: setName,
    });
  }, []);
  const probe = <Probe account={account} name={name} />;
  return !mounted ? (
    <p>Unmounted</p>
  ) : new URLSearchParams(location.search).has("embedded") ? (
    <div className="node-meetingBlock">
      <div className="meeting-block-shell">
        <div className="meeting-collaborative-editor">{probe}</div>
      </div>
    </div>
  ) : (
    probe
  );
}
createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ZilobaseFeaturesProvider
      value={{
        deployment: "meeting-test",
        queryClient,
        apiFetch: async () => ({}),
        auth: { getSession: async () => ({ user: null, session: null }) },
      }}
    >
      <ShortcutProvider>
        <PageEditorRegistryProvider>
          <Runtime />
        </PageEditorRegistryProvider>
      </ShortcutProvider>
    </ZilobaseFeaturesProvider>
  </React.StrictMode>,
);
