--| tier: standard
--| key: id
--| field: id uuid
--| field: code text
--| field: name text
--| field: version bigint
--| field: created_at timestamp
-- The read model. The SELECT list is the scan order.
SELECT id, code, name, version, created_at, updated_at
FROM team
