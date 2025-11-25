-- Create clients table
CREATE TABLE IF NOT EXISTS public.client_data (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  company TEXT,
  phone TEXT,
  notes TEXT,
  team TEXT CHECK (team IN ('1', '2', '3')),
  slug TEXT UNIQUE NOT NULL,
  brand_kit JSONB,
  created_at TIMESTAMPTZ DEFAULT now(),
  created_by UUID REFERENCES auth.users(id)
);

-- Create project briefs table
CREATE TABLE IF NOT EXISTS public.project_briefs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID REFERENCES public.client_data(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  deadline DATE,
  status TEXT CHECK (status IN ('todo', 'completed')) DEFAULT 'todo',
  brand_kit_id TEXT,
  cover_image TEXT,
  cover_video TEXT,
  brief_type TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Create card uploads table
CREATE TABLE IF NOT EXISTS public.card_uploads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  card_id UUID REFERENCES public.project_briefs(id) ON DELETE CASCADE,
  file_name TEXT NOT NULL,
  file_url TEXT NOT NULL,
  file_type TEXT NOT NULL,
  upload_type TEXT CHECK (upload_type IN ('material', 'final')) NOT NULL,
  uploaded_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.client_data ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_briefs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.card_uploads ENABLE ROW LEVEL SECURITY;

-- Policies for client_data
-- Admins can do everything
CREATE POLICY "Admins can manage client_data"
ON public.client_data
FOR ALL
USING (auth.uid() IS NOT NULL);

-- Anyone can read client_data (for public links)
CREATE POLICY "Public read access to client_data"
ON public.client_data
FOR SELECT
USING (true);

-- Policies for project_briefs
-- Admins can manage briefs
CREATE POLICY "Admins can manage project_briefs"
ON public.project_briefs
FOR ALL
USING (auth.uid() IS NOT NULL);

-- Anyone can read briefs (for public links)
CREATE POLICY "Public read access to project_briefs"
ON public.project_briefs
FOR SELECT
USING (true);

-- Policies for card_uploads
-- Admins can manage uploads
CREATE POLICY "Admins can manage card_uploads"
ON public.card_uploads
FOR ALL
USING (auth.uid() IS NOT NULL);

-- Anyone can read uploads (for public links)
CREATE POLICY "Public read access to card_uploads"
ON public.card_uploads
FOR SELECT
USING (true);

-- Create indexes for better performance
CREATE INDEX idx_client_data_slug ON public.client_data(slug);
CREATE INDEX idx_project_briefs_client_id ON public.project_briefs(client_id);
CREATE INDEX idx_project_briefs_status ON public.project_briefs(status);
CREATE INDEX idx_card_uploads_card_id ON public.card_uploads(card_id);