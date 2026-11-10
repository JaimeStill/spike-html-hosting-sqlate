--| tier: standard
--| key: id
--| field: id uuid not null
--| field: code text not null
--| field: name text not null
--| field: team text not null
--| field: created_at timestamp not null
-- One organization's live projects, each with its team's code.
SELECT p.id, p.code, p.name, t.code AS team, p.version, p.created_at
FROM project p
JOIN team t ON t.id = p.team_id
WHERE {{> app.tenant}} AND {{> app.live}}
