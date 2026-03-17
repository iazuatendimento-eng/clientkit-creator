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

    const { emails, subject, mediaUrl, mediaUrls, mediaType, clientName, cardText, caption } = await req.json();

    if (!emails || emails.length === 0) {
      throw new Error('Nenhum e-mail fornecido');
    }
    if (!mediaUrl && (!mediaUrls || mediaUrls.length === 0)) {
      throw new Error('URL da mídia não fornecida');
    }

    const validEmails = emails.filter((e: string) => e && e.includes('@'));
    if (validEmails.length === 0) {
      throw new Error('Nenhum e-mail válido encontrado');
    }

    const isVideo = mediaType === 'video';
    const mediaLabel = isVideo ? 'Vídeo' : 'Arte';

    // Build text/caption section if provided
    let textSection = '';
    if (cardText) {
      textSection += `
        <div style="background-color: #f8f9fa; border-radius: 8px; padding: 16px; margin-bottom: 20px;">
          <p style="color: #333; font-weight: bold; margin: 0 0 8px 0; font-size: 14px;">📝 Texto:</p>
          <p style="color: #555; margin: 0; white-space: pre-wrap; font-size: 14px;">${cardText.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</p>
        </div>
      `;
    }
    if (caption) {
      textSection += `
        <div style="background-color: #f0f4ff; border-radius: 8px; padding: 16px; margin-bottom: 20px;">
          <p style="color: #333; font-weight: bold; margin: 0 0 8px 0; font-size: 14px;">💬 Legenda:</p>
          <p style="color: #555; margin: 0; white-space: pre-wrap; font-size: 14px;">${caption.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</p>
        </div>
      `;
    }

    // Build attachments - support multiple URLs for carousel
    const allUrls: string[] = mediaUrls && mediaUrls.length > 0 ? mediaUrls : [mediaUrl];
    const extension = isVideo ? "mp4" : "png";
    const baseName = clientName.replace(/[^a-zA-Z0-9]/g, '_');
    const attachments = allUrls.map((url: string, i: number) => ({
      filename: allUrls.length > 1 ? `${baseName}_p${i + 1}.${extension}` : `${baseName}.${extension}`,
      path: url,
    }));

    const count = allUrls.length;

    let mediaSection = '';
    if (isVideo) {
      // For videos: show a clickable link since email clients don't support inline video
      const videoLinksHtml = allUrls.map((url: string, i: number) => {
        const label = allUrls.length > 1 ? `Assistir Vídeo ${i + 1}` : 'Assistir Vídeo';
        return `
          <div style="text-align: center; margin: 16px 0;">
            <a href="${url}" target="_blank" style="display: inline-block; background-color: #4F46E5; color: #ffffff; text-decoration: none; padding: 14px 28px; border-radius: 8px; font-weight: bold; font-size: 16px;">
              ▶ ${label}
            </a>
            <p style="color: #888; font-size: 12px; margin-top: 8px;">Clique para abrir o vídeo no navegador</p>
          </div>
        `;
      }).join('');
      mediaSection = `
        <div style="margin: 20px 0;">
          ${videoLinksHtml}
          <p style="color: #555; text-align: center; font-size: 13px; margin-top: 12px;">O vídeo também está em anexo neste e-mail.</p>
        </div>
      `;
    } else {
      // For images: show inline previews
      const imagePreviewsHtml = allUrls.map((url: string) => `
        <div style="text-align: center; margin: 12px 0;">
          <img src="${url}" alt="Arte - ${clientName}" style="max-width: 100%; border-radius: 8px; border: 1px solid #e5e7eb;" />
        </div>
      `).join('');
      mediaSection = `
        <div style="margin: 20px 0;">
          ${imagePreviewsHtml}
          <p style="color: #555; text-align: center; font-size: 13px; margin-top: 8px;">${count > 1 ? `As ${count} artes também foram enviadas` : 'A arte também foi enviada'} em anexo.</p>
        </div>
      `;
    }

    const htmlBody = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <h2 style="color: #333;">📬 ${mediaLabel} - ${clientName}</h2>
        <p style="color: #555;">Olá! Segue ${isVideo ? 'o vídeo' : 'a arte'} gerada para <strong>${clientName}</strong>.</p>
        ${textSection}
        ${mediaSection}
        <p style="color: #999; font-size: 12px; margin-top: 30px;">Enviado via iazu</p>
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
          from: 'iazu <noreply@contato.iazu.com.br>',
          to: [email],
          subject: subject || `${mediaLabel} - ${clientName}`,
          html: htmlBody,
          attachments,
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
