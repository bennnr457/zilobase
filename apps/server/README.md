# Zilobase Server

```sh
npm install
npm run db:migrate
npm run dev
```

`npm run dev` starts the normal Node/serverful backend on port `3000`.

## Self-hosted bootstrap and registration

Production Node deployments require `ZILOBASE_BOOTSTRAP_TOKEN`. Submit it only
in the `Authorization: Bearer` or `X-Zilobase-Bootstrap-Token` header to
`POST /api/instance/bootstrap`; query-string and request-body tokens are not
accepted. Bootstrap transactionally creates one verified owner, one pinned
workspace, and an owner membership, then permanently marks the instance as
initialized. The bootstrap token is the initial proof of operator control, so
the owner does not complete an email OTP challenge during setup. The web setup
flow signs that owner in through the normal password endpoint immediately after
bootstrap succeeds.

When upgrading an older self-hosted database, the migration pins its earliest
workspace and treats that installation as already bootstrapped; it does not
create another administrator or workspace.

After bootstrap, registration is `invite-only`. The pinned workspace owner can
read and update `GET/PATCH /api/instance/settings` to choose `invite-only` or
`open`. In open mode, verified accounts become workspace members when their
session is restored. In invite-only mode, Better Auth user creation requires a
pending, unexpired invitation whose workspace and normalized email both match;
the normal invitation acceptance still creates the membership. Hosted runtime
adapters bypass these self-host-only policies.

## Self-hosted object storage

The Node runtime uses `S3_ENDPOINT` for private server-to-object-storage operations and
`S3_PUBLIC_ENDPOINT` when signing browser upload/read URLs. In Compose these are
the internal `http://minio:9000` address and the public object-storage origin,
respectively. Production uses a dedicated TLS hostname proxied by Caddy; local
development exposes RustFS only on loopback. The public endpoint must not use a
subpath and must be reachable by desktop and browser clients.

## Realtime Collaboration

Editable page bodies use Yjs through Hocuspocus. Run the latest Drizzle
migrations before starting the server. The Node runtime serves the collaboration
WebSocket at `/collaboration`; clients obtain short-lived page-scoped tickets
from `POST /pages/:id/collaboration-bootstrap`. Clients request the full Yjs
state on a cold page open and only a short-lived ticket for cached documents.

`COLLABORATION_SECRET` is optional and falls back to `BETTER_AUTH_SECRET`. Set
it separately when collaboration tickets should have an independent signing
key. Set `COLLABORATION_WEBSOCKET_URL` when the public WebSocket origin cannot
be derived from the API request URL, such as behind a development proxy.

## Runtime extension API

The server exports a runtime-neutral extension surface from
`@zilobase/server/adapter-api`. It includes the Hocuspocus factory, ticket
helpers, Yjs conversion helpers, and collaboration runtime callbacks for
alternate runtimes. Node-only migration and server runtime helpers are exported
separately from `@zilobase/server/node-adapter-api` so alternate runtime bundles
do not load filesystem-dependent modules.

## Backend organization

The server separates HTTP adapters, backend operations, infrastructure, and
application composition. Both HTTP routes and services group code by domain;
only substantial subsystems get nested folders.

| Folder                  | Responsibility                                                                                         |
| ----------------------- | ------------------------------------------------------------------------------------------------------ |
| `src/entrypoints`       | Process startup and shutdown                                                                           |
| `src/app`               | Application factory, middleware installation, route registration, extensions, background orchestration |
| `src/routes/<domain>`   | HTTP input validation, request middleware, headers/cookies, response serialization                     |
| `src/services/<domain>` | Domain rules, authorization decisions, database operations, transactions, ordered workflows            |
| `src/infrastructure`    | Database/schema, storage, email, Effect runtime, generic background delivery                           |
| `src/shared`            | Generic configuration, cancellation/crypto utilities, named cross-domain contracts and errors          |
| `src/public`            | Supported runtime-neutral, Node, and realtime package exports                                          |
| `src/scripts`           | Operational and verification commands                                                                  |
| `src/test-support`      | Shared test fixtures and helpers                                                                       |

Routes call services with explicit actors, IDs, validated data, environment, and
extension context. Services never accept Hono contexts or format Hono responses.
Native Request/Headers/Response remain supported at authentication and provider
boundaries. Services may use Drizzle directly; there is no extra repository layer.

See the [core application operation inventory](OPERATIONS.md) for public API
extraction, authorization, retries, cache ownership and unsupported legacy calls.

### Functional owners

- **Auth:** factory at the domain root; session resolution, password inspection,
  and pinned membership in `sessions`; delegated tokens and clients in `oauth`;
  Google token verification in `identity`.
- **Desktop auth:** authorization and session/token operations in services;
  server-rendered HTML, styles, escaping, and CSP in route-local `pages`.
- **Workspaces:** reads/deletion at the root, invitation workflows in
  `invitations`, member changes in `members`, settings updates in `settings`.
  Cross-domain grants/admission/expiry remain in `memberships`.
- **Teamspaces:** lifecycle/management and policy at the root, with
  `membership`, `principals`, `invitations`, and `settings` operation owners.
- **Access:** effective permissions, principal membership, resource lookups,
  and access-level decisions shared by domains. HTTP mismatch responses stay
  in routes.
- **Pages:** `read`, `content`, `hierarchy`, `lifecycle`, `sharing`, `navigation`,
  and `layouts`, plus the existing `graph`, `placements`, `properties`, and
  reusable page mutations. Layout routes retain the `/page-layouts` mount.
  Member page-detail responses include optional `propertyContext`: property IDs,
  accessible row/source targets, and host/source revisions read before the
  property bindings. This lets a client reuse complete authorized database reads
  without returning definitions or values again. Guest/published reads omit this
  context. `/pages/:id/properties` remains the fallback for missing or stale data,
  with its existing page access and workspace checks.
- **Page guests:** invitations, approval requests, workspace guest management,
  and common guest policy, independent from workspace member invitations.
- **Databases:** `lifecycle`, `mutations`, `navigation`, `access`, `commands`,
  `data-sources`, `history`, `read`, `realtime`, `records`, `schema`, `setup`,
  and `views`. Mutation payloads and source clocks stay with mutations.
- **Calendar:** connections, events, sync, realtime, preferences, and provider
  operations. Provider callbacks, webhooks, and configuration HTTP adapters
  have separate owners.
- **Automations:** definition, compilation, triggers, execution, history,
  domain configuration, and actions. Slack and webhook actions have their own
  connector folders.
- **Meetings:** lifecycle, audio, transcription, summary, and contracts.
- **Collaboration:** documents/codecs/update policy, tickets, document
  persistence, mutations, and Hocuspocus runtime composition.
- **Images:** access lookups, uploads/completion/deletion, reads, and domain
  configuration; physical object storage stays in infrastructure.
- **User settings:** preferences and profile operations, with profile images
  under `profile/images`.
- **Instance:** bootstrap/admission policy in `registration`, administration
  in `settings`, discovery/version compatibility in `discovery`.
- **Notifications:** inbox reads/read-state changes versus domain delivery and
  outbox processing.
- **API keys, clips, search, metadata, health, and demo:** independent small
  domains with descriptive implementation files.

### Boundaries and verification

Import owners directly instead of adding forwarding-only internal barrels.
Keep local helpers/tests beside their owner and promote only genuinely shared
support. Database schemas remain centralized and existing migrations are unchanged.
Domain outboxes stay with their services; app background orchestration and
infrastructure delivery remain separate. Runtime implementations stay in the
runtime-adapter package.

`npm run test:architecture` checks backend ownership, cross-layer runtime cycles,
runtime-provider boundaries, and public export compatibility. Server tests also
lock HTTP method/path and middleware registration order. `npm run test:server`
runs coverage, query regressions, and the server build; existing isolated database,
calendar, background, and automation harnesses exercise persistence and delivery.

### Ask AI

Configure `OPENAI_API_KEY` and `AI_MODEL` in the server environment. `AI_MODEL` is
an OpenAI Responses API model ID available to that key; it has no hard-coded
default. Credentials stay on the server. Ask AI uses the same authenticated API
origin for web and desktop, and streams responses from `POST /ai/chat`.

Users attach authorized workspace pages and databases with `@`. Open editor
content is captured for the current turn. Each database source is included once,
with all accessible view configurations. The context inspector reports omissions.

Chat history is private to its creator and workspace. Conversations persist until
explicitly deleted, or until their workspace/account is deleted. Deleting a chat
cascades to its turns. Full source markdown and local editor snapshots are not
stored; historical inspection shows IDs, revisions and coverage. Source access is
rechecked before history is displayed or sent to a model. Inaccessible history
requires a new chat. Generation stops with the request; abandoned turns become
interrupted after the three-minute generation deadline and a short grace period.

Ask AI bounds each source export to 200 records before rendering; all authorized
property definitions and view configurations remain available. The inspector
shows acquired/included totals and any omitted page blocks, records, or history.
Set `AI_CONTEXT_WINDOW_TOKENS` to the configured OpenAI model's context window
(default 32768, minimum 8192). The input budget conservatively uses UTF-8 bytes as
an upper bound for byte-level text tokens, reserves 4096 output tokens plus message
overhead, and keeps the separate 2 MB request and 48000-character context limits.
Metadata that cannot fit blocks the send with a remove-attachment message.
Source citation markers resolve only against the answer's authorized manifest.
Context logging is off by default; local `zilobaseDebugAiContext=1` enables
metadata diagnostics, and `zilobaseDebugAiContextContent=1` additionally opts into
raw content logging. Neither is needed for normal chat.
