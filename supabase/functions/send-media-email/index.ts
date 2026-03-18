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
    ).filter((url: unknown): url is string => typeof url === 'string' && url.trim().length > 0);

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
    const allUrls: string[] = mediaUrls && mediaUrls.length > 0 ? mediaUrls : [mediaUrl];
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

    // Build download URLs via edge function proxy
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
    const downloadLinks: { url: string; name: string }[] = attachmentEntries.map((entry) => {
      const proxyUrl = `${SUPABASE_URL}/functions/v1/download-file?url=${encodeURIComponent(entry.url)}&name=${encodeURIComponent(entry.filename)}`;
      return { url: proxyUrl, name: entry.filename };
    });

    const attachments = attachmentEntries.map((entry) => ({
      filename: entry.filename,
      path: entry.url,
    }));

    const count = allUrls.length;

    // Build download buttons HTML
    const downloadButtonsHtml = downloadLinks.map((link, i: number) => `
      <a href="${link.url}" style="display: inline-block; background-color: #4f46e5; color: #ffffff; text-decoration: none; padding: 12px 24px; border-radius: 8px; font-weight: bold; font-size: 14px; margin: 4px;" target="_blank">
        ⬇️ Baixar ${isVideo ? 'Vídeo' : 'Arte'}${downloadLinks.length > 1 ? ` ${i + 1}` : ''}
      </a>
    `).join('');

    let mediaSection = '';
    if (isVideo) {
      const coverPreviewHtml = validVideoCoverUrls.length > 0
        ? validVideoCoverUrls.map((url: string, i: number) => {
            const dlLink = downloadLinks[i] || downloadLinks[0];
            return `
            <div style="text-align: center; margin: 12px 0;">
              <a href="${dlLink.url}" target="_blank" style="display: inline-block; position: relative; text-decoration: none;">
                <img src="${url}" alt="Capa do vídeo ${safeClientName}${validVideoCoverUrls.length > 1 ? ` ${i + 1}` : ''}" style="max-width: 100%; border-radius: 8px; border: 1px solid #e5e7eb;" />
                <div style="position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); width: 64px; height: 64px; background-color: rgba(0,0,0,0.6); border-radius: 50%; display: flex; align-items: center; justify-content: center;">
                  <div style="width: 0; height: 0; border-style: solid; border-width: 12px 0 12px 22px; border-color: transparent transparent transparent #ffffff; margin-left: 4px;"></div>
                </div>
              </a>
            </div>
          `;
          }).join('')
        : `
            <p style="color: #888; text-align: center; font-size: 13px; margin: 8px 0 16px 0;">
              Prévia da capa não disponível neste envio.
            </p>
          `;

      mediaSection = `
        <div style="margin: 20px 0;">
          ${coverPreviewHtml}
          <div style="text-align: center; margin-top: 16px;">
            ${downloadButtonsHtml}
          </div>
          <p style="color: #555; text-align: center; font-size: 13px; margin-top: 12px;">${count > 1 ? `Os ${count} vídeos também foram enviados` : 'O vídeo também foi enviado'} em anexo.</p>
        </div>
      `;
    } else {
      // For images: show inline previews
      const imagePreviewsHtml = allUrls.map((url: string) => `
        <div style="text-align: center; margin: 12px 0;">
          <img src="${url}" alt="Arte - ${safeClientName}" style="max-width: 100%; border-radius: 8px; border: 1px solid #e5e7eb;" />
        </div>
      `).join('');
      mediaSection = `
        <div style="margin: 20px 0;">
          ${imagePreviewsHtml}
          <div style="text-align: center; margin-top: 16px;">
            ${downloadButtonsHtml}
          </div>
          <p style="color: #555; text-align: center; font-size: 13px; margin-top: 12px;">${count > 1 ? `As ${count} artes também foram enviadas` : 'A arte também foi enviada'} em anexo.</p>
        </div>
      `;
    }

    const attachmentNotice = isVideo
      ? `🎬 Baixar o <strong>VÍDEO</strong> arquivo MP4 do anexo — ele <strong>NÃO</strong> dá player aqui... <span style="color:#dc2626;font-weight:bold;">⚠️ ATENÇÃO!!!</span> é preciso fazer o <strong>DOWNLOAD/BAIXAR O ARQUIVO .MP4</strong>`
      : `🎨 Baixar a <strong>ARTE</strong> arquivo PNG do anexo — ele <strong>NÃO</strong> dá player aqui... <span style="color:#dc2626;font-weight:bold;">⚠️ ATENÇÃO!!!</span> é preciso fazer o <strong>DOWNLOAD/BAIXAR O ARQUIVO .PNG</strong>`;

    const htmlBody = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <h2 style="color: #333;">📬 ${mediaLabel} - ${safeClientName}</h2>
        <p style="color: #555;">Olá! Segue ${isVideo ? 'o vídeo' : 'a arte'} para <strong>${safeClientName}</strong>.</p>
        <div style="background-color: #eef2ff; border-left: 4px solid #4f46e5; border-radius: 6px; padding: 12px 16px; margin: 16px 0;">
          <p style="color: #333; margin: 0; font-size: 14px;">${attachmentNotice}</p>
        </div>
        ${textSection}
        ${mediaSection}
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
