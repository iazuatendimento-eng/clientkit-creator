// Unsplash image search with optional API key and graceful fallback
// If VITE_UNSPLASH_ACCESS_KEY is not set or the API fails, we fallback to source.unsplash.com (no key)

export interface UnsplashImage {
  id: string;
  urls: {
    regular: string;
    small: string;
    thumb: string;
  };
  user: {
    name: string;
    links: {
      html: string;
    };
  };
  description: string | null;
}

export const searchUnsplashImages = async (query: string, perPage: number = 12): Promise<UnsplashImage[]> => {
  const accessKey = import.meta.env.VITE_UNSPLASH_ACCESS_KEY as string | undefined;
  try {
    if (accessKey) {
      const response = await fetch(
        `https://api.unsplash.com/search/photos?query=${encodeURIComponent(query)}&per_page=${perPage}&client_id=${accessKey}`
      );
      if (response.ok) {
        const data = await response.json();
        return data.results || [];
      }
    }
    // Fallback: generate pseudo results using source.unsplash.com
    const results: UnsplashImage[] = Array.from({ length: perPage }).map((_, i) => ({
      id: `${Date.now()}-${i}`,
      urls: {
        regular: `https://source.unsplash.com/1080x1350/?${encodeURIComponent(query)}&sig=${i}`,
        small: `https://source.unsplash.com/400x300/?${encodeURIComponent(query)}&sig=${i}`,
        thumb: `https://source.unsplash.com/100x100/?${encodeURIComponent(query)}&sig=${i}`,
      },
      user: { name: "Unsplash (random)", links: { html: "https://unsplash.com" } },
      description: query,
    }));
    return results;
  } catch (error) {
    console.error('Error fetching Unsplash images:', error);
    // Final fallback
    return Array.from({ length: Math.min(6, perPage) }).map((_, i) => ({
      id: `fallback-${i}`,
      urls: {
        regular: `https://picsum.photos/seed/${encodeURIComponent(query)}-${i}/1080/1350`,
        small: `https://picsum.photos/seed/${encodeURIComponent(query)}-${i}/400/300`,
        thumb: `https://picsum.photos/seed/${encodeURIComponent(query)}-${i}/100/100`,
      },
      user: { name: "Picsum", links: { html: "https://picsum.photos" } },
      description: query,
    }));
  }
};

// Free stock photo sources
export const FREE_STOCK_SOURCES = [
  { name: 'Unsplash', url: 'https://unsplash.com', description: 'Beautiful free images & pictures' },
  { name: 'Pexels', url: 'https://www.pexels.com', description: 'Free stock photos & videos' },
  { name: 'Pixabay', url: 'https://pixabay.com', description: 'Stunning free images & videos' },
];
