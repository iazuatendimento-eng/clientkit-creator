import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

Deno.serve(async () => {
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, serviceKey);

  // List all files under videos/ prefix that start with regen_
  const allFiles: string[] = [];
  let offset = 0;
  const limit = 100;

  while (true) {
    const { data, error } = await supabase.storage
      .from("card-uploads")
      .list("videos", { limit, offset, search: "regen_" });

    if (error) {
      return new Response(JSON.stringify({ error: error.message }), { status: 500 });
    }
    if (!data || data.length === 0) break;

    for (const file of data) {
      if (file.name.startsWith("regen_")) {
        allFiles.push(`videos/${file.name}`);
      }
    }

    if (data.length < limit) break;
    offset += limit;
  }

  if (allFiles.length === 0) {
    return new Response(JSON.stringify({ message: "No regen files found", deleted: 0 }));
  }

  // Delete in batches of 100
  let totalDeleted = 0;
  for (let i = 0; i < allFiles.length; i += 100) {
    const batch = allFiles.slice(i, i + 100);
    const { error } = await supabase.storage.from("card-uploads").remove(batch);
    if (error) {
      console.error("Delete batch error:", error);
    } else {
      totalDeleted += batch.length;
    }
  }

  return new Response(JSON.stringify({ message: `Deleted ${totalDeleted} regen files`, deleted: totalDeleted }));
});
