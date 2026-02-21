
-- Add columns for temporary generated video storage
ALTER TABLE public.project_briefs
ADD COLUMN generated_video_url text,
ADD COLUMN generated_video_expires_at timestamp with time zone;
