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
