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

export interface PreloadedVideoData {
  template: VideoTemplateData;
  videoPages: VideoPages;
  videoUrls: (string | null)[];
  pageTexts: string[];
  pageTextAdjustments: PageTextAdjustment[];
  pageImageAdjustments: PageImageAdjustment[];
  adjustments: ElementAdjustments;
}

export function useVideoPregenerate(
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

        const fontFamily = brandKit?.font || brandKit?.fontFamily || "Arial";
        await loadGoogleFont(fontFamily);

        const fullText = cardText || cardTitle || "";
        const texts = fullText.split(";").map((t: string) => t.trim()).filter((t: string) => t.length > 0);
        if (texts.length === 0) texts.push(fullText || clientName);

        const initPt = texts.map(() => ({ ...defaultPageTextAdjustment }));
        const initPi = texts.map(() => ({ ...defaultPageImageAdjustment }));
        const adj = { ...defaultAdjustments };

        // Search for background videos
        let bgVideoUrls: (string | null)[] = texts.map(() => null);
        try {
          const searchTerms = fullText.split(" ").slice(0, 6).join(" ");
          let translatedTerms = searchTerms;
          try {
            const { data: transData } = await Promise.race([
              supabase.functions.invoke("translate-text", { body: { text: searchTerms } }),
              new Promise<never>((_, reject) => setTimeout(() => reject(new Error("Timeout")), 5000)),
            ]);
            if (transData?.translatedText) translatedTerms = transData.translatedText;
          } catch { /* use original */ }

          let results = await searchVideos(translatedTerms, Math.max(texts.length, 3));
          if (results.length === 0) results = await searchVideos(translatedTerms.split(" ").slice(0, 2).join(" "), 3);
          if (results.length === 0) results = await searchVideos("business technology", 3);

          if (results.length > 0) {
            bgVideoUrls = texts.map((_, idx) => results[idx % results.length]?.videoUrl || null);
          }
        } catch { /* ignore */ }

        const pages = await generateAllVideoPages(tmpl, texts, brandKit, [], adj, initPt, initPi);

        setPreloadedData({
          template: tmpl,
          videoPages: pages,
          videoUrls: bgVideoUrls,
          pageTexts: texts,
          pageTextAdjustments: initPt,
          pageImageAdjustments: initPi,
          adjustments: adj,
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
