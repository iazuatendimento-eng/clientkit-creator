import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const escapeHtml = (value: string) =>
    value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');

  const sanitizeHttpUrl = (value: unknown): string | null => {
    if (typeof value !== 'string') return null;
    const trimmed = value.trim();
    if (!trimmed) return null;

    try {
      const parsed = new URL(trimmed);
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
      return parsed.toString();
    } catch {
      return null;
    }
  };

  try {
    const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');
    if (!RESEND_API_KEY) {
      throw new Error('RESEND_API_KEY não configurada');
    }

    const {
      emails,
      subject,
      mediaUrl,
      mediaUrls,
      mediaType,
      clientName,
      cardText,
      caption,
      videoCoverUrl,
      videoCoverUrls,
    } = await req.json();

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
    const safeClientName = escapeHtml(clientName || 'Cliente');

    const validVideoCoverUrls: string[] = (
      Array.isArray(videoCoverUrls) && videoCoverUrls.length > 0
        ? videoCoverUrls
        : (videoCoverUrl ? [videoCoverUrl] : [])
    )
      .map((url: unknown) => sanitizeHttpUrl(url))
      .filter((url): url is string => !!url);

    // Build text/caption section if provided
    let textSection = '';
    if (cardText) {
      textSection += `
        <div style="background-color: #f8f9fa; border-radius: 8px; padding: 16px; margin-bottom: 20px;">
          <p style="color: #333; font-weight: bold; margin: 0 0 8px 0; font-size: 14px;">📝 Texto:</p>
          <p style="color: #555; margin: 0; white-space: pre-wrap; font-size: 14px;">${escapeHtml(cardText)}</p>
        </div>
      `;
    }
    if (caption) {
      textSection += `
        <div style="background-color: #f0f4ff; border-radius: 8px; padding: 16px; margin-bottom: 20px;">
          <p style="color: #333; font-weight: bold; margin: 0 0 8px 0; font-size: 14px;">💬 Legenda:</p>
          <p style="color: #555; margin: 0; white-space: pre-wrap; font-size: 14px;">${escapeHtml(caption)}</p>
        </div>
      `;
    }

    // Build attachments - support multiple URLs for carousel
    const rawUrls: unknown[] = mediaUrls && mediaUrls.length > 0 ? mediaUrls : [mediaUrl];
    const allUrls: string[] = rawUrls
      .map((url) => sanitizeHttpUrl(url))
      .filter((url): url is string => !!url);

    if (allUrls.length === 0) {
      throw new Error('Nenhuma URL de mídia válida encontrada');
    }

    const baseName = (clientName || 'cliente').replace(/[^a-zA-Z0-9]/g, '_');

    const inferExtensionFromUrl = (url: string, fallback: string): string => {
      try {
        const pathname = new URL(url).pathname.toLowerCase();
        const match = pathname.match(/\.([a-z0-9]+)$/);
        if (match?.[1]) return match[1];
      } catch {
        const normalized = url.toLowerCase().split('?')[0].split('#')[0];
        const match = normalized.match(/\.([a-z0-9]+)$/);
        if (match?.[1]) return match[1];
      }
      return fallback;
    };

    const fallbackExtension = isVideo ? 'mp4' : 'png';
    const attachmentEntries = allUrls.map((url: string, i: number) => {
      const ext = inferExtensionFromUrl(url, fallbackExtension);
      const filename = allUrls.length > 1 ? `${baseName}_p${i + 1}.${ext}` : `${baseName}.${ext}`;
      return { url, filename };
    });

    const attachments = attachmentEntries.map((entry) => ({
      filename: entry.filename,
      path: entry.url,
    }));

    // Simple, direct email body
    const fileType = isVideo ? 'MP4' : 'PNG';
    const mediaWord = isVideo ? 'VÍDEO' : 'ARTE';
    const mediaWordLower = isVideo ? 'vídeo' : 'arte';
    const downloadInstruction = isVideo
      ? `<strong style="color: #d32f2f; font-size: 16px;">SEU VÍDEO ESTÁ EM ANEXO ABAIXO, PARA VER O VÍDEO NÃO DÊ PLAYER É NECESSÁRIO BAIXAR, FAZER O DOWNLOAD MESMO...</strong><br/><br/>
         <strong style="color: #d32f2f; font-size: 15px;">ATENÇÃO BAIXAR FAZER O DOWNLOAD MESMO DO MP4</strong>`
      : `<strong style="color: #d32f2f; font-size: 16px;">SUA ARTE ESTÁ EM ANEXO ABAIXO, PARA VER A ARTE NÃO DÊ PLAYER É NECESSÁRIO BAIXAR, FAZER O DOWNLOAD MESMO...</strong><br/><br/>
         <strong style="color: #d32f2f; font-size: 15px;">ATENÇÃO BAIXAR FAZER O DOWNLOAD MESMO DO PNG</strong>`;

    const htmlBody = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <h2 style="color: #333;">📬 ${mediaWord} - ${safeClientName}</h2>
        <div style="background-color: #fff3f3; border: 2px solid #d32f2f; border-radius: 8px; padding: 20px; margin: 20px 0; text-align: center;">
          <p style="margin: 0; line-height: 1.6;">${downloadInstruction}</p>
        </div>
        ${textSection}
        <p style="color: #999; font-size: 12px; margin-top: 30px;">Enviado via iazu</p>
      </div>
    `;

    const results = await Promise.all(
      validEmails.map(async (email: string) => {
        try {
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
            return { email, success: false, error: data };
          }
          return { email, success: true, id: data.id };
        } catch (err) {
          console.error(`Erro ao enviar para ${email}:`, err);
          return { email, success: false, error: String(err) };
        }
      })
    );

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
