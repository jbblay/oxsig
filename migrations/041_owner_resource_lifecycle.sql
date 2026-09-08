-- Keep owner-managed resource relationships consistent across destructive and
-- archival lifecycle transitions. Live Workspace bindings are polymorphic, so
-- PostgreSQL cannot express these relationships as ordinary foreign keys.

CREATE OR REPLACE FUNCTION oxsig_detach_live_workspace_resource_on_delete()
RETURNS TRIGGER AS $$
DECLARE
    old_data JSONB := to_jsonb(OLD);
    resource_type_name TEXT := TG_ARGV[0];
    resource_owner UUID;
    resource_uuid UUID;
BEGIN
    resource_owner := NULLIF(old_data->>'owner_id', '')::uuid;
    resource_uuid := COALESCE(NULLIF(old_data->>'id', '')::uuid, resource_owner);

    IF resource_owner IS NOT NULL AND resource_uuid IS NOT NULL THEN
        UPDATE live_workspace_resources
           SET status = 'detached',
               detached_at = COALESCE(detached_at, NOW()),
               updated_at = NOW()
         WHERE resource_owner_id = resource_owner
           AND resource_type = resource_type_name
           AND resource_id = resource_uuid
           AND status = 'attached';
    END IF;

    RETURN OLD;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION oxsig_detach_live_workspace_resource_on_unavailable()
RETURNS TRIGGER AS $$
DECLARE
    new_data JSONB := to_jsonb(NEW);
    resource_type_name TEXT := TG_ARGV[0];
    resource_owner UUID;
    resource_uuid UUID;
    unavailable BOOLEAN := false;
BEGIN
    resource_owner := NULLIF(new_data->>'owner_id', '')::uuid;
    resource_uuid := COALESCE(NULLIF(new_data->>'id', '')::uuid, resource_owner);

    CASE resource_type_name
        WHEN 'academy-course' THEN
            unavailable := new_data->>'status' = 'archived';
        WHEN 'vault-item' THEN
            unavailable := COALESCE((new_data->>'archived')::boolean, false);
        WHEN 'storyboard' THEN
            unavailable := new_data->>'deleted_at' IS NOT NULL
                OR new_data->>'status' = 'archived';
        WHEN 'lab-instance' THEN
            unavailable := new_data->>'status' IN ('destroying', 'destroyed');
        ELSE
            unavailable := false;
    END CASE;

    IF unavailable AND resource_owner IS NOT NULL AND resource_uuid IS NOT NULL THEN
        UPDATE live_workspace_resources
           SET status = 'detached',
               detached_at = COALESCE(detached_at, NOW()),
               updated_at = NOW()
         WHERE resource_owner_id = resource_owner
           AND resource_type = resource_type_name
           AND resource_id = resource_uuid
           AND status = 'attached';
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Capability evidence deliberately survives ordinary enrollment abandonment, but
-- must not claim proof from an Academy source the owner explicitly deleted.
CREATE OR REPLACE FUNCTION oxsig_remove_capability_evidence_for_deleted_source()
RETURNS TRIGGER AS $$
DECLARE
    source_type_name TEXT := TG_ARGV[0];
BEGIN
    DELETE FROM learning_capability_evidence
     WHERE owner_id = OLD.owner_id
       AND source_type = source_type_name
       AND source_id = OLD.id;
    RETURN OLD;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_academy_course_workspace_detach_delete ON academy_courses;
CREATE TRIGGER trg_academy_course_workspace_detach_delete
AFTER DELETE ON academy_courses
FOR EACH ROW EXECUTE FUNCTION oxsig_detach_live_workspace_resource_on_delete('academy-course');

DROP TRIGGER IF EXISTS trg_academy_course_workspace_detach_archive ON academy_courses;
CREATE TRIGGER trg_academy_course_workspace_detach_archive
AFTER UPDATE OF status ON academy_courses
FOR EACH ROW EXECUTE FUNCTION oxsig_detach_live_workspace_resource_on_unavailable('academy-course');

DROP TRIGGER IF EXISTS trg_vault_item_workspace_detach_delete ON vault_items;
CREATE TRIGGER trg_vault_item_workspace_detach_delete
AFTER DELETE ON vault_items
FOR EACH ROW EXECUTE FUNCTION oxsig_detach_live_workspace_resource_on_delete('vault-item');

DROP TRIGGER IF EXISTS trg_vault_item_workspace_detach_archive ON vault_items;
CREATE TRIGGER trg_vault_item_workspace_detach_archive
AFTER UPDATE OF archived ON vault_items
FOR EACH ROW EXECUTE FUNCTION oxsig_detach_live_workspace_resource_on_unavailable('vault-item');

DROP TRIGGER IF EXISTS trg_storyboard_workspace_detach_delete ON storyboard_sessions;
CREATE TRIGGER trg_storyboard_workspace_detach_delete
AFTER DELETE ON storyboard_sessions
FOR EACH ROW EXECUTE FUNCTION oxsig_detach_live_workspace_resource_on_delete('storyboard');

DROP TRIGGER IF EXISTS trg_storyboard_workspace_detach_unavailable ON storyboard_sessions;
CREATE TRIGGER trg_storyboard_workspace_detach_unavailable
AFTER UPDATE OF status, deleted_at ON storyboard_sessions
FOR EACH ROW EXECUTE FUNCTION oxsig_detach_live_workspace_resource_on_unavailable('storyboard');

DROP TRIGGER IF EXISTS trg_lab_instance_workspace_detach_delete ON lab_instances;
CREATE TRIGGER trg_lab_instance_workspace_detach_delete
AFTER DELETE ON lab_instances
FOR EACH ROW EXECUTE FUNCTION oxsig_detach_live_workspace_resource_on_delete('lab-instance');

DROP TRIGGER IF EXISTS trg_lab_instance_workspace_detach_destroy ON lab_instances;
CREATE TRIGGER trg_lab_instance_workspace_detach_destroy
AFTER UPDATE OF status ON lab_instances
FOR EACH ROW EXECUTE FUNCTION oxsig_detach_live_workspace_resource_on_unavailable('lab-instance');

DROP TRIGGER IF EXISTS trg_infrastructure_design_workspace_detach_delete ON infrastructure_designs;
CREATE TRIGGER trg_infrastructure_design_workspace_detach_delete
AFTER DELETE ON infrastructure_designs
FOR EACH ROW EXECUTE FUNCTION oxsig_detach_live_workspace_resource_on_delete('infrastructure-design');

DROP TRIGGER IF EXISTS trg_academy_practice_capability_evidence_delete ON academy_practice_attempts;
CREATE TRIGGER trg_academy_practice_capability_evidence_delete
AFTER DELETE ON academy_practice_attempts
FOR EACH ROW EXECUTE FUNCTION oxsig_remove_capability_evidence_for_deleted_source('academy-practice');

DROP TRIGGER IF EXISTS trg_academy_reflection_capability_evidence_delete ON academy_learning_reflections;
CREATE TRIGGER trg_academy_reflection_capability_evidence_delete
AFTER DELETE ON academy_learning_reflections
FOR EACH ROW EXECUTE FUNCTION oxsig_remove_capability_evidence_for_deleted_source('academy-reflection');
