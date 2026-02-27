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

    const { emails, subject, mediaUrl, mediaType, clientName, cardText, caption } = await req.json();

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

    // Fetch the media file and convert to base64 for attachment
    let attachments: any[] = [];
    try {
      const mediaResponse = await fetch(mediaUrl);
      if (mediaResponse.ok) {
        const arrayBuffer = await mediaResponse.arrayBuffer();
        const bytes = new Uint8Array(arrayBuffer);
        const chunkSize = 8192;
        let binary = "";
        for (let i = 0; i < bytes.length; i += chunkSize) {
          const chunk = bytes.subarray(i, Math.min(i + chunkSize, bytes.length));
          for (let j = 0; j < chunk.length; j++) {
            binary += String.fromCharCode(chunk[j]);
          }
        }
        const base64Content = btoa(binary);
        const contentType = mediaResponse.headers.get("content-type") || (isVideo ? "video/mp4" : "image/png");
        const extension = isVideo ? "mp4" : "png";
        const fileName = `${clientName.replace(/[^a-zA-Z0-9]/g, '_')}.${extension}`;
        attachments = [{
          filename: fileName,
          content: base64Content,
          type: contentType,
        }];
      } else {
        console.error("Failed to fetch media for attachment:", mediaResponse.status);
      }
    } catch (fetchErr) {
      console.error("Error fetching media for attachment:", fetchErr);
    }

    const htmlBody = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <h2 style="color: #333;">📬 ${mediaLabel} - ${clientName}</h2>
        <p style="color: #555;">Olá! Segue ${isVideo ? 'o vídeo' : 'a arte'} gerada para <strong>${clientName}</strong>.</p>
        ${textSection}
        <div style="text-align: center; margin: 30px 0;">
          ${!isVideo
            ? `<img src="${mediaUrl}" alt="Arte" style="max-width: 100%; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.1);" />`
            : `<p style="color: #555;">O vídeo foi enviado em anexo neste e-mail.</p>`
          }
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
          from: 'ClientKit <noreply@contato.iazu.com.br>',
          to: [email],
          subject: subject || `${mediaLabel} - ${clientName}`,
          html: htmlBody,
          attachments: attachments.length > 0 ? attachments : undefined,
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
