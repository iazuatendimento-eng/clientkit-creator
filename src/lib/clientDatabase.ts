import { supabase } from "@/integrations/supabase/client";

export interface ClientData {
  id: string;
  name: string;
  email: string;
  company?: string;
  phone?: string;
  notes?: string;
  team?: "1" | "2" | "3";
  slug: string;
  brand_kit?: any;
  created_at?: string;
  active?: boolean;
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

export async function getAllClients() {
  const { data, error } = await supabase
    .from("client_data")
    .select("*")
    .order("created_at", { ascending: false });
  
  if (error) throw error;
  return data || [];
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
    .order("created_at", { ascending: false });
  
  if (error) throw error;
  return data || [];
}

export async function bulkUpdateBriefStatus(clientIds: string[], newStatus: "todo" | "completed") {
  // Get all briefs for these clients
  const { data: briefs, error: fetchError } = await supabase
    .from("project_briefs")
    .select("*")
    .in("client_id", clientIds)
    .order("created_at", { ascending: false });

  if (fetchError) throw fetchError;
  if (!briefs || briefs.length === 0) return [];

  // Group by client and get first brief per client
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
  // Get all briefs for these clients
  const { data: briefs, error: fetchError } = await supabase
    .from("project_briefs")
    .select("*")
    .in("client_id", clientIds)
    .order("created_at", { ascending: false });

  if (fetchError) throw fetchError;
  if (!briefs || briefs.length === 0) return [];

  // Group by client and get first brief per client
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

// Generate slug from name
export function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // Remove accents
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
