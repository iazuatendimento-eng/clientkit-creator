-- Add caption field to project_briefs table
ALTER TABLE public.project_briefs 
ADD COLUMN generated_caption text;

-- Add index for better performance on caption queries
CREATE INDEX idx_project_briefs_caption ON public.project_briefs(generated_caption);

-- Add comment to document the field
COMMENT ON COLUMN public.project_briefs.generated_caption IS 'Auto-generated caption with emojis and hashtags for social media';