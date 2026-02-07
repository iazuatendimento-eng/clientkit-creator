-- Allow public/anonymous inserts to card_uploads table (for client portal uploads)
CREATE POLICY "Public can insert card_uploads"
ON public.card_uploads
FOR INSERT
WITH CHECK (true);
