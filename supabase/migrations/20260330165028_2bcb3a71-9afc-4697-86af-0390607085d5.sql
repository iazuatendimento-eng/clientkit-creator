
CREATE POLICY "Public can insert project_briefs"
  ON public.project_briefs
  FOR INSERT
  WITH CHECK (true);
