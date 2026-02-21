import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // Find expired generated videos
    const { data: expired, error: fetchError } = await supabase
      .from("project_briefs")
      .select("id, generated_video_url")
      .not("generated_video_url", "is", null)
      .lt("generated_video_expires_at", new Date().toISOString());

    if (fetchError) throw fetchError;

    if (!expired || expired.length === 0) {
      return new Response(JSON.stringify({ cleaned: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let cleaned = 0;
    for (const brief of expired) {
      // Extract storage path from URL
      if (brief.generated_video_url) {
        try {
          const url = new URL(brief.generated_video_url);
          const pathMatch = url.pathname.match(/\/object\/public\/card-uploads\/(.+)/);
          if (pathMatch) {
            await supabase.storage.from("card-uploads").remove([pathMatch[1]]);
          }
        } catch (e) {
          console.error("Error deleting file:", e);
        }
      }

      // Clear the fields
      await supabase
        .from("project_briefs")
        .update({ generated_video_url: null, generated_video_expires_at: null })
        .eq("id", brief.id);

      cleaned++;
    }

    return new Response(JSON.stringify({ cleaned }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Cleanup error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
