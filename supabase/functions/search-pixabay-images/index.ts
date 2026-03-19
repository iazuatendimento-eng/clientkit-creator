import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const apiKey = Deno.env.get('PIXABAY_API_KEY');
    if (!apiKey) {
      throw new Error('PIXABAY_API_KEY is not configured');
    }

    const { query, perPage = 12, page = 1 } = await req.json();
    if (!query) {
      throw new Error('Query is required');
    }

    const sanitized = query.replace(/[\n\r]+/g, ' ').replace(/\s+/g, ' ').trim();
    const shortQuery = sanitized.split(/\s+/).slice(0, 5).join(' ').substring(0, 80);

    const url = `https://pixabay.com/api/?key=${apiKey}&q=${encodeURIComponent(shortQuery)}&per_page=${perPage}&page=${page}&image_type=photo&safesearch=true&orientation=vertical`;

    let response: Response | null = null;
    const maxRetries = 3;
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      response = await fetch(url);
      if (response.status === 429) {
        const delay = 1000 * (attempt + 1);
        console.warn(`Pixabay 429 throttled, retrying in ${delay}ms (attempt ${attempt + 1}/${maxRetries})`);
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }
      break;
    }

    if (!response || !response.ok) {
      const status = response?.status || 'unknown';
      const body = response ? await response.text() : 'No response';
      throw new Error(`Pixabay API error [${status}]: ${body}`);
    }

    const data = await response.json();

    const images = (data.hits || []).map((img: any) => ({
      id: `pixabay-${img.id}`,
      urls: {
        regular: img.largeImageURL || img.webformatURL,
        small: img.webformatURL,
        thumb: img.previewURL,
      },
      photographer: img.user || 'Pixabay',
      photographerUrl: `https://pixabay.com/users/${img.user_id}/`,
      description: img.tags || query,
      source: 'pixabay',
    }));

    return new Response(JSON.stringify({ images }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Pixabay image search error:', error);
    return new Response(JSON.stringify({ error: error.message, images: [] }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
