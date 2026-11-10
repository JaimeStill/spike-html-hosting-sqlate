--| tier: standard
DELETE FROM team
WHERE {{> sql.guard_where}}
