CREATE TABLE org (
  id uuid PRIMARY KEY,
  code text NOT NULL,
  name text NOT NULL,
  CONSTRAINT uq_org_code UNIQUE (code)
);

CREATE TABLE project (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES org (id),
  team_id uuid NOT NULL REFERENCES team (id),
  code text NOT NULL,
  name text NOT NULL,
  archived_at timestamp,
  version bigint NOT NULL DEFAULT 1,
  created_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uq_project_org_code UNIQUE (org_id, code)
);
