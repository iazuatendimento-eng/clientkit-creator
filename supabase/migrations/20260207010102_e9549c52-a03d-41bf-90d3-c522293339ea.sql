-- Allow public/anonymous uploads to card-uploads bucket (for client portal)
DROP POLICY IF EXISTS "Authenticated users can upload card files" ON storage.objects;
CREATE POLICY "Anyone can upload card files"
ON storage.objects
FOR INSERT
WITH CHECK (bucket_id = 'card-uploads');

-- Allow public/anonymous updates to card-uploads bucket
DROP POLICY IF EXISTS "Authenticated users can update card files" ON storage.objects;
CREATE POLICY "Anyone can update card files"
ON storage.objects
FOR UPDATE
USING (bucket_id = 'card-uploads');

-- Allow public/anonymous deletes to card-uploads bucket
DROP POLICY IF EXISTS "Authenticated users can delete card files" ON storage.objects;
CREATE POLICY "Anyone can delete card files"
ON storage.objects
FOR DELETE
USING (bucket_id = 'card-uploads');
