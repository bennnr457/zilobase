# Zilobase contributor instructions

These instructions apply throughout this repository. Implement client features so
web and a future React Native application can use the same backend operations,
TanStack Query behavior, TanStack DB collections, and mutation/cache rules.

## Where code belongs

- `packages/features` is the shared client. It owns API contracts and requests,
  query keys/options, query and mutation hooks, canonical entity collections,
  invalidation, optimistic updates, reconciliation, domain controllers, and pure
  domain models.
- `apps/web/src/components/<domain>` owns domain screens, widgets, local hooks,
  and presentation state. `components/ui` contains generic UI primitives; shared
  calendar renderers live in `components/calendar/primitives`. `app` owns startup,
  providers, routing, shortcuts, and the shell. `platform` owns
  physical web/desktop adapters; `lib` contains web presentation helpers and
  `styles` contains global styles. Keep editor, canvas, Tiptap, Yjs collaboration,
  comments Yjs, Ask AI chrome, meeting capture, demo runtime, Electron, and database
  view geometry here.
  Keep form/screen state machines beside their screens.
  Place brand artwork in `components/branding` and generic widgets in `components/ui`.
  Keep Notion import hooks at their domain root and conversion in `conversion`.
  Import implementation owners directly across web; do not add forwarding-only
  index modules or re-export shared features through web UI modules.
  Database route composition lives in `components/databases/screen`, embedded
  blocks in `blocks`, row-page properties in `page-properties`, and property
  editors/settings in `properties`. Keep shared view UI in `views/shared`, view
  settings in `views/settings`, and local view commands in `views/commands`;
  preserve distinct view renderers, geometry, controllers, and lifecycle owners.
- A future `apps/mobile` will own native screens, navigation, and native adapters.
  It will import `@zilobase/features`. Do not create the mobile app as a side
  effect of ordinary web changes.
- Server HTTP handlers and HTTP-specific support belong in
  `apps/server/src/routes/<domain>`. Backend operations and domain rules belong in
  `apps/server/src/services/<domain>`. Keep database, storage, queues, and other
  infrastructure in `apps/server/src/infrastructure`, and application composition
  in `apps/server/src/app`. Route modules call services without changing public
  HTTP paths or authorization behavior.

Keep screens and their local hooks together under their domain rather than
creating another `components` directory inside each domain. Retain meaningful
subsystems such as editor collaboration and database table/kanban/timeline
renderers. Reserve the `features` folder name for `packages/features`.

Keep sidebar composition and private navigation/workspace/section renderers in
`app/shell/sidebar/app-sidebar.tsx`; controller composition, local state, storage,
and Effect commands live in `sidebar-controller.ts`. Keep the customization editor
and its shared tab/icon presentation in `sidebar-customization.tsx` so its preview
has no import cycle through the app sidebar. Reuse the shadcn sidebar-07 primitive
structure in `components/ui/sidebar.tsx`, with CSS-variable widths, offcanvas
collapse, and Zilobase tokens. Keep right-panel sizing in `app/shell/panels/tool-panels.tsx`.
Import shared configuration commands from features directly and library labels/icons
from `components/library`; avoid a shell navigation barrel or forwarding modules.
Use Effect for fallible shell storage, native profile workflows, clipboard actions,
and ordered creation/navigation commands. Preserve storage keys, debounce timing,
best-effort fallbacks, and stale-result checks. Keep layout geometry and React view
state plain.

Keep shell composition at `app/shell/app-shell.tsx`, the fallback screen header
in `app/shell/header`, favicon installation/conversion beside the shell, and tool-panel
composition in `app/shell/panels`, and settings shell/dialogs in `components/settings/shell` with section screens
in `components/settings/sections`. Workspace settings, members, guests, invitations,
and page access gates live under the matching workspace subfolders; keep their
hooks beside their UI without nested components/commands/model buckets. Teamspace
UI and local hooks stay together at the teamspace domain root. Route-mounted
screens use explicit `*-screen.tsx` names; route settings use `*-settings-screen.tsx`. Page chrome and body scrolling belong to
`components/pages/layout/page-layout.tsx`, with one placement-aware header in
`components/pages/header/page-header.tsx`. Main routes, desktop panes, and desktop dialogs compose
this layout around the existing editor body. Page presentation state, opening/closing commands, and promotion live in
`components/pages/presentation/page-presentation.tsx`; pane rendering owns geometry,
and dialog rendering owns focus and dismissal. Hosts do not duplicate page headers
or scroll viewports. Shared viewport rendering lives in `components/ui/scroll-viewport.tsx`.
Page design customization belongs in `components/pages/design`, separate from the
page layout frame. Page content owns the editor lifecycle; breadcrumb UI belongs
in `components/navigation/breadcrumbs.tsx`.
Mobile embedded page requests navigate to main routes before consulting desktop
presentation preferences. Keep the embedded-page dialog lazy and domain-owned;
do not reintroduce a shell forwarding host or a separate authenticated-page module.
Shared header/sidebar actions and their hooks live in `components/navigation`;
page/database sharing UI and its hook live in `components/sharing`. Import these
owners directly; page headers must not import them through the shell sidebar.
Shared route identifiers and navigation icons belong in navigation; SVG icon
helpers belong in `components/ui/icon-svg.ts`. Avoid domain forwarding barrels.
Use Effect for clipboard and duplicate/navigation sequences while Query retains
mutation ownership and React retains form/screen state.
Load settings and embedded-page dialogs lazily. Route workspace settings directly
to its owning component instead of adding a shell forwarding screen.

Compose app-wide providers in `app/providers/app-providers.tsx`. Keep scoped
providers beside the UI or runtime they serve. Merge tiny provider wrappers into
their existing owner when practical; icon defaults live in `components/icons.ts`
so independent editor roots can use them without importing application startup.
Provider adapter workflows use Effect for session recovery, ordered cleanup, and
fallible storage. Keep their auth ports Promise-based and React lifecycle/context
composition unchanged; avoid adding another runtime or service layer.

Keep web route declarations and root routes together in `app/routing/router.tsx`,
with screens loaded lazily. Keep route guards and URL validation separate. Group
the shell, pending UI, authenticated fallback, and edition host in `route-shell.tsx`;
keep global error recovery in `route-error-page.tsx` and load it lazily. Avoid
forwarding route-group modules and extra files for small route surfaces.
Keep authentication, onboarding, OAuth, start-page, and share-access workflows
together in `guards.ts`. Compose them as Effects; `router.tsx` declares routes and
runs them with `Effect.runPromise` at the router adapter boundary. Preserve original
errors and redirect responses.
Use `Effect.runSync` for synchronous guards and browser actions to preserve
callback timing.
Compose routing helpers directly as Effects; convert to Promises only in router
callbacks or when supplying an existing Promise-based shared-client port.
Interrupt asynchronous UI fibers in React cleanup to prevent late state updates.
TanStack Query retains request/cache/retry ownership; keep rendering and URL
parsing straightforward without extra Effect services or layers.

Desktop transport, capture, persistence, window, and deep-link adapters live under
`platform`; application state and demo runtime composition live under `app`.
Web startup configuration lives in `apps/web/src/app/startup.ts`; keep request,
session, and meeting-capture installation together and preserve bootstrap order.
Desktop session switching and replacement composition live in `app/desktop-session.ts`;
the replacement dialog controller lives in `components/desktop/servers`.
Group desktop presentation under window, tabs, servers, auth, updates, deep-links,
and diagnostics. Import their owners directly; platform operations stay in platform.
Keep native operations in `platform` and avoid recreating an `app/runtime` folder.
Use Effect for startup installation and desktop session workflows. Run synchronous
installation and browser callbacks with `Effect.runSync`; keep native/cleanup ports
Promise-based with `Effect.runPromise` at their boundaries. Preserve candidate
verification counters, cleanup order, and the two-frame React teardown wait.
Use finalizers for revocation timer cleanup without changing its timeout scope.
Web build feature flags and desktop environment checks live together in
`apps/web/src/platform/environment.ts`. Keep Vite environment reads in web and
reuse this module instead of creating a single-file application config folder.
Server HTTP handlers, middleware, and route-specific support live in `routes`;
backend domain operations and models live in `services`. Do not recreate
application `src/features` or web `src/shared` directories.

If a file calls the backend or encodes domain rules and needs no platform/UI
APIs, it belongs in features. If it mixes domain work with platform behavior,
split the domain work into features and keep the last-step adapter in the app.
Being pure alone does not make a form model or pixel-layout helper shared domain
code.

Do not import app code, `window`, `document`, browser storage, IndexedDB,
Electron, DOM geometry, CSS, routers, React DOM, Tiptap, or Yjs into features.
Accept search strings, callback URLs, deployment identity, and platform-dependent
values as arguments. React hooks are allowed in the domain's React entrypoint.

## Initialization and platform ports

Reuse `createZilobaseClient`, `ZilobaseFeaturesProvider`, `ApiFetcher`,
`ZilobaseAuthClient`, `ClientLifecycle`, and `ClientCacheStorage` from the existing
package. Web's composition is
[features-provider.tsx](apps/web/src/app/providers/features-provider.tsx).

- Use one QueryClient and shared-data registry per application runtime. Pass the
  same client to initialization, providers, imperative reads, and controllers.
- Supply deployment identity explicitly. Isolate data by deployment, account,
  session, workspace, and guest/public capability as applicable.
- Keep transport, credentials, connectivity/app visibility, and physical storage
  in platform adapters. Keep backend operations and domain/cache policy shared.
- Dispose subscriptions, controllers, realtime connections, and owned cache
  state when their runtime or identity ends.

When the native app is explicitly requested, implement these ports for native
networking/authentication, app lifecycle, and storage; compose the existing
provider; then build native screens using the shared domain hooks/controllers.
Do not duplicate the web API client, query keys, collections, or mutation logic.

## Query, collections, mutations, and persistence

- TanStack Query owns request lifecycles, pagination, result references, and
  invalidation. TanStack DB owns canonical entities and coherent publication.
  Domain controllers own pending intentions and reconciliation.
- Use existing domain reads and commands. Do not introduce another entity cache
  or app-local API mutation to bypass shared behavior.
- Capture identity/scope when asynchronous work starts. Check it before applying
  results, acknowledgements, optimistic updates, or rollbacks. A response from an
  old identity must never write into the next identity's cache. Clearing the
  mutation cache does not cancel an executing mutation's callbacks.
- Preserve revision checks, repeated-edit ordering, pending-write protection,
  authorization, rollback, and realtime reconciliation semantics.
- Features owns restore/revision/retention and scoped-clearing rules; storage
  adapters own physical transactions and platform APIs. Preserve existing web
  database names, schemas, upgrades, budgets, and durable data during changes.
- Persistence is an optional capability in the client configuration. Avoid making
  new online domain behavior depend on a durable storage implementation. Persist
  supported payloads, not live collection references or transient UI previews.

## Hosted editor and future native integration

The editor remains web code. Document design rendering belongs in
`components/editor/document-design`, distinct from page frame layout and page
design customization. Keep editor runtime, collaboration, hosted bootstrap,
operations, selection, and drag/drop as distinct subsystems.

Ask AI presentation is grouped into chat, composer, attachments, workspace, and
styles beneath `components/ai`; import owning files directly rather than an
elements barrel.

The editor remains web code. Native screens will open the hosted editor in a
WebView through the existing `/editor` route and versioned bridge contracts in
[editor-bridge.ts](packages/features/src/pages/editor-bridge.ts).

The native app and WebView are independent JavaScript runtimes. They share client
implementation and backend data; they do not share a live QueryClient, TanStack
DB collection instance, Yjs document, or editor history. The WebView owns its
editor, Yjs state, and cache instances.

Validate bridge version, instance, request IDs, and deployment/account/session/
workspace scope. Keep bridge credentials in memory and out of persisted cache
payloads and logs. Send navigation requests to the host. Notify native consumers
of affected records after confirmed changes so their own queries invalidate.
Local flush acknowledges durable local storage; it does not acknowledge server
synchronization. Preserve that distinction for flush, close, reconnect, and
identity teardown. Hosted startup requires connectivity; bundled offline editor
assets remain deferred.

## Imports and implementation style

- Keep `@zilobase/features` as one package. Do not add an SDK, parallel client
  package, or speculative adapter framework.
- Use the package root for initialization and ports,
  `@zilobase/features/<domain>` for domain APIs/models, and
  `@zilobase/features/<domain>/react` for hooks. Server consumers use
  `@zilobase/features/runtime`. Avoid private package imports and internal barrel
  cycles.
- Follow neighboring contracts, queries, hooks/`react.ts`, cache, models, and
  commands. Consolidate trivial forwarding layers, but retain distinct complex
  subsystems. Extract existing shareable behavior rather than inventing future
  abstractions.
- Preserve behavior and unrelated working changes. Keep refactors in coherent,
  independently verified passes; follow the requested commit boundaries.
- Do not recreate `architecture/`. Update `CONTEXT.md` only when domain
  terminology changes.

## Verification

For shared-client changes, run features tests, web tests, workspace typechecks,
lint, formatting, and architecture checks:

```sh
npm test --workspace @zilobase/features
npm run test:web
npm run typecheck
npm run lint
npm run fmt:check
npm run test:architecture
```

Add focused integration/browser checks for the affected subsystem. Exercise
identity changes and late results, optimistic failure/repeated edits, revisions,
realtime reconciliation, and storage failure/restart/clearing when relevant.
Editor changes need host/editor isolation, navigation, invalidation, flush versus
sync, reconnect, and teardown coverage. Changes to package exports or dependencies
also need affected workspace tests and builds. Scale checks to the change; a
documentation-only edit needs formatting and link validation.

## Existing migration gaps

The current implementation is a foundation, not proof that every boundary is
complete. When working in these areas, address and test the remaining gaps:

- Late mutation success/rollback callbacks can cross account changes.
- Calendar currently requires its storage adapter despite optional persistence.
- Offline session restoration/logout cleanup and image-upload API/domain work
  still have ownership in web that should be split into shared policy and adapters.
- The editor bridge has a lifetime request-count limit that can block close, and
  embedded meeting navigation/detail invalidation is incomplete.

These are migration gaps, not patterns to repeat. Remove entries as they are fixed.
