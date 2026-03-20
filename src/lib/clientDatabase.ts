import { supabase } from "@/integrations/supabase/client";

export interface ClientData {
  id: string;
  name: string;
  email: string;
  email_2?: string | null;
  email_3?: string | null;
  company?: string;
  phone?: string;
  notes?: string;
  team?: string;
  slug: string;
  brand_kit?: any;
  created_at?: string;
  active?: boolean;
  payment_method?: "pix" | "credit_card";
  payment_due_day?: number;
  monthly_amount?: number;
  narration_type?: string;
  image_type?: string;
  particularity_type?: string;
  briefing?: string;
}

export interface ClientUpload {
  id: string;
  client_id: string;
  file_url: string;
  file_name: string;
  file_type: string;
  uploaded_at?: string;
}

export interface ProjectBrief {
  id: string;
  client_id: string;
  title: string;
  description?: string;
  deadline?: string;
  status: "todo" | "completed";
  brand_kit_id?: string;
  cover_image?: string;
  cover_video?: string;
  brief_type?: string;
  created_at?: string;
  generated_caption?: string;
  published?: boolean;
  sort_order?: number;
}

// Client functions
export async function createClient(client: Omit<ClientData, "id" | "created_at">) {
  const { data, error } = await supabase
    .from("client_data")
    .insert([client])
    .select()
    .single();
  
  if (error) throw error;
  return data;
}

export async function updateClient(id: string, updates: Partial<ClientData>) {
  const { data, error } = await supabase
    .from("client_data")
    .update(updates)
    .eq("id", id)
    .select()
    .single();
  
  if (error) throw error;
  return data;
}

export async function deleteClient(id: string) {
  // 1. Get all project briefs for this client
  const { data: briefs } = await supabase
    .from("project_briefs")
    .select("id")
    .eq("client_id", id);

  // 2. Delete card_uploads (files + records) for each brief
  if (briefs && briefs.length > 0) {
    const briefIds = briefs.map(b => b.id);
    
    // Get all card upload file paths to delete from storage
    const { data: cardUploads } = await supabase
      .from("card_uploads")
      .select("id, file_url")
      .in("card_id", briefIds);
    
    if (cardUploads && cardUploads.length > 0) {
      // Delete files from storage
      const storagePaths = cardUploads
        .map(u => {
          const match = u.file_url.match(/card-uploads\/(.+)$/);
          return match ? match[1] : null;
        })
        .filter(Boolean) as string[];
      
      if (storagePaths.length > 0) {
        await supabase.storage.from("card-uploads").remove(storagePaths);
      }
      
      // Delete card_uploads records
      await supabase.from("card_uploads").delete().in("card_id", briefIds);
    }
    
    // 3. Delete project briefs
    await supabase.from("project_briefs").delete().eq("client_id", id);
  }

  // 4. Delete client_uploads (files + records)
  const { data: clientUploads } = await supabase
    .from("client_uploads")
    .select("id, file_url")
    .eq("client_id", id);
  
  if (clientUploads && clientUploads.length > 0) {
    const storagePaths = clientUploads
      .map(u => {
        const match = u.file_url.match(/card-uploads\/(.+)$/);
        return match ? match[1] : null;
      })
      .filter(Boolean) as string[];
    
    if (storagePaths.length > 0) {
      await supabase.storage.from("card-uploads").remove(storagePaths);
    }
    
    await supabase.from("client_uploads").delete().eq("client_id", id);
  }

  // 5. Delete client payments
  await supabase.from("client_payments").delete().eq("client_id", id);

  // 6. Finally delete the client itself
  const { error } = await supabase
    .from("client_data")
    .delete()
    .eq("id", id);
  
  if (error) throw error;
}

// Light query for listing - excludes heavy brand_kit JSONB (can be 14MB+ per row)
export async function getAllClients() {
  const { data, error } = await supabase
    .from("client_data")
    .select("id, name, email, email_2, email_3, company, phone, notes, team, slug, created_at, active, payment_method, payment_due_day, monthly_amount, narration_type, image_type, particularity_type, briefing")
    .order("created_at", { ascending: false });
  
  if (error) throw error;
  return data || [];
}

// Full client data including brand_kit - use only when opening a specific client
export async function getClientWithBrandKit(id: string) {
  const { data, error } = await supabase
    .from("client_data")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  
  if (error) throw error;
  return data;
}

export async function getClientBySlug(slug: string) {
  const { data, error } = await supabase
    .from("client_data")
    .select("*")
    .eq("slug", slug)
    .single();
  
  if (error) {
    if (error.code === "PGRST116") return null; // Not found
    throw error;
  }
  return data;
}

// Project Brief functions
export async function createProjectBrief(brief: Omit<ProjectBrief, "id" | "created_at">) {
  const { data, error } = await supabase
    .from("project_briefs")
    .insert([brief])
    .select()
    .single();
  
  if (error) throw error;
  return data;
}

export async function updateProjectBrief(id: string, updates: Partial<ProjectBrief>) {
  const { data, error } = await supabase
    .from("project_briefs")
    .update(updates)
    .eq("id", id)
    .select()
    .single();
  
  if (error) throw error;
  return data;
}

export async function deleteProjectBrief(id: string) {
  const { error } = await supabase
    .from("project_briefs")
    .delete()
    .eq("id", id);
  
  if (error) throw error;
}

export async function getProjectBriefsByClient(clientId: string) {
  const { data, error } = await supabase
    .from("project_briefs")
    .select("*")
    .eq("client_id", clientId)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });
  
  if (error) throw error;
  return data || [];
}

export async function updateBriefsSortOrder(briefIds: string[]) {
  // Update sort_order for each brief based on its position in the array
  const updates = briefIds.map((id, index) =>
    supabase
      .from("project_briefs")
      .update({ sort_order: index + 1 })
      .eq("id", id)
  );
  
  await Promise.all(updates);
}

export async function bulkUpdateBriefStatus(
  clientIds: string[], 
  newStatus: "todo" | "completed",
  completionMeta?: { completion_type?: string; completion_template_id?: string; completion_template_name?: string }
) {
  // Get all todo briefs for these clients (ordered by sort_order then created_at to match visual order)
  const { data: briefs, error: fetchError } = await supabase
    .from("project_briefs")
    .select("*")
    .in("client_id", clientIds)
    .eq("status", "todo")
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });

  if (fetchError) throw fetchError;
  if (!briefs || briefs.length === 0) return [];

  // Group by client and get first (oldest/top) brief per client
  const firstBriefPerClient = new Map();
  briefs.forEach(brief => {
    if (!firstBriefPerClient.has(brief.client_id)) {
      firstBriefPerClient.set(brief.client_id, brief.id);
    }
  });

  const briefIdsToUpdate = Array.from(firstBriefPerClient.values());

  // Update status for first brief of each client
  const updatePayload: any = { status: newStatus };
  if (newStatus === "completed" && completionMeta) {
    if (completionMeta.completion_type) updatePayload.completion_type = completionMeta.completion_type;
    if (completionMeta.completion_template_id) updatePayload.completion_template_id = completionMeta.completion_template_id;
    if (completionMeta.completion_template_name) updatePayload.completion_template_name = completionMeta.completion_template_name;
  }

  const { data, error } = await supabase
    .from("project_briefs")
    .update(updatePayload)
    .in("id", briefIdsToUpdate)
    .select();

  if (error) throw error;

  // When completing, delete material uploads for those briefs
  if (newStatus === "completed") {
    for (const briefId of briefIdsToUpdate) {
      await deleteCardUploadsByCardId(briefId);
    }
  }

  return data || [];
}

export async function bulkUpdateBriefDeadline(clientIds: string[], deadline: string) {
  // Get all todo briefs for these clients (ordered by sort_order then created_at to match visual order)
  const { data: briefs, error: fetchError } = await supabase
    .from("project_briefs")
    .select("*")
    .in("client_id", clientIds)
    .eq("status", "todo")
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });

  if (fetchError) throw fetchError;
  if (!briefs || briefs.length === 0) return [];

  // Group by client and get first (oldest/top) brief per client
  const firstBriefPerClient = new Map();
  briefs.forEach(brief => {
    if (!firstBriefPerClient.has(brief.client_id)) {
      firstBriefPerClient.set(brief.client_id, brief.id);
    }
  });

  const briefIdsToUpdate = Array.from(firstBriefPerClient.values());

  // Update deadline for first brief of each client
  const { data, error } = await supabase
    .from("project_briefs")
    .update({ deadline })
    .in("id", briefIdsToUpdate)
    .select();

  if (error) throw error;
  return data || [];
}

// Card Uploads functions
export interface CardUpload {
  id: string;
  card_id: string;
  file_url: string;
  file_name: string;
  file_type: string;
  upload_type: "material" | "final";
  uploaded_at?: string;
}

export async function createCardUpload(upload: Omit<CardUpload, "id" | "uploaded_at">) {
  const { data, error } = await supabase
    .from("card_uploads")
    .insert([upload])
    .select()
    .single();
  
  if (error) throw error;
  return data;
}

export async function getCardUploads(cardId: string) {
  const { data, error } = await supabase
    .from("card_uploads")
    .select("*")
    .eq("card_id", cardId)
    .order("uploaded_at", { ascending: true });
  
  if (error) throw error;
  return data || [];
}

export async function deleteCardUpload(id: string) {
  const { error } = await supabase
    .from("card_uploads")
    .delete()
    .eq("id", id);
  
  if (error) throw error;
}

export async function deleteCardUploadsByCardId(cardId: string) {
  const { data: uploads } = await supabase
    .from("card_uploads")
    .select("id, file_url")
    .eq("card_id", cardId);

  if (uploads && uploads.length > 0) {
    const storagePaths = uploads
      .map(u => {
        const match = u.file_url.match(/card-uploads\/(.+)$/);
        return match ? match[1] : null;
      })
      .filter(Boolean) as string[];

    if (storagePaths.length > 0) {
      await supabase.storage.from("card-uploads").remove(storagePaths);
    }

    await supabase.from("card_uploads").delete().eq("card_id", cardId);
  }
}

// Art Generation Selection functions
export async function tagFirstCardsForArtGeneration(clientIds: string[]) {
  // First, clear all existing tags
  await supabase
    .from("project_briefs")
    .update({ art_generation_selected: false })
    .eq("art_generation_selected", true);

  // Get all todo briefs for these clients (ordered by sort_order then created_at to match visual order)
  const { data: briefs, error: fetchError } = await supabase
    .from("project_briefs")
    .select("*")
    .in("client_id", clientIds)
    .eq("status", "todo")
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });

  if (fetchError) throw fetchError;
  if (!briefs || briefs.length === 0) return [];

  // Group by client and get first (oldest/top) brief per client
  const firstBriefPerClient = new Map();
  briefs.forEach(brief => {
    if (!firstBriefPerClient.has(brief.client_id)) {
      firstBriefPerClient.set(brief.client_id, brief.id);
    }
  });

  const briefIdsToTag = Array.from(firstBriefPerClient.values());

  // Tag first brief of each client
  const { data, error } = await supabase
    .from("project_briefs")
    .update({ art_generation_selected: true })
    .in("id", briefIdsToTag)
    .select();

  if (error) throw error;
  return data || [];
}

// Auto-tag first cards of all active clients
// teamFilter: team name string to filter by, or undefined for all
export async function autoTagFirstCardsForAllActiveClients(teamFilter?: string) {
  // Get all active clients, optionally filtered by team
  let query = supabase
    .from("client_data")
    .select("id")
    .eq("active", true);
  
  if (teamFilter) {
    query = query.eq("team", teamFilter);
  }

  const { data: clients, error: clientError } = await query;

  if (clientError) throw clientError;
  if (!clients || clients.length === 0) return [];

  const clientIds = clients.map(c => c.id);
  return tagFirstCardsForArtGeneration(clientIds);
}

export async function getTaggedCardsForArtGeneration(teamFilter?: string) {
  const { data, error } = await supabase
    .from("project_briefs")
    .select("*, client:client_data(*)")
    .eq("art_generation_selected", true)
    .eq("status", "todo");

  if (error) throw error;

  const rows = data || [];
  if (!teamFilter) return rows;
  return rows.filter((row: any) => row.client?.team === teamFilter);
}

export async function clearArtGenerationTags(teamFilter?: string) {
  if (teamFilter) {
    const { data: clients, error: clientsError } = await supabase
      .from("client_data")
      .select("id")
      .eq("team", teamFilter);

    if (clientsError) throw clientsError;

    const clientIds = (clients || []).map((c: any) => c.id);
    if (clientIds.length === 0) return;

    const { error } = await supabase
      .from("project_briefs")
      .update({ art_generation_selected: false })
      .eq("art_generation_selected", true)
      .in("client_id", clientIds);

    if (error) throw error;
    return;
  }

  const { error } = await supabase
    .from("project_briefs")
    .update({ art_generation_selected: false })
    .eq("art_generation_selected", true);

  if (error) throw error;
}

// Client Uploads functions
export async function createClientUpload(upload: Omit<ClientUpload, "id" | "uploaded_at">) {
  const { data, error } = await supabase
    .from("client_uploads")
    .insert([upload])
    .select()
    .single();
  
  if (error) throw error;
  return data;
}

export async function getClientUploads(clientId: string) {
  const { data, error } = await supabase
    .from("client_uploads")
    .select("*")
    .eq("client_id", clientId)
    .order("uploaded_at", { ascending: false });
  
  if (error) throw error;
  return data || [];
}

export async function deleteClientUpload(id: string) {
  const { error } = await supabase
    .from("client_uploads")
    .delete()
    .eq("id", id);
  
  if (error) throw error;
}

// Generate slug from name
export function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // Remove accents
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
