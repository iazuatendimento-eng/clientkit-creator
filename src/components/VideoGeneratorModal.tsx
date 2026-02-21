import { useState, useEffect, useCallback } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Loader2, Download, Film, Volume2, VolumeX, Pencil, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  generateAllVideoPages,
  getImagePlaceholderRect,
  getImageElSize,
  getImageClipShape,
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
import { VideoPreviewPlayer } from "@/components/VideoPreviewPlayer";
import { VideoAdjustOverlay } from "@/components/VideoAdjustOverlay";
import { searchVideos } from "@/lib/imageSearch";
import { encodeVideoToMP4, reencodeForWhatsApp, type MotionEffect, type TransitionEffect, type TextAnimation, type LogoAnimation } from "@/lib/videoEncoder";

import type { PreloadedVideoData } from "@/hooks/useVideoPregenerate";

interface VideoGeneratorModalProps {
  isOpen: boolean;
  onClose: () => void;
  cardId: string;
  cardTitle: string;
  cardText: string;
  brandKit: any;
  clientName: string;
  cardIndex: number;
  preloadedData?: PreloadedVideoData | null;
}

export function VideoGeneratorModal({
  isOpen,
  onClose,
  cardId,
  cardTitle,
  cardText,
  brandKit,
  clientName,
  cardIndex,
  preloadedData,
}: VideoGeneratorModalProps) {
  const [status, setStatus] = useState<"loading" | "ready" | "exporting" | "error">("loading");
  const [template, setTemplate] = useState<VideoTemplateData | null>(null);
  const [videoPages, setVideoPages] = useState<VideoPages | null>(null);
  const [videoUrls, setVideoUrls] = useState<(string | null)[]>([]);
  const [exportProgress, setExportProgress] = useState(0);
  const [exportedBlob, setExportedBlob] = useState<Blob | null>(null);
  const [pageTexts, setPageTexts] = useState<string[]>([]);

  // Editing state
  const [isEditing, setIsEditing] = useState(false);
  const [currentEditPage, setCurrentEditPage] = useState(0);
  const [adjustments, setAdjustments] = useState<ElementAdjustments>({ ...defaultAdjustments });
  const [pageTextAdjustments, setPageTextAdjustments] = useState<PageTextAdjustment[]>([]);
  const [pageImageAdjustments, setPageImageAdjustments] = useState<PageImageAdjustment[]>([]);
  const [isApplyingAdjustments, setIsApplyingAdjustments] = useState(false);

  // Adjustment helpers
  const updateAdj = (key: keyof ElementAdjustments, value: number) => {
    setAdjustments(prev => ({ ...prev, [key]: value }));
  };

  const updatePageTextAdj = (pageIdx: number, key: keyof PageTextAdjustment, value: number) => {
    setPageTextAdjustments(prev => {
      const next = [...prev];
      while (next.length <= pageIdx) next.push({ ...defaultPageTextAdjustment });
      next[pageIdx] = { ...next[pageIdx], [key]: value };
      return next;
    });
  };

  const updatePageImageAdj = (pageIdx: number, key: keyof PageImageAdjustment, value: number) => {
    setPageImageAdjustments(prev => {
      const next = [...prev];
      while (next.length <= pageIdx) next.push({ ...defaultPageImageAdjustment });
      next[pageIdx] = { ...next[pageIdx], [key]: value };
      return next;
    });
  };

  // Extract animation settings from template
  const getTextAnimation = (t: VideoTemplateData): TextAnimation => {
    const allEls = [...(t.contentElements || []), ...(t.signatureElements || [])];
    const el = allEls.find(e => (e.type === "text" || e.type === "contact") && e.animationType && e.animationType !== "none");
    return (el?.animationType as TextAnimation) || "none";
  };
  const getLogoAnimation = (t: VideoTemplateData): LogoAnimation => {
    const allEls = [...(t.contentElements || []), ...(t.signatureElements || [])];
    const el = allEls.find(e => (e.type === "logo" || e.type === "mascot") && e.animationType && e.animationType !== "none");
    return (el?.animationType as LogoAnimation) || "none";
  };
  const getTextAnimDuration = (t: VideoTemplateData): number => {
    const allEls = [...(t.contentElements || []), ...(t.signatureElements || [])];
    const el = allEls.find(e => (e.type === "text" || e.type === "contact") && e.animationType && e.animationType !== "none");
    return el?.animDuration ?? 1.5;
  };

  const generateVideo = useCallback(async (adj?: ElementAdjustments, ptAdj?: PageTextAdjustment[], piAdj?: PageImageAdjustment[]) => {
    setStatus("loading");
    setExportedBlob(null);

    try {
      const { data: templates, error } = await supabase
        .from("master_video_templates")
        .select("*")
        .order("created_at", { ascending: true });

      if (error || !templates || templates.length === 0) {
        toast.error("Nenhum template de vídeo encontrado");
        setStatus("error");
        return;
      }

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
      setTemplate(tmpl);

      const fontFamily = brandKit?.font || brandKit?.fontFamily || "Arial";
      await loadGoogleFont(fontFamily);

      const fullText = cardText || cardTitle || "";
      const texts = fullText.split(";").map((t: string) => t.trim()).filter((t: string) => t.length > 0);
      if (texts.length === 0) texts.push(fullText || clientName);
      setPageTexts(texts);

      // Init adjustments arrays if needed
      if (!ptAdj || ptAdj.length === 0) {
        const initPt = texts.map(() => ({ ...defaultPageTextAdjustment }));
        setPageTextAdjustments(initPt);
        ptAdj = initPt;
      }
      if (!piAdj || piAdj.length === 0) {
        const initPi = texts.map(() => ({ ...defaultPageImageAdjustment }));
        setPageImageAdjustments(initPi);
        piAdj = initPi;
      }

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
      } catch (err) {
        console.error("Video search error:", err);
      }
      setVideoUrls(bgVideoUrls);

      const useAdj = adj || adjustments;
      const pages = await generateAllVideoPages(tmpl, texts, brandKit, [], useAdj, ptAdj, piAdj);
      setVideoPages(pages);
      setStatus("ready");
    } catch (err) {
      console.error("Video generation error:", err);
      toast.error("Erro ao gerar vídeo");
      setStatus("error");
    }
  }, [cardId, cardTitle, cardText, brandKit, clientName, cardIndex]);

  useEffect(() => {
    if (isOpen) {
      setCurrentEditPage(0);
      setExportedBlob(null);

      if (preloadedData) {
        setIsEditing(true);
        // Use pre-generated data — open instantly in ready state
        setTemplate(preloadedData.template);
        setVideoPages(preloadedData.videoPages);
        setVideoUrls(preloadedData.videoUrls);
        setPageTexts(preloadedData.pageTexts);
        setPageTextAdjustments(preloadedData.pageTextAdjustments);
        setPageImageAdjustments(preloadedData.pageImageAdjustments);
        setAdjustments(preloadedData.adjustments);
        setStatus("ready");
      } else {
        setAdjustments({ ...defaultAdjustments });
        setPageTextAdjustments([]);
        setPageImageAdjustments([]);
        generateVideo();
      }
    } else {
      setStatus("loading");
      setVideoPages(null);
      setVideoUrls([]);
      setExportedBlob(null);
      setTemplate(null);
      setIsEditing(false);
    }
  }, [isOpen]);

  const applyAdjustments = async () => {
    if (!template) return;
    setIsApplyingAdjustments(true);
    try {
      const pages = await generateAllVideoPages(template, pageTexts, brandKit, [], adjustments, pageTextAdjustments, pageImageAdjustments);
      setVideoPages(pages);
      toast.success("Ajustes aplicados!");
    } catch (err) {
      console.error("Error applying adjustments:", err);
      toast.error("Erro ao aplicar ajustes");
    }
    setIsApplyingAdjustments(false);
  };

  const handleExport = async (stripAudio: boolean) => {
    if (!template || !videoPages) return;

    setStatus("exporting");
    setExportProgress(0);

    try {
      const textAnim = getTextAnimation(template);
      const logoAnim = getLogoAnimation(template);
      const textAnimDuration = getTextAnimDuration(template);

      const imageRect = getImagePlaceholderRect(template.contentElements, template.width, template.height);
      const imageElSz = getImageElSize(template.contentElements);
      const imageClipShape = getImageClipShape(template.contentElements);

      const blob = await encodeVideoToMP4(videoPages.pages, {
        width: template.width,
        height: template.height,
        pageDuration: template.pageDuration,
        fps: 24,
        motionEffect: "ken-burns" as MotionEffect,
        transitionEffect: "fade" as TransitionEffect,
        textAnimation: textAnim,
        logoAnimation: logoAnim,
        textAnimDuration: textAnimDuration / (template.pageDuration || 3),
        backgroundVideoUrls: videoUrls,
        overlayPages: videoPages.overlayPages,
        frameOverlayPages: videoPages.frameOverlayPages,
        logoOverlayPages: videoPages.logoOverlayPages,
        imageRect,
        imageClipShape,
        pageImageAdjustments,
        audioUrl: stripAudio ? undefined : (template.audioUrl1 || template.audioUrl2 || undefined),
        onProgress: setExportProgress,
      });

      let finalBlob = blob;
      try {
        finalBlob = await reencodeForWhatsApp(blob, () => {}, { stripAudio });
      } catch { /* use original */ }

      setExportedBlob(finalBlob);
      setStatus("ready");

      const url = URL.createObjectURL(finalBlob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${clientName}-${cardTitle.slice(0, 20)}.mp4`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 30000);
      toast.success("Vídeo exportado! ✓");
    } catch (err) {
      console.error("Export error:", err);
      toast.error("Erro ao exportar vídeo");
      setStatus("ready");
    }
  };

  const isContentPage = template && videoPages ? currentEditPage < videoPages.pages.length - 1 : true;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Film className="h-5 w-5" />
            Gerar Vídeo
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {status === "loading" && (
            <div className="flex flex-col items-center justify-center py-12 gap-3">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <p className="text-sm text-muted-foreground">Gerando preview do vídeo...</p>
            </div>
          )}

          {status === "error" && (
            <div className="flex flex-col items-center justify-center py-12 gap-3">
              <p className="text-sm text-destructive">Erro ao gerar vídeo</p>
              <Button variant="outline" onClick={() => generateVideo()}>Tentar novamente</Button>
            </div>
          )}

          {status === "exporting" && (
            <div className="flex flex-col items-center justify-center py-12 gap-3">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <p className="text-sm text-muted-foreground">
                Exportando vídeo... {Math.round(exportProgress * 100)}%
              </p>
              <div className="w-full bg-muted rounded-full h-2">
                <div
                  className="bg-primary h-2 rounded-full transition-all"
                  style={{ width: `${exportProgress * 100}%` }}
                />
              </div>
            </div>
          )}

          {status === "ready" && videoPages && template && (
            <>
              {/* Preview or Edit mode */}
              <div className="rounded-lg overflow-hidden border bg-black">
                {isEditing ? (
                  <div className="relative w-full" style={{ aspectRatio: `${template.width}/${template.height}` }}>
                    <VideoAdjustOverlay
                      template={{
                        width: template.width,
                        height: template.height,
                        contentElements: template.contentElements as any[],
                        signatureElements: template.signatureElements as any[],
                      }}
                      previewUrl={videoPages.pages[currentEditPage] || null}
                      isBusy={isApplyingAdjustments}
                      onCommit={applyAdjustments}
                      isContentPage={isContentPage}
                      pageText={pageTexts[currentEditPage] || ""}
                      fontFamily={brandKit?.font || brandKit?.fontFamily || ""}
                      textColor={Array.isArray(brandKit?.colors) && brandKit.colors[1] ? brandKit.colors[1] : "#ffffff"}
                      logoUrl={brandKit?.pngs?.[0] || brandKit?.logo || ""}
                      contactUrl={brandKit?.pngs?.[1] || brandKit?.contactInfo || ""}
                      mascotUrl={brandKit?.pngs?.[2] || brandKit?.mascot || ""}
                      frameOverlayUrl={videoPages.frameOverlayPages?.[currentEditPage] || ""}
                      textOverlayUrl={videoPages.overlayPages?.[currentEditPage] || ""}
                      logoOverlayUrl={videoPages.logoOverlayPages?.[currentEditPage] || ""}
                      backgroundVideoUrl={videoUrls[currentEditPage] || ""}
                      logoX={isContentPage ? adjustments.logoX : (adjustments.sigLogoX ?? adjustments.logoX)}
                      logoY={isContentPage ? adjustments.logoY : (adjustments.sigLogoY ?? adjustments.logoY)}
                      logoScaleX={isContentPage ? adjustments.logoScaleX : (adjustments.sigLogoScaleX ?? adjustments.logoScaleX)}
                      logoScaleY={isContentPage ? adjustments.logoScaleY : (adjustments.sigLogoScaleY ?? adjustments.logoScaleY)}
                      setLogoX={(v) => updateAdj(isContentPage ? "logoX" : "sigLogoX", v)}
                      setLogoY={(v) => updateAdj(isContentPage ? "logoY" : "sigLogoY", v)}
                      setLogoScaleX={(v) => updateAdj(isContentPage ? "logoScaleX" : "sigLogoScaleX", v)}
                      setLogoScaleY={(v) => updateAdj(isContentPage ? "logoScaleY" : "sigLogoScaleY", v)}
                      contactX={isContentPage ? adjustments.contactX : (adjustments.sigContactX ?? adjustments.contactX)}
                      contactY={isContentPage ? adjustments.contactY : (adjustments.sigContactY ?? adjustments.contactY)}
                      contactScaleX={isContentPage ? adjustments.contactScaleX : (adjustments.sigContactScaleX ?? adjustments.contactScaleX)}
                      contactScaleY={isContentPage ? adjustments.contactScaleY : (adjustments.sigContactScaleY ?? adjustments.contactScaleY)}
                      setContactX={(v) => updateAdj(isContentPage ? "contactX" : "sigContactX", v)}
                      setContactY={(v) => updateAdj(isContentPage ? "contactY" : "sigContactY", v)}
                      setContactScaleX={(v) => updateAdj(isContentPage ? "contactScaleX" : "sigContactScaleX", v)}
                      setContactScaleY={(v) => updateAdj(isContentPage ? "contactScaleY" : "sigContactScaleY", v)}
                      mascotX={isContentPage ? adjustments.mascotX : (adjustments.sigMascotX ?? adjustments.mascotX)}
                      mascotY={isContentPage ? adjustments.mascotY : (adjustments.sigMascotY ?? adjustments.mascotY)}
                      mascotScaleX={isContentPage ? adjustments.mascotScaleX : (adjustments.sigMascotScaleX ?? adjustments.mascotScaleX)}
                      mascotScaleY={isContentPage ? adjustments.mascotScaleY : (adjustments.sigMascotScaleY ?? adjustments.mascotScaleY)}
                      setMascotX={(v) => updateAdj(isContentPage ? "mascotX" : "sigMascotX", v)}
                      setMascotY={(v) => updateAdj(isContentPage ? "mascotY" : "sigMascotY", v)}
                      setMascotScaleX={(v) => updateAdj(isContentPage ? "mascotScaleX" : "sigMascotScaleX", v)}
                      setMascotScaleY={(v) => updateAdj(isContentPage ? "mascotScaleY" : "sigMascotScaleY", v)}
                      textX={pageTextAdjustments[currentEditPage]?.textX || 0}
                      textY={pageTextAdjustments[currentEditPage]?.textY || 0}
                      textScale={pageTextAdjustments[currentEditPage]?.textScale || 100}
                      setTextX={(v) => updatePageTextAdj(currentEditPage, "textX", v)}
                      setTextY={(v) => updatePageTextAdj(currentEditPage, "textY", v)}
                      setTextScale={(v) => updatePageTextAdj(currentEditPage, "textScale", v)}
                      imageX={pageImageAdjustments[currentEditPage]?.imageX || 0}
                      imageY={pageImageAdjustments[currentEditPage]?.imageY || 0}
                      imageScale={pageImageAdjustments[currentEditPage]?.imageScale || 100}
                      setImageX={(v) => updatePageImageAdj(currentEditPage, "imageX", v)}
                      setImageY={(v) => updatePageImageAdj(currentEditPage, "imageY", v)}
                      setImageScale={(v) => updatePageImageAdj(currentEditPage, "imageScale", v)}
                    />
                    {/* Page navigation in edit mode */}
                    {videoPages.pages.length > 1 && (
                      <div className="absolute bottom-2 left-0 right-0 flex justify-center gap-1 z-20">
                        {videoPages.pages.map((_, idx) => (
                          <button
                            key={idx}
                            onClick={() => setCurrentEditPage(idx)}
                            className={`w-6 h-6 rounded-full text-xs font-bold transition-all ${
                              currentEditPage === idx
                                ? "bg-primary text-primary-foreground scale-110"
                                : "bg-black/50 text-white hover:bg-black/70"
                            }`}
                          >
                            {idx + 1}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                ) : (
                  <VideoPreviewPlayer
                    pages={videoPages.pages}
                    pageDuration={template.pageDuration}
                    motionEffect="ken-burns"
                    transitionEffect="fade"
                    textAnimation={getTextAnimation(template)}
                    logoAnimation={getLogoAnimation(template)}
                    textAnimDuration={getTextAnimDuration(template)}
                    videoUrls={videoUrls}
                    overlayPages={videoPages.overlayPages}
                    frameOverlayPages={videoPages.frameOverlayPages}
                    logoOverlayPages={videoPages.logoOverlayPages}
                    imageRect={getImagePlaceholderRect(template.contentElements, template.width, template.height)}
                    imageElSize={getImageElSize(template.contentElements)}
                    imageClipShape={getImageClipShape(template.contentElements)}
                    pageImageAdjustments={pageImageAdjustments}
                    className="w-full aspect-[9/16] max-h-[50vh]"
                  />
                )}
              </div>

              {/* Template info + edit toggle */}
              <div className="flex items-center justify-between">
                <p className="text-xs text-muted-foreground">
                  Template: {template.name}
                </p>
                <Button
                  variant={isEditing ? "default" : "outline"}
                  size="sm"
                  onClick={() => setIsEditing(!isEditing)}
                  className="gap-1.5"
                >
                  <Pencil className="h-3.5 w-3.5" />
                  {isEditing ? "Voltar ao Preview" : "Editar"}
                </Button>
              </div>

              {/* Download buttons */}
              {!isEditing && (
                <div className="grid grid-cols-2 gap-2">
                  <Button onClick={() => handleExport(false)} className="gap-2">
                    <Volume2 className="h-4 w-4" />
                    Com Áudio
                  </Button>
                  <Button variant="outline" onClick={() => handleExport(true)} className="gap-2">
                    <VolumeX className="h-4 w-4" />
                    Sem Áudio
                  </Button>
                </div>
              )}
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
