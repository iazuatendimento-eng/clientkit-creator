-- Add published field to project_briefs table
ALTER TABLE public.project_briefs 
ADD COLUMN published boolean NOT NULL DEFAULT false;

-- Add index for better performance on published queries
CREATE INDEX idx_project_briefs_published ON public.project_briefs(published);

-- Add comment to document the field
COMMENT ON COLUMN public.project_briefs.published IS 'Indicates if the client has published the content on social media';