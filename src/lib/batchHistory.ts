import { supabase } from "@/integrations/supabase/client";

export interface BatchItem {
  cardId: string;
  clientId: string;
  clientName: string;
  company: string;
  cardTitle: string;
  cardText: string;
  brandKit: any;
  files: string[]; // URLs of generated images/pages
  backgroundImages?: string[];
  adjustments?: {
    logoScale?: { x: number; y: number };
    logoOffset?: { x: number; y: number };
    contactScale?: { x: number; y: number };
    contactOffset?: { x: number; y: number };
    mascotScale?: { x: number; y: number };
    mascotOffset?: { x: number; y: number };
  };
}

export interface BatchGeneration {
  id: string;
  type: "art" | "video";
  template_snapshot: any;
  items: BatchItem[];
  created_by: string;
  created_at: string;
}

const MAX_BATCHES_PER_TYPE = 6;

export async function saveBatchGeneration(
  type: "art" | "video",
  templateSnapshot: any,
  items: BatchItem[]
): Promise<string | null> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;

    // Auto-cleanup: delete oldest batches if we have 6 or more
    await cleanupOldBatches(type, user.id);

    const { data, error } = await supabase
      .from("batch_generations")
      .insert({
        type,
        template_snapshot: templateSnapshot,
        items: items as any,
        created_by: user.id,
      })
      .select("id")
      .single();

    if (error) {
      console.error("Error saving batch:", error);
      return null;
    }

    return data.id;
  } catch (error) {
    console.error("Error saving batch:", error);
    return null;
  }
}

async function cleanupOldBatches(type: "art" | "video", userId: string) {
  try {
    // Get all batches of this type for this user, ordered by date
    const { data: batches, error } = await supabase
      .from("batch_generations")
      .select("id, created_at")
      .eq("type", type)
      .eq("created_by", userId)
      .order("created_at", { ascending: false });

    if (error || !batches) return;

    // If we have MAX or more, delete the oldest ones
    if (batches.length >= MAX_BATCHES_PER_TYPE) {
      const batchesToDelete = batches.slice(MAX_BATCHES_PER_TYPE - 1);
      const idsToDelete = batchesToDelete.map((b) => b.id);

      if (idsToDelete.length > 0) {
        await supabase
          .from("batch_generations")
          .delete()
          .in("id", idsToDelete);
        
        console.log(`Auto-deleted ${idsToDelete.length} old ${type} batch(es)`);
      }
    }
  } catch (error) {
    console.error("Error cleaning up old batches:", error);
  }
}

export async function getBatchGenerations(type?: "art" | "video"): Promise<BatchGeneration[]> {
  try {
    let query = supabase
      .from("batch_generations")
      .select("*")
      .order("created_at", { ascending: false });

    if (type) {
      query = query.eq("type", type);
    }

    const { data, error } = await query;

    if (error) {
      console.error("Error fetching batches:", error);
      return [];
    }

    return (data || []).map((b) => ({
      ...b,
      type: b.type as "art" | "video",
      items: b.items as unknown as BatchItem[],
    })) as BatchGeneration[];
  } catch (error) {
    console.error("Error fetching batches:", error);
    return [];
  }
}

export async function getBatchById(id: string): Promise<BatchGeneration | null> {
  try {
    const { data, error } = await supabase
      .from("batch_generations")
      .select("*")
      .eq("id", id)
      .maybeSingle();

    if (error || !data) {
      console.error("Error fetching batch:", error);
      return null;
    }

    return {
      ...data,
      type: data.type as "art" | "video",
      items: data.items as unknown as BatchItem[],
    };
  } catch (error) {
    console.error("Error fetching batch:", error);
    return null;
  }
}

export async function updateBatchItem(
  batchId: string,
  itemIndex: number,
  updates: Partial<BatchItem>
): Promise<boolean> {
  try {
    const batch = await getBatchById(batchId);
    if (!batch) return false;

    const items = [...batch.items];
    items[itemIndex] = { ...items[itemIndex], ...updates };

    const { error } = await supabase
      .from("batch_generations")
      .update({ items: items as any })
      .eq("id", batchId);

    if (error) {
      console.error("Error updating batch item:", error);
      return false;
    }

    return true;
  } catch (error) {
    console.error("Error updating batch item:", error);
    return false;
  }
}

export async function deleteBatch(id: string): Promise<boolean> {
  try {
    const { error } = await supabase
      .from("batch_generations")
      .delete()
      .eq("id", id);

    if (error) {
      console.error("Error deleting batch:", error);
      return false;
    }

    return true;
  } catch (error) {
    console.error("Error deleting batch:", error);
    return false;
  }
}
