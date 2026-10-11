# Agent execution and MCP

Server chat execution, queued AI jobs, MCP connector services, and the MCP egress port are removed. The worker does not route `/agents` to a ChatAgent durable object, and background work has no AI lane. Outbound fetch keeps pinned webhook delivery for automations.

The browser still presents conversation tools and connector settings. Those screens call the removed server routes.

See [AI conversations](README.md) and [settings presentation](settings.md). [Architecture index](../../README.md).
