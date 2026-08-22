WITH admissions(run_id, publication_id) AS (
  SELECT run_id, publication_id FROM webhook_admissions
  UNION ALL
  SELECT run_id, publication_id FROM cron_admissions
  UNION ALL
  SELECT run_id, publication_id FROM poll_admissions
  UNION ALL
  SELECT run_id, publication_id FROM integration_admissions
)
UPDATE runs
SET project_id = publications.project_id,
    source = 'trigger',
    closure_digest = publications.closure_digest,
    model_version = publications.model_version,
    publication_id = publications.publication_id
FROM admissions
JOIN publications ON publications.publication_id = admissions.publication_id
WHERE runs.run_id = admissions.run_id
  AND runs.source IS NULL;
