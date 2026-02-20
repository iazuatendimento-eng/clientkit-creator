-- Allow public read access to video templates so the public portal can generate videos
CREATE POLICY "Public read access to video templates"
ON public.master_video_templates
FOR SELECT
USING (true);