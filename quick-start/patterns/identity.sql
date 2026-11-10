--| tier: native
--| native: postgres, RETURNING. Ports: OUTPUT INSERTED (SQL Server), a second read (MySQL).
-- The identity every command returns: the row's key and its version.
RETURNING id, version
