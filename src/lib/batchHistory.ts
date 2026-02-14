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
  previewVideoUrls?: (string | null)[];
  adjustments?: {
    logoScale?: { x: number; y: number };
    logoOffset?: { x: number; y: number };
    contactScale?: { x: number; y: number };
    contactOffset?: { x: number; y: number };
    mascotScale?: { x: number; y: number };
    mascotOffset?: { x: number; y: number };
  };
  pageTextAdjustments?: { textScale: number; textX: number; textY: number }[];
  pageImageAdjustments?: { imageX: number; imageY: number; imageScale: number }[];
  note?: string;
  noteRead?: boolean;
}

export interface BatchGeneration {
  id: string;
  type: "art" | "video";
  template_snapshot: any;
  items: BatchItem[];
  created_by: string;
  created_at: string;
}

export async function saveBatchGeneration(
  type: "art" | "video",
  templateSnapshot: any,
  items: BatchItem[],
  existingId?: string
): Promise<string | null> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;

    // If existingId provided, update instead of insert
    if (existingId) {
      const { error } = await supabase
        .from("batch_generations")
        .update({
          template_snapshot: templateSnapshot,
          items: items as any,
        })
        .eq("id", existingId);

      if (error) {
        console.error("Error updating batch:", error);
        return null;
      }

      return existingId;
    }

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

export async function getBatchGenerations(type?: "art" | "video"): Promise<BatchGeneration[]> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    console.log("getBatchGenerations - Current user:", user?.id);

    // Fetch only lightweight columns - exclude heavy 'items' JSONB (can be 8MB+ per row)
    let query = supabase
      .from("batch_generations")
      .select("id, type, template_snapshot, created_by, created_at")
      .order("created_at", { ascending: false })
      .limit(50);

    if (type) {
      query = query.eq("type", type);
    }

    const { data, error } = await query;

    console.log("getBatchGenerations - Result:", { data, error, count: data?.length });

    if (error) {
      console.error("Error fetching batches:", error);
      return [];
    }

    return (data || []).map((b) => ({
      ...b,
      type: b.type as "art" | "video",
      items: [] as BatchItem[], // items loaded on demand via getBatchById
    }));
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
