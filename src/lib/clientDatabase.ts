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
    .select("id, name, email, company, phone, notes, team, slug, created_at, active, payment_method, payment_due_day, monthly_amount, narration_type, image_type, particularity_type, briefing")
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

export async function bulkUpdateBriefStatus(clientIds: string[], newStatus: "todo" | "completed") {
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
  const { data, error } = await supabase
    .from("project_briefs")
    .update({ status: newStatus })
    .in("id", briefIdsToUpdate)
    .select();

  if (error) throw error;
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

export async function getTaggedCardsForArtGeneration() {
  const { data, error } = await supabase
    .from("project_briefs")
    .select("*, client:client_data(*)")
    .eq("art_generation_selected", true)
    .eq("status", "todo");

  if (error) throw error;
  return data || [];
}

export async function clearArtGenerationTags() {
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
