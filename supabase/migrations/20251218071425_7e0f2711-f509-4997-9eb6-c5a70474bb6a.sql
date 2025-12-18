-- Add monthly_amount to client_data table
ALTER TABLE public.client_data 
ADD COLUMN IF NOT EXISTS monthly_amount decimal(10,2);