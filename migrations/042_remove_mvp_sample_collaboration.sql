-- Remove historical MVP seed records from real databases without touching
-- user-created data. These rows were created by migrations 001 and 004.

-- Migration 004 inserted this exact sample collaboration when test@example.com
-- happened to exist. Match every original seed field so normal collaborations
-- are never selected.
DELETE FROM collaborations collaboration
USING users owner
WHERE collaboration.owner_id = owner.id
  AND owner.email = 'test@example.com'
  AND collaboration.name = 'Test Collaboration'
  AND collaboration.description = 'A sample collaboration for testing real-time features'
  AND collaboration.collaboration_type = 'document'
  AND collaboration.metadata = '{}'::jsonb
  AND collaboration.settings = '{}'::jsonb;

-- Migration 001 inserted a synthetic user in every fresh database. Remove that
-- exact seed only when nothing in the current schema references it. The generic
-- foreign-key scan makes this safe as OXSIG adds new owner/user tables: if the
-- seed identity was ever used for real/dev data, it is retained rather than
-- cascading that data away.
DO $$
DECLARE
    seed_id UUID;
    reference_record RECORD;
    has_reference BOOLEAN;
BEGIN
    SELECT id
      INTO seed_id
      FROM users
     WHERE public_key = 'test_public_key_123'
       AND display_name = 'Test User'
       AND email = 'test@oxsig.local'
     LIMIT 1;

    IF seed_id IS NULL THEN
        RETURN;
    END IF;

    FOR reference_record IN
        SELECT constraint_table.oid::regclass::text AS table_name,
               source_attribute.attname AS column_name
          FROM pg_constraint constraint_row
          JOIN pg_class constraint_table
            ON constraint_table.oid = constraint_row.conrelid
          JOIN unnest(constraint_row.conkey) WITH ORDINALITY AS source_key(attnum, position)
            ON true
          JOIN unnest(constraint_row.confkey) WITH ORDINALITY AS target_key(attnum, position)
            ON target_key.position = source_key.position
          JOIN pg_attribute source_attribute
            ON source_attribute.attrelid = constraint_row.conrelid
           AND source_attribute.attnum = source_key.attnum
          JOIN pg_attribute target_attribute
            ON target_attribute.attrelid = constraint_row.confrelid
           AND target_attribute.attnum = target_key.attnum
         WHERE constraint_row.contype = 'f'
           AND constraint_row.confrelid = 'users'::regclass
           AND target_attribute.attname = 'id'
    LOOP
        EXECUTE format(
            'SELECT EXISTS (SELECT 1 FROM %s WHERE %I = $1)',
            reference_record.table_name,
            reference_record.column_name
        ) INTO has_reference USING seed_id;

        IF has_reference THEN
            RETURN;
        END IF;
    END LOOP;

    DELETE FROM users WHERE id = seed_id;
END;
$$ LANGUAGE plpgsql;
