import { supabase } from "@/integrations/supabase/client";
import { translateToEnglishLocal } from "./localTranslate";

/**
 * Uses AI to generate optimized English search terms for stock media.
 * Falls back to local dictionary translation if AI fails.
 */
export async function getSmartSearchTerms(opts: {
  cardTitle?: string;
  cardDescription?: string;
  imageType?: string;
  clientName?: string;
  mediaType?: "image" | "video";
}): Promise<string> {
  const { cardTitle, cardDescription, imageType, clientName, mediaType = "image" } = opts;

  // Build a fallback from local translation
  const fallbackText = [cardTitle, imageType, cardDescription]
    .filter(Boolean)
    .join(" ")
    .split(" ")
    .slice(0, 10)
    .join(" ");
  const localFallback = translateToEnglishLocal(fallbackText).trim() || "business marketing";

  try {
    const { data, error } = await supabase.functions.invoke("smart-search-terms", {
      body: { cardTitle, cardDescription, imageType, clientName, mediaType },
    });

    if (error) {
      console.warn("Smart search AI failed, using local fallback:", error);
      return localFallback;
    }

    const terms = data?.searchTerms?.trim();
    if (!terms) {
      console.warn("Smart search returned empty, using local fallback");
      return localFallback;
    }

    console.log(`🧠 AI search: "${fallbackText}" → "${terms}"`);
    return terms;
  } catch (e) {
    console.warn("Smart search exception, using local fallback:", e);
    return localFallback;
  }
}
