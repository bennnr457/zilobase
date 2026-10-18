# Automation backend acceptance

Run from the core repository root with Node 24+, Docker, and installed workspace dependencies:

```sh
docker pull postgres:17.10-alpine
docker pull valkey/valkey:8-alpine
npm run test:automations:unit
npm run test:automations:node
npm run test:automations:worker
# All three, without test retries:
npm run test:automations
```

The same acceptance scenarios run against the production HTTP app and session
middleware, migrated PostgreSQL, and either BullMQ/Valkey or deployment-bundled
Cloudflare API/queue/cron code in Miniflare. The Worker acceptance suite has no
server-adapter alias. A local service binding controls delivery barriers and
configuration changes without reloading workerd or adding application routes. The smaller workerd adapter unit suite retains its fixtures;
run it separately with `npm run test:workers --workspace @zilobase/runtime-adapter`.

Each invocation provisions empty disposable containers through the existing
background fixture lifecycle, uses random local ports and a unique deployment
cell, and removes its resources on completion. It rejects nonlocal or nonempty
databases. Provider HTTP/DNS and Node's webhook transport boundary are controlled;
production URL and secret validation still run. No Slack or Cloudflare account
credentials are used. Tests do not contact provider services.

Reports are written to `.test-results/automations/<runtime>.json`. Failures print
bounded dispatch diagnostics without credential or provider-payload fields.

## Behavior contracts

- Saving creates a definition/revision; HTTP row commands capture mutation facts
  atomically with their updates and durable dispatches.
- Event edits accumulate for a fixed three-second window. Reverted changes do not
  trigger; automation-origin writes cannot recursively trigger other rules.
- Runs pin definitions, while action references read current values at context
  load. A queued event's values can therefore differ from its action payload,
  including between retries. Payloads are not frozen snapshots.
- Completed actions remain committed after a later failure. Successful step
  outputs are restored during recovery.
- External delivery is at least once. A provider can accept a request before its
  success receipt is committed. Receivers should deduplicate stable delivery IDs;
  those IDs do not imply that retry payloads are immutable.
- Scheduled downtime collapses to the latest missed occurrence; it does not
  backfill all missed occurrences. Both runtime suites verify timezone/DST
  cursors and end dates; the schedule unit suite covers recurrence combinations.
- Disabled execution persists a business retry sixty seconds later. Acceptance
  verifies that durable delay, then injects an admitted duplicate wake-up after
  re-enabling execution to avoid sleeping sixty seconds for every recovery case.
  Lease expiry and schedule due timestamps are likewise adjusted only in fixture
  databases. These controls do not add production routes or bypass authentication.
- Both runtimes exercise PostgreSQL serialization and deadlock failures, including
  failure after a provider receipt is saved. Node also kills a real BullMQ child
  consumer during an automation, expires its fixture leases, and recovers through
  replacement consumers without repeating completed steps. A pending provider
  request can be retried with the same delivery identity after a process crash.

For focused local debugging, `ZILOBASE_AUTOMATION_TEST_MATCH` selects scenario names.
CI rejects that filter so required gates always run the full matrix.

## CI and rollout

Core PRs run adapter/workerd checks, the Node and Worker acceptance matrix, and
existing background recovery tests. Existing core validation remains in place.
Hosted Cloudflare checks consume the shared suite from their pinned core checkout.

Merge core first, advance the Cloudflare workflow's core SHA to that merged
revision with `node scripts/automations/pin-cloud-core.mjs <merged-sha> --apply`,
and run its acceptance check. A local uncommitted change is not a valid
cross-repository pin. Required-check activation must follow the first successful
run of the new workflow on the default branch; use `configure-required-checks.mjs`
to inspect/apply that gate without replacing existing protection requirements.
No historical queued work is automatically replayed by these changes.
