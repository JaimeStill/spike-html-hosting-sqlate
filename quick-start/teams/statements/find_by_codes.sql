--| tier: standard
SELECT id, code, name, version, created_at, updated_at
FROM team
WHERE code IN ({{codes...}})
ORDER BY code
