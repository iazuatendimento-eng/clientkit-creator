
ALTER TABLE public.master_templates ADD COLUMN deleted boolean NOT NULL DEFAULT false;
ALTER TABLE public.master_video_templates ADD COLUMN deleted boolean NOT NULL DEFAULT false;
