
CREATE OR REPLACE FUNCTION public.hash_password(p_password text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  RETURN public.crypt(p_password, public.gen_salt('bf'));
END;
$$;

GRANT EXECUTE ON FUNCTION public.hash_password(text) TO authenticated;
