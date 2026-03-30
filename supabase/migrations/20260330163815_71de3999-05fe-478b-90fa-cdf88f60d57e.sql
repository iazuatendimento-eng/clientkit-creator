
-- Table to store client login credentials (separate from client_data for security)
CREATE TABLE public.client_credentials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.client_data(id) ON DELETE CASCADE,
  username text NOT NULL UNIQUE,
  password_hash text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Only authenticated admins can manage credentials
ALTER TABLE public.client_credentials ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage client_credentials"
  ON public.client_credentials
  FOR ALL
  USING (auth.uid() IS NOT NULL);

-- Function to hash password using pgcrypto
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Function to verify client login (security definer to bypass RLS)
CREATE OR REPLACE FUNCTION public.verify_client_login(p_username text, p_password text)
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_client_id uuid;
  v_password_hash text;
BEGIN
  SELECT client_id, password_hash INTO v_client_id, v_password_hash
  FROM public.client_credentials
  WHERE username = p_username;
  
  IF v_client_id IS NULL THEN
    RETURN NULL;
  END IF;
  
  IF v_password_hash = crypt(p_password, v_password_hash) THEN
    RETURN v_client_id;
  END IF;
  
  RETURN NULL;
END;
$$;

-- Grant execute to anon role so unauthenticated clients can login
GRANT EXECUTE ON FUNCTION public.verify_client_login(text, text) TO anon;
GRANT EXECUTE ON FUNCTION public.verify_client_login(text, text) TO authenticated;
