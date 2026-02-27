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
export const searchUnsplashImagesReal = async (query: string, perPage: number = 15): Promise<SearchImage[]> => {
  const accessKey = import.meta.env.VITE_UNSPLASH_ACCESS_KEY as string | undefined;
  
  if (!accessKey) {
    console.log('Unsplash API key not configured');
    return [];
  }

  try {
    const response = await fetch(
      `https://api.unsplash.com/search/photos?query=${encodeURIComponent(query)}&per_page=${perPage}&orientation=portrait&client_id=${accessKey}`
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
  const apiKey = import.meta.env.VITE_PEXELS_API_KEY || 'Ogmbd5yQ7EvLxAyzUKA7o9JqFsQj28loZrZKNoPzzQflzmBjCl28EUuk';
  
  if (!apiKey) {
    console.log('Pexels API key not configured');
    return [];
  }

  // Sanitize query: remove newlines, trim, and limit to first 80 chars (3-5 words)
  const sanitized = query.replace(/[\n\r]+/g, ' ').replace(/\s+/g, ' ').trim();
  const shortQuery = sanitized.split(/\s+/).slice(0, 5).join(' ').substring(0, 80);
  console.log(`[Pexels Video] Searching: "${shortQuery}"`);

  try {
    const response = await fetch(
      `https://api.pexels.com/videos/search?query=${encodeURIComponent(shortQuery)}&per_page=${perPage}&page=${page}&orientation=portrait`,
      {
        headers: {
          'Authorization': apiKey
        }
      }
    );

    if (!response.ok) {
      console.error('Pexels Video API error:', response.status);
      return [];
    }

    const data = await response.json();
    
    return (data.videos || []).map((video: any) => {
      // Get the best quality video file (prefer HD, then SD)
      const videoFiles = video.video_files || [];
      const hdFile = videoFiles.find((f: any) => f.quality === 'hd' && f.width >= 1080) 
        || videoFiles.find((f: any) => f.quality === 'hd')
        || videoFiles.find((f: any) => f.quality === 'sd')
        || videoFiles[0];
      
      return {
        id: `pexels-video-${video.id}`,
        url: video.url,
        image: video.image, // Pexels provides a thumbnail image
        duration: video.duration,
        videoUrl: hdFile?.link || '',
        photographer: video.user?.name || 'Pexels',
      description: query,
      source: 'pexels' as const,
    };
    }).filter((v: SearchVideo) => v.image && v.videoUrl);
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

// Combined video search - searches Pexels and Pixabay in parallel and merges results
export const searchVideos = async (query: string, perPage: number = 5, page: number = 1): Promise<SearchVideo[]> => {
  const [pexelsResults, pixabayResults] = await Promise.all([
    searchPexelsVideos(query, perPage, page),
    searchPixabayVideos(query, perPage, page),
  ]);

  // Interleave results: pexels1, pixabay1, pexels2, pixabay2, ...
  const combined: SearchVideo[] = [];
  const maxLen = Math.max(pexelsResults.length, pixabayResults.length);
  for (let i = 0; i < maxLen; i++) {
    if (i < pexelsResults.length) combined.push(pexelsResults[i]);
    if (i < pixabayResults.length) combined.push(pixabayResults[i]);
  }

  console.log(`[Video Search] Combined: ${pexelsResults.length} Pexels + ${pixabayResults.length} Pixabay = ${combined.length} total`);
  return combined;
};

// Check which APIs are configured
export const getConfiguredApis = (): { pexels: boolean; unsplash: boolean } => {
  return {
    pexels: !!import.meta.env.VITE_PEXELS_API_KEY,
    unsplash: !!import.meta.env.VITE_UNSPLASH_ACCESS_KEY,
  };
};
