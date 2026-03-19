CREATE OR REPLACE FUNCTION public.get_client_brand_kit_urls(client_ids uuid[])
RETURNS TABLE(id uuid, image_type text, narration_type text, briefing text, logo text, contact_info text, mascot text, colors jsonb)
LANGUAGE sql STABLE
AS $$
  SELECT 
    cd.id,
    cd.image_type,
    cd.narration_type,
    cd.briefing,
    COALESCE(
      cd.brand_kit->>'logo',
      cd.brand_kit->'pngs'->>0,
      ''
    ) as logo,
    COALESCE(
      cd.brand_kit->>'contactInfo',
      cd.brand_kit->'pngs'->>1,
      ''
    ) as contact_info,
    COALESCE(
      cd.brand_kit->>'mascot',
      cd.brand_kit->'pngs'->>2,
      ''
    ) as mascot,
    cd.brand_kit->'colors' as colors
  FROM client_data cd
  WHERE cd.id = ANY(client_ids);
$$;