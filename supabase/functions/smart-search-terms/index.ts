import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS")
    return new Response(null, { headers: corsHeaders });

  try {
    const { cardTitle, cardDescription, imageType, clientName, mediaType } =
      await req.json();

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY)
      throw new Error("LOVABLE_API_KEY is not configured");

    const context = [
      cardTitle && `Title: ${cardTitle}`,
      cardDescription && `Description: ${cardDescription}`,
      imageType && `Visual style: ${imageType}`,
      clientName && `Client: ${clientName}`,
    ]
      .filter(Boolean)
      .join("\n");

    const isVideo = mediaType === "video";

    const systemPrompt = `You are a stock ${isVideo ? "video" : "photo"} search expert. Given a social media post context in Portuguese, output 3-6 English search keywords that would find the BEST matching ${isVideo ? "video clips" : "photos"} on Pexels/Pixabay.

Rules:
- Focus on VISUAL elements, not abstract concepts
- Use descriptive, concrete terms (e.g. "woman smiling coffee shop" not "happiness promotion")
- Include the visual style hint if provided
- Output ONLY the keywords separated by spaces, nothing else
- Never output Portuguese words`;

    const response = await fetch(
      "https://ai.gateway.lovable.dev/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash-lite",
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: context || "business marketing" },
          ],
        }),
      }
    );

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: "Rate limited", searchTerms: "" }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: "Payment required", searchTerms: "" }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      const t = await response.text();
      console.error("AI gateway error:", response.status, t);
      return new Response(
        JSON.stringify({ searchTerms: "" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const data = await response.json();
    const raw = data.choices?.[0]?.message?.content || "";
    // Clean: remove quotes, punctuation, extra whitespace, limit to 6 terms
    const searchTerms = raw
      .replace(/["""''`]/g, "")
      .replace(/[,;.\n]/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .split(" ")
      .slice(0, 6)
      .join(" ");

    return new Response(
      JSON.stringify({ searchTerms }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("smart-search-terms error:", e);
    return new Response(
      JSON.stringify({ searchTerms: "", error: e instanceof Error ? e.message : "Unknown" }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
