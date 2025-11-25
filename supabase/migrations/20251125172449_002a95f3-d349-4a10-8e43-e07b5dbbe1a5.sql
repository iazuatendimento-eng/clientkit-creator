-- Add active field to client_data table
ALTER TABLE public.client_data 
ADD COLUMN active boolean NOT NULL DEFAULT true;

-- Add index for better performance on active status queries
CREATE INDEX idx_client_data_active ON public.client_data(active);

-- Add comment to document the field
COMMENT ON COLUMN public.client_data.active IS 'Indicates if the client is active. Inactive clients cannot have cards moved or new actions performed.';