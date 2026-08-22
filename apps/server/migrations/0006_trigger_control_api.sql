ALTER TABLE webhook_bindings ADD COLUMN operator_state TEXT NOT NULL DEFAULT 'active' CHECK (operator_state IN ('active', 'paused'));
ALTER TABLE webhook_bindings ADD COLUMN updated_at INTEGER NOT NULL DEFAULT 0 CHECK (updated_at >= 0);

ALTER TABLE cron_bindings ADD COLUMN operator_state TEXT NOT NULL DEFAULT 'active' CHECK (operator_state IN ('active', 'paused'));
ALTER TABLE cron_bindings ADD COLUMN updated_at INTEGER NOT NULL DEFAULT 0 CHECK (updated_at >= 0);

ALTER TABLE poll_bindings ADD COLUMN operator_state TEXT NOT NULL DEFAULT 'active' CHECK (operator_state IN ('active', 'paused'));
ALTER TABLE poll_bindings ADD COLUMN updated_at INTEGER NOT NULL DEFAULT 0 CHECK (updated_at >= 0);
ALTER TABLE poll_bindings ADD COLUMN last_error_code TEXT;

ALTER TABLE integration_bindings ADD COLUMN operator_state TEXT NOT NULL DEFAULT 'active' CHECK (operator_state IN ('active', 'paused'));
ALTER TABLE integration_bindings ADD COLUMN updated_at INTEGER NOT NULL DEFAULT 0 CHECK (updated_at >= 0);
ALTER TABLE integration_bindings ADD COLUMN last_error_code TEXT;

CREATE TABLE trigger_activities (
  activity_id TEXT PRIMARY KEY,
  binding_id TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (
    kind IN (
      'delivery.failed',
      'health.failed',
      'health.needs_reauth',
      'health.recovered',
      'health.suspended',
      'operator.paused',
      'operator.resumed'
    )
  ),
  error_code TEXT,
  error_message TEXT CHECK (error_message IS NULL OR length(error_message) <= 512),
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
) STRICT;

CREATE INDEX trigger_activities_binding ON trigger_activities (binding_id, created_at DESC, activity_id DESC);
CREATE INDEX trigger_activities_expiry ON trigger_activities (expires_at, activity_id);
