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

    const { query, perPage = 5, page = 1 } = await req.json();
    if (!query) {
      throw new Error('Query is required');
    }

    // Sanitize query
    const sanitized = query.replace(/[\n\r]+/g, ' ').replace(/\s+/g, ' ').trim();
    const shortQuery = sanitized.split(/\s+/).slice(0, 5).join(' ').substring(0, 80);

    const url = `https://pixabay.com/api/videos/?key=${apiKey}&q=${encodeURIComponent(shortQuery)}&per_page=${perPage}&page=${page}&safesearch=true`;

    let response: Response | null = null;
    const maxRetries = 3;
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      response = await fetch(url);
      if (response.status === 429) {
        const delay = 1000 * (attempt + 1); // 1s, 2s, 3s
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

    const videos = (data.hits || []).map((video: any) => {
      // Get the best quality video (prefer large, then medium, then small)
      const large = video.videos?.large;
      const medium = video.videos?.medium;
      const small = video.videos?.small;
      const tiny = video.videos?.tiny;
      const best = large?.url ? large : medium?.url ? medium : small;
      // Use tiny video thumbnail or construct from userImageURL
      const thumbnail = tiny?.thumbnail || video.userImageURL || '';

      return {
        id: `pixabay-video-${video.id}`,
        url: video.pageURL,
        image: thumbnail,
        duration: video.duration,
        videoUrl: best?.url || '',
        photographer: video.user || 'Pixabay',
        description: video.tags || query,
        source: 'pixabay',
      };
    }).filter((v: any) => v.videoUrl);

    return new Response(JSON.stringify({ videos }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Pixabay search error:', error);
    return new Response(JSON.stringify({ error: error.message, videos: [] }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
