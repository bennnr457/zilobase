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

Compose app-wide providers in `app/providers/app-providers.tsx`. Keep scoped
providers beside the UI or runtime they serve. Merge tiny provider wrappers into
their existing owner when practical; icon defaults live in `components/icons.ts`
so independent editor roots can use them without importing application startup.

Keep web route declarations and root routes together in `app/routing/router.tsx`,
with screens loaded lazily. Keep route guards, URL validation, shell rendering,
and error surfaces separate; avoid forwarding route-group modules.

Desktop transport, capture, persistence, window, and deep-link adapters live under
`platform`; application state and demo runtime composition live under `app`.
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
