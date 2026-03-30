
CREATE OR REPLACE FUNCTION public.hash_password(p_password text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN extensions.crypt(p_password, extensions.gen_salt('bf'));
END;
$$;

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
  
  IF v_password_hash = extensions.crypt(p_password, v_password_hash) THEN
    RETURN v_client_id;
  END IF;
  
  RETURN NULL;
END;
$$;
