CREATE TABLE poll_bindings (
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
  connection_id TEXT,
  schedule_json TEXT CHECK (
    schedule_json IS NULL OR
    (json_valid(schedule_json) AND json_type(schedule_json) = 'array')
  ),
  next_at INTEGER,
  retry_at INTEGER,
  health TEXT NOT NULL CHECK (health IN ('initializing', 'healthy', 'needs_reauth', 'failed')),
  checkpoint_json TEXT NOT NULL DEFAULT 'null' CHECK (json_valid(checkpoint_json)),
  continuation_root_id TEXT,
  continuation_page INTEGER NOT NULL DEFAULT 0 CHECK (continuation_page >= 0),
  active_claim_id TEXT,
  active_lease_token TEXT,
  active_lease_expires_at INTEGER,
  UNIQUE (project_id, flow_id, trigger_node_id)
) STRICT;

CREATE TABLE poll_claims (
  binding_id TEXT NOT NULL,
  claim_id TEXT NOT NULL,
  root_occurrence_id TEXT NOT NULL,
  page INTEGER NOT NULL CHECK (page >= 0),
  runtime_version INTEGER NOT NULL CHECK (runtime_version > 0),
  run_id TEXT,
  completed_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  PRIMARY KEY (binding_id, claim_id)
) STRICT;

CREATE TABLE poll_event_dedupe (
  binding_id TEXT NOT NULL,
  provider_event_id TEXT NOT NULL,
  run_id TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  PRIMARY KEY (binding_id, provider_event_id)
) STRICT;

CREATE TABLE poll_admissions (
  run_id TEXT PRIMARY KEY,
  binding_id TEXT NOT NULL,
  runtime_version INTEGER NOT NULL CHECK (runtime_version > 0),
  publication_id TEXT NOT NULL,
  root_occurrence_id TEXT NOT NULL,
  page INTEGER NOT NULL CHECK (page >= 0)
) STRICT;

CREATE INDEX poll_bindings_wake ON poll_bindings (next_at, retry_at, binding_id);
CREATE INDEX poll_claims_expiry ON poll_claims (expires_at, binding_id, claim_id);
CREATE INDEX poll_event_dedupe_expiry ON poll_event_dedupe (expires_at, binding_id, provider_event_id);
