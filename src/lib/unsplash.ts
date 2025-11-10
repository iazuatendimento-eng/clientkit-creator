// Unsplash image search using their public API
// No API key needed for basic search

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
  try {
    // Using Unsplash's public source API
    const response = await fetch(
      `https://api.unsplash.com/search/photos?query=${encodeURIComponent(query)}&per_page=${perPage}&client_id=demo`
    );

    if (!response.ok) {
      throw new Error('Erro ao buscar imagens');
    }

    const data = await response.json();
    return data.results || [];
  } catch (error) {
    console.error('Error fetching Unsplash images:', error);
    return [];
  }
};

// Free stock photo sources
export const FREE_STOCK_SOURCES = [
  { name: 'Unsplash', url: 'https://unsplash.com', description: 'Beautiful free images & pictures' },
  { name: 'Pexels', url: 'https://www.pexels.com', description: 'Free stock photos & videos' },
  { name: 'Pixabay', url: 'https://pixabay.com', description: 'Stunning free images & videos' },
];
