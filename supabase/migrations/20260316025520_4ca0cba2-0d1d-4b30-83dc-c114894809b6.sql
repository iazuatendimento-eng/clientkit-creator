
-- Strip base64 data URLs from batch_generations items.files arrays
-- This is a one-time cleanup to reduce bloated JSONB columns
UPDATE batch_generations
SET items = (
  SELECT jsonb_agg(
    jsonb_set(
      item,
      '{files}',
      COALESCE(
        (SELECT jsonb_agg(f)
         FROM jsonb_array_elements_text(item->'files') AS f
         WHERE f::text LIKE 'http%'),
        '[]'::jsonb
      )
    )
  )
  FROM jsonb_array_elements(items) AS item
)
WHERE items::text LIKE '%data:image%' OR items::text LIKE '%blob:%';
