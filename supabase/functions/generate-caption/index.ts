import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { text } = await req.json();
    
    if (!text) {
      return new Response(
        JSON.stringify({ error: 'Texto não fornecido' }), 
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY não configurada');
    }

    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          { 
            role: 'system', 
            content: 'Você é um especialista em criar legendas criativas e engajadoras para redes sociais. Crie legendas que incluam emojis relevantes e hashtags estratégicas. A legenda deve ser atraente, concisa e otimizada para engajamento.' 
          },
          { 
            role: 'user', 
            content: `Crie uma legenda para redes sociais baseada no seguinte texto:\n\n${text}\n\nA legenda deve:\n- Ser criativa e chamar atenção\n- Incluir emojis relevantes ao contexto\n- Ter de 5 a 10 hashtags estratégicas no final\n- Ser otimizada para engajamento\n- Ter no máximo 300 caracteres (sem contar as hashtags)` 
          }
        ],
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: 'Limite de requisições excedido. Tente novamente em alguns instantes.' }), 
          { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: 'Créditos insuficientes. Adicione créditos ao seu workspace Lovable.' }), 
          { status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      const errorText = await response.text();
      console.error('Erro da API Lovable AI:', response.status, errorText);
      throw new Error('Erro ao gerar legenda');
    }

    const data = await response.json();
    const caption = data.choices[0].message.content;

    return new Response(
      JSON.stringify({ caption }), 
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Erro ao gerar legenda:', error);
    return new Response(
      JSON.stringify({ error: error.message || 'Erro desconhecido' }), 
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
