import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

type AttachmentMeta = {
  filename: string;
  path: string;
  estimatedBytes: number;
};

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const sanitizeHttpUrl = (value: unknown): string | null => {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;

  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
    return parsed.toString();
  } catch {
    return null;
  }
};

const inferExtensionFromUrl = (url: string, fallback: string): string => {
  try {
    const pathname = new URL(url).pathname.toLowerCase();
    const match = pathname.match(/\.([a-z0-9]+)$/);
    if (match?.[1]) return match[1];
  } catch {
    const normalized = url.toLowerCase().split("?")[0].split("#")[0];
    const match = normalized.match(/\.([a-z0-9]+)$/);
    if (match?.[1]) return match[1];
  }
  return fallback;
};

const parseHeaderSize = (raw: string | null): number | null => {
  if (!raw) return null;
  const parsed = parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const estimateFileSize = async (url: string): Promise<number | null> => {
  try {
    const headRes = await fetch(url, { method: "HEAD" });
    const headSize = parseHeaderSize(headRes.headers.get("content-length"));
    if (headSize) return headSize;
  } catch {
    // Ignore and continue with ranged GET fallback.
  }

  try {
    const rangeRes = await fetch(url, {
      method: "GET",
      headers: { Range: "bytes=0-0" },
    });

    const contentRange = rangeRes.headers.get("content-range");
    if (contentRange) {
      const total = contentRange.split("/").pop() || "";
      const parsed = parseInt(total, 10);
      if (Number.isFinite(parsed) && parsed > 0) return parsed;
    }

    const rangeSize = parseHeaderSize(rangeRes.headers.get("content-length"));
    if (rangeSize) return rangeSize;
  } catch {
    // Fall through to default estimates.
  }

  return null;
};

const estimateBytesFromFilename = (filename: string, isVideo: boolean): number => {
  const ext = filename.split(".").pop()?.toLowerCase();
  if (!ext) return isVideo ? 8 * 1024 * 1024 : 2 * 1024 * 1024;

  const fallbackByExt: Record<string, number> = {
    mp4: 10 * 1024 * 1024,
    mov: 12 * 1024 * 1024,
    webm: 8 * 1024 * 1024,
    png: 2 * 1024 * 1024,
    jpg: 1 * 1024 * 1024,
    jpeg: 1 * 1024 * 1024,
    gif: 3 * 1024 * 1024,
    webp: 1 * 1024 * 1024,
  };

  return fallbackByExt[ext] ?? (isVideo ? 8 * 1024 * 1024 : 2 * 1024 * 1024);
};

const splitAttachmentsIntoChunks = (
  attachments: AttachmentMeta[],
  options: { maxBytesPerEmail: number; maxAttachmentsPerEmail: number },
): AttachmentMeta[][] => {
  const chunks: AttachmentMeta[][] = [];
  let current: AttachmentMeta[] = [];
  let currentBytes = 0;

  for (const attachment of attachments) {
    const willExceedBytes = current.length > 0 && currentBytes + attachment.estimatedBytes > options.maxBytesPerEmail;
    const willExceedCount = current.length > 0 && current.length >= options.maxAttachmentsPerEmail;

    if (willExceedBytes || willExceedCount) {
      chunks.push(current);
      current = [];
      currentBytes = 0;
    }

    current.push(attachment);
    currentBytes += attachment.estimatedBytes;
  }

  if (current.length > 0) {
    chunks.push(current);
  }

  return chunks;
};

const readJsonSafe = async (res: Response): Promise<unknown> => {
  try {
    return await res.json();
  } catch {
    const text = await res.text();
    return text;
  }
};

const isLikelyAttachmentSizeError = (status: number, payload: unknown): boolean => {
  if (status === 413 || status === 422) return true;
  const text = typeof payload === "string" ? payload : JSON.stringify(payload ?? {});
  const lowered = text.toLowerCase();
  return (
    lowered.includes("too large") ||
    lowered.includes("payload") ||
    lowered.includes("attachment") ||
    lowered.includes("size") ||
    lowered.includes("content-length") ||
    lowered.includes("exceed")
  );
};

const extractEmailId = (payload: unknown): string | null => {
  if (!payload || typeof payload !== "object") return null;
  const id = (payload as { id?: unknown }).id;
  return typeof id === "string" && id.length > 0 ? id : null;
};

type DeliveryCheck = {
  state: "ok" | "failed" | "unknown";
  lastEvent?: string;
  payload?: unknown;
};

const FAILURE_EVENTS = new Set([
  "bounced",
  "failed",
  "complained",
  "canceled",
  "cancelled",
  "delivery_failed",
]);

const SUCCESS_EVENTS = new Set([
  "delivered",
  "opened",
  "clicked",
]);

const PENDING_EVENTS = new Set([
  "queued",
  "sent",
  "scheduled",
  "processing",
  "accepted",
]);

const checkDeliveryStatus = async (
  apiKey: string,
  emailId: string,
): Promise<DeliveryCheck> => {
  const maxAttempts = 12;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      const res = await fetch(`https://api.resend.com/emails/${emailId}`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${apiKey}`,
        },
      });

      const payload = await readJsonSafe(res);

      if (!res.ok) {
        if ((res.status === 429 || res.status >= 500) && attempt < maxAttempts - 1) {
          await sleep(400 * (attempt + 1));
          continue;
        }
        return { state: "unknown", payload };
      }

      const lastEventRaw = typeof payload === "object" && payload !== null
        ? (payload as { last_event?: unknown }).last_event
        : undefined;
      const lastEvent = typeof lastEventRaw === "string" ? lastEventRaw.toLowerCase() : undefined;

      if (lastEvent && FAILURE_EVENTS.has(lastEvent)) {
        return { state: "failed", lastEvent, payload };
      }

      if (lastEvent && SUCCESS_EVENTS.has(lastEvent)) {
        return { state: "ok", lastEvent, payload };
      }

      if (lastEvent && PENDING_EVENTS.has(lastEvent) && attempt < maxAttempts - 1) {
        const waitMs = Math.min(2000 + attempt * 350, 4500);
        await sleep(waitMs);
        continue;
      }

      return { state: "unknown", lastEvent, payload };
    } catch (err) {
      if (attempt < 2) {
        await sleep(350 * (attempt + 1));
        continue;
      }
      return { state: "unknown", payload: String(err) };
    }
  }

  return { state: "unknown" };
};

const sendEmailPartWithRetry = async (
  apiKey: string,
  email: string,
  subject: string,
  text: string,
  html: string,
  attachments: Array<{ filename: string; path: string }>,
): Promise<{ success: boolean; status: number; payload: unknown }> => {
  let lastStatus = 0;
  let lastPayload: unknown = null;

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: "iazu <noreply@contato.iazu.com.br>",
          to: [email],
          subject,
          text,
          html,
          attachments,
        }),
      });

      const payload = await readJsonSafe(res);
      lastStatus = res.status;
      lastPayload = payload;

      if (res.status === 429 && attempt < 2) {
        const retryAfter = parseInt(res.headers.get("retry-after") || "2", 10);
        const waitSec = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : 2;
        await sleep(waitSec * 1000);
        continue;
      }

      if (!res.ok) {
        if ((res.status >= 500 || res.status === 408) && attempt < 2) {
          await sleep(500 * (attempt + 1));
          continue;
        }
        break;
      }

      // Send accepted by provider — treat as success immediately (no polling)
      return { success: true, status: res.status, payload };
    } catch (err) {
      lastStatus = 0;
      lastPayload = String(err);

      if (attempt < 2) {
        await sleep(500 * (attempt + 1));
        continue;
      }

      break;
    }
  }

  return { success: false, status: lastStatus, payload: lastPayload };
};

const sendChunkWithAutoSplit = async (
  apiKey: string,
  email: string,
  subject: string,
  text: string,
  html: string,
  attachments: Array<{ filename: string; path: string }>,
): Promise<Array<{ success: boolean; status: number; payload: unknown; attachmentCount: number }>> => {
  const attempt = await sendEmailPartWithRetry(apiKey, email, subject, text, html, attachments);

  if (attempt.success) {
    return [{ ...attempt, attachmentCount: attachments.length }];
  }

  if (attachments.length <= 1 || !isLikelyAttachmentSizeError(attempt.status, attempt.payload)) {
    return [{ ...attempt, attachmentCount: attachments.length }];
  }

  const half = Math.ceil(attachments.length / 2);
  const left = attachments.slice(0, half);
  const right = attachments.slice(half);

  const leftResults = await sendChunkWithAutoSplit(apiKey, email, subject, text, html, left);
  const rightResults = await sendChunkWithAutoSplit(apiKey, email, subject, text, html, right);

  return [...leftResults, ...rightResults];
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
    if (!RESEND_API_KEY) {
      throw new Error("RESEND_API_KEY não configurada");
    }

    const {
      emails,
      subject,
      mediaUrl,
      mediaUrls,
      mediaType,
      clientName,
      caption,
    } = await req.json();

    if (!emails || emails.length === 0) {
      throw new Error("Nenhum e-mail fornecido");
    }
    if (!mediaUrl && (!mediaUrls || mediaUrls.length === 0)) {
      throw new Error("URL da mídia não fornecida");
    }

    const validEmails = Array.from(
      new Set(
        emails
          .map((e: unknown) => (typeof e === "string" ? e.trim() : ""))
          .filter((e: string) => e.length > 0 && e.includes("@")),
      ),
    );
    if (validEmails.length === 0) {
      throw new Error("Nenhum e-mail válido encontrado");
    }

    const isVideo = mediaType === "video";
    const mediaLabel = isVideo ? "Vídeo" : "Arte";

    const rawUrls: unknown[] = mediaUrls && mediaUrls.length > 0 ? mediaUrls : [mediaUrl];
    const allUrls: string[] = rawUrls
      .map((url) => sanitizeHttpUrl(url))
      .filter((url): url is string => !!url);

    if (allUrls.length === 0) {
      throw new Error("Nenhuma URL de mídia válida encontrada");
    }

    const baseName = (clientName || "cliente").replace(/[^a-zA-Z0-9]/g, "_");
    const fallbackExtension = isVideo ? "mp4" : "png";

    const seededAttachments = allUrls.map((url: string, i: number) => {
      const ext = inferExtensionFromUrl(url, fallbackExtension);
      const filename = allUrls.length > 1 ? `${baseName}_p${i + 1}.${ext}` : `${baseName}.${ext}`;
      return { url, filename };
    });

    const attachmentMeta: AttachmentMeta[] = await Promise.all(
      seededAttachments.map(async (entry) => {
        const detectedSize = await estimateFileSize(entry.url);
        return {
          filename: entry.filename,
          path: entry.url,
          estimatedBytes: detectedSize ?? estimateBytesFromFilename(entry.filename, isVideo),
        };
      }),
    );

    // Split conservatively — Trello and some gateways silently reject large emails.
    // Images: max 5 attachments or 15MB per email to ensure delivery.
    const maxBytesPerEmail = isVideo ? 20 * 1024 * 1024 : 15 * 1024 * 1024;
    const maxAttachmentsPerEmail = isVideo ? 2 : 5;
    const attachmentChunks = splitAttachmentsIntoChunks(attachmentMeta, {
      maxBytesPerEmail,
      maxAttachmentsPerEmail,
    });

    if (attachmentChunks.length === 0) {
      throw new Error("Nenhum anexo válido para envio");
    }

    const baseSubject = subject || `${mediaLabel} - ${clientName}`;
    console.log(
      `Preparando envio: ${attachmentMeta.length} anexo(s), ${attachmentChunks.length} parte(s), ${validEmails.length} destinatário(s), assunto="${baseSubject}"`,
    );

    const tipoMidia = isVideo ? "VÍDEO" : "ARTE";
    const artigoMidia = isVideo ? "SEU" : "SUA";
    const artigoMidia2 = isVideo ? "O" : "A";
    const tipoArquivo = isVideo ? "MP4" : "PNG";
    const downloadInstruction = `${artigoMidia} ${tipoMidia} ESTÁ EM ANEXO ABAIXO, PARA VER ${artigoMidia2} ${tipoMidia} NÃO DÊ PLAYER É NECESSÁRIO BAIXAR, FAZER O DOWNLOAD MESMO...\n\nAVISO: BAIXAR FAZER O DOWNLOAD MESMO DO ${tipoArquivo}`;

    const bodyParts: string[] = [];
    if (caption) bodyParts.push(caption);
    if (attachmentChunks.length > 1) {
      bodyParts.push(`Os anexos foram divididos em ${attachmentChunks.length} e-mails para garantir a entrega completa.`);
    }
    bodyParts.push(downloadInstruction);

    const plainText = bodyParts.join("\n\n");
    const htmlBody = `<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">${bodyParts.map((t) => `<p style="color: #333; margin: 0 0 16px 0; white-space: pre-wrap; font-size: 14px;">${escapeHtml(t)}</p>`).join("")}</div>`;

    const results: Array<{
      email: string;
      success: boolean;
      parts: Array<{ part: number; success: boolean; status: number; id?: string; error?: unknown }>;
      error?: unknown;
    }> = [];

    for (let ei = 0; ei < validEmails.length; ei++) {
      const email = validEmails[ei];

      if (ei > 0) {
        await new Promise((r) => setTimeout(r, 300));
      }

      try {
        let recipientSuccess = true;
        const partResults: Array<{ part: number; success: boolean; status: number; id?: string; error?: unknown }> = [];

        let partCounter = 0;
        for (let pi = 0; pi < attachmentChunks.length; pi++) {
          if (pi > 0) {
            await new Promise((r) => setTimeout(r, 250));
          }

          const currentChunk = attachmentChunks[pi].map(({ filename, path }) => ({ filename, path }));
          const chunkSubject =
            attachmentChunks.length > 1
              ? `${baseSubject} (Parte ${pi + 1}/${attachmentChunks.length})`
              : baseSubject;

          const adaptiveResults = await sendChunkWithAutoSplit(
            RESEND_API_KEY,
            email,
            chunkSubject,
            plainText,
            htmlBody,
            currentChunk,
          );

          for (const sendResult of adaptiveResults) {
            partCounter += 1;
            if (!sendResult.success) {
              recipientSuccess = false;
              const errorDetail = typeof sendResult.payload === "object"
                ? JSON.stringify(sendResult.payload)
                : String(sendResult.payload);
              console.error(
                `FALHA [${email}] parte=${partCounter} status=${sendResult.status} anexos=${sendResult.attachmentCount} body=${errorDetail}`,
              );
              partResults.push({
                part: partCounter,
                success: false,
                status: sendResult.status,
                error: sendResult.payload,
              });
            } else {
              const payloadObj = sendResult.payload as { id?: string } | null;
              console.log(
                `OK [${email}] parte=${partCounter} id=${payloadObj?.id} anexos=${sendResult.attachmentCount}`,
              );
              partResults.push({
                part: partCounter,
                success: true,
                status: sendResult.status,
                id: payloadObj?.id,
              });
            }
          }
        }

        results.push({
          email,
          success: recipientSuccess,
          parts: partResults,
          ...(recipientSuccess ? {} : { error: "Falha em uma ou mais partes" }),
        });
      } catch (err) {
        console.error(`EXCEÇÃO [${email}]: ${String(err)}`);
        results.push({
          email,
          success: false,
          parts: [],
          error: String(err),
        });
      }
    }

    const allSuccess = results.every((r) => r.success);
    const successCount = results.filter((r) => r.success).length;

    const failedRecipients = results
      .filter((r) => !r.success)
      .map((r) => r.email);

    return new Response(
      JSON.stringify({
        success: allSuccess,
        message: `${successCount}/${validEmails.length} destinatário(s) com envio concluído em anexo`,
        ...(allSuccess ? {} : { error: `Falha no envio para: ${failedRecipients.join(", ")}` }),
        partCount: attachmentChunks.length,
        results,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (error: unknown) {
    console.error("Error in send-media-email:", error);
    const errorMessage = error instanceof Error ? error.message : "Erro desconhecido";
    return new Response(JSON.stringify({ success: false, error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
