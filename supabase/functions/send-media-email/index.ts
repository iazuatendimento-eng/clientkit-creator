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

    const attachments: Array<{ filename: string; path: string }> = [];

    for (const entry of attachmentEntries) {
      attachments.push({
        filename: entry.filename,
        path: entry.url,
      });
    }

    console.log(`Preparando envio: ${attachments.length} anexo(s), ${validEmails.length} destinatário(s), assunto="${subject || `${mediaLabel} - ${clientName}`}"`);

    const tipoMidia = isVideo ? 'VÍDEO' : 'ARTE';
    const tipoArquivo = isVideo ? 'MP4' : 'PNG';
    const downloadInstruction = `SUA ${tipoMidia} ESTÁ EM ANEXO ABAIXO, PARA VER A ${tipoMidia} NÃO DÊ PLAYER É NECESSÁRIO BAIXAR, FAZER O DOWNLOAD MESMO...\n\nAVISO: BAIXAR FAZER O DOWNLOAD MESMO DO ${tipoArquivo}`;

    const bodyParts: string[] = [];
    if (caption) bodyParts.push(caption);
    bodyParts.push(downloadInstruction);

    const plainText = bodyParts.join('\n\n');

    const htmlBody = `<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">${bodyParts.map(t => `<p style="color: #333; margin: 0 0 16px 0; white-space: pre-wrap; font-size: 14px;">${escapeHtml(t)}</p>`).join('')}</div>`;

    const results = [];
    for (let ei = 0; ei < validEmails.length; ei++) {
      const email = validEmails[ei];
      // Stagger requests: wait 300ms between each email to avoid rate limits
      if (ei > 0) {
        await new Promise(r => setTimeout(r, 300));
      }
      try {
        let res: Response | null = null;
        let data: any = null;
        // Retry up to 3 times on rate limit (429)
        for (let attempt = 0; attempt < 3; attempt++) {
          res = await fetch('https://api.resend.com/emails', {
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

          data = await res.json();
          if (res.status === 429) {
            const retryAfter = parseInt(res.headers.get('retry-after') || '2', 10);
            console.warn(`Rate limited for ${email}, retrying in ${retryAfter}s (attempt ${attempt + 1})`);
            await new Promise(r => setTimeout(r, retryAfter * 1000));
            continue;
          }
          break;
        }

        if (!res || !res.ok) {
          console.error(`Erro ao enviar para ${email}:`, data);
          results.push({ email, success: false, error: data });
        } else {
          results.push({ email, success: true, id: data.id });
        }
      } catch (err) {
        console.error(`Erro ao enviar para ${email}:`, err);
        results.push({ email, success: false, error: String(err) });
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
