-- Add field to mark cards for art generation
ALTER TABLE public.project_briefs 
ADD COLUMN IF NOT EXISTS art_generation_selected BOOLEAN NOT NULL DEFAULT false;