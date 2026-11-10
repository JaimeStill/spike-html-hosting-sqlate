--| tier: standard
MERGE INTO org AS o
USING (VALUES ({{id:uuid}}, {{code}}, {{name}})) AS s (id, code, name)
ON o.code = s.code
WHEN NOT MATCHED THEN INSERT (id, code, name) VALUES (s.id, s.code, s.name)
