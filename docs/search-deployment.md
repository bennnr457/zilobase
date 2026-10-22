# Deploying Gemini search

Search remains disabled until `SEARCH_EMBEDDINGS_ENABLED=true` and a workspace owner or admin enables it in workspace settings. Set the same server-only `GEMINI_API_KEY` in API and background environments. Pickers continue using keyword search. Enabling a workspace sends page text and supported stored property text to Google.

## Node processes

`ZILOBASE_PROCESS_ROLE=all` serves the API and consumes every background lane. `api` serves requests and publishes notifications without consuming them. `worker` consumes background work without opening the API listener.

`ZILOBASE_BACKGROUND_LANES` optionally selects comma-separated consumer lanes: `ai,fast,automation,calendar,search`. An empty value consumes every lane. Every process retains producers for every lane. Unknown, empty or duplicate entries fail configuration validation. A dedicated search replica uses role `worker` and lanes `search`. Keep consumers for the other lanes running as well.

All workers can run maintenance. Persisted maintenance leases coordinate ownership across replicas and lanes. Queue Redis must remain separate from realtime Redis.

The worker health listener defaults to `127.0.0.1:3001`. Configure `BACKGROUND_HEALTH_HOST=0.0.0.0` for container health probes and restrict access with network policy. Its `/ready` endpoint checks consumers and maintenance; it does not serve API routes.

## Compose

The default service uses combined mode. To isolate search, set the main consumer lanes to `ai,fast,automation,calendar` and enable the `search-worker` profile:

```sh
ZILOBASE_BACKGROUND_LANES=ai,fast,automation,calendar docker compose --profile search-worker up -d --scale search-worker=2
```

The worker inherits server credentials and database/Redis configuration, consumes only search, and probes port 3001. The main service still produces search notifications.

## Helm

The chart defaults to `node.processRole=all`. For independent scaling, use separate releases against the same database, cell, queue Redis and application secrets:

- API/general worker release: `node.processRole=all`, `node.backgroundLanes=ai,fast,automation,calendar`.
- Search release: `node.processRole=worker`, `node.backgroundLanes=search`, `ingress.enabled=false`; scale `replicaCount` independently.

Worker releases expose the health port instead of an API listener. The chart rejects ingress on worker releases. Set `search.enabled=true` in both releases and create the Secret selected by `search.existingSecret` with the `GEMINI_API_KEY` entry. No key is required when disabled. Enabled search adds outbound HTTPS to the configured `search.egressCIDRs`; use approved provider ranges or an egress proxy when applying narrower controls.

## Shared limits

Set `SEARCH_EMBEDDING_QUOTA_SCOPE` consistently for processes sharing the provider allowance. Within the same PostgreSQL database, minute reservations and cooldown are shared by API and workers. Separate databases cannot coordinate reservations; allocate provider capacity between them explicitly.

Defaults: 30 requests/minute, 100,000 reserved input tokens/minute, 20% interactive reservation, 10 million deployment indexing tokens/day and 1 million workspace indexing tokens/day. Configure `SEARCH_EMBEDDING_RPM`, `SEARCH_EMBEDDING_TPM`, `SEARCH_EMBEDDING_DAILY_TOKENS` and `SEARCH_EMBEDDING_WORKSPACE_DAILY_TOKENS`. Conservative input reservations use UTF-8 bytes; provider-reported tokens are recorded and reconciled separately.

`ZILOBASE_BACKGROUND_SEARCH_CONCURRENCY` defaults to 4. More worker replicas increase consumers while the database quota remains shared. Provider HTTP calls happen outside database transactions. Invocation progress is checkpointed; abrupt shutdown is recovered through leases and durable dispatch. A crash after provider success can result in a billed repeat call.

## Database indexes

PostgreSQL 17 with pgvector >= 0.8.0 is required even when search is disabled. Use the pinned repository database build and run capability preflight before migrations. See [the database image guide](../deploy/postgres/README.md).

For an existing populated installation, rebuild each partition's HNSW index concurrently through a direct administrative connection:

```sh
node --env-file=/secure/database.env scripts/search/rebuild-vector-indexes.mjs
```

This command checks for the expected 32 partition indexes and runs outside migration transactions. It must not use a transaction-mode connection pool.
