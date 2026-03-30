ALTER TABLE public.client_data
ADD COLUMN monthly_material_limit integer NOT NULL DEFAULT 30,
ADD COLUMN monthly_material_used integer NOT NULL DEFAULT 0,
ADD COLUMN material_usage_reset_at timestamp with time zone NOT NULL DEFAULT date_trunc('month', now());