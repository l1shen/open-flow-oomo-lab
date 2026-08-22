ALTER TABLE publications ADD COLUMN actor_id TEXT NOT NULL DEFAULT 'legacy';
ALTER TABLE publications ADD COLUMN operation TEXT NOT NULL DEFAULT 'publish' CHECK (operation IN ('publish', 'rollback'));
ALTER TABLE publications ADD COLUMN source_publication_id TEXT;
ALTER TABLE publications ADD COLUMN model_version INTEGER NOT NULL DEFAULT 1 CHECK (model_version > 0);
ALTER TABLE publications ADD COLUMN created_at INTEGER NOT NULL DEFAULT 0;

CREATE INDEX publications_list ON publications (project_id, flow_id, created_at DESC, publication_id DESC);

ALTER TABLE flow_live ADD COLUMN revision INTEGER NOT NULL DEFAULT 1 CHECK (revision > 0);
ALTER TABLE flow_live ADD COLUMN updated_at INTEGER NOT NULL DEFAULT 0;

ALTER TABLE runs ADD COLUMN publication_id TEXT;
