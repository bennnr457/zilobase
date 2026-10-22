# Vector search implementation ledger

Target: Gemini Embedding 2, 1536 dimensions, text only, opt-in per deployment and workspace.
The approved 25-pass plan in the implementation chat is the specification.
Baseline: `6966ac168e`; both application and hosted adapter were clean when implementation began.

| Pass | Commit scope                                    | Status                                                                                       |
| ---- | ----------------------------------------------- | -------------------------------------------------------------------------------------------- |
| 1    | Contracts and regression fixtures               | Verified: 9 focused tests; server typecheck                                                  |
| 2    | PostgreSQL/pgvector provisioning                | Verified: image build, upgrade, vectors/HNSW, backup/restore; 5 adapter tests; tooling tests |
| 3    | Page-owned vector schema                        | Pending                                                                                      |
| 4    | Markdown chunking                               | Pending                                                                                      |
| 5    | Stored property chunks                          | Pending                                                                                      |
| 6    | Transactional invalidation                      | Pending                                                                                      |
| 7    | Gemini provider                                 | Pending                                                                                      |
| 8    | Quotas and query cache                          | Pending                                                                                      |
| 9    | Search background lane                          | Pending                                                                                      |
| 10   | Resumable indexing                              | Pending                                                                                      |
| 11   | Backfill and maintenance                        | Pending                                                                                      |
| 12   | Live SQL eligibility                            | Pending                                                                                      |
| 13   | Hybrid retrieval                                | Pending                                                                                      |
| 14   | HNSW retrieval                                  | Pending                                                                                      |
| 15   | Workspace controls                              | Pending                                                                                      |
| 16   | Shared client and UI                            | Pending                                                                                      |
| 17   | Ask AI integration                              | Pending                                                                                      |
| 18   | Node worker deployment                          | Pending                                                                                      |
| 19   | Community Cloudflare runtime                    | Pending                                                                                      |
| 20   | Hosted Cloudflare adapter (separate repository) | Pending                                                                                      |
| 21   | Operations and diagnostics                      | Pending                                                                                      |
| 22   | Node acceptance and upgrade                     | Pending                                                                                      |
| 23   | Worker/browser parity                           | Pending                                                                                      |
| 24   | Relevance and scale                             | Pending                                                                                      |
| 25   | Verification and runbooks                       | Pending                                                                                      |

## Verification notes

- Docker daemon is available.
- Gemini credential validated read-only and stored with dotenvx encryption in Node development and hosted development/production envs. Production API and background Worker secrets were updated at the explicit user request. Live relevance evaluation is still pending.
- No production migrations, secrets, deployments, or workspace activation are authorized as incidental implementation actions.
