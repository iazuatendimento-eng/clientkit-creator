import { supabase } from "@/integrations/supabase/client";
import { translateToEnglishLocal } from "./localTranslate";

/**
 * Translates a search query to English for stock media searches.
 * Falls back to local dictionary if the AI translation fails.
 */
export async function translateSearchQuery(query: string): Promise<string> {
  const trimmed = query.trim();
  if (!trimmed) return trimmed;

  // Quick check: if already looks like English (basic heuristic), skip
  const localFallback = translateToEnglishLocal(trimmed);

  try {
    const { data, error } = await supabase.functions.invoke("translate-text", {
      body: { text: trimmed },
    });

    if (error) {
      console.warn("Translation failed, using local fallback:", error);
      return localFallback || trimmed;
    }

    const translated = data?.translatedText?.trim();
    if (!translated) return localFallback || trimmed;

    console.log(`🌐 Search translated: "${trimmed}" → "${translated}"`);
    return translated;
  } catch (e) {
    console.warn("Translation exception:", e);
    return localFallback || trimmed;
  }
}
