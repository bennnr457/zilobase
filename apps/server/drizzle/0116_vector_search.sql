CREATE EXTENSION IF NOT EXISTS vector;
--> statement-breakpoint
DO $$ BEGIN
  IF string_to_array((SELECT extversion FROM pg_extension WHERE extname='vector'), '.')::int[] < ARRAY[0,8,0] THEN
    RAISE EXCEPTION 'PGVECTOR_UPGRADE_REQUIRED: pgvector >= 0.8.0 is required';
  END IF;
END $$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION zilobase_index_page() RETURNS trigger AS $$
DECLARE
  body text;
  document_id text;
BEGIN
  IF TG_OP = 'DELETE' THEN
    document_id := 'page:' || OLD.id;
    DELETE FROM search_document WHERE id = document_id;
    RETURN OLD;
  END IF;
  document_id := 'page:' || NEW.id;
  IF NEW.deleted_at IS NOT NULL THEN
    DELETE FROM search_document WHERE id = document_id;
    RETURN NEW;
  END IF;
  SELECT COALESCE(string_agg(trim(both '"' from value::text), ' '), '') INTO body
    FROM jsonb_path_query(COALESCE(NEW.content, '{}'::jsonb), '$.**.text') AS value;
  INSERT INTO search_document (
    id, workspace_id, source_type, source_id, source_page_id, title, path,
    emoji, content_text, search_vector, source_updated_at, created_at, updated_at
  ) VALUES (
    document_id, NEW.workspace_id, 'page', NEW.id, NEW.id,
    COALESCE(NULLIF(BTRIM(NEW.name), ''), 'Untitled'),
    COALESCE(NULLIF(BTRIM(NEW.name), ''), 'Untitled'),
    NEW.metadata->>'emoji', body,
    setweight(to_tsvector('simple', COALESCE(NEW.name, '')), 'A') ||
      setweight(to_tsvector('simple', body), 'B'),
    NEW.updated_at, NOW(), NOW()
  ) ON CONFLICT (id) DO UPDATE SET
    workspace_id = EXCLUDED.workspace_id, title = EXCLUDED.title,
    path = EXCLUDED.path, emoji = EXCLUDED.emoji, content_text = EXCLUDED.content_text,
    search_vector = EXCLUDED.search_vector,
    source_updated_at = EXCLUDED.source_updated_at, updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint

--> statement-breakpoint
DROP TABLE search_chunk;
--> statement-breakpoint
CREATE UNIQUE INDEX page_workspace_id_unique ON page(workspace_id,id);
--> statement-breakpoint
CREATE TABLE search_embedding_profile (
 id text PRIMARY KEY, provider text NOT NULL CHECK(provider='google'), model text NOT NULL,
 dimensions integer NOT NULL CHECK(dimensions=1536), distance text NOT NULL CHECK(distance='cosine'),
 serializer_version integer NOT NULL, property_serializer_version integer NOT NULL,
 chunker_version integer NOT NULL, document_prompt_version integer NOT NULL, query_prompt_version integer NOT NULL,
 chunk_target_bytes integer NOT NULL, chunk_overlap_bytes integer NOT NULL, max_input_bytes integer NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO search_embedding_profile VALUES ('gemini-embedding-2-1536-text-v1','google','gemini-embedding-2',1536,'cosine',1,1,1,1,1,2400,320,4096,now());
CREATE FUNCTION zilobase_immutable_embedding_profile() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Embedding profiles are immutable; create a new profile'; END $$;
CREATE TRIGGER immutable_embedding_profile BEFORE UPDATE OR DELETE ON search_embedding_profile
 FOR EACH ROW EXECUTE FUNCTION zilobase_immutable_embedding_profile();
--> statement-breakpoint
CREATE TABLE workspace_search_settings (
 workspace_id text PRIMARY KEY REFERENCES workspace(id) ON DELETE CASCADE,
 cell_id text NOT NULL, enabled boolean NOT NULL DEFAULT false,
 profile_id text NOT NULL REFERENCES search_embedding_profile(id), index_epoch bigint NOT NULL DEFAULT 1,
 enabled_at timestamptz, enabled_by text REFERENCES "user"(id) ON DELETE SET NULL,
 backfill_cursor text, backfill_high_water text, backfill_completed_at timestamptz,
 last_error_code text, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE page_search_index (
 workspace_id text NOT NULL, page_id text NOT NULL, profile_id text NOT NULL REFERENCES search_embedding_profile(id),
 index_epoch bigint NOT NULL, requested_revision bigint NOT NULL DEFAULT 1, indexed_revision bigint NOT NULL DEFAULT 0,
 status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','running','ready','failed')),
 first_dirty_at timestamptz NOT NULL DEFAULT now(), not_before timestamptz NOT NULL DEFAULT now(),
 pending_task_id uuid, lease_owner text, lease_expires_at timestamptz, lease_fence bigint NOT NULL DEFAULT 0,
 active_generation_id uuid, staged_generation_id uuid, staged_revision bigint,
 expected_chunk_count integer, completed_chunk_count integer NOT NULL DEFAULT 0,
 consecutive_failures integer NOT NULL DEFAULT 0, last_error_code text, last_indexed_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(workspace_id,page_id,profile_id),
 FOREIGN KEY(workspace_id,page_id) REFERENCES page(workspace_id,id) ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX page_search_due_idx ON page_search_index(status,not_before,workspace_id) WHERE status IN ('pending','running');
CREATE INDEX page_search_workspace_status_idx ON page_search_index(workspace_id,status);
--> statement-breakpoint
CREATE TABLE search_chunk (
 id uuid NOT NULL DEFAULT gen_random_uuid(), workspace_id text NOT NULL, page_id text NOT NULL,
 profile_id text NOT NULL REFERENCES search_embedding_profile(id), index_epoch bigint NOT NULL,
 generation_id uuid NOT NULL, source_revision bigint NOT NULL,
 chunk_kind text NOT NULL CHECK(chunk_kind IN ('title','body','property')), source_key text NOT NULL, chunk_index integer NOT NULL CHECK(chunk_index>=0),
 content_markdown text NOT NULL, embedding_input_hash text NOT NULL, embedding vector(1536), is_active boolean NOT NULL DEFAULT false,
 byte_count integer NOT NULL CHECK(byte_count>=0), token_count integer, metadata jsonb NOT NULL DEFAULT '{}',
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(workspace_id,id),
 FOREIGN KEY(workspace_id,page_id) REFERENCES page(workspace_id,id) ON DELETE CASCADE ON UPDATE CASCADE,
 UNIQUE(workspace_id,page_id,profile_id,generation_id,chunk_kind,source_key,chunk_index),
 CHECK(NOT is_active OR embedding IS NOT NULL)
) PARTITION BY HASH(workspace_id);
CREATE TABLE search_chunk_p00 PARTITION OF search_chunk FOR VALUES WITH (MODULUS 32, REMAINDER 0);
CREATE TABLE search_chunk_p01 PARTITION OF search_chunk FOR VALUES WITH (MODULUS 32, REMAINDER 1);
CREATE TABLE search_chunk_p02 PARTITION OF search_chunk FOR VALUES WITH (MODULUS 32, REMAINDER 2);
CREATE TABLE search_chunk_p03 PARTITION OF search_chunk FOR VALUES WITH (MODULUS 32, REMAINDER 3);
CREATE TABLE search_chunk_p04 PARTITION OF search_chunk FOR VALUES WITH (MODULUS 32, REMAINDER 4);
CREATE TABLE search_chunk_p05 PARTITION OF search_chunk FOR VALUES WITH (MODULUS 32, REMAINDER 5);
CREATE TABLE search_chunk_p06 PARTITION OF search_chunk FOR VALUES WITH (MODULUS 32, REMAINDER 6);
CREATE TABLE search_chunk_p07 PARTITION OF search_chunk FOR VALUES WITH (MODULUS 32, REMAINDER 7);
CREATE TABLE search_chunk_p08 PARTITION OF search_chunk FOR VALUES WITH (MODULUS 32, REMAINDER 8);
CREATE TABLE search_chunk_p09 PARTITION OF search_chunk FOR VALUES WITH (MODULUS 32, REMAINDER 9);
CREATE TABLE search_chunk_p10 PARTITION OF search_chunk FOR VALUES WITH (MODULUS 32, REMAINDER 10);
CREATE TABLE search_chunk_p11 PARTITION OF search_chunk FOR VALUES WITH (MODULUS 32, REMAINDER 11);
CREATE TABLE search_chunk_p12 PARTITION OF search_chunk FOR VALUES WITH (MODULUS 32, REMAINDER 12);
CREATE TABLE search_chunk_p13 PARTITION OF search_chunk FOR VALUES WITH (MODULUS 32, REMAINDER 13);
CREATE TABLE search_chunk_p14 PARTITION OF search_chunk FOR VALUES WITH (MODULUS 32, REMAINDER 14);
CREATE TABLE search_chunk_p15 PARTITION OF search_chunk FOR VALUES WITH (MODULUS 32, REMAINDER 15);
CREATE TABLE search_chunk_p16 PARTITION OF search_chunk FOR VALUES WITH (MODULUS 32, REMAINDER 16);
CREATE TABLE search_chunk_p17 PARTITION OF search_chunk FOR VALUES WITH (MODULUS 32, REMAINDER 17);
CREATE TABLE search_chunk_p18 PARTITION OF search_chunk FOR VALUES WITH (MODULUS 32, REMAINDER 18);
CREATE TABLE search_chunk_p19 PARTITION OF search_chunk FOR VALUES WITH (MODULUS 32, REMAINDER 19);
CREATE TABLE search_chunk_p20 PARTITION OF search_chunk FOR VALUES WITH (MODULUS 32, REMAINDER 20);
CREATE TABLE search_chunk_p21 PARTITION OF search_chunk FOR VALUES WITH (MODULUS 32, REMAINDER 21);
CREATE TABLE search_chunk_p22 PARTITION OF search_chunk FOR VALUES WITH (MODULUS 32, REMAINDER 22);
CREATE TABLE search_chunk_p23 PARTITION OF search_chunk FOR VALUES WITH (MODULUS 32, REMAINDER 23);
CREATE TABLE search_chunk_p24 PARTITION OF search_chunk FOR VALUES WITH (MODULUS 32, REMAINDER 24);
CREATE TABLE search_chunk_p25 PARTITION OF search_chunk FOR VALUES WITH (MODULUS 32, REMAINDER 25);
CREATE TABLE search_chunk_p26 PARTITION OF search_chunk FOR VALUES WITH (MODULUS 32, REMAINDER 26);
CREATE TABLE search_chunk_p27 PARTITION OF search_chunk FOR VALUES WITH (MODULUS 32, REMAINDER 27);
CREATE TABLE search_chunk_p28 PARTITION OF search_chunk FOR VALUES WITH (MODULUS 32, REMAINDER 28);
CREATE TABLE search_chunk_p29 PARTITION OF search_chunk FOR VALUES WITH (MODULUS 32, REMAINDER 29);
CREATE TABLE search_chunk_p30 PARTITION OF search_chunk FOR VALUES WITH (MODULUS 32, REMAINDER 30);
CREATE TABLE search_chunk_p31 PARTITION OF search_chunk FOR VALUES WITH (MODULUS 32, REMAINDER 31);
CREATE INDEX search_chunk_generation_idx ON search_chunk(workspace_id,page_id,profile_id,generation_id);
CREATE INDEX search_chunk_reuse_idx ON search_chunk(workspace_id,profile_id,embedding_input_hash) WHERE embedding IS NOT NULL;
--> statement-breakpoint
CREATE TABLE search_invalidation (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), workspace_id text NOT NULL REFERENCES workspace(id) ON DELETE CASCADE,
 kind text NOT NULL, resource_id text NOT NULL, revision bigint NOT NULL, cursor text,
 status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','running','ready','failed')),
 pending_task_id uuid, lease_owner text, lease_expires_at timestamptz, lease_fence bigint NOT NULL DEFAULT 0,
 last_error_code text, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(workspace_id,kind,resource_id,revision)
);
CREATE INDEX search_invalidation_due_idx ON search_invalidation(status,created_at);
CREATE TABLE search_query_embedding_cache (
 workspace_id text NOT NULL REFERENCES workspace(id) ON DELETE CASCADE, user_id text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
 profile_id text NOT NULL REFERENCES search_embedding_profile(id), purpose text NOT NULL, input_hash text NOT NULL,
 embedding vector(1536) NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), expires_at timestamptz NOT NULL,
 PRIMARY KEY(workspace_id,user_id,profile_id,purpose,input_hash)
);
CREATE INDEX search_query_expiry_idx ON search_query_embedding_cache(expires_at);
CREATE TABLE search_embedding_usage_bucket (
 quota_scope text NOT NULL, bucket_scope text NOT NULL, window_start timestamptz NOT NULL, window_kind text NOT NULL,
 traffic_class text NOT NULL, requests bigint NOT NULL DEFAULT 0,
 reserved_tokens bigint NOT NULL DEFAULT 0, reported_tokens bigint NOT NULL DEFAULT 0,
 cooldown_until timestamptz, updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(quota_scope,bucket_scope,window_start,window_kind,traffic_class)
);
CREATE INDEX search_usage_expiry_idx ON search_embedding_usage_bucket(window_start);
