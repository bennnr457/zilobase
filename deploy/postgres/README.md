# PostgreSQL with pgvector

Build with `node scripts/search/postgres-image.mjs`. Compose builds the same image automatically.
The image retains PostgreSQL 17.10's volume layout and pins the base digest and pgvector 0.8.7 source checksum.

Self-hosted Compose pins the published multi-platform image:

```text
ghcr.io/zilobase/postgres@sha256:8ba7c752d0567b22b8d33c5f87c663c82ea9fd693375cf754f01dd6082a0345b
```

[Publication run](https://github.com/zilobase/zilobase/actions/runs/39724890435)
built and tested Linux AMD64 and ARM64 natively from image-only commit
`28481a42fb82b803f5938251bab25fee8e243f78`. Tag:
`17.10-vector0.8.7-28481a42fb82`. Anonymous manifest access is verified.
The digest is the registry OCI index, not a local image ID.

The repository-owned `.github/workflows/postgres-image.yml` tests PostgreSQL 17,
pgvector 0.8.7, 1536-dimensional vectors and HNSW on both architectures before
publishing. It runs independently of application deployment/migrations. Future
Dockerfile/workflow changes publish a commit-qualified tag; update the Compose
digest only after the new run passes. Local setup continues building the pinned
Dockerfile source and does not publish anything.

External PostgreSQL must provide pgvector >= 0.8.0, including when semantic search is disabled. The migration preflight checks availability/version and installs `vector` if permitted. Otherwise the database owner must install or upgrade it first. Helm uses external PostgreSQL and does not provision its extensions.

Back up before upgrading. Keep PostgreSQL on major version 17. Restore tests must run against this image because plain PostgreSQL cannot restore the vector type. Disabling semantic search does not remove its schema or extension.
