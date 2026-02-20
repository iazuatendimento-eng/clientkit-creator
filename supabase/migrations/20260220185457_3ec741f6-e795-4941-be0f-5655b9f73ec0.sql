-- Allow public (unauthenticated) users to update cover_video and cover_image on project_briefs
CREATE POLICY "Public can update cover fields"
ON public.project_briefs
FOR UPDATE
USING (true)
WITH CHECK (true);