-- Drop existing restrictive policies
DROP POLICY IF EXISTS "Users can create batches" ON batch_generations;
DROP POLICY IF EXISTS "Users can delete their own batches" ON batch_generations;
DROP POLICY IF EXISTS "Users can update their own batches" ON batch_generations;
DROP POLICY IF EXISTS "Users can view their own batches" ON batch_generations;

-- Recreate as PERMISSIVE policies (default)
CREATE POLICY "Users can view their own batches"
ON batch_generations
FOR SELECT
USING (auth.uid() = created_by);

CREATE POLICY "Users can create batches"
ON batch_generations
FOR INSERT
WITH CHECK (auth.uid() = created_by);

CREATE POLICY "Users can update their own batches"
ON batch_generations
FOR UPDATE
USING (auth.uid() = created_by);

CREATE POLICY "Users can delete their own batches"
ON batch_generations
FOR DELETE
USING (auth.uid() = created_by);