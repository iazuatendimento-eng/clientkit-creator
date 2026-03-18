import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  generateAllVideoPages,
  loadGoogleFont,
  defaultAdjustments,
  defaultPageTextAdjustment,
  defaultPageImageAdjustment,
  type VideoTemplateData,
  type CanvasElement,
  type VideoPages,
  type ElementAdjustments,
  type PageTextAdjustment,
  type PageImageAdjustment,
} from "@/lib/videoRenderer";
import { searchVideos } from "@/lib/imageSearch";
import { translateToEnglishLocal } from "@/lib/localTranslate";

export interface PreloadedVideoData {
  template: VideoTemplateData;
  videoPages: VideoPages;
  videoUrls: (string | null)[];
  pageTexts: string[];
  pageTextAdjustments: PageTextAdjustment[];
  pageImageAdjustments: PageImageAdjustment[];
  adjustments: ElementAdjustments;
  searchedImages: string[];
  materialImages: string[];
}

export function useVideoPregenerate(
  cardId: string,
  cardText: string,
  cardTitle: string,
  brandKit: any,
  clientName: string,
  cardIndex: number,
  enabled: boolean = true
) {
  const [preloadedData, setPreloadedData] = useState<PreloadedVideoData | null>(null);
  const [isPreloading, setIsPreloading] = useState(false);
  const hasStarted = useRef(false);

  useEffect(() => {
    if (!enabled || hasStarted.current) return;
    hasStarted.current = true;

    const pregenerate = async () => {
      setIsPreloading(true);
      try {
        const { data: templates, error } = await supabase
        .from("master_video_templates")
        .select("*")
        .eq("deleted", false)
        .order("created_at", { ascending: true });

        if (error || !templates || templates.length === 0) return;

        const selectedIdx = cardIndex % templates.length;
        const raw = templates[selectedIdx];
        const tmpl: VideoTemplateData = {
          id: raw.id,
          name: raw.name,
          contentElements: (raw.content_elements || []) as unknown as CanvasElement[],
          signatureElements: (raw.signature_elements || []) as unknown as CanvasElement[],
          width: raw.width,
          height: raw.height,
          backgroundColor: raw.background_color,
          pageDuration: raw.page_duration,
          audioUrl1: raw.audio_url_1 || undefined,
          audioUrl2: raw.audio_url_2 || undefined,
        };

        // Fetch client metadata for better search context
        let clientImageType = "";
        let clientNarrationType = "";
        let clientBriefing = "";
        try {
          const { data: clientMeta } = await supabase
            .from("client_data")
            .select("image_type, narration_type, briefing")
            .eq("name", clientName)
            .maybeSingle();
          if (clientMeta) {
            clientImageType = clientMeta.image_type || "";
            clientNarrationType = clientMeta.narration_type || "";
            clientBriefing = clientMeta.briefing || "";
          }
        } catch { /* ignore */ }

        const fontFamily = brandKit?.font || brandKit?.fontFamily || "Arial";
        await loadGoogleFont(fontFamily);

        const fullText = cardText || cardTitle || "";
        const texts = fullText.split(";").map((t: string) => t.trim()).filter((t: string) => t.length > 0);
        if (texts.length === 0) texts.push(fullText || clientName);

        const initPt = texts.map(() => ({ ...defaultPageTextAdjustment }));
        const initPi = texts.map(() => ({ ...defaultPageImageAdjustment }));
        const adj = { ...defaultAdjustments };

        // Fetch ALL material uploads (images + videos) in order
        let matFiles: { url: string; isVideo: boolean }[] = [];
        try {
          const { data: uploads } = await supabase
            .from("card_uploads")
            .select("file_url, file_type")
            .eq("card_id", cardId)
            .eq("upload_type", "material");
          matFiles = (uploads || []).map(u => ({
            url: u.file_url,
            isVideo: u.file_type.startsWith("video"),
          }));
        } catch { /* ignore */ }

        // Trim materials to page count (discard extras)
        const usableMats = matFiles.slice(0, texts.length);

        // Assign materials per page in order; remaining pages need bank videos
        const bgImages: string[] = texts.map(() => "");
        let bgVideoUrls: (string | null)[] = texts.map(() => null);
        const pagesNeedingBankVideo: number[] = [];

        usableMats.forEach((mat, idx) => {
          if (mat.isVideo) {
            bgVideoUrls[idx] = mat.url;
          } else {
            bgImages[idx] = mat.url;
          }
        });

        // Pages without any material need a video from the bank
        texts.forEach((_, idx) => {
          if (idx >= usableMats.length) {
            pagesNeedingBankVideo.push(idx);
          }
        });

        // Search bank videos only for uncovered pages
        if (pagesNeedingBankVideo.length > 0) {
          try {
            // Build rich search context from client metadata + text
            const contextParts = [clientImageType, clientNarrationType, clientBriefing, fullText].filter(Boolean);
            const searchContext = contextParts.join(" ").split(" ").slice(0, 15).join(" ");
            let translatedTerms = searchContext;
            try {
              const { data: transData } = await Promise.race([
                supabase.functions.invoke("translate-text", { body: { text: searchContext } }),
                new Promise<never>((_, reject) => setTimeout(() => reject(new Error("Timeout")), 5000)),
              ]);
              if (transData?.translatedText) translatedTerms = transData.translatedText;
            } catch { /* use original */ }

            let results = await searchVideos(translatedTerms, Math.max(pagesNeedingBankVideo.length, 3));
            if (results.length === 0) results = await searchVideos(translatedTerms.split(" ").slice(0, 2).join(" "), 3);
            if (results.length === 0) results = await searchVideos("business technology", 3);

            if (results.length > 0) {
              pagesNeedingBankVideo.forEach((pageIdx, i) => {
                bgVideoUrls[pageIdx] = results[i % results.length]?.videoUrl || null;
              });
            }
          } catch { /* ignore */ }
        }

        // Collect material image URLs for the renderer
        const matImageUrls = bgImages.filter(u => u.length > 0);

        const pages = await generateAllVideoPages(tmpl, texts, brandKit, bgImages, adj, initPt, initPi);

        setPreloadedData({
          template: tmpl,
          videoPages: pages,
          videoUrls: bgVideoUrls,
          pageTexts: texts,
          pageTextAdjustments: initPt,
          pageImageAdjustments: initPi,
          adjustments: adj,
          searchedImages: bgImages,
          materialImages: matImageUrls,
        });
      } catch (err) {
        console.error("Video pregeneration error:", err);
      } finally {
        setIsPreloading(false);
      }
    };

    pregenerate();
  }, [enabled]);

  return { preloadedData, isPreloading };
}
