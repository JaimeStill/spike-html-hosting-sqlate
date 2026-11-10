--| tier: standard
-- Inserts a team unless one with the code exists, so a seed is idempotent.
MERGE INTO team AS t
USING (VALUES ({{id:uuid}}, {{code}}, {{name}})) AS s (id, code, name)
ON t.code = s.code
WHEN NOT MATCHED THEN INSERT (id, code, name) VALUES (s.id, s.code, s.name)
