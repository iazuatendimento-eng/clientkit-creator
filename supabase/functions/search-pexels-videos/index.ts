import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const CACHE_TTL_MS = 10 * 60 * 1000;
const MAX_POOL_SIZE = 80;

const EMERGENCY_VIDEOS = [
  {
    id: "pexels-video-7308225",
    url: "https://www.pexels.com/video/posting-the-business-products-on-instagram-story-7308225/",
    image: "https://images.pexels.com/videos/7308225/advertising-appliance-branding-business-7308225.jpeg?auto=compress&cs=tinysrgb&fit=crop&h=1200&w=630",
    duration: 24,
    videoUrl: "https://videos.pexels.com/video-files/7308225/7308225-hd_1080_1920_24fps.mp4",
    photographer: "RDNE Stock project",
    description: "business marketing",
    source: "pexels",
  },
  {
    id: "pexels-video-8348724",
    url: "https://www.pexels.com/video/woman-in-a-meeting-discussing-about-graphs-8348724/",
    image: "https://images.pexels.com/videos/8348724/pexels-photo-8348724.jpeg?auto=compress&cs=tinysrgb&fit=crop&h=1200&w=630",
    duration: 14,
    videoUrl: "https://videos.pexels.com/video-files/8348724/8348724-hd_1080_1920_25fps.mp4",
    photographer: "Kampus Production",
    description: "business marketing",
    source: "pexels",
  },
  {
    id: "pexels-video-7578609",
    url: "https://www.pexels.com/video/analyzing-a-graphic-7578609/",
    image: "https://images.pexels.com/videos/7578609/pexels-photo-7578609.jpeg?auto=compress&cs=tinysrgb&fit=crop&h=1200&w=630",
    duration: 37,
    videoUrl: "https://videos.pexels.com/video-files/7578609/7578609-hd_1080_2048_25fps.mp4",
    photographer: "Tima Miroshnichenko",
    description: "business marketing",
    source: "pexels",
  },
  {
    id: "pexels-video-7563942",
    url: "https://www.pexels.com/video/woman-holding-placard-quotes-7563942/",
    image: "https://images.pexels.com/videos/7563942/abstract-accomplishment-achievement-aid-7563942.jpeg?auto=compress&cs=tinysrgb&fit=crop&h=1200&w=630",
    duration: 9,
    videoUrl: "https://videos.pexels.com/video-files/7563942/7563942-hd_1080_1920_30fps.mp4",
    photographer: "RDNE Stock project",
    description: "social media",
    source: "pexels",
  },
  {
    id: "pexels-video-7564016",
    url: "https://www.pexels.com/video/person-holding-a-letter-board-7564016/",
    image: "https://images.pexels.com/videos/7564016/architecture-art-blogging-and-social-media-blue-sky-7564016.jpeg?auto=compress&cs=tinysrgb&fit=crop&h=1200&w=630",
    duration: 8,
    videoUrl: "https://videos.pexels.com/video-files/7564016/7564016-hd_1080_1920_30fps.mp4",
    photographer: "RDNE Stock project",
    description: "social media",
    source: "pexels",
  },
  {
    id: "pexels-video-8987453",
    url: "https://www.pexels.com/video/mechanic-fixing-the-engine-of-a-vehicle-8987453/",
    image: "https://images.pexels.com/videos/8987453/auto-automobile-automotive-car-8987453.jpeg?auto=compress&cs=tinysrgb&fit=crop&h=1200&w=630",
    duration: 12,
    videoUrl: "https://videos.pexels.com/video-files/8987453/8987453-hd_1080_1920_30fps.mp4",
    photographer: "Artem Podrez",
    description: "service",
    source: "pexels",
  },
  {
    id: "pexels-video-7541843",
    url: "https://www.pexels.com/video/a-person-removing-a-part-of-the-engine-of-a-truck-7541843/",
    image: "https://images.pexels.com/videos/7541843/action-adult-at-work-auto-7541843.jpeg?auto=compress&cs=tinysrgb&fit=crop&h=1200&w=630",
    duration: 13,
    videoUrl: "https://videos.pexels.com/video-files/7541843/7541843-hd_1080_2048_25fps.mp4",
    photographer: "cottonbro studio",
    description: "service",
    source: "pexels",
  },
  {
    id: "pexels-video-8987409",
    url: "https://www.pexels.com/video/man-repairing-a-motor-vehicle-8987409/",
    image: "https://images.pexels.com/videos/8987409/auto-automobile-automotive-car-8987409.jpeg?auto=compress&cs=tinysrgb&fit=crop&h=1200&w=630",
    duration: 11,
    videoUrl: "https://videos.pexels.com/video-files/8987409/8987409-hd_1080_1920_30fps.mp4",
    photographer: "Artem Podrez",
    description: "service",
    source: "pexels",
  },
];

const queryCache = new Map<string, { videos: any[]; cachedAt: number }>();
let fallbackPool: any[] = [...EMERGENCY_VIDEOS];

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
    const merged = [...videos, ...fallbackPool, ...EMERGENCY_VIDEOS];
    const uniqueById = new Map<string, any>();
    for (const item of merged) {
      if (item?.id && !uniqueById.has(item.id)) uniqueById.set(item.id, item);
    }
    fallbackPool = Array.from(uniqueById.values()).slice(0, MAX_POOL_SIZE);
  }
};

const getFallbackVideos = (perPage: number) => {
  const source = fallbackPool.length > 0 ? fallbackPool : EMERGENCY_VIDEOS;
  return source.slice(0, Math.max(1, Math.min(perPage, source.length)));
};

const calcRetryDelayMs = (retryAfterHeader: string | null, attempt: number): number => {
  if (retryAfterHeader) {
    const asSeconds = Number(retryAfterHeader);
    if (!Number.isNaN(asSeconds) && asSeconds > 0) {
      return Math.ceil(asSeconds * 1000);
    }

    const asDate = new Date(retryAfterHeader).getTime();
    if (!Number.isNaN(asDate)) {
      const diff = asDate - Date.now();
      if (diff > 0) return diff;
    }
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
      console.warn("PEXELS_API_KEY is not configured, using fallback videos");
      return new Response(JSON.stringify({ error: "PEXELS_API_KEY is not configured", videos: getFallbackVideos(6), fallback: true }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json().catch(() => ({}));
    const query = typeof body?.query === "string" ? body.query : "";
    const perPage = Math.min(Math.max(Number(body?.perPage) || 6, 1), 20);
    const page = Math.max(Number(body?.page) || 1, 1);

    const sanitized = query.replace(/[\n\r]+/g, " ").replace(/\s+/g, " ").trim();
    const shortQuery = sanitized.split(/\s+/).slice(0, 5).join(" ").substring(0, 80);

    if (!shortQuery) {
      return new Response(JSON.stringify({ error: "Query is required", videos: getFallbackVideos(perPage), fallback: true }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
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

        return new Response(
          JSON.stringify({
            error: "Pexels API throttled",
            throttled: true,
            fallback: true,
            videos: getFallbackVideos(perPage),
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
      console.error(`Pexels API error [${status}]: ${errorBody}`);

      return new Response(JSON.stringify({
        error: `Pexels API error [${status}]`,
        fallback: true,
        videos: getFallbackVideos(perPage),
      }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
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

    const finalVideos = videos.length > 0 ? videos : getFallbackVideos(perPage);
    setCached(cacheKey, finalVideos);

    return new Response(JSON.stringify({ videos: finalVideos, fallback: videos.length === 0 }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Pexels search error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";

    return new Response(JSON.stringify({
      error: message,
      fallback: true,
      videos: getFallbackVideos(6),
    }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
