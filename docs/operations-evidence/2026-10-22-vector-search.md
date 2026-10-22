# Vector search verification — 2026-10-22

## Node acceptance

Run `npm run test:search:node`. The runner creates a fresh, isolated PostgreSQL
17.10/pgvector 0.8.7 database and dedicated Valkey broker, applies real migrations,
boots authenticated HTTP routes, and starts search consumers in separate Node
processes. It redirects Gemini REST calls to a controlled local HTTP provider;
no real provider credentials are used. It cleans up only its own containers.

15 scenarios passed: authenticated bootstrap; opt-in/backfill/paraphrase search;
body/title changes through Hocuspocus persistence; duplicate delivery; delete and
restore; select-name and stored-ID values, definition/option fanout and source
removal; interactive timeout fallback; SIGKILL during a provider call; SIGKILL
after a 16-vector checkpoint; broker outage and recovery; API restart; database
and broker restart; disablement during a provider call and cleanup; re-enablement;
backup/restore with 1536-dimensional vectors and all 32 HNSW partition indexes.

Crash tests explicitly expire the persisted page lease after killing a consumer
instead of sleeping 90 seconds. Maintenance ticks are driven explicitly. This
proves recovery through the production lease/admission/delivery handlers, not a
wall-clock recovery SLA. Normal pauses stop consumers gracefully; crash cases
use SIGKILL. Queue outage/restart errors in the log are intentional.

The command writes `.test-results/search/node-acceptance.json`. CI runs the same
command and retains the report. This report is fake-provider transport and
persistence evidence, not real-model relevance evidence.

Machine: macOS arm64, 32 GiB host RAM, Docker VM ~7.7 GiB, Node 26.8.2. CI uses
Node 24 and Linux Docker. No production migration or deployment was performed.

The acceptance test caught and fixed select serialization: current option names
and stored IDs are both resolved against the live property definition. Unknown
or deleted names/IDs are excluded. Property excerpts now include their bounded
label. The option-rename case explicitly exercises a stored ID; an unmigrated
old stored name is excluded if it no longer exists in the source definition.

## Worker and browser acceptance

`npm run test:search` passed 15 Node scenarios and 10 Worker scenarios. The Worker
suite bundles production API, queue, cron and Durable Object composition through
Wrangler, then runs it in workerd/Miniflare against real PostgreSQL/pgvector. It
uses actual queue producers/consumers and the production dispatch handlers. A
control binding pauses admission or queue availability; no app authentication or
search handler is replaced. Cron eligibility is accelerated in the fixture DB.

The Worker interruption test replaces the running workerd module while its
second embedding batch is blocked, after 16 embeddings are checkpointed. It
expires the abandoned page lease, runs cron, and verifies publication of the
same staged generation. In-flight provider billing remains at least once.

Both runs compare canonical content, provenance, input hashes, normalized vector
hashes and the semantic Top-1 title for the same fixture pages. They write
`node-parity.json` / `worker-parity.json` under `.test-results/search`. This proves
shared behavior with controlled vectors, not real-provider relevance.

`npm run test:search:browser` passed four checks using the actual web app, shared
client and authenticated API: workspace disable/enable/reindex; hybrid results
and keyboard navigation; keyword-only sidebar picker; and settings/results that
fit a 390px viewport. Screenshots and request/response summaries are retained in
`.test-results/search`; CI uploads them. Desktop and mobile captures were
visually inspected. The API response dates caught by this test are normalized at
vector hydration so the shared client accepts the same ISO contract as keyword
results. The real-Postgres regression asserts the serialized date contract.

126 search and Ask AI read-tool tests also passed. Search discovery remains
separate from live read evidence. Final verification, live relevance and release-scale performance outcomes are
recorded below.

## Final verification and image publication

After the scale-related search changes, the real acceptance suites passed again:
15 Node scenarios, 10 Worker scenarios with matching parity outputs, and four
actual-app browser checks. Search-specific web tests passed. The full server
quality command passed 952 tests (14 pre-existing conditional skips), followed
by 262 query-regression tests and the server build. The HTTP inventory explicitly
includes the three new settings/reindex routes.

Other checks passed: 577 shared-client tests; 13 page-context and nine HTML
conversion tests; all workspace typechecks; architecture/ownership and 112 public
export entry conditions; dependency alignment (one existing clipper TypeScript
version warning); lint (existing warnings); tooling/community guards; main web
and server builds. Runtime-adapter Node tests passed 114 with three conditional
skips; Worker tests passed 42. Hosted `0adf8ec` passed 79 Node tests (one
conditional skip), 14 Worker tests, build/type generation and API/background
Wrangler dry-runs against the final shared code.

The broad web suite currently fails an assertion at
`apps/web/test/features/pages/editor/document-session.test.mjs:230` in concurrent,
uncommitted editor changes: the replacement awareness clock is not greater than 50. Search-specific checks and browser acceptance pass. Those unrelated editor
and database changes are excluded from the search commits. Do not describe the
whole worktree as release-green until their owner resolves that failure.

[GitHub Actions run 39724890435](https://github.com/zilobase/zilobase/actions/runs/39724890435)
published the PostgreSQL image from image-only branch commit
`28481a42fb82b803f5938251bab25fee8e243f78`. Both native architectures passed
PostgreSQL 17, pgvector 0.8.7, 1536-dimensional vector and HNSW probes. The OCI
index is:

```text
ghcr.io/zilobase/postgres@sha256:8ba7c752d0567b22b8d33c5f87c663c82ea9fd693375cf754f01dd6082a0345b
```

Anonymous manifest access and full AMD64/ARM64 pulls passed using an empty Docker
credential store. The pinned published ARM64 image also passed the local volume,
vector/HNSW and dump/restore test. Self-hosted production Compose now pins that
registry digest; source development continues building the pinned Dockerfile.
Production Compose configuration validates. This publication changed no
production application deployment, database schema or workspace setting.

The image-only publication branch is intentionally separate from the application
commit series: it contains only the Dockerfile and image workflow on remote main,
so publishing did not push the local application history or concurrent edits.

## Relevance, scale and final local verification

Pass 24 (`ba04a96a29`) records the [live model report](../search-evaluation/2026-10-22-gemini.json)
and [10k/100k/1m scale report](../search-evaluation/2026-10-22-scale.json).
The final live Gemini run passed all relevance gates: semantic Recall@10 1.00,
paraphrase improvement 1.00, title/identifier Top-1 1.00, with 3,494 reported
input tokens. Offline query prefill uses 20 seconds; interactive limits remain
1.8 / 2.5 seconds and are tested separately. An earlier final-run attempt hit
the interactive provider timeout; it was not counted as a passing relevance run.
The provider now distinguishes its own timeout from caller cancellation.

The clean million-chunk run passed ANN Recall@20 0.95 in the dominant workspace
and exact recall 1.00 in small/selective sets. All nine interactive cases returned
hybrid results within 2.5 seconds (maximum 2,122 ms), with one partition selected.
The large index built in 670.29 seconds using 2 GiB maintenance memory and two
parallel workers. Read the evaluation guide for synthetic-corpus limitations,
raw selective ANN results, storage and memory measurements; these are not
production traffic percentiles.

The scale run exposed and fixed repeated ancestry/ownership scans, a pulled-up
permission semi-join, and recall loss from strict iterative ordering/early
stopping. The measured final path uses a single bounded, authorized 2,000-chunk
ANN pool with relaxed scanning and cosine reranking; small sets remain exact.
103 focused real-database/provider/search tests pass. The final Node/Worker
acceptance run passes all 25 scenarios; the four actual-app browser checks pass.

Local development was also repaired after the running pre-feature PostgreSQL
container blocked preflight. The dependency container was recreated with the
vector-capable image while retaining `zilobase-source-dev_postgres_data`. Core
migrations were applied only to loopback `zilobase_node`, `zilobase_worker` and
`zilobase_enterprise_connected`. The new source revision column and pgvector
0.8.7 are present; both Node and Worker health endpoints return 200. The Worker
database retains its 49 live pages. No production migration was performed.

## Follow-up: continuous indexing admission

Search deliveries now refill and publish pending work after each processed page,
workspace scan or invalidation. Five outstanding page jobs per workspace keep
the four consumers supplied without unbounded admission. Future quota/budget
continuations retain their slots, and settings locks prevent concurrent refills
from overfilling the window. Admission continues rotating across workspaces.
Recovery publishes newly admitted work in the same sweep; cron is a repair path
rather than the normal throughput clock.

The focused real-PostgreSQL/search/background run passes 138 tests. The complete
Node acceptance suite passes 16 scenarios and Worker acceptance passes 11.
Both include a 12-page backfill with one initial maintenance kick and no further
maintenance while draining (2,280 ms Node; 1,207 ms Worker with the deterministic
fake provider). These timings demonstrate queue refill, not live Gemini latency.
Concurrency, delayed-slot retention and admission of another workspace are
covered by database tests. Server/runtime-adapter typechecks and the Worker
bundle guard pass. The local workspace reports 42 ready pages and both local
API readiness endpoints return 200. No production deployment was performed.
