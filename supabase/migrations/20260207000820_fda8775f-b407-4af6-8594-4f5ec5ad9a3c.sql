
-- Create teams table
CREATE TABLE public.teams (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL,
  created_by uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.teams ENABLE ROW LEVEL SECURITY;

-- RLS policies - all authenticated users can manage teams
CREATE POLICY "Authenticated users can view teams"
  ON public.teams FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can create teams"
  ON public.teams FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can update teams"
  ON public.teams FOR UPDATE
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can delete teams"
  ON public.teams FOR DELETE
  USING (auth.uid() IS NOT NULL);

-- Insert default teams based on existing hardcoded values
INSERT INTO public.teams (name) VALUES
  ('SEG, QUA E SEX'),
  ('TER, QUI E SÁB'),
  ('SEG A SEX');
