--| tier: standard
-- Inserts an organization's project unless its code exists there; the team is named by code.
MERGE INTO project AS p
USING (SELECT {{id:uuid}} AS id, {{org:uuid}} AS org_id, t.id AS team_id, {{code}} AS code, {{name}} AS name
       FROM team t WHERE t.code = {{team}}) AS s
ON p.org_id = s.org_id AND p.code = s.code
WHEN NOT MATCHED THEN INSERT (id, org_id, team_id, code, name)
  VALUES (s.id, s.org_id, s.team_id, s.code, s.name)
