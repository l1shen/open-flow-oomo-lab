CREATE TABLE flow_connector_teams (
  flow_id TEXT PRIMARY KEY,
  team_id TEXT CHECK (team_id IS NULL OR length(team_id) > 0)
) STRICT;

INSERT INTO flow_connector_teams (flow_id, team_id)
SELECT flow_id, NULL FROM flows;

ALTER TABLE runs ADD COLUMN connector_team_id TEXT CHECK (connector_team_id IS NULL OR length(connector_team_id) > 0);
