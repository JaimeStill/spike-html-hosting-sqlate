--| tier: native
--| native: postgres, RETURNING through app.identity.
INSERT INTO team (code, name)
VALUES ({{code}}, {{name}})
{{> app.identity}}
