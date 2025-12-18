-- Create card-uploads bucket (public for reading)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'card-uploads', 
  'card-uploads', 
  true,
  52428800, -- 50MB limit
  ARRAY['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'video/mp4', 'video/webm', 'video/quicktime']
)
ON CONFLICT (id) DO NOTHING;

-- Allow anyone to view files (public bucket)
CREATE POLICY "Public can view card uploads" 
ON storage.objects 
FOR SELECT 
USING (bucket_id = 'card-uploads');

-- Only authenticated users can upload
CREATE POLICY "Authenticated users can upload card files" 
ON storage.objects 
FOR INSERT 
WITH CHECK (bucket_id = 'card-uploads' AND auth.uid() IS NOT NULL);

-- Only authenticated users can update their uploads
CREATE POLICY "Authenticated users can update card files" 
ON storage.objects 
FOR UPDATE 
USING (bucket_id = 'card-uploads' AND auth.uid() IS NOT NULL);

-- Only authenticated users can delete files
CREATE POLICY "Authenticated users can delete card files" 
ON storage.objects 
FOR DELETE 
USING (bucket_id = 'card-uploads' AND auth.uid() IS NOT NULL);