# Ask AI implementation plan

Status: passes 1–9 implemented and verified. Automatic workspace discovery remains a later extension. This plan stays uncommitted.

## Product outcome

Build normal, read-only chat about workspace information. Users type `@` to attach
pages and databases, then ask questions with follow-ups. They do not need to select
a database view. The model receives full page content, database records once per
source, and all available view configurations within an explicit context budget.

Context is based on selected resources, not the scroll viewport, rendered rows,
collapsed sections, or the currently active database view. Attaching a page
includes its embedded databases. Linked subpages and database row bodies remain
references unless explicitly attached.

Deliver the context workflow before adding model transport. Deliver working chat
before expanding into automatic workspace discovery. Editing pages, executing
database mutations, uploads, external connectors, embeddings, and autonomous
actions are outside this first release.

## Existing foundation

- `packages/page-context` provides page document conversion, database extraction,
  database markdown, context contracts, and the combined markdown builder.
- The database formatter currently repeats source rows per view, uses view-visible
  properties, and describes only part of the view configuration. It must change.
- `packages/features/src/databases/reads.ts` exposes `getDatabaseExport`; its query
  uses the complete-read export endpoint and existing shared entity references.
- Export rows contain nested page metadata, whereas the context builder expects
  flattened row names. An explicit mapping is required.
- `packages/features/src/search` already supports page/database search with
  workspace-scoped query keys and authorized search results.
- Page operations already expose page and content reads. The web editor registry
  exposes `getContentJson()` for open pages.
- Ask AI has full-page, docked, and floating presentation, but the current submit
  handler only appends local user messages. Page/database props are not consumed.
- Migration `0112_remove_ai_backend.sql` drops the old chat/backend tables. Create
  new migrations for this design; do not modify historical migrations.
- `native-ai-boundary.test.mjs` deliberately asserts that the current UI has no
  conversation runtime. Replace that assertion when introducing the runtime.
- There are existing uncommitted AI UI/environment changes. Preserve and integrate
  those changes rather than resetting or replacing them.

## Ownership

| Owner                                  | Responsibility                                                                                                            |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `packages/page-context`                | Portable context contracts, document conversion, normalized markdown rendering, deterministic budgeting, source manifest  |
| `packages/features`                    | Shared reads, context acquisition policy, search/query behavior, chat contracts and operations, cache scope and lifecycle |
| `apps/web/src/sections/ai`             | Mention interaction, attachment chips, context inspection, chat presentation and local UI state                           |
| Web editor runtime                     | Capture current editor JSON through the existing registry; no editor dependencies in features                             |
| `apps/server/src/routes/ai`            | Validate HTTP requests and adapt streaming responses                                                                      |
| `apps/server/src/services/ai`          | Resource authorization, server context acquisition, model execution, conversation operations                              |
| Server infrastructure/runtime adapters | Database persistence and deployment-specific transport/configuration                                                      |

Use one normalized context contract and renderer for client inspection and server
execution. Client and server use their existing domain reads to populate it; do
not make server services import client React hooks or web editor code.

## Pass 1 — Define the context contract and representative fixtures

Deliverables:

- Replace the view-centered database context shape with explicit hosts, sources,
  properties, records, and views. Keep host-to-source associations.
- Identify records by source ID + row ID, retaining page ID and parent-row ID.
  Identify properties with both definition IDs and source binding IDs where used.
- Include page ID/title/path, content provenance, read timestamp and available
  revision markers. Record local editor content as a local snapshot.
- Define completeness per resource/source: total rows when known, included rows,
  omitted rows, unavailable sources, and reasons for partial content.
- Preserve all supported, authorized view configuration fields in a structured
  representation, including nested filter groups, sort order, grouping, column
  visibility/order and view-specific settings. Do not flatten away semantics.
- Define a source manifest tying markdown sections and IDs to navigable resources.
- Add fixtures for linked sources, shared sources across hosts, unused sources,
  multiple views, nested rows, rich properties, and unusual page blocks.

Acceptance: fixtures express the agreed context without needing a selected view,
and every rendered value can be traced to its source and property IDs.

## Pass 2 — Render database records once per source

Deliverables:

- Render each database host's identity and source associations.
- Render each accessible source's identity, all authorized property definitions,
  property types/configuration, and a single records table.
- Include all source properties rather than only properties shown by a view.
  View-hidden is presentation metadata, not an authorization rule.
- Include row ID, page ID, parent-row ID when relevant, title, and property values.
  Use unambiguous property IDs in headers or a nearby schema mapping.
- Render each host's views separately with view ID, source ID, name, type, and full
  supported configuration. Keep configuration structured when prose loses detail.
- Include sources with no views. Reuse a source's records across multiple hosts
  while retaining each host's distinct view configuration.
- Index property values by page/property to avoid repeated linear scans per cell.
- Escape table syntax, newlines, and configuration values. Distinguish missing
  values from valid false, zero, and empty values.

Acceptance: three views of one source produce one records table and three view
descriptions. Hidden columns, linked sources, nested filters and record IDs survive
the conversion. No view filter removes source records from the context.

## Pass 3 — Complete page markdown and combined context rendering

Deliverables:

- Audit conversion against the actual registered editor nodes and marks. Preserve
  headings, lists, tasks, tables, code, math, links, columns and collapsed content.
- Fix lossy or duplicated output, including details/summary handling. Represent
  unsupported blocks explicitly instead of silently dropping meaningful content.
- Keep media, meetings and files as useful references; do not imply that their
  contents have been read or transcribed.
- Preserve page/database block IDs and link body references to database sections.
  Do not recursively expand linked pages or database row bodies.
- Assemble multiple attachments in deterministic order. Deduplicate repeated page
  attachments, embedded databases and shared sources without losing provenance.
- Replace raw string slicing and the current attachment trimming behavior with
  structured section/row budgeting. Always retain valid markdown and omission
  metadata. Return an explicit result when essential metadata itself cannot fit.

Acceptance: a mixed-content page plus embedded databases produces readable markdown
with complete IDs, stable ordering, no repeated record payload, and honest limits.

## Pass 4 — Acquire fresh, authorized resource context

Deliverables:

- Add shared-client context acquisition using existing page/content operations,
  `getDatabaseExport`, QueryClient and entity reference resolvers.
- Map export payloads into context contracts explicitly; do not pass wire types
  directly into the renderer or create another entity cache.
- Discover embedded database IDs from the captured page document. Load all
  accessible linked sources, including sources without views, with bounded
  concurrency and per-build deduplication.
- Accept local page snapshots through an explicit input port. The web adapter
  captures open editor JSON at send time; closed pages use authorized content
  reads. Build from a captured value, not a mutable editor handle.
- Revalidate metadata/access and define when reads must bypass otherwise-fresh
  caches. Available revision markers describe individual reads; do not promise a
  transactionally consistent snapshot across separately fetched resources.
- Capture deployment/account/session/workspace scope before work starts. Cancel
  and discard stale results on scope changes and check scope before publication.
- Failure to load an explicitly selected root blocks that send with a retry/remove
  action. An unavailable embedded resource remains an explicit partial section;
  omit metadata the user is no longer authorized to read.

Acceptance: unsynced edits appear in the captured markdown, cold pages work, shared
sources load once, and a workspace/session switch cannot publish an old build.

## Pass 5 — Implement `@` mentions and a context inspector

Deliverables:

- Add caret-aware `@` detection and page/database search using existing shared
  search queries. Debounce requests and discard stale search results.
- Support keyboard selection, Escape, mouse/touch selection and IME composition
  without breaking Enter-to-send or multiline input.
- Use stable structured attachment references, independent of editable mention
  text. Show removable chips with title, icon and page/database type.
- Do not require a view picker. Do not silently attach the current page: let users
  add it through a visible action using the existing page/database props.
- Show attachment loading, inaccessible and partial states. Keep attachments
  selected for follow-up messages until removed, and capture them again per send.
- Add an inspect action showing rendered markdown, included source counts, and
  omissions. Distinguish a draft preview from the immutable sent snapshot.
- Send waits for the final build. Do not rebuild or serialize large databases on
  every keystroke. Preserve draft text/attachments on failed submission.

Acceptance: users can attach a page and a database with `@`, inspect their combined
context, edit the open page, and see that edit reflected in the next send snapshot.
This pass is usable without a model connection.

## Pass 6 — Add server context assembly and streaming chat

Deliverables:

- Select and pin compatible AI SDK, framework and provider versions before coding.
  The inspected installation contains `ai@6.0.218`, while the registry reports
  `7.0.145`; neither active web nor server manifest currently declares the SDK.
  Prefer establishing the new runtime on current compatible v7 packages after
  checking their bundled docs and deployment support. Do not code against the
  leftover v6 installation or copy removed backend APIs.
- Keep model/provider configuration and credentials on the server. Validate them
  for the chosen deployment and use a configurable model rather than a guessed ID.
- Define validated shared request/response contracts: user text, resource refs,
  local page snapshots, bounded history, request ID, and context version.
- Server services authorize the workspace and every selected/expanded resource.
  Resolve saved page/database content from canonical services and render with the
  same context package. A client markdown preview is not an authorization source.
- Accept bounded, schema-validated local editor snapshots only for authorized
  pages. Treat snapshot contents as user-supplied context, not verified persisted
  content. Independently authorize embedded database IDs found inside them.
- Separate instructions, user input and workspace context. Treat workspace text
  as information, including text that looks like model instructions.
- Add one read-only streaming response path with follow-ups, cancellation and
  useful errors. Abort provider work when the request is canceled where supported.
- Connect shared chat operations to existing web chat chrome. Show preparing,
  streaming, stopped and failed states; retain partial answers on interruption.
- Return the actual server context manifest/coverage to the UI so the inspector
  reflects what was sent, including any changes since client preview.
- With no attachments, allow ordinary chat but clearly avoid claiming workspace
  knowledge. Do not imply that the entire workspace was automatically loaded.

Acceptance: a real question about attached records receives a streamed answer,
follow-ups work, stop works, and unauthorized resource IDs never reach the model.
Verify the deployed Node/Worker targets and desktop transport used by this app.

## Pass 7 — Persist conversations and per-turn source coverage

Deliverables:

- Add new schema/migrations for private workspace-scoped threads, messages and
  turn/source metadata. Reuse existing infrastructure and migration conventions.
- Store attachment refs, context contract version, capture/revision markers,
  coverage, outcome and usage with the relevant turn. Keep source snapshots in
  the same authorized lifecycle if exact sent-context inspection is supported;
  otherwise explicitly show that historical content is not retained.
- Save the user turn before generation and finalize the assistant turn with
  completed, stopped or failed status. Use request IDs to prevent duplicate turns
  on network retry. Define interrupted status when a process dies mid-stream.
- Add create/list/open/delete thread operations and shared query/cache behavior.
  Preserve the active conversation across docked, floating and full-page modes.
- Reauthorize resources before using prior source material in another model call.
  Do not replay revoked source context or derived historical answers into the
  model. Choose an explicit history-access rule rather than relying on thread
  ownership alone; a changed access set may require starting a fresh context.
- Define deletion and retention for messages and retained source snapshots. Do
  not promise background generation or reconnectable streams in this release.

Acceptance: refresh restores the conversation and its attachment refs, retry does
not duplicate messages, interrupted turns are clear, and threads cannot cross
workspace/account boundaries.

## Pass 8 — Ground answers, bound context and make limits visible

Deliverables:

- Use the source manifest for page/database/record citation links. Validate model
  references against the authorized manifest before rendering navigable links.
- Resolve links through existing route builders and embedded-page navigation.
- Allocate a model-aware input budget for instructions, current message, history,
  context and output reserve. Keep byte/character limits as separate transport
  protection; do not treat a character count as an exact token count.
- Preserve source identities, schemas and view configurations where possible,
  then allocate records deterministically across sources. Make any metadata,
  page-body, record or history omission explicit rather than dropping it silently.
- Show included/total rows and partial-resource reasons in the inspector. Tell
  the model that a partial source cannot justify exhaustive counts, absence
  claims, or workspace-wide conclusions.
- For oversized exports, bound acquisition as well as final rendering. Reuse
  existing export pagination if it meets the contract; otherwise add an authorized
  bounded source export read rather than filtering through an arbitrary view.
- Keep diagnostics to counts, timings, revisions and usage by default. Remove
  unconditional development logging of raw workspace markdown; full-content
  diagnostics require explicit local opt-in.

Acceptance: oversized databases remain usable and visibly partial; source links
open the right resources; revoked or fabricated IDs do not become valid citations.
The assistant can explain what its answer covers.

## Pass 9 — Integration verification and release readiness

Deliverables:

- Replace the old no-runtime AI boundary test with checks for the new ownership,
  server-only secrets, and shared client operations.
- Add focused browser scenarios for mentions, latest editor content, embedded and
  directly attached databases, duplicate sources, retries, stop, persisted threads,
  presentation changes, and workspace switches during preparation/streaming.
- Verify meaningful data cases: hidden properties, all view configs, linked
  sources, no-view sources, nested rows, formulas/relations, empty values,
  inaccessible resources, malformed editor JSON, and context over budget.
- Exercise server authorization, late results, duplicate requests, provider
  failure, process interruption and access revocation between turns.
- Use deterministic provider fixtures for transport tests and a small live-model
  smoke check for end-to-end behavior. Avoid asserting exact generated wording.
- Run affected package/server tests, web tests, workspace typechecks, lint,
  formatting, architecture checks and affected builds. Verify migrations on a
  fresh database and the current schema. Preserve existing feature flag behavior.

Acceptance: the first release supports dependable attached-context chat in all
existing Ask AI presentations, with explicit scope, usable errors and no silent
loss of context.

## Later pass — Automatic workspace discovery

After attached-context chat is stable, add read-only workspace search, page reads
and bounded source record queries as model tools. Reuse the same authorization,
normalized context contracts, manifests and coverage rules. Use the SDK's supported
tool orchestration rather than introducing a custom model loop.

This enables questions without `@` attachments and targeted retrieval from large
sources. A view-specific request such as “summarize the Active Projects view” can
then use that view's real query semantics. It does not change the default rule
that an attached database supplies its sources and all view configurations.

## Execution order and completion gates

| Milestone           | Passes     | Reviewable result                                                             |
| ------------------- | ---------- | ----------------------------------------------------------------------------- |
| Context engine      | 1–4        | Correct markdown, IDs, acquisition, deduplication and structured limits       |
| Attachment workflow | 5          | `@` selection and inspectable send-time context without a model               |
| Working chat        | 6          | Real read-only streamed answers and follow-ups                                |
| Persistent chat     | 7          | Reloadable threads with per-turn coverage and access rules                    |
| First release       | 8–9        | Grounded links, bounded acquisition, visible limits and verified integrations |
| Workspace discovery | Later pass | Model-assisted search and targeted reads beyond explicit attachments          |

Keep each pass independently reviewable. Add focused tests with the pass that owns
the behavior; pass 9 verifies integration rather than postponing all testing.
Choose concrete model/provider deployment settings and retention policy in their
owning passes; they do not block work on the context engine or attachment UI.
