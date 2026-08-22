CREATE TABLE integration_bindings (
  binding_id TEXT PRIMARY KEY,
  endpoint_id TEXT NOT NULL UNIQUE,
  project_id TEXT NOT NULL,
  flow_id TEXT NOT NULL,
  trigger_node_id TEXT NOT NULL,
  current_publication_id TEXT,
  runtime_version INTEGER NOT NULL CHECK (runtime_version > 0),
  trigger_json TEXT NOT NULL CHECK (json_valid(trigger_json) AND json_type(trigger_json) = 'object'),
  connection_id TEXT NOT NULL,
  health TEXT NOT NULL CHECK (health IN ('initializing', 'healthy', 'needs_reauth', 'failed')),
  reconcile_at INTEGER,
  retry_at INTEGER,
  UNIQUE (project_id, flow_id, trigger_node_id)
) STRICT;

CREATE TABLE integration_states (
  binding_id TEXT PRIMARY KEY,
  runtime_version INTEGER NOT NULL CHECK (runtime_version > 0),
  trigger_json TEXT NOT NULL CHECK (json_valid(trigger_json) AND json_type(trigger_json) = 'object'),
  connection_id TEXT NOT NULL,
  checkpoint_json TEXT NOT NULL CHECK (json_valid(checkpoint_json)),
  subscription_json TEXT NOT NULL CHECK (json_valid(subscription_json) AND json_type(subscription_json) = 'object'),
  reconcile_at INTEGER,
  updated_at INTEGER NOT NULL
) STRICT;

CREATE TABLE integration_admissions (
  run_id TEXT PRIMARY KEY,
  binding_id TEXT NOT NULL,
  runtime_version INTEGER NOT NULL CHECK (runtime_version > 0),
  publication_id TEXT NOT NULL
) STRICT;

CREATE INDEX integration_bindings_wake ON integration_bindings (reconcile_at, retry_at, binding_id);
CREATE INDEX integration_states_wake ON integration_states (reconcile_at, binding_id);
