CREATE TABLE revisions (
  revision_id TEXT PRIMARY KEY,
  digest TEXT NOT NULL,
  content TEXT NOT NULL
) STRICT;

CREATE TABLE publications (
  publication_id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  flow_id TEXT NOT NULL,
  revision_id TEXT NOT NULL,
  revision_digest TEXT NOT NULL,
  closure_digest TEXT NOT NULL,
  engine_contract TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  request_digest TEXT NOT NULL,
  UNIQUE (project_id, idempotency_key)
) STRICT;

CREATE TABLE flow_live (
  project_id TEXT NOT NULL,
  flow_id TEXT NOT NULL,
  publication_id TEXT NOT NULL,
  PRIMARY KEY (project_id, flow_id)
) STRICT;

CREATE TABLE webhook_bindings (
  endpoint_id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  flow_id TEXT NOT NULL,
  trigger_node_id TEXT NOT NULL,
  current_publication_id TEXT,
  runtime_version INTEGER NOT NULL CHECK (runtime_version > 0),
  trigger_json TEXT CHECK (
    trigger_json IS NULL OR
    (json_valid(trigger_json) AND json_type(trigger_json) = 'object')
  ),
  UNIQUE (project_id, flow_id, trigger_node_id)
) STRICT;

CREATE TABLE cron_bindings (
  binding_id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  flow_id TEXT NOT NULL,
  trigger_node_id TEXT NOT NULL,
  current_publication_id TEXT,
  runtime_version INTEGER NOT NULL CHECK (runtime_version > 0),
  trigger_json TEXT CHECK (
    trigger_json IS NULL OR
    (json_valid(trigger_json) AND json_type(trigger_json) = 'object')
  ),
  schedule_json TEXT CHECK (
    schedule_json IS NULL OR
    (json_valid(schedule_json) AND json_type(schedule_json) = 'array')
  ),
  next_at INTEGER,
  UNIQUE (project_id, flow_id, trigger_node_id)
) STRICT;

CREATE TABLE runs (
  run_id TEXT PRIMARY KEY,
  idempotency_key TEXT NOT NULL UNIQUE,
  request_digest TEXT NOT NULL,
  revision_id TEXT NOT NULL,
  revision_digest TEXT NOT NULL,
  flow_id TEXT NOT NULL,
  engine_contract TEXT NOT NULL,
  engine_digest TEXT NOT NULL,
  inputs TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('queued', 'starting', 'running', 'canceled', 'completed', 'failed', 'indeterminate')),
  result TEXT,
  event_count INTEGER NOT NULL DEFAULT 0,
  event_bytes INTEGER NOT NULL DEFAULT 0,
  events_truncated INTEGER NOT NULL DEFAULT 0 CHECK (events_truncated IN (0, 1))
) STRICT;

CREATE TABLE trigger_occurrences (
  occurrence_id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL UNIQUE,
  trigger_node_id TEXT NOT NULL,
  payload TEXT NOT NULL
) STRICT;

CREATE TABLE webhook_admissions (
  run_id TEXT PRIMARY KEY,
  endpoint_id TEXT NOT NULL,
  runtime_version INTEGER NOT NULL CHECK (runtime_version > 0),
  publication_id TEXT NOT NULL
) STRICT;

CREATE TABLE cron_admissions (
  run_id TEXT PRIMARY KEY,
  binding_id TEXT NOT NULL,
  runtime_version INTEGER NOT NULL CHECK (runtime_version > 0),
  publication_id TEXT NOT NULL,
  scheduled_at TEXT NOT NULL
) STRICT;

CREATE TABLE work (
  sequence INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id TEXT NOT NULL UNIQUE
) STRICT;

CREATE TABLE events (
  run_id TEXT NOT NULL,
  cursor INTEGER NOT NULL,
  kind TEXT NOT NULL,
  payload TEXT NOT NULL,
  value TEXT,
  PRIMARY KEY (run_id, cursor)
) STRICT;
