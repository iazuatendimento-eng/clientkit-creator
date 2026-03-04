import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

// Max attachment size ~8MB (base64 inflates ~33%, Resend limit is 40MB but edge fn memory is limited)
const MAX_ATTACHMENT_BYTES = 8 * 1024 * 1024;

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

    // Try to fetch the media and attach if small enough, otherwise send as link
    let attachments: any[] = [];
    let useLink = false;

    try {
      // First do a HEAD request to check size without downloading
      const headResponse = await fetch(mediaUrl, { method: 'HEAD' });
      const contentLength = headResponse.headers.get('content-length');
      const fileSize = contentLength ? parseInt(contentLength, 10) : 0;

      if (fileSize > MAX_ATTACHMENT_BYTES) {
        // Too large for attachment, send as download link
        useLink = true;
        console.log(`File too large for attachment (${(fileSize / 1024 / 1024).toFixed(1)}MB), sending as link`);
      } else {
        // Small enough, download and attach
        const mediaResponse = await fetch(mediaUrl);
        if (mediaResponse.ok) {
          const arrayBuffer = await mediaResponse.arrayBuffer();
          
          // Double-check actual size
          if (arrayBuffer.byteLength > MAX_ATTACHMENT_BYTES) {
            useLink = true;
            console.log(`Actual file too large (${(arrayBuffer.byteLength / 1024 / 1024).toFixed(1)}MB), sending as link`);
          } else {
            const bytes = new Uint8Array(arrayBuffer);
            // Convert to base64 in chunks to avoid stack overflow
            const chunkSize = 32768;
            let base64 = '';
            for (let i = 0; i < bytes.length; i += chunkSize) {
              const chunk = bytes.subarray(i, Math.min(i + chunkSize, bytes.length));
              let binary = '';
              for (let j = 0; j < chunk.length; j++) {
                binary += String.fromCharCode(chunk[j]);
              }
              base64 += btoa(binary);
            }
            
            // btoa on chunks doesn't work correctly for base64 - need proper encoding
            // Re-do with proper full base64
            let fullBinary = '';
            for (let i = 0; i < bytes.length; i += 8192) {
              const chunk = bytes.subarray(i, Math.min(i + 8192, bytes.length));
              for (let j = 0; j < chunk.length; j++) {
                fullBinary += String.fromCharCode(chunk[j]);
              }
            }
            const base64Content = btoa(fullBinary);
            
            const contentType = mediaResponse.headers.get("content-type") || (isVideo ? "video/mp4" : "image/png");
            const extension = isVideo ? "mp4" : "png";
            const fileName = `${clientName.replace(/[^a-zA-Z0-9]/g, '_')}.${extension}`;
            attachments = [{
              filename: fileName,
              content: base64Content,
              type: contentType,
            }];
          }
        } else {
          console.error("Failed to fetch media:", mediaResponse.status);
          useLink = true;
        }
      }
    } catch (fetchErr) {
      console.error("Error fetching media for attachment:", fetchErr);
      useLink = true;
    }

    // Build media section in email body
    let mediaSection = '';
    if (isVideo) {
      if (useLink) {
        mediaSection = `
          <div style="text-align: center; margin: 30px 0;">
            <p style="color: #555; margin-bottom: 16px;">O vídeo é grande demais para anexo. Clique no botão abaixo para baixar:</p>
            <a href="${mediaUrl}" style="display: inline-block; background-color: #7c3aed; color: white; padding: 14px 28px; border-radius: 8px; text-decoration: none; font-weight: bold; font-size: 16px;">⬇️ Baixar Vídeo</a>
            <p style="color: #999; font-size: 12px; margin-top: 12px;">Este link expira em alguns dias.</p>
          </div>
        `;
      } else {
        mediaSection = `
          <div style="text-align: center; margin: 30px 0;">
            <p style="color: #555;">O vídeo foi enviado em anexo neste e-mail.</p>
          </div>
        `;
      }
    } else {
      mediaSection = `
        <div style="text-align: center; margin: 30px 0;">
          <img src="${mediaUrl}" alt="Arte" style="max-width: 100%; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.1);" />
        </div>
      `;
    }

    const htmlBody = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <h2 style="color: #333;">📬 ${mediaLabel} - ${clientName}</h2>
        <p style="color: #555;">Olá! Segue ${isVideo ? 'o vídeo' : 'a arte'} gerada para <strong>${clientName}</strong>.</p>
        ${textSection}
        ${mediaSection}
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
