DELETE FROM card_uploads WHERE card_id IN (SELECT id FROM project_briefs);
DELETE FROM project_briefs;