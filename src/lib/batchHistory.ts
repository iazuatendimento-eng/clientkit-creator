import { supabase } from "@/integrations/supabase/client";

/**
 * Strip base64 data and blob URLs from a brandKit object before persisting to DB.
 * Keeps only remote URLs (http/https) to avoid bloating the JSONB column.
 */
export function sanitizeBrandKitForStorage(brandKit: any): any {
  if (!brandKit) return brandKit;

  const isRemoteUrl = (v: any): boolean =>
    typeof v === "string" && (v.startsWith("http://") || v.startsWith("https://"));

  const clean = (val: any): any => {
    if (typeof val !== "string") return val;
    if (isRemoteUrl(val)) return val;
    if (val.startsWith("data:") || val.startsWith("blob:")) return "";
    return val;
  };

  const sanitized = { ...brandKit };
  for (const key of ["logo", "contactInfo", "mascot"]) {
    if (sanitized[key]) sanitized[key] = clean(sanitized[key]);
  }
  if (Array.isArray(sanitized.pngs)) {
    sanitized.pngs = sanitized.pngs.map((p: any) => clean(p));
  }
  return sanitized;
}

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
  photoImage?: string;
  photoOffset?: { x: number; y: number };
  elementOverrides?: any;
  pageIndex?: number;
  totalPages?: number;
  imageType?: string;
  narrationType?: string;
  briefing?: string;
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

/**
 * Convert a base64 data URL to a Blob.
 */
function dataUrlToBlob(dataUrl: string): Blob {
  const [header, base64] = dataUrl.split(",");
  const mime = header.match(/:(.*?);/)?.[1] || "image/png";
  const binary = atob(base64);
  const array = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) array[i] = binary.charCodeAt(i);
  return new Blob([array], { type: mime });
}

const withCacheBuster = (url: string) => `${url}${url.includes("?") ? "&" : "?"}v=${Date.now()}`;

/**
 * Upload base64/blob files from batch items to Supabase Storage and replace with URLs.
 * Processes uploads in parallel batches of 5.
 */
async function uploadItemFilesToStorage(items: BatchItem[], batchId: string): Promise<BatchItem[]> {
  const results: BatchItem[] = [];

  for (const item of items) {
    const uploadedFiles: string[] = [];

    for (let fi = 0; fi < (item.files || []).length; fi++) {
      const file = item.files[fi];
      if (typeof file === "string" && file.startsWith("http")) {
        uploadedFiles.push(file);
        continue;
      }
      if (typeof file === "string" && file.startsWith("data:")) {
        try {
          const blob = dataUrlToBlob(file);
          const ext = blob.type === "image/png" ? "png" : "jpg";
          const fileName = `batch-previews/${batchId}/${item.cardId}_p${item.pageIndex ?? 0}_${fi}.${ext}`;

          const { error } = await supabase.storage
            .from("card-uploads")
            .upload(fileName, blob, { contentType: blob.type, upsert: true });

          if (!error) {
            const { data: urlData } = supabase.storage.from("card-uploads").getPublicUrl(fileName);
            uploadedFiles.push(withCacheBuster(urlData.publicUrl));
          } else {
            console.error("Upload error:", error);
          }
        } catch (e) {
          console.error("Failed to upload preview:", e);
        }
      }
      // Skip blob: URLs — they can't be uploaded
    }

    // Upload photoImage if it's a base64 data URL
    let persistedPhotoImage = item.photoImage;
    if (typeof persistedPhotoImage === "string" && persistedPhotoImage.startsWith("data:")) {
      try {
        const blob = dataUrlToBlob(persistedPhotoImage);
        const ext = blob.type === "image/png" ? "png" : "jpg";
        const fileName = `batch-previews/${batchId}/${item.cardId}_p${item.pageIndex ?? 0}_photo.${ext}`;
        const { error } = await supabase.storage
          .from("card-uploads")
          .upload(fileName, blob, { contentType: blob.type, upsert: true });
        if (!error) {
          const { data: urlData } = supabase.storage.from("card-uploads").getPublicUrl(fileName);
          persistedPhotoImage = withCacheBuster(urlData.publicUrl);
        } else {
          console.error("Upload photo error:", error);
        }
      } catch (e) {
        console.error("Failed to upload photoImage:", e);
      }
    } else if (typeof persistedPhotoImage === "string" && persistedPhotoImage.startsWith("blob:")) {
      // Blob URLs can't be uploaded and won't survive page reload — clear them
      persistedPhotoImage = undefined;
    }

    // Upload backgroundImages if they are base64 data URLs
    let persistedBackgroundImages = item.backgroundImages;
    if (Array.isArray(persistedBackgroundImages)) {
      const uploaded: string[] = [];
      for (let bi = 0; bi < persistedBackgroundImages.length; bi++) {
        const bg = persistedBackgroundImages[bi];
        if (typeof bg === "string" && bg.startsWith("http")) {
          uploaded.push(bg);
        } else if (typeof bg === "string" && bg.startsWith("data:")) {
          try {
            const blob = dataUrlToBlob(bg);
            const ext = blob.type === "image/png" ? "png" : "jpg";
            const fileName = `batch-previews/${batchId}/${item.cardId}_p${item.pageIndex ?? 0}_bg${bi}.${ext}`;
            const { error } = await supabase.storage
              .from("card-uploads")
              .upload(fileName, blob, { contentType: blob.type, upsert: true });
            if (!error) {
              const { data: urlData } = supabase.storage.from("card-uploads").getPublicUrl(fileName);
              uploaded.push(urlData.publicUrl);
            }
          } catch (e) {
            console.error("Failed to upload backgroundImage:", e);
          }
        }
        // Skip blob: URLs
      }
      persistedBackgroundImages = uploaded.length > 0 ? uploaded : undefined;
    }

    results.push({
      ...item,
      brandKit: sanitizeBrandKitForStorage(item.brandKit),
      files: uploadedFiles,
      photoImage: persistedPhotoImage,
      backgroundImages: persistedBackgroundImages,
      previewVideoUrls: (item.previewVideoUrls || []).map(u =>
        typeof u === "string" && (u.startsWith("data:") || u.startsWith("blob:")) ? null : u
      ),
    });
  }

  return results;
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

    // Determine the batch ID for storage paths
    const batchId = existingId || crypto.randomUUID();

    // Upload base64 previews to Storage and get clean URLs
    const cleanItems = await uploadItemFilesToStorage(items, batchId);

    if (existingId) {
      const { error } = await supabase
        .from("batch_generations")
        .update({
          template_snapshot: templateSnapshot,
          items: cleanItems as any,
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
        id: batchId,
        type,
        template_snapshot: templateSnapshot,
        items: cleanItems as any,
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

    // Recalculate hasUnresolvedNotes flag in template_snapshot
    const hasUnresolvedNotes = items.some(i => i.note && !i.noteRead);
    const updatedSnapshot = { ...(batch.template_snapshot as any), hasUnresolvedNotes };

    const { error } = await supabase
      .from("batch_generations")
      .update({ items: items as any, template_snapshot: updatedSnapshot as any })
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
