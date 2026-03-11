-- Drop the restrictive SELECT policy and recreate as permissive
DROP POLICY IF EXISTS "Users can view their own batches" ON public.batch_generations;
CREATE POLICY "Users can view their own batches"
ON public.batch_generations
FOR SELECT
TO authenticated
USING (auth.uid() = created_by);

-- Fix other policies too
DROP POLICY IF EXISTS "Users can create batches" ON public.batch_generations;
CREATE POLICY "Users can create batches"
ON public.batch_generations
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = created_by);

DROP POLICY IF EXISTS "Users can update their own batches" ON public.batch_generations;
CREATE POLICY "Users can update their own batches"
ON public.batch_generations
FOR UPDATE
TO authenticated
USING (auth.uid() = created_by);

DROP POLICY IF EXISTS "Users can delete their own batches" ON public.batch_generations;
CREATE POLICY "Users can delete their own batches"
ON public.batch_generations
FOR DELETE
TO authenticated
USING (auth.uid() = created_by);