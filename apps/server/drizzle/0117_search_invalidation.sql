ALTER TABLE page_property ADD COLUMN search_revision bigint NOT NULL DEFAULT 1;
ALTER TABLE page_property_value ADD COLUMN search_revision bigint NOT NULL DEFAULT 1;
ALTER TABLE data_source ADD COLUMN search_revision bigint NOT NULL DEFAULT 1;
--> statement-breakpoint
CREATE FUNCTION zilobase_request_page_index(w text,p text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
 INSERT INTO page_search_index(workspace_id,page_id,profile_id,index_epoch,not_before)
 SELECT w,p,s.profile_id,s.index_epoch,clock_timestamp()+interval '5 seconds'
 FROM workspace_search_settings s JOIN page ON page.id=p AND page.workspace_id=w
 WHERE s.workspace_id=w AND s.enabled
 ON CONFLICT(workspace_id,page_id,profile_id) DO UPDATE SET
 requested_revision=page_search_index.requested_revision+1,
 index_epoch=EXCLUDED.index_epoch, status='pending', consecutive_failures=0,last_error_code=NULL,
 first_dirty_at=CASE WHEN page_search_index.requested_revision=page_search_index.indexed_revision THEN clock_timestamp() ELSE page_search_index.first_dirty_at END,
 not_before=least(CASE WHEN page_search_index.requested_revision=page_search_index.indexed_revision THEN clock_timestamp()+interval '30 seconds' ELSE page_search_index.first_dirty_at+interval '30 seconds' END,clock_timestamp()+interval '5 seconds'),
 updated_at=clock_timestamp();
END $$;
CREATE FUNCTION zilobase_page_search_dirty() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='UPDATE' AND ROW(NEW.name,NEW.content,NEW.deleted_at,NEW.workspace_id) IS NOT DISTINCT FROM ROW(OLD.name,OLD.content,OLD.deleted_at,OLD.workspace_id) THEN RETURN NEW; END IF;
 PERFORM zilobase_request_page_index(NEW.workspace_id,NEW.id);
 RETURN NEW;
END $$;
CREATE TRIGGER page_vector_dirty AFTER INSERT OR UPDATE ON page FOR EACH ROW EXECUTE FUNCTION zilobase_page_search_dirty();
--> statement-breakpoint
CREATE FUNCTION zilobase_property_search_revision() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_TABLE_NAME='page_property' THEN
  NEW.search_revision=OLD.search_revision+CASE WHEN ROW(NEW.name,NEW.type,NEW.config,NEW.deleted_at) IS DISTINCT FROM ROW(OLD.name,OLD.type,OLD.config,OLD.deleted_at) THEN 1 ELSE 0 END;
 ELSIF TG_TABLE_NAME='data_source' THEN
  NEW.search_revision=greatest(NEW.search_revision,OLD.search_revision+CASE WHEN ROW(NEW.parent_database_id,NEW.deleted_at) IS DISTINCT FROM ROW(OLD.parent_database_id,OLD.deleted_at) THEN 1 ELSE 0 END);
 ELSE
  NEW.search_revision=OLD.search_revision+CASE WHEN ROW(NEW.value,NEW.page_id,NEW.property_id) IS DISTINCT FROM ROW(OLD.value,OLD.page_id,OLD.property_id) THEN 1 ELSE 0 END;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER property_search_revision BEFORE UPDATE ON page_property FOR EACH ROW EXECUTE FUNCTION zilobase_property_search_revision();
CREATE TRIGGER property_value_search_revision BEFORE UPDATE ON page_property_value FOR EACH ROW EXECUTE FUNCTION zilobase_property_search_revision();
CREATE TRIGGER source_search_revision BEFORE UPDATE ON data_source FOR EACH ROW EXECUTE FUNCTION zilobase_property_search_revision();
CREATE FUNCTION zilobase_property_value_search_dirty() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE p text; w text;
BEGIN
 IF TG_OP='UPDATE' AND NEW.search_revision=OLD.search_revision THEN RETURN NEW; END IF;
 p=CASE WHEN TG_OP='DELETE' THEN OLD.page_id ELSE NEW.page_id END;
 SELECT workspace_id INTO w FROM page WHERE id=p;
 IF w IS NOT NULL THEN PERFORM zilobase_request_page_index(w,p); END IF;
 IF TG_OP='UPDATE' AND OLD.page_id<>NEW.page_id THEN
  SELECT workspace_id INTO w FROM page WHERE id=OLD.page_id;
  IF w IS NOT NULL THEN PERFORM zilobase_request_page_index(w,OLD.page_id); END IF;
 END IF;
 RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
END $$;
CREATE TRIGGER property_value_vector_dirty AFTER INSERT OR UPDATE OR DELETE ON page_property_value FOR EACH ROW EXECUTE FUNCTION zilobase_property_value_search_dirty();
--> statement-breakpoint
CREATE FUNCTION zilobase_property_search_fanout() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.search_revision=OLD.search_revision THEN RETURN NEW; END IF;
 INSERT INTO search_invalidation(workspace_id,kind,resource_id,revision)
 SELECT s.workspace_id,'property',NEW.id,NEW.search_revision FROM workspace_search_settings s WHERE s.workspace_id=NEW.workspace_id AND s.enabled
 ON CONFLICT DO NOTHING;
 RETURN NEW;
END $$;
CREATE TRIGGER property_vector_fanout AFTER UPDATE ON page_property FOR EACH ROW EXECUTE FUNCTION zilobase_property_search_fanout();
CREATE FUNCTION zilobase_row_search_dirty() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE p text; w text;
BEGIN
 IF TG_OP='UPDATE' AND ROW(NEW.page_id,NEW.data_source_id,NEW.deleted_at) IS NOT DISTINCT FROM ROW(OLD.page_id,OLD.data_source_id,OLD.deleted_at) THEN RETURN NEW; END IF;
 p=CASE WHEN TG_OP='DELETE' THEN OLD.page_id ELSE NEW.page_id END;
 SELECT workspace_id INTO w FROM page WHERE id=p;
 IF w IS NOT NULL THEN PERFORM zilobase_request_page_index(w,p); END IF;
 IF TG_OP='UPDATE' AND OLD.page_id<>NEW.page_id THEN
  SELECT workspace_id INTO w FROM page WHERE id=OLD.page_id;
  IF w IS NOT NULL THEN PERFORM zilobase_request_page_index(w,OLD.page_id); END IF;
 END IF;
 RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
END $$;
CREATE TRIGGER row_vector_dirty AFTER INSERT OR UPDATE OR DELETE ON database_row FOR EACH ROW EXECUTE FUNCTION zilobase_row_search_dirty();
--> statement-breakpoint
CREATE FUNCTION zilobase_database_property_search_fanout() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE source_id text; w text; rev bigint;
BEGIN
 IF TG_OP='UPDATE' AND ROW(NEW.data_source_id,NEW.property_id) IS NOT DISTINCT FROM ROW(OLD.data_source_id,OLD.property_id) THEN RETURN NEW; END IF;
 FOR source_id IN SELECT DISTINCT value FROM unnest(ARRAY[CASE WHEN TG_OP<>'INSERT' THEN OLD.data_source_id END,CASE WHEN TG_OP<>'DELETE' THEN NEW.data_source_id END]) AS value WHERE value IS NOT NULL LOOP
  SELECT d.workspace_id,ds.search_revision INTO w,rev FROM data_source ds JOIN database d ON d.id=ds.parent_database_id WHERE ds.id=source_id FOR UPDATE OF ds;
  -- Membership changes get their own monotonic source revision, independent of source metadata.
  UPDATE data_source SET search_revision=rev+1 WHERE id=source_id;
  INSERT INTO search_invalidation(workspace_id,kind,resource_id,revision)
  SELECT s.workspace_id,'data_source',source_id,rev+1 FROM workspace_search_settings s WHERE s.workspace_id=w AND s.enabled ON CONFLICT DO NOTHING;
 END LOOP;
 RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
END $$;
CREATE TRIGGER database_property_vector_fanout AFTER INSERT OR UPDATE OR DELETE ON database_property FOR EACH ROW EXECUTE FUNCTION zilobase_database_property_search_fanout();

--> statement-breakpoint
CREATE FUNCTION zilobase_source_search_fanout() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.search_revision=OLD.search_revision THEN RETURN NEW; END IF;
 INSERT INTO search_invalidation(workspace_id,kind,resource_id,revision)
 SELECT s.workspace_id,'data_source',NEW.id,NEW.search_revision FROM workspace_search_settings s JOIN database d ON d.workspace_id=s.workspace_id
 WHERE d.id=NEW.parent_database_id AND s.enabled ON CONFLICT DO NOTHING;
 RETURN NEW;
END $$;
CREATE TRIGGER source_vector_fanout AFTER UPDATE ON data_source FOR EACH ROW EXECUTE FUNCTION zilobase_source_search_fanout();
