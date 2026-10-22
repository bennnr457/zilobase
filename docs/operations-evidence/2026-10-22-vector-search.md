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
separate from live read evidence. Full final verification and live relevance /
release-scale performance are subsequent gates.
