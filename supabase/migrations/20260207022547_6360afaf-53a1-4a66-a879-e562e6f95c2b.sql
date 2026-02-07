-- Adicionar campos de tipo de narração, imagem e particularidade ao cadastro do cliente
ALTER TABLE public.client_data
ADD COLUMN narration_type text,
ADD COLUMN image_type text,
ADD COLUMN particularity_type text;