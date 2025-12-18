-- Add payment fields to client_data table
ALTER TABLE public.client_data 
ADD COLUMN IF NOT EXISTS payment_method text CHECK (payment_method IN ('pix', 'credit_card')),
ADD COLUMN IF NOT EXISTS payment_due_day integer CHECK (payment_due_day >= 1 AND payment_due_day <= 31);

-- Create payments tracking table
CREATE TABLE IF NOT EXISTS public.client_payments (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id uuid NOT NULL REFERENCES public.client_data(id) ON DELETE CASCADE,
  amount decimal(10,2) NOT NULL DEFAULT 0,
  due_date date NOT NULL,
  payment_method text CHECK (payment_method IN ('pix', 'credit_card')),
  paid boolean NOT NULL DEFAULT false,
  paid_at timestamp with time zone,
  notes text,
  created_at timestamp with time zone DEFAULT now(),
  created_by uuid
);

-- Enable RLS
ALTER TABLE public.client_payments ENABLE ROW LEVEL SECURITY;

-- RLS policies for client_payments
CREATE POLICY "Admins can manage client_payments" 
ON public.client_payments 
FOR ALL 
USING (auth.uid() IS NOT NULL);

CREATE POLICY "Public read access to client_payments" 
ON public.client_payments 
FOR SELECT 
USING (true);

-- Create index for better query performance
CREATE INDEX IF NOT EXISTS idx_client_payments_due_date ON public.client_payments(due_date);
CREATE INDEX IF NOT EXISTS idx_client_payments_paid ON public.client_payments(paid);
CREATE INDEX IF NOT EXISTS idx_client_payments_client_id ON public.client_payments(client_id);