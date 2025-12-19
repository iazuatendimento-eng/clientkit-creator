-- Drop existing restrictive policies for master_templates
DROP POLICY IF EXISTS "Users can view their own templates" ON public.master_templates;
DROP POLICY IF EXISTS "Users can create templates" ON public.master_templates;
DROP POLICY IF EXISTS "Users can update their own templates" ON public.master_templates;
DROP POLICY IF EXISTS "Users can delete their own templates" ON public.master_templates;

-- Create new policies that allow all authenticated users to view all templates
CREATE POLICY "Authenticated users can view all templates" 
ON public.master_templates 
FOR SELECT 
USING (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can create templates" 
ON public.master_templates 
FOR INSERT 
WITH CHECK (auth.uid() = created_by);

CREATE POLICY "Authenticated users can update any template" 
ON public.master_templates 
FOR UPDATE 
USING (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can delete any template" 
ON public.master_templates 
FOR DELETE 
USING (auth.uid() IS NOT NULL);

-- Drop existing restrictive policies for master_video_templates
DROP POLICY IF EXISTS "Users can view their own video templates" ON public.master_video_templates;
DROP POLICY IF EXISTS "Users can create their own video templates" ON public.master_video_templates;
DROP POLICY IF EXISTS "Users can update their own video templates" ON public.master_video_templates;
DROP POLICY IF EXISTS "Users can delete their own video templates" ON public.master_video_templates;

-- Create new policies that allow all authenticated users to view all video templates
CREATE POLICY "Authenticated users can view all video templates" 
ON public.master_video_templates 
FOR SELECT 
USING (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can create video templates" 
ON public.master_video_templates 
FOR INSERT 
WITH CHECK (auth.uid() = created_by);

CREATE POLICY "Authenticated users can update any video template" 
ON public.master_video_templates 
FOR UPDATE 
USING (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can delete any video template" 
ON public.master_video_templates 
FOR DELETE 
USING (auth.uid() IS NOT NULL);