# Database responsiveness verification — 2026-10-24

Prepared for one PR: six sequential phases, 18 commits. No production deployment or schema
migration. Public paths, protocol version 2, command schemas, atomic `row.change`,
canonical collections, receipt replay and source-lane serialization are retained.

## Measured results

Local environment: macOS arm64, Node 26.8.2, Chrome, disposable PostgreSQL
17.10/pgvector 0.8.7 and Valkey containers. Browser measurements use the real
signed-in application with three records, a checkbox property and table/board
views. Responses are held until the expected optimistic state is visible.

| Scenario                       | Before / baseline                                                                                                                                      | Verified result                                                                                                                                                         |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Healthy idle                   | Unversioned Cloudflare `realtime.pong` was parsed as invalid; live investigation observed bootstrap/records traffic at the 20-second heartbeat cadence | Five deterministic pong deliveries: zero bootstrap/records reads. Signed-in Node: three actual 20-second heartbeat sends, zero database reads                           |
| Ordinary loaded checkbox edit  | Live inspection already showed one command without an immediate GET; later heartbeat traffic obscured this                                             | Six signed-in edits: six `row.change` POSTs, zero bootstrap/records GETs; visible feedback before each response                                                         |
| Visible feedback               | No comparable baseline latency recorded                                                                                                                | Six browser event-to-checked-state samples in the accompanying JSON; approximately 5–7 ms in the initial run, below the approximately 50 ms target on this fixture      |
| Cumulative pagination          | Retaining 50/100/150-row windows made recovery replay three reads / 300 transferred rows                                                               | One retained window and matching page parameter; recovery issues one 150-row read                                                                                       |
| Equivalent views               | Idle, hover and focus could schedule equivalent prefetch work                                                                                          | Complete query keys share pending prefetches and fresh windows; fresh equivalent table/board/gallery prefetches issue zero reads                                        |
| Duplicate event / delivery gap | Invalid or missing delivery requires recovery                                                                                                          | Three duplicate content deliveries issue zero reads; a genuine gap causes one bootstrap and one records read                                                            |
| Permanent record read failure  | Permissive retry override attempted a 403 three times                                                                                                  | 401/403/404 attempted once; transient reads retain the shared retry policy; dedicated stale-window recovery remains                                                     |
| Content-only server edit       | Full active-source listing plus duplicate acquisition of an already-owned source lane                                                                  | Three target-row SELECTs at both 2 and 252 source records, no active-source listing; one framework-owned lane is reused                                                 |
| Unrelated rendering            | Global publication revision invalidated every database projection                                                                                      | Presence publication changes no mounted record model; database B's edit changes neither A's table nor A's board model; B's unchanged sibling row does not rerender      |
| Kanban                         | Shared row commands already existed; earlier failed automation was not proof of a product drag defect                                                  | Native reorder, cross-column placement/status, sorted confirmation/cancellation, repeated moves and the real embedded board pass; one atomic command per completed drop |

Server timings are evidence, not CI thresholds. Ten title edits per source size
measured p50/p95 of 21.90/24.54 ms at 2 rows and 21.82/25.50 ms at 252 rows in the
isolated run. These are command execution timings, not end-to-end interaction
latency. Browser feedback timings measure the DOM checked-state update, excluding
the following paint and physical display delay. The three target SELECTs read the row for validation and before/after
facts. Property, journal, receipt and outbox work remains required.

Node's adapter handles heartbeat pings without sending a pong. Its signed-in
check therefore counts real outgoing pings. The unversioned Cloudflare reply is
covered by deterministic parser/manager/request-budget tests and hosted adapter
compatibility tests. This PR has not been deployed to measure hosted behavior.

## Commit and ownership boundaries

1. Heartbeat parsing; status-aware read retry; recovery errors scoped by host and
   failed query category.
2. One cumulative window; scope-aware recovery coordination with newest required
   versions; complete-key prefetch deduplication and idle-work cleanup.
3. Pending property intentions through one authorization refresh; sparse shared
   projections preserving newer edits; native drag and command lifecycle tests.
4. Target-only content lookup; transaction lock ownership reuse; bounded lookup,
   concurrency, replay, linked-host and automation-fact checks.
5. Coherent scoped publications; stable canonical-derived row projections;
   scoped intentions/pending controls and presence/render regression coverage.
6. Request budgets; real signed-in responsiveness/account/reconnect workflows;
   this evidence and rollout procedure.

The browser gate also exposed a table marquee bug: the clipped horizontal scroll
content was an unstable vertical anchor. The existing controller now uses the
record surface for Y coordinates while retaining horizontal scroll coordinates.
All 24 marquee checks pass, including selection of rows unmounted by edge scroll.
Final verification also replaced one retired `accent-accent` utility with the
existing `accent-action-primary` token so the full web token boundary passes.

## Reproduction and gates

Run from the repository root:

```sh
npm test --workspace @zilobase/features
npm run test:web
npm run typecheck
npm run lint
npm run fmt:check
npm run test:architecture
npm run test:databases:acceptance
npm run test:databases:browser
ZILOBASE_APP_MEASUREMENTS=/tmp/zilobase-responsiveness.json npm run test:databases:app-browser
npm run test:databases:isolated
```

The acceptance command also runs affected server and Node runtime-adapter tests
and server/web builds. The signed-in runner starts isolated services, then removes
only those services. Its screenshots remain under `.dev/database-app-results/`,
including `kanban.png` and `embedded-kanban.png`. Its optional measurements include
fixture size, browser feedback samples, request sizes, heap and retained-cache
snapshots. No command body, cookie or authentication token is needed in the report.

The signed-in workflows cover delayed responses, cross-view previews, independent
peer convergence, reconnects, rejected writes, side panes, full-page promotion,
dialog/mobile navigation, actual embedded databases and all seven view layouts.
A separately authenticated fixture account replaces the mounted session while an
old committed response is held; delivering it afterward must not restore the old
account's visible records. The focused property browser suite also verifies
permission denial and account changes with a late property read.

Stale authorization coverage retains the existing 30-second rule. Missing, stale
or invalidated membership causes one shared refresh; the latest unsent property
intention supersedes its predecessor. Refreshing does not authorize a write until
one exact eligible target is proven. Removed, denied or ambiguous targets fail
visibly. Confirmed writes are distinct from failed synchronization reads.

### Final gate results

- Shared features: 591 passing tests.
- Full web tests, workspace typechecks, lint, formatting and architecture: pass.
  Lint retains pre-existing warnings outside this change.
- Database acceptance: pass, including 91 server and 16 affected Node adapter tests,
  database web coverage and server/web builds.
- Full database browser suite: 129 passing tests in one clean final run.
- Signed-in app browser: pass, including delayed edits and delivered late acknowledgement
  after a real account change. Local UI/measurement artifacts are reproducible above.
- Hosted build, adapter/Worker suites and deployment dry run: pass.
- Additional isolated persistence harness: fails only at the unchanged cold-search
  assertion described below, after the new content-work checks pass.

An earlier combined browser run exposed a paste assertion that checked later cells
as soon as the first cell settled. It now polls the full expected pasted tuple,
matching the existing ordered delivery. The final full browser run required no retry.

### Hosted compatibility

From the sibling `zilobase-cloudflare-adapter` checkout:

```sh
npm run build
npm test
npm run deploy:check
```

These passed locally: adapter typecheck, 82 tests (one skipped), 14 Worker tests,
identity/binding compatibility, migration planning and the full stack dry run.
The dry run explicitly reported that no migration or deployment was performed.
Do not run a deploy command without `--dry-run` for this verification.

### Known unrelated baseline failure

The additional `test:databases:isolated` harness passes the new bounded-work,
replay, automation facts, shared-host and concurrent edit/move/archive assertions,
then fails its existing cold-search access assertion: the second actor receives
`Confidential roadmap` where the fixture expects `Launch plans`. Running the
original verification script from `main` against another empty isolated database
reproduces the same failure before these new budget checks are present. Search
and access implementation files are unchanged by this PR. This is not counted as
a passing harness or silently relaxed; investigate it independently before using
that full harness as a release gate.

## PR baseline

This implementation was prepared on existing local `main` at `25e4d7c7b1`.
GitHub `main` is `c375e4cd56`, 34 existing commits behind that local baseline.
The scoped implementation diff is `main..perf/database-responsiveness` with
18 commits. A direct PR to the older GitHub `main` would contain 52 commits;
resolve the baseline before publishing so the review retains the requested scope.
The earlier local commits have not been rewritten by this work.

## Bounded Cloudflare verification after an approved release

Use one authorized test workspace and a three-record fixture. Record the deployed
client/API revisions, actor, host/source and UTC start/end before collecting.
Keep request bodies, cookies, tokens and unrelated workspace data out of evidence.

1. Capture one browser network trace and a bounded Worker tail for at most three
   minutes. Filter to this fixture's host/source. Stop the tail after the window;
   do not leave an idle collector running.
2. Wait for three heartbeat cycles without focus changes or edits. Expect zero
   bootstrap/records GETs. Pongs must not trigger invalidation or reconnects.
3. With the table loaded and property authorization current, toggle one status.
   Expect one command POST, immediate visible feedback and no database GET when
   that property is absent from filter/sort dependencies.
4. Drop a card across columns, then reorder it within a column. Expect one atomic
   `row.change` per completed drop. A cross-column command carries both status and
   placement. Verify a second client converges, then restore the fixture values.
5. Load 150 rows and trigger a genuine delivery-gap recovery. Expect one
   cumulative 150-row read. A real membership/filter/sort change can legitimately
   request a new window; snapshot recovery may perform its dedicated retry.
6. Compare browser requests with edge and API observations using request IDs and
   timestamps. A gateway log and an API log for the same browser request are two
   observation layers, not two browser requests. Do not sum them as duplicates.
7. Stop collection and retain only the sanitized counts, response statuses,
   fixture size, relevant screenshots and measured timings.

## Rollback and remaining limits

Rollback the application changes if idle reads return, ordinary edits issue
unexplained reads, moves produce more than one command, newer pending edits are
lost, scope isolation fails, or reconnect/replay stops converging. Restore the
previous compatible web/API artifacts and repeat the bounded fixture check.
There is no schema/storage migration or new persisted window representation to
reverse, and transaction receipts must remain intact.

Authorized, loaded edits target visible feedback around 50 ms; cold reads,
authorization refresh, long tasks, slow devices and network delays remain outside
that local measurement. Source writes remain serialized. Filter/sort membership,
structural changes, real gaps, access changes and stale snapshots still recover
through authorized reads. Rendering checks count actual mounted model/row changes;
they do not claim that every parent React component never renders.
