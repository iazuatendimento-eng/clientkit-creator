import { createClient } from "https://esm.sh/@supabase/supabase-js@2.79.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const { action, client_id, username, password } = await req.json();

    if (action === "login") {
      const { data, error } = await supabase.rpc("verify_client_login", {
        p_username: username,
        p_password: password,
      });

      if (error || !data) {
        return new Response(
          JSON.stringify({ error: "Usuário ou senha incorretos" }),
          { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const { data: clientData } = await supabase
        .from("client_data")
        .select("id, name, email, company, slug, team, active")
        .eq("id", data)
        .single();

      if (!clientData) {
        return new Response(
          JSON.stringify({ error: "Cliente não encontrado" }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      return new Response(
        JSON.stringify({ client: clientData }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // All other actions require admin auth
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Não autorizado" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) {
      return new Response(
        JSON.stringify({ error: "Não autorizado" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (action === "upsert") {
      if (!client_id || !username || !password) {
        return new Response(
          JSON.stringify({ error: "client_id, username e password são obrigatórios" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Hash password using DB function
      const { data: hash, error: hashError } = await supabase.rpc("hash_password", {
        p_password: password,
      });
      if (hashError) throw hashError;

      const { data: existing } = await supabase
        .from("client_credentials")
        .select("id")
        .eq("client_id", client_id)
        .maybeSingle();

      if (existing) {
        const { error } = await supabase
          .from("client_credentials")
          .update({ username, password_hash: hash, updated_at: new Date().toISOString() })
          .eq("client_id", client_id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("client_credentials")
          .insert({ client_id, username, password_hash: hash });
        if (error) throw error;
      }

      return new Response(
        JSON.stringify({ success: true }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (action === "delete") {
      const { error } = await supabase
        .from("client_credentials")
        .delete()
        .eq("client_id", client_id);
      if (error) throw error;

      return new Response(
        JSON.stringify({ success: true }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (action === "get") {
      const { data, error } = await supabase
        .from("client_credentials")
        .select("username")
        .eq("client_id", client_id)
        .maybeSingle();
      if (error) throw error;

      return new Response(
        JSON.stringify({ credentials: data }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ error: "Ação inválida" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("Error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
