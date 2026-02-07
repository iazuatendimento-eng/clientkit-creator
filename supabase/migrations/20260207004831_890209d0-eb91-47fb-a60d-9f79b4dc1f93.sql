-- Add sort_order column to project_briefs for drag-and-drop persistence
ALTER TABLE public.project_briefs ADD COLUMN sort_order integer NOT NULL DEFAULT 0;

-- Set initial sort_order based on created_at for existing records
WITH ranked AS (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY client_id ORDER BY created_at ASC) as rn
  FROM public.project_briefs
)
UPDATE public.project_briefs pb
SET sort_order = ranked.rn
FROM ranked
WHERE pb.id = ranked.id;