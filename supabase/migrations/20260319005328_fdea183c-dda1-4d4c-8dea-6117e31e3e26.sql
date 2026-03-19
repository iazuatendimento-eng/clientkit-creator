ALTER TABLE public.project_briefs 
ADD COLUMN completion_type TEXT DEFAULT NULL,
ADD COLUMN completion_template_id TEXT DEFAULT NULL,
ADD COLUMN completion_template_name TEXT DEFAULT NULL;