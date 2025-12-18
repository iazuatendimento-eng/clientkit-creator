-- Create table for master art templates
CREATE TABLE public.master_templates (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  elements JSONB NOT NULL DEFAULT '[]'::jsonb,
  width INTEGER NOT NULL DEFAULT 1080,
  height INTEGER NOT NULL DEFAULT 1350,
  background_color TEXT NOT NULL DEFAULT '#ffffff',
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.master_templates ENABLE ROW LEVEL SECURITY;

-- Policies for authenticated users to manage their own templates
CREATE POLICY "Users can view their own templates" 
ON public.master_templates 
FOR SELECT 
USING (auth.uid() = created_by);

CREATE POLICY "Users can create templates" 
ON public.master_templates 
FOR INSERT 
WITH CHECK (auth.uid() = created_by);

CREATE POLICY "Users can update their own templates" 
ON public.master_templates 
FOR UPDATE 
USING (auth.uid() = created_by);

CREATE POLICY "Users can delete their own templates" 
ON public.master_templates 
FOR DELETE 
USING (auth.uid() = created_by);

-- Trigger for updated_at
CREATE TRIGGER update_master_templates_updated_at
BEFORE UPDATE ON public.master_templates
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();