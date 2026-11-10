--| tier: standard
--| returning: project_row
-- Archives a live project of the organization, guarded by its version.
UPDATE project
SET archived_at = CURRENT_TIMESTAMP, {{> sql.guard_set}}
WHERE {{> sql.guard_where}} AND {{> app.tenant}} AND {{> app.live}}
