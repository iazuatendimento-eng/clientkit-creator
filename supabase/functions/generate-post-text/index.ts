import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { topic, postType, clientName, briefing, narrationType } = await req.json();

    if (!topic || typeof topic !== "string") {
      return new Response(JSON.stringify({ error: "topic is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const isCarousel = postType === "carousel";

    const systemPrompt = `Você é um copywriter especialista em redes sociais. Gere textos curtos e impactantes para posts.

REGRAS OBRIGATÓRIAS:
${isCarousel ? `
- Gere EXATAMENTE 6 frases separadas por ponto e vírgula (;)
- Cada frase deve ter entre 4 e 8 palavras (idealmente 6)
- O resultado final deve ser: frase1; frase2; frase3; frase4; frase5; frase6
- NÃO gere mais que 6 frases. NUNCA mais que 5 separadores (;)
- NÃO use ponto final dentro das frases, apenas ; como separador
- A primeira frase deve ser um gancho chamativo
- A última frase deve ser um CTA (chamada para ação)
- O texto total deve caber em um vídeo de no máximo 1 minuto
` : `
- Gere UMA frase com entre 4 e 8 palavras (idealmente 6)
- Deve ser impactante e funcionar como headline de um post
- NÃO use ponto final
- O texto deve caber em um vídeo de no máximo 20 segundos
`}
- Escreva em português do Brasil
- Tom: profissional mas acessível
- Não use hashtags
- Não use emojis
- Retorne APENAS o texto, sem aspas, sem explicação`;

    const userPrompt = `Assunto/Tema: ${topic}
${clientName ? `Empresa: ${clientName}` : ""}
${briefing ? `Contexto do cliente: ${briefing}` : ""}
${narrationType ? `Estilo de comunicação: ${narrationType}` : ""}
Tipo: ${isCarousel ? "Carrossel (6 páginas)" : "Post único"}`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded. Tente novamente em alguns segundos." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "Créditos insuficientes." }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const t = await response.text();
      console.error("AI error:", response.status, t);
      throw new Error("AI gateway error");
    }

    const data = await response.json();
    const generatedText = data.choices?.[0]?.message?.content?.trim() || "";

    return new Response(JSON.stringify({ text: generatedText }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("generate-post-text error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
