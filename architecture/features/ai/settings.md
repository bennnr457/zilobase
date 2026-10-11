# Settings presentation

## Interface

[Shared contracts](../../../packages/features/src/ai-chat/settings-contract.ts) define definitions, drafts, versions and review state for the Ask AI settings screens. The server settings routes, drafts, and publication service are removed. Saving from the UI has no server handler.

## Browser state and presentation

The [draft hook](../../../apps/web/src/features/ai/settings/use-settings-draft.ts) owns the flush queue, storage, cross-tab invalidation and mutation ordering. [Recovery](../../../apps/web/src/features/ai/settings/model/draft-recovery.ts) merges local patches with the incoming snapshot and identifies version conflicts; parsing and storage failures stay in the hook's recovery handler. [Summary rules](../../../apps/web/src/features/ai/settings/model/draft-summary.ts) derive changed fields, tabs and dirty state.

The [settings page](../../../apps/web/src/features/ai/settings/components/agent-settings-page.tsx) keeps state in one composition and uses named render functions for its header, selected capability, instruction pane and version history. These functions do not create component identities or move hooks. Personal tabs are instructions, connectors, activity and versions. [Render tests](../../../apps/web/test/features/ai/settings-page.test.mjs) cover read-only instructions, activity presentation and restore commands.

[Connector setup](../../../apps/web/src/features/ai/settings/model/connector-setup.ts) derives provider availability and connect-button state for personal connectors. [MCP policy rules](../../../apps/web/src/features/ai/settings/model/mcp-tool-draft.ts) distinguish staged policy defaults from saved settings and derive review highlighting. The [action rules](../../../apps/web/src/features/ai/settings/model/draft-actions.ts) retain the save and discard conditions for the settings card. Each model has behavioral coverage under the existing web AI test directory.

[AI overview](README.md).
