-- Create batch_generations table to store history of generated art/video batches
CREATE TABLE public.batch_generations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type TEXT NOT NULL CHECK (type IN ('art', 'video')),
  template_snapshot JSONB NOT NULL, -- Full template state at generation time
  items JSONB NOT NULL DEFAULT '[]'::jsonb, -- Array of generated items with files, adjustments
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.batch_generations ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Users can view their own batches"
  ON public.batch_generations FOR SELECT
  USING (auth.uid() = created_by);

CREATE POLICY "Users can create batches"
  ON public.batch_generations FOR INSERT
  WITH CHECK (auth.uid() = created_by);

CREATE POLICY "Users can update their own batches"
  ON public.batch_generations FOR UPDATE
  USING (auth.uid() = created_by);

CREATE POLICY "Users can delete their own batches"
  ON public.batch_generations FOR DELETE
  USING (auth.uid() = created_by);

-- Index for faster queries
CREATE INDEX idx_batch_generations_created_by ON public.batch_generations(created_by);
CREATE INDEX idx_batch_generations_type ON public.batch_generations(type);
CREATE INDEX idx_batch_generations_created_at ON public.batch_generations(created_at DESC);