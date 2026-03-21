
-- For each client with 2+ completed cards, move the one with the highest sort_order back to "todo"
WITH to_revert AS (
  SELECT DISTINCT ON (client_id) id
  FROM project_briefs
  WHERE status = 'completed'
    AND client_id IN (
      SELECT client_id FROM project_briefs WHERE status = 'completed' GROUP BY client_id HAVING count(*) >= 2
    )
  ORDER BY client_id, sort_order DESC, created_at DESC
)
UPDATE project_briefs
SET status = 'todo',
    completion_type = NULL,
    completion_template_id = NULL,
    completion_template_name = NULL
WHERE id IN (SELECT id FROM to_revert);
