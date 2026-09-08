-- Remove the historical MVP collaboration seed from real databases.
-- Migration 004 inserted this row when test@example.com existed. Keep the cleanup
-- deliberately narrow so user-created collaborations and the test identity itself
-- are never removed.

DELETE FROM collaborations collaboration
USING users owner
WHERE collaboration.owner_id = owner.id
  AND owner.email = 'test@example.com'
  AND collaboration.name = 'Test Collaboration'
  AND collaboration.description = 'A sample collaboration for testing real-time features'
  AND collaboration.collaboration_type = 'document'
  AND collaboration.metadata = '{}'::jsonb
  AND collaboration.settings = '{}'::jsonb;
