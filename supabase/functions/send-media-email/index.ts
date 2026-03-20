import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { encode as encodeBase64 } from "https://deno.land/std@0.168.0/encoding/base64.ts";

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

    // No styled text cards in email

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

    const inferContentType = (filename: string, fallback: string): string => {
      const ext = filename.split('.').pop()?.toLowerCase();
      switch (ext) {
        case 'mp4': return 'video/mp4';
        case 'mov': return 'video/quicktime';
        case 'webm': return 'video/webm';
        case 'png': return 'image/png';
        case 'jpg':
        case 'jpeg': return 'image/jpeg';
        case 'gif': return 'image/gif';
        default: return fallback;
      }
    };

    const fallbackExtension = isVideo ? 'mp4' : 'png';
    const fallbackContentType = isVideo ? 'video/mp4' : 'image/png';
    const attachmentEntries = allUrls.map((url: string, i: number) => {
      const ext = inferExtensionFromUrl(url, fallbackExtension);
      const filename = allUrls.length > 1 ? `${baseName}_p${i + 1}.${ext}` : `${baseName}.${ext}`;
      return { url, filename };
    });

    const isVideoFilename = (filename: string) => /\.(mp4|mov|webm|avi)$/i.test(filename);
    const videoEntries = attachmentEntries.filter((entry) => isVideoFilename(entry.filename));
    const nonVideoEntries = attachmentEntries.filter((entry) => !isVideoFilename(entry.filename));

    // Keep attachments only for non-video files. Videos are sent as links in body for better deliverability.
    const attachments = await Promise.all(
      nonVideoEntries.map(async (entry) => {
        const fileResponse = await fetch(entry.url);
        if (!fileResponse.ok) {
          throw new Error(`Falha ao baixar anexo ${entry.filename} (${fileResponse.status})`);
        }

        const bytes = new Uint8Array(await fileResponse.arrayBuffer());
        if (bytes.length === 0) {
          throw new Error(`Anexo vazio: ${entry.filename}`);
        }

        const contentTypeHeader = fileResponse.headers.get('content-type')?.split(';')[0]?.trim();
        return {
          filename: entry.filename,
          content: encodeBase64(bytes.buffer),
          content_type: contentTypeHeader || inferContentType(entry.filename, fallbackContentType),
        };
      })
    );

    const bodyParts: string[] = [];
    if (caption) bodyParts.push(caption);

    if (attachments.length > 0) {
      const tipoMidia = isVideo ? 'VÍDEO' : 'ARTE';
      const tipoArquivo = isVideo ? 'MP4' : 'PNG';
      bodyParts.push(`SUA ${tipoMidia} ESTÁ EM ANEXO ABAIXO, PARA VER A ${tipoMidia} NÃO DÊ PLAYER É NECESSÁRIO BAIXAR, FAZER O DOWNLOAD MESMO...\n\nAVISO: BAIXAR FAZER O DOWNLOAD MESMO DO ${tipoArquivo}`);
    }

    if (videoEntries.length > 0) {
      bodyParts.push(
        `LINK${videoEntries.length > 1 ? 'S' : ''} PARA BAIXAR O VÍDEO:\n${videoEntries
          .map((entry, idx) => `${idx + 1}. ${entry.url}`)
          .join('\n')}\n\nOBS: para garantir a entrega, vídeos são enviados por link de download.`
      );
    }

    const plainText = bodyParts.join('\n\n');

    const textParagraphs = bodyParts
      .filter((part) => !part.startsWith('LINK') && !part.startsWith('OBS: para garantir a entrega'));

    const videoLinksHtml = videoEntries.length
      ? `<div style="margin: 0 0 16px 0;"><p style="color: #333; margin: 0 0 8px 0; font-size: 14px; font-weight: 600;">Link${videoEntries.length > 1 ? 's' : ''} para baixar o vídeo:</p><ul style="margin: 0 0 8px 20px; padding: 0;">${videoEntries
          .map(
            (entry, idx) =>
              `<li style="margin: 0 0 6px 0;"><a href="${escapeHtml(entry.url)}" style="color: #0f172a; text-decoration: underline;" target="_blank" rel="noopener noreferrer">Vídeo ${idx + 1}</a></li>`
          )
          .join('')}</ul><p style="color: #666; margin: 0; font-size: 12px;">OBS: para garantir a entrega, vídeos são enviados por link de download.</p></div>`
      : '';

    const htmlBody = `<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">${textParagraphs
      .map((t) => `<p style="color: #333; margin: 0 0 16px 0; white-space: pre-wrap; font-size: 14px;">${escapeHtml(t)}</p>`)
      .join('')}${videoLinksHtml}</div>`;

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
              text: plainText,
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
