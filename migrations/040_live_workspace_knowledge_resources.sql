-- Extend Live Workspace resource bindings to non-machine learning context.
-- Visibility inside a workspace does not transfer ownership and does not grant
-- terminal or desktop control. Machine-control leases remain lab-instance only.

ALTER TABLE live_workspace_resources
  DROP CONSTRAINT IF EXISTS live_workspace_resources_resource_type_check;

ALTER TABLE live_workspace_resources
  ADD CONSTRAINT live_workspace_resources_resource_type_check
  CHECK (resource_type IN (
    'lab-instance',
    'academy-course',
    'infrastructure-design',
    'storyboard',
    'vault-item'
  ));

COMMENT ON COLUMN live_workspace_resources.resource_type IS
  'Workspace-visible owner resource. Non-machine bindings such as storyboard and vault-item never imply terminal/desktop control.';
