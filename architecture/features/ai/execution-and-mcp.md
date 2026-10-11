# Agent execution and MCP

Server chat execution, queued AI jobs, and MCP connector services are removed. The worker does not route `/agents` to a ChatAgent durable object, and background work has no AI lane.

The browser still presents conversation tools and connector settings. Those screens call the removed server routes. Pinned outbound fetch remains a runtime transport and is not an Ask AI product surface.

See [AI conversations](README.md) and [settings presentation](settings.md). [Architecture index](../../README.md).
