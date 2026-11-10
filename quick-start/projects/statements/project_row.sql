--| tier: standard
-- The row an archive changed, read in the organization.
SELECT id, code, archived_at, version FROM project
WHERE id = {{id}} AND {{> app.tenant}}
