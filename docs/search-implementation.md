# Vector search implementation ledger

Target: Gemini Embedding 2, 1536 dimensions, text only, opt-in per deployment and workspace.
The approved 25-pass plan in the implementation chat is the specification.
Baseline: `6966ac168e`; both application and hosted adapter were clean when implementation began.

| Pass | Commit scope                                    | Status                                                                                                                                                       |
| ---- | ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1    | Contracts and regression fixtures               | Verified: 9 focused tests; server typecheck                                                                                                                  |
| 2    | PostgreSQL/pgvector provisioning                | Verified: image build, upgrade, vectors/HNSW, backup/restore; 5 adapter tests; tooling tests                                                                 |
| 3    | Page-owned vector schema                        | Verified: fresh migration; 12 focused tests including real schema constraints; server typecheck                                                              |
| 4    | Markdown chunking                               | Verified: 7 chunking tests, 13 converter/parser tests, server typecheck                                                                                      |
| 5    | Stored property chunks                          | Verified: 25 property serialization tests; server typecheck                                                                                                  |
| 6    | Transactional invalidation                      | Verified: 73 search/mutation/collaboration tests; real invalidation triggers; server typecheck                                                               |
| 7    | Gemini provider                                 | Verified: 12 provider tests; server typecheck; live Gemini batch/query returned 1536 dimensions and correct semantic ranking                                 |
| 8    | Quotas and query cache                          | Verified: 5 real-Postgres concurrency, quota, cooldown, accounting and cache tests; server typecheck                                                         |
| 9    | Search background lane                          | Verified: 32 shared delivery tests, 10 adapter tests, 15 Miniflare queue tests; server/adapter typechecks                                                    |
| 10   | Resumable indexing                              | Verified: 7 real-Postgres tests covering publication, reuse, edits/disablement in flight, lease reclaim, durable continuation and failures; server typecheck |
| 11   | Backfill and maintenance                        | Verified: 104 search/background tests, including bounded backfill/fanout, admission recovery, lease recovery, debounce and cleanup; server typecheck         |
| 12   | Live SQL eligibility                            | Verified: 6 real-Postgres differential/adversarial tests over generated graphs, teams, guests, expiry, sources and revisions; server typecheck               |
| 13   | Hybrid retrieval                                | Verified: 5 real-Postgres ranking/fallback tests, 10 access/route regressions and affected read/AI regressions; server typecheck                             |
| 14   | HNSW retrieval                                  | Verified: 3 real-Postgres plan/recall/filter tests (600 chunks), 11 retrieval/access regressions, concurrent rebuild of 32 indexes; server typecheck         |
| 15   | Workspace controls                              | Verified: 5 real-Postgres operation tests for roles, capability, durable enablement, disable/reset fencing, idempotency and policy; server typecheck         |
| 16   | Shared client and UI                            | Verified: 9 shared cache/request tests, sidebar suite, server/features/web typechecks; browser acceptance scheduled for pass 23                              |
| 17   | Ask AI integration                              | Verified: AI discovery/live-read/replay regressions and 30 search/access/read-tool tests; server typecheck                                                   |
| 18   | Node worker deployment                          | Pending                                                                                                                                                      |
| 19   | Community Cloudflare runtime                    | Pending                                                                                                                                                      |
| 20   | Hosted Cloudflare adapter (separate repository) | Pending                                                                                                                                                      |
| 21   | Operations and diagnostics                      | Pending                                                                                                                                                      |
| 22   | Node acceptance and upgrade                     | Pending                                                                                                                                                      |
| 23   | Worker/browser parity                           | Pending                                                                                                                                                      |
| 24   | Relevance and scale                             | Pending                                                                                                                                                      |
| 25   | Verification and runbooks                       | Pending                                                                                                                                                      |

## Verification notes

- Docker daemon is available.
- Gemini credential validated read-only and stored with dotenvx encryption in Node development and hosted development/production envs. Production API and background Worker secrets were updated at the explicit user request. Live relevance evaluation is still pending.
- Production secrets were explicitly requested and configured. No production migrations, deployments, or workspace activation are authorized as incidental implementation actions.

Passes 6–11 connect transactional dirty state, post-commit admission, delayed queue notifications, resumable indexing, backfill and minute maintenance. Feature controls remain disabled.

Concurrent non-search changes appeared in runtime-adapter package/template docs/tests during pass 6; preserve them and stage only search-owned hunks.

Search access traversal fails closed when ancestry reaches 64 levels, including corrupt cycles. Final chunk hydration evaluates access, source membership, revisions and freshness in one SQL statement.

Pass 14 found and fixed freshness-subquery flattening that prevented ordered HNSW scans. Retrieval disables PostgreSQL JIT locally to avoid expensive compilation for short interactive queries. The 600-chunk fixture proves partition pruning, index availability and filtered ANN Recall@20 >= 0.95; release-scale evaluation remains pending.
