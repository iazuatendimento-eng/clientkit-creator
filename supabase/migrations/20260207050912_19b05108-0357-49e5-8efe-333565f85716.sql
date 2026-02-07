
-- Add briefing column to client_data
ALTER TABLE public.client_data ADD COLUMN briefing text;

-- Create client_uploads table for client-level file uploads
CREATE TABLE public.client_uploads (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id uuid NOT NULL REFERENCES public.client_data(id) ON DELETE CASCADE,
  file_url text NOT NULL,
  file_name text NOT NULL,
  file_type text NOT NULL,
  uploaded_at timestamp with time zone DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.client_uploads ENABLE ROW LEVEL SECURITY;

-- Authenticated users can manage client_uploads
CREATE POLICY "Admins can manage client_uploads"
ON public.client_uploads
FOR ALL
USING (auth.uid() IS NOT NULL);

-- Public read access
CREATE POLICY "Public read access to client_uploads"
ON public.client_uploads
FOR SELECT
USING (true);
