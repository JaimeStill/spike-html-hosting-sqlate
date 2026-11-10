--| tier: standard
UPDATE team
SET name = {{name}}, {{> sql.guard_set}}
WHERE {{> sql.guard_where}}
