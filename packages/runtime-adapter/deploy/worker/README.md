# Community Cloudflare deploy templates

Self-host Zilobase on Cloudflare Workers from the public `zilobase` repo.
Copy these templates next to your worker entries and replace every
`<PLACEHOLDER>` — no hosted values are baked in.

## Files

| Template                    | Copy to                     | `main` points at         |
| --------------------------- | --------------------------- | ------------------------ |
| `wrangler.template.jsonc`   | `wrangler.jsonc`            | `worker.template.ts`     |
| `background.template.jsonc` | `background-wrangler.jsonc` | `background.template.ts` |
| `web.template.jsonc`        | `web-wrangler.jsonc`        | `web.template.js`        |
| `worker.template.ts`        | your worker entry           | —                        |
| `background.template.ts`    | your background entry       | —                        |
| `web.template.js`           | your web entry              | —                        |

## Provisioning guide

1. Create the resources the placeholders name:
   - Hyperdrive config for Postgres (`<HYPERDRIVE_ID>` via `wrangler hyperdrive create`),
   - R2 bucket (`<R2_BUCKET_NAME>`) plus a preview bucket for local dev,
   - Queues `zilobase-background-fast`, `zilobase-automation-runs`,
     `zilobase-calendar-jobs`, `zilobase-ai-runs`, and
     `zilobase-search-indexing`, with matching dead-letter queues as listed
     under `queues.consumers`,
   - Two rate-limiter bindings (namespace ids `1001`, `2001`).
2. Set `vars` origins to your domains (`<API_ORIGIN>`, `<WEB_ORIGIN>`,
   `<API_ORIGIN_WS>` websocket origin). `CLIENT_URL` accepts a
   comma-separated list.
3. Create every secret under `secrets.required` with
   `wrangler secret put <NAME>`. The community templates require **zero**
   hosted env vars (`POSTHOG_*`, `ZILOBASE_DEMO_ENABLED`,
   `ZILOBASE_IDENTITY_CONFIG_KEYS` are absent by design).
4. Point `routes`/`pattern` at your domains and `services` at your
   `zilobase-server` worker name.
5. Deploy the API worker first (`wrangler deploy -c wrangler.jsonc`),
   then background (`-c background-wrangler.jsonc`), then web
   (`-c web-wrangler.jsonc`).

Durable Object bindings, the fresh-install `runtime-ports-v1` migration, queue
names, rate limits, and module `alias` entries are byte-identical to the
hosted composition — only credentials, hostnames, buckets, placement, and
routes are placeholders. `template-parity` tests guard this invariant.

`runtime-ports-v1` is deliberately a fresh namespace baseline. Do not apply it
to a Worker script that already recorded the retired `v1..v14` chain; delete
and recreate that unused Worker namespace or choose a new script name first.
This reset does not delete PostgreSQL rows or R2 objects.

## Semantic search

Create the search queue and its dead-letter queue before enabling producers.
Both API and background Workers require `GEMINI_API_KEY` when
`SEARCH_EMBEDDINGS_ENABLED=true`. Credentials remain optional while disabled.
Use the same quota scope and database for both Workers.

The search consumer uses batch size 1, concurrency 4, five transport retries
and a DLQ. Its handler checkpoints work before the 45-second application
budget and schedules normal continuation as a new durable task. Minute cron
recovers missed dispatch and expired leases. Workspace owners/admins must
also opt in before any page indexing starts. See the
[deployment guide](../../../../docs/search-deployment.md).
