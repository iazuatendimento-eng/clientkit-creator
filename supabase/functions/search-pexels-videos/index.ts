import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const CACHE_TTL_MS = 10 * 60 * 1000;
const MAX_POOL_SIZE = 80;
const queryCache = new Map<string, { videos: any[]; cachedAt: number }>();
let fallbackPool: any[] = [];

const getCached = (key: string): any[] | null => {
  const item = queryCache.get(key);
  if (!item) return null;
  if (Date.now() - item.cachedAt > CACHE_TTL_MS) {
    queryCache.delete(key);
    return null;
  }
  return item.videos;
};

const setCached = (key: string, videos: any[]) => {
  queryCache.set(key, { videos, cachedAt: Date.now() });
  if (videos.length > 0) {
    const merged = [...videos, ...fallbackPool];
    const uniqueById = new Map<string, any>();
    for (const item of merged) {
      if (item?.id && !uniqueById.has(item.id)) uniqueById.set(item.id, item);
    }
    fallbackPool = Array.from(uniqueById.values()).slice(0, MAX_POOL_SIZE);
  }
};

const calcRetryDelayMs = (retryAfterHeader: string | null, attempt: number): number => {
  const retryAfterSeconds = retryAfterHeader ? Number(retryAfterHeader) : NaN;
  if (!Number.isNaN(retryAfterSeconds) && retryAfterSeconds > 0) {
    return Math.ceil(retryAfterSeconds * 1000);
  }

  const base = 1200;
  const exp = Math.min(attempt, 6);
  const jitter = Math.floor(Math.random() * 500);
  return base * 2 ** exp + jitter;
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const apiKey = Deno.env.get("PEXELS_API_KEY");
    if (!apiKey) {
      throw new Error("PEXELS_API_KEY is not configured");
    }

    const body = await req.json().catch(() => ({}));
    const query = typeof body?.query === "string" ? body.query : "";
    const perPage = Math.min(Math.max(Number(body?.perPage) || 6, 1), 20);
    const page = Math.max(Number(body?.page) || 1, 1);

    if (!query.trim()) {
      throw new Error("Query is required");
    }

    const sanitized = query.replace(/[\n\r]+/g, " ").replace(/\s+/g, " ").trim();
    const shortQuery = sanitized.split(/\s+/).slice(0, 5).join(" ").substring(0, 80);

    if (!shortQuery) {
      throw new Error("Query is required");
    }

    const cacheKey = `${shortQuery}|${perPage}|${page}`;
    const cachedVideos = getCached(cacheKey);
    if (cachedVideos && cachedVideos.length > 0) {
      return new Response(JSON.stringify({ videos: cachedVideos, cached: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const url = `https://api.pexels.com/videos/search?query=${encodeURIComponent(shortQuery)}&per_page=${perPage}&page=${page}&orientation=portrait`;

    let response: Response | null = null;
    const maxRetries = 6;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      response = await fetch(url, {
        headers: {
          Authorization: apiKey,
        },
      });

      if (response.status === 429) {
        const isLastAttempt = attempt === maxRetries - 1;
        if (!isLastAttempt) {
          const waitMs = calcRetryDelayMs(response.headers.get("Retry-After"), attempt);
          console.warn(`Pexels throttled (429), retrying in ${waitMs}ms (attempt ${attempt + 1}/${maxRetries})`);
          await sleep(waitMs);
          continue;
        }

        const poolFallback = fallbackPool.slice(0, Math.min(perPage, fallbackPool.length));
        return new Response(
          JSON.stringify({
            error: "Pexels API throttled",
            throttled: true,
            videos: poolFallback,
          }),
          {
            status: 200,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }

      if (response.status >= 500) {
        const isLastAttempt = attempt === maxRetries - 1;
        if (!isLastAttempt) {
          const waitMs = calcRetryDelayMs(response.headers.get("Retry-After"), attempt);
          console.warn(`Pexels server error (${response.status}), retrying in ${waitMs}ms (attempt ${attempt + 1}/${maxRetries})`);
          await sleep(waitMs);
          continue;
        }
      }

      break;
    }

    if (!response || !response.ok) {
      const status = response?.status ?? "unknown";
      const errorBody = response ? await response.text() : "No response";
      throw new Error(`Pexels API error [${status}]: ${errorBody}`);
    }

    const data = await response.json();

    const videos = (data.videos || [])
      .map((video: any) => {
        const videoFiles = video.video_files || [];
        const hdFile =
          videoFiles.find((f: any) => f.quality === "hd" && f.width >= 1080) ||
          videoFiles.find((f: any) => f.quality === "hd") ||
          videoFiles.find((f: any) => f.quality === "sd") ||
          videoFiles[0];

        return {
          id: `pexels-video-${video.id}`,
          url: video.url,
          image: video.image,
          duration: video.duration,
          videoUrl: hdFile?.link || "",
          photographer: video.user?.name || "Pexels",
          description: shortQuery,
          source: "pexels",
        };
      })
      .filter((v: any) => v.image && v.videoUrl);

    setCached(cacheKey, videos);

    return new Response(JSON.stringify({ videos }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Pexels search error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";

    return new Response(JSON.stringify({ error: message, videos: [] }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
