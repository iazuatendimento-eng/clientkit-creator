// Multi-source image search with Pexels, Unsplash, Pixabay and fallback options
import { supabase } from "@/integrations/supabase/client";

export interface SearchImage {
  id: string;
  urls: {
    regular: string;
    small: string;
    thumb: string;
  };
  photographer: string;
  photographerUrl: string;
  description: string | null;
  source: 'pexels' | 'unsplash' | 'picsum' | 'pixabay';
}

// Pexels API search (free, excellent quality)
export const searchPexelsImages = async (query: string, perPage: number = 15, page: number = 1): Promise<SearchImage[]> => {
  // Pexels API key (publishable, client-side)
  const apiKey = import.meta.env.VITE_PEXELS_API_KEY || 'Ogmbd5yQ7EvLxAyzUKA7o9JqFsQj28loZrZKNoPzzQflzmBjCl28EUuk';
  
  if (!apiKey) {
    console.log('Pexels API key not configured');
    return [];
  }

  try {
    const response = await fetch(
      `https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&per_page=${perPage}&page=${page}&orientation=portrait`,
      {
        headers: {
          'Authorization': apiKey
        }
      }
    );

    if (!response.ok) {
      console.error('Pexels API error:', response.status);
      return [];
    }

    const data = await response.json();
    
    return (data.photos || []).map((photo: any) => ({
      id: `pexels-${photo.id}`,
      urls: {
        regular: photo.src.large2x || photo.src.large,
        small: photo.src.medium,
        thumb: photo.src.small,
      },
      photographer: photo.photographer,
      photographerUrl: photo.photographer_url,
      description: photo.alt || query,
      source: 'pexels' as const,
    }));
  } catch (error) {
    console.error('Error fetching Pexels images:', error);
    return [];
  }
};

// Unsplash API search
export const searchUnsplashImagesReal = async (query: string, perPage: number = 15, page: number = 1): Promise<SearchImage[]> => {
  const accessKey = import.meta.env.VITE_UNSPLASH_ACCESS_KEY as string | undefined;
  
  if (!accessKey) {
    console.log('Unsplash API key not configured');
    return [];
  }

  try {
    const response = await fetch(
      `https://api.unsplash.com/search/photos?query=${encodeURIComponent(query)}&per_page=${perPage}&page=${page}&orientation=portrait&client_id=${accessKey}`
    );

    if (!response.ok) {
      console.error('Unsplash API error:', response.status);
      return [];
    }

    const data = await response.json();
    
    return (data.results || []).map((photo: any) => ({
      id: `unsplash-${photo.id}`,
      urls: {
        regular: photo.urls.regular,
        small: photo.urls.small,
        thumb: photo.urls.thumb,
      },
      photographer: photo.user.name,
      photographerUrl: photo.user.links.html,
      description: photo.description || photo.alt_description || query,
      source: 'unsplash' as const,
    }));
  } catch (error) {
    console.error('Error fetching Unsplash images:', error);
    return [];
  }
};

// Picsum fallback (random images, no real search)
export const getPicsumFallback = (query: string, count: number = 12): SearchImage[] => {
  return Array.from({ length: count }).map((_, i) => ({
    id: `picsum-${Date.now()}-${i}`,
    urls: {
      regular: `https://picsum.photos/seed/${encodeURIComponent(query.replace(/\s+/g, '-'))}-${i}-${Date.now()}/1080/1350`,
      small: `https://picsum.photos/seed/${encodeURIComponent(query.replace(/\s+/g, '-'))}-${i}-${Date.now()}/400/500`,
      thumb: `https://picsum.photos/seed/${encodeURIComponent(query.replace(/\s+/g, '-'))}-${i}-${Date.now()}/100/125`,
    },
    photographer: 'Picsum Photos',
    photographerUrl: 'https://picsum.photos',
    description: query,
    source: 'picsum' as const,
  }));
};

// Main search function - tries Pexels first, then Unsplash, then fallback
export const searchImages = async (query: string, perPage: number = 15, page: number = 1): Promise<SearchImage[]> => {
  // Try Pexels first (generally better results)
  let results = await searchPexelsImages(query, perPage, page);
  
  if (results.length > 0) {
    console.log(`Found ${results.length} images from Pexels`);
    return results;
  }

  // Try Unsplash second
  results = await searchUnsplashImagesReal(query, perPage);
  
  if (results.length > 0) {
    console.log(`Found ${results.length} images from Unsplash`);
    return results;
  }

  // Fallback to Picsum (random images)
  console.log('Using Picsum fallback (no API keys configured)');
  return getPicsumFallback(query, Math.min(perPage, 12));
};

// Pexels Video search
export interface SearchVideo {
  id: string;
  url: string;
  image: string; // thumbnail/preview image
  duration: number;
  videoUrl: string; // direct video file URL (SD quality for background use)
  photographer: string;
  description: string;
  source?: 'pexels' | 'pixabay';
}

export const searchPexelsVideos = async (query: string, perPage: number = 5, page: number = 1): Promise<SearchVideo[]> => {
  const sanitized = query.replace(/[\n\r]+/g, ' ').replace(/\s+/g, ' ').trim();
  const shortQuery = sanitized.split(/\s+/).slice(0, 5).join(' ').substring(0, 80);

  if (!shortQuery) {
    console.warn('[Pexels Video] Empty query after sanitization');
    return [];
  }

  console.log(`[Pexels Video] Searching: "${shortQuery}"`);

  try {
    const { data, error } = await supabase.functions.invoke('search-pexels-videos', {
      body: { query: shortQuery, perPage, page, fastMode: true },
    });

    if (error) {
      const message = typeof error.message === 'string' ? error.message : 'Unknown error';
      console.error('Pexels video search error:', message);
      return [];
    }

    return (data?.videos || []).map((video: any) => ({
      id: video.id,
      url: video.url,
      image: video.image,
      duration: video.duration,
      videoUrl: video.videoUrl,
      photographer: video.photographer || 'Pexels',
      description: video.description || shortQuery,
      source: 'pexels' as const,
    }));
  } catch (error) {
    console.error('Error fetching Pexels videos:', error);
    return [];
  }
};

// Pixabay Video search (via edge function since API key is a secret)
export const searchPixabayVideos = async (query: string, perPage: number = 5, page: number = 1): Promise<SearchVideo[]> => {
  try {
    const { data, error } = await supabase.functions.invoke('search-pixabay-videos', {
      body: { query, perPage, page },
    });

    if (error) {
      console.error('Pixabay video search error:', error);
      return [];
    }

    return (data?.videos || []).map((v: any) => ({
      ...v,
      source: 'pixabay' as const,
    }));
  } catch (error) {
    console.error('Error fetching Pixabay videos:', error);
    return [];
  }
};

// Combined video search - Pexels only
export const searchVideos = async (query: string, perPage: number = 5, page: number = 1): Promise<SearchVideo[]> => {
  const results = await searchPexelsVideos(query, perPage, page);
  console.log(`[Video Search] Pexels: ${results.length} results`);
  return results;
};

// Pixabay Image search (via edge function since API key is a secret)
export const searchPixabayImages = async (query: string, perPage: number = 12, page: number = 1): Promise<SearchImage[]> => {
  try {
    const { data, error } = await supabase.functions.invoke('search-pixabay-images', {
      body: { query, perPage, page },
    });

    if (error) {
      console.error('Pixabay image search error:', error);
      return [];
    }

    return (data?.images || []).map((img: any) => ({
      ...img,
      source: 'pixabay' as const,
    }));
  } catch (error) {
    console.error('Error fetching Pixabay images:', error);
    return [];
  }
};

// Check which APIs are configured
export const getConfiguredApis = (): { pexels: boolean; unsplash: boolean } => {
  return {
    pexels: !!import.meta.env.VITE_PEXELS_API_KEY,
    unsplash: !!import.meta.env.VITE_UNSPLASH_ACCESS_KEY,
  };
};
