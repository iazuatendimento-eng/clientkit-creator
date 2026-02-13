import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function getMimeType(name: string): string {
  const ext = name.split('.').pop()?.toLowerCase() || '';
  const mimes: Record<string, string> = {
    jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif',
    webp: 'image/webp', svg: 'image/svg+xml',
    mp4: 'video/mp4', mov: 'video/quicktime', webm: 'video/webm',
  };
  return mimes[ext] || 'application/octet-stream';
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const url = new URL(req.url);
  const fileUrl = url.searchParams.get("url");
  const fileName = url.searchParams.get("name") || "download";

  if (!fileUrl) {
    return new Response("Missing url param", { status: 400, headers: corsHeaders });
  }

  try {
    const res = await fetch(fileUrl);
    if (!res.ok) {
      return new Response(`Upstream error: ${res.status}`, { status: 502, headers: corsHeaders });
    }

    const buffer = await res.arrayBuffer();
    const mimeType = getMimeType(fileName);

    return new Response(buffer, {
      headers: {
        ...corsHeaders,
        "Content-Type": mimeType,
        "Content-Disposition": `attachment; filename="${fileName}"`,
        "Content-Length": buffer.byteLength.toString(),
        "Cache-Control": "no-cache",
      },
    });
  } catch (e) {
    return new Response(`Error: ${e.message}`, { status: 500, headers: corsHeaders });
  }
});
