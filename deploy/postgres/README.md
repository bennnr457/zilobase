# PostgreSQL with pgvector

Build with `node scripts/search/postgres-image.mjs`. Compose builds the same image automatically.
The image retains PostgreSQL 17.10's volume layout and pins the base digest and pgvector 0.8.7 source checksum.

For releases, publish the built image through the release registry and set the deployment image to its registry digest. No registry publication is performed by local setup. A release digest must come from the actual registry upload; a local image ID is not a portable registry digest.

External PostgreSQL must provide pgvector >= 0.8.0, including when semantic search is disabled. The migration preflight checks availability/version and installs `vector` if permitted. Otherwise the database owner must install or upgrade it first. Helm uses external PostgreSQL and does not provision its extensions.

Back up before upgrading. Keep PostgreSQL on major version 17. Restore tests must run against this image because plain PostgreSQL cannot restore the vector type. Disabling semantic search does not remove its schema or extension.
