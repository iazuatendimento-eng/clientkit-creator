ALTER TABLE public.project_briefs
  ADD COLUMN IF NOT EXISTS generated_art_url text,
  ADD COLUMN IF NOT EXISTS generated_art_expires_at timestamptz;