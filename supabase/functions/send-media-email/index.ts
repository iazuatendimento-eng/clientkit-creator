import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');
    if (!RESEND_API_KEY) {
      throw new Error('RESEND_API_KEY não configurada');
    }

    const { emails, subject, mediaUrl, mediaType, clientName } = await req.json();

    if (!emails || emails.length === 0) {
      throw new Error('Nenhum e-mail fornecido');
    }
    if (!mediaUrl) {
      throw new Error('URL da mídia não fornecida');
    }

    const validEmails = emails.filter((e: string) => e && e.includes('@'));
    if (validEmails.length === 0) {
      throw new Error('Nenhum e-mail válido encontrado');
    }

    const isVideo = mediaType === 'video';
    const mediaLabel = isVideo ? 'Vídeo' : 'Arte';

    const htmlBody = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <h2 style="color: #333;">📬 ${mediaLabel} - ${clientName}</h2>
        <p style="color: #555;">Olá! Segue ${isVideo ? 'o vídeo' : 'a arte'} gerada para <strong>${clientName}</strong>.</p>
        <div style="text-align: center; margin: 30px 0;">
          ${isVideo 
            ? `<p style="color: #555;">Clique no botão abaixo para baixar o vídeo:</p>`
            : `<img src="${mediaUrl}" alt="Arte" style="max-width: 100%; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.1);" />`
          }
          <a href="${mediaUrl}" download style="display: inline-block; margin-top: 20px; padding: 12px 24px; background-color: #6366f1; color: white; text-decoration: none; border-radius: 8px; font-weight: bold;">
            ⬇ Baixar ${mediaLabel}
          </a>
        </div>
        <p style="color: #999; font-size: 12px; margin-top: 30px;">Enviado via ClientKit Creator</p>
      </div>
    `;

    const results = [];
    for (const email of validEmails) {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${RESEND_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: 'ClientKit <contato@iazu.com.br>',
          to: [email],
          subject: subject || `${mediaLabel} - ${clientName}`,
          html: htmlBody,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        console.error(`Erro ao enviar para ${email}:`, data);
        results.push({ email, success: false, error: data });
      } else {
        results.push({ email, success: true, id: data.id });
      }
    }

    const allSuccess = results.every(r => r.success);
    const successCount = results.filter(r => r.success).length;

    return new Response(JSON.stringify({
      success: allSuccess,
      message: `${successCount}/${validEmails.length} e-mail(s) enviado(s)`,
      results,
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error: unknown) {
    console.error('Error in send-media-email:', error);
    const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';
    return new Response(JSON.stringify({ success: false, error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
