ALTER TABLE projects ADD COLUMN deletion_requested_at INTEGER;
ALTER TABLE projects ADD COLUMN deletion_attempted_at INTEGER;

CREATE INDEX projects_retirement ON projects (status, deletion_attempted_at, deletion_requested_at, project_id);

ALTER TABLE runs ADD COLUMN events_expires_at INTEGER;

CREATE INDEX runs_events_expiry ON runs (events_expires_at, run_id);
