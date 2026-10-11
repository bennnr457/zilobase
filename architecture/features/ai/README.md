# AI conversations

## Owning modules and interface

- [apps/web/src/features/ai](../../../apps/web/src/features/ai)
- [packages/features/src/ai-chat](../../../packages/features/src/ai-chat)

The Ask AI web UI remains behind `VITE_FEATURE_ASK_AI`, which is off unless that flag is true. While it is off, the sidebar AI tab, customizer chat actions, editor entry points, floating panel, and `/ai` screen stay hidden. Shared `ai-chat` contracts and hooks stay with that UI.

The server implementation is removed. There are no `/api/ai` routes, chat or settings tables, AI jobs, MCP connector services, MCP egress, or a ChatAgent durable object. The server package does not depend on the AI SDK or the MCP client. Requests the UI still sends to those endpoints have no server handler. Meeting transcription remains the server model call.

## Main flow

Browser conversation state, draft settings, and presentation live in the web feature. Shared contracts describe the request and response shapes the UI still uses. Nothing on the server accepts a turn, publishes settings, or runs a tool.

## Authorization and persistence

Ask AI no longer stores threads, settings, uploads, or connector credentials. Page and database authorization stays with those features. Meeting transcription still uses `OPENAI_API_KEY` and is separate from Ask AI.

## Focused guides

- [Browser conversation state and presentation](conversations.md)
- [Settings presentation](settings.md)

## Verification and change points

Exercise the web feature through [its tests](../../../apps/web/test/features/ai) and the shared [ai-chat tests](../../../packages/features/src/ai-chat). Run the affected workspace scripts described in [testing and quality](../../setup/testing-and-quality.md).

Update this guide when ownership, interfaces, or cross-module flows change. [Architecture index](../../README.md).

## Capability map

| Capability                          | Browser owner                                                                                                                                                      |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Conversation state and presentation | [conversations](../../../apps/web/src/features/ai/conversations): adapters, thread state, models, live effects and components                                      |
| Settings                            | [settings](../../../apps/web/src/features/ai/settings): draft state and settings components                                                                        |
| Ask AI screens                      | [screens](../../../apps/web/src/features/ai/screens) open the personal chat page                                                                                   |
| Context and files                   | [context](../../../apps/web/src/features/ai/context) derives page context; [files](../../../apps/web/src/features/ai/files) handles uploads and prompt attachments |
| Tools and background work           | Conversation elements present tool calls, approvals and results. The server does not execute them.                                                                 |

The [web interface](../../../apps/web/src/features/ai/index.ts) exports `useAiChatThreadState`; routing enters the Ask AI screen explicitly. Reusable conversation primitives stay internal to the feature. The shared package name and `ai-chat` subpaths remain stable. Vite adapter selection and the web harness resolve the conversation location explicitly.

The pure [draft action rules](../../../apps/web/src/features/ai/settings/model/draft-actions.ts) distinguish card visibility, save/discard availability and mutation busy state. [Behavioral tests](../../../apps/web/test/features/ai/settings-actions.test.mjs) cover pending runs, conflicts and read-only actors; the rendered actions retain mutation and toast ownership.
