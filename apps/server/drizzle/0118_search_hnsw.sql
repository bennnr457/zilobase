CREATE INDEX search_chunk_active_cosine_hnsw ON search_chunk USING hnsw (embedding vector_cosine_ops)
WITH (m=16,ef_construction=64) WHERE is_active AND embedding IS NOT NULL;
