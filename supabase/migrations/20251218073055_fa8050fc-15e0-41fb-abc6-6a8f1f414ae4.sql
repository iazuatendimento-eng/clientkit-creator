-- Create master video templates table
CREATE TABLE public.master_video_templates (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  content_elements JSONB NOT NULL DEFAULT '[]',
  signature_elements JSONB NOT NULL DEFAULT '[]',
  width INTEGER NOT NULL DEFAULT 1080,
  height INTEGER NOT NULL DEFAULT 1920,
  background_color TEXT NOT NULL DEFAULT '#1a1a2e',
  page_duration INTEGER NOT NULL DEFAULT 10,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.master_video_templates ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Users can view their own video templates" 
ON public.master_video_templates 
FOR SELECT 
USING (auth.uid() = created_by);

CREATE POLICY "Users can create their own video templates" 
ON public.master_video_templates 
FOR INSERT 
WITH CHECK (auth.uid() = created_by);

CREATE POLICY "Users can update their own video templates" 
ON public.master_video_templates 
FOR UPDATE 
USING (auth.uid() = created_by);

CREATE POLICY "Users can delete their own video templates" 
ON public.master_video_templates 
FOR DELETE 
USING (auth.uid() = created_by);

-- Create trigger for automatic timestamp updates
CREATE TRIGGER update_master_video_templates_updated_at
BEFORE UPDATE ON public.master_video_templates
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();