export function register({ readSource, assert, test }) {
  test("all meeting content uses one collaborative rich-text editor", async () => {
    const [
      summaryEditorSource,
      meetingViewSource,
      meetingPageSource,
      editorStyles,
      extensionSource,
      editorExtensionHookSource,
      meetingCollaborationSource,
    ] = await Promise.all([
      readSource(
        "/src/sections/pages/editor/extensions/meeting/components/meeting-collaborative-editor.tsx",
      ),
      readSource("/src/sections/pages/editor/extensions/meeting/components/meeting-view.tsx"),
      readSource("/src/sections/meetings/meeting-screen.tsx"),
      readSource("/src/sections/meetings/styles/meeting.css"),
      readSource("/src/sections/pages/editor/runtime/lib/create-base-extensions.ts"),
      readSource("/src/sections/pages/editor/runtime/hooks/use-editor-runtime.ts"),
      readSource(
        "/src/sections/pages/editor/extensions/meeting/hooks/use-meeting-collaboration.ts",
      ),
    ]);

    assert.match(summaryEditorSource, /import \{ Editor \}/);
    assert.match(summaryEditorSource, /collaborationField: field/);
    assert.match(summaryEditorSource, /user,\s+users: \[\]/);
    assert.match(summaryEditorSource, /database: editable/);
    assert.match(summaryEditorSource, /editorTabIndex: 0/);
    assert.match(summaryEditorSource, /onPointerDownCapture=\{focusNestedEditor\}/);
    assert.match(summaryEditorSource, /documentId: document\.guid,\s+pageId/);
    assert.match(meetingViewSource, /const transcriptEditable\s*=\s*editable/);
    assert.match(
      meetingViewSource,
      /editable=\{\s*transcriptEditable\s*&&\s*collaboration\.synced/,
    );
    assert.match(meetingViewSource, /livePreview=\{transcriptPreview\}/);
    assert.match(meetingViewSource, /useMeetingCollaboration\(meetingId, session\?\.user\)/);
    assert.match(meetingViewSource, /user=\{collaboration\.user\}/);
    assert.match(meetingCollaborationSource, /setAwarenessField\("user", collaborationUser\)/);
    assert.match(meetingCollaborationSource, /autoConnect: false/);
    assert.match(meetingCollaborationSource, /activeProvider\s*\.connect\(\)/);
    assert.match(
      meetingViewSource,
      /collaboration\.document && collaboration\.provider && collaboration\.user/,
    );
    assert.match(meetingViewSource, /resolveMeetingTranscriptPreview/);
    assert.doesNotMatch(meetingViewSource, /LiveTranscriptDraft/);
    assert.match(summaryEditorSource, /"notes" \| "summary" \| "transcript"/);
    assert.match(meetingViewSource, /field=\{activeTab\}/);
    assert.match(meetingViewSource, /pageId=\{meeting\.pageId\}/);
    assert.match(meetingViewSource, /setActiveTab\("summary"\)/);
    assert.match(
      meetingViewSource,
      /TabsTrigger[\s\S]*?className="capitalize"[\s\S]*?width="content"/,
    );
    assert.doesNotMatch(meetingViewSource, /useMeetingTranscript/);
    assert.doesNotMatch(meetingViewSource, /MeetingNotesEditor/);
    assert.match(extensionSource, /field: collaborationField/);
    assert.match(
      extensionSource,
      /MeetingBlock\.configure\(\{[\s\S]*?editorRuntime: databaseEditorRuntime/,
    );
    assert.match(editorExtensionHookSource, /collaborationField,\s+documentKey/);
    assert.match(
      editorExtensionHookSource,
      /collaboration\?\.awareness \|\| collaboration\?\.provider\?\.awareness/,
    );
    assert.match(meetingPageSource, /PageMetadata as PageMetadataHeader/);
    assert.match(meetingPageSource, /onCoverChange=/);
    assert.match(meetingPageSource, /onIconChange=/);
    assert.match(meetingPageSource, /showTitle=\{false\}/);
    assert.match(
      editorStyles,
      /\.meeting-block-shell-full \.meeting-collaborative-editor[\s\S]*margin-left: -3\.5rem/,
    );
    assert.match(
      editorStyles,
      /\.meeting-block-shell-full > \.meeting-block-header \{[\s\S]*@apply mt-6 py-2/,
    );
  });
}
