CREATE TABLE projects (
  project_id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('active', 'retiring')),
  draft_revision_id TEXT NOT NULL,
  create_idempotency_key TEXT NOT NULL UNIQUE,
  create_request_digest TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
) STRICT;

CREATE INDEX projects_list ON projects (created_at, project_id);

CREATE TABLE project_revisions (
  revision_id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  parent_revision_id TEXT,
  actor_id TEXT NOT NULL,
  created_at INTEGER NOT NULL
) STRICT;

CREATE INDEX project_revisions_project ON project_revisions (project_id, created_at, revision_id);

CREATE TABLE project_presentations (
  project_id TEXT PRIMARY KEY,
  revision INTEGER NOT NULL CHECK (revision > 0),
  value TEXT NOT NULL CHECK (json_valid(value) AND json_type(value) = 'object'),
  updated_at INTEGER NOT NULL
) STRICT;

ALTER TABLE runs ADD COLUMN project_id TEXT;
ALTER TABLE runs ADD COLUMN source TEXT CHECK (source IS NULL OR source IN ('draft', 'live', 'trigger'));
ALTER TABLE runs ADD COLUMN closure_digest TEXT;
ALTER TABLE runs ADD COLUMN model_version INTEGER CHECK (model_version IS NULL OR model_version > 0);
ALTER TABLE runs ADD COLUMN created_at INTEGER NOT NULL DEFAULT 0;
ALTER TABLE runs ADD COLUMN started_at INTEGER;
ALTER TABLE runs ADD COLUMN finished_at INTEGER;

CREATE INDEX runs_project_list ON runs (project_id, created_at, run_id);

ALTER TABLE events ADD COLUMN created_at INTEGER NOT NULL DEFAULT 0;
