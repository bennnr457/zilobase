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
| 11   | Backfill and maintenance                        | Pending                                                                                                                                                      |
| 12   | Live SQL eligibility                            | Pending                                                                                                                                                      |
| 13   | Hybrid retrieval                                | Pending                                                                                                                                                      |
| 14   | HNSW retrieval                                  | Pending                                                                                                                                                      |
| 15   | Workspace controls                              | Pending                                                                                                                                                      |
| 16   | Shared client and UI                            | Pending                                                                                                                                                      |
| 17   | Ask AI integration                              | Pending                                                                                                                                                      |
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

Pass 6 installs durable invalidation and post-commit publication nudges. Admission from dirty state is connected with the resumable handlers in passes 9–11, before feature enablement.

Concurrent non-search changes appeared in runtime-adapter package/template docs/tests during pass 6; preserve them and stage only search-owned hunks.
