import { useState, useEffect, useCallback } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Loader2, Download, Film, Volume2, VolumeX, Pencil, RotateCcw, Upload, Search, Check } from "lucide-react";
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
import { searchVideos, type SearchVideo } from "@/lib/imageSearch";
import { encodeVideoToMP4, reencodeForWhatsApp, type MotionEffect, type TransitionEffect, type TextAnimation, type LogoAnimation } from "@/lib/videoEncoder";
import { Input } from "@/components/ui/input";


import type { PreloadedVideoData } from "@/hooks/useVideoPregenerate";

function VideoSwapSection({ videoUrls, currentEditPage, cardId, materialImages, onVideoSwapped, onImageSwapped }: {
  videoUrls: (string | null)[];
  currentEditPage: number;
  cardId: string;
  materialImages: string[];
  onVideoSwapped: (pageIdx: number, url: string) => void;
  onImageSwapped: (pageIdx: number, imageUrl: string) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchVideo[]>([]);
  const [searching, setSearching] = useState(false);
  const [uploading, setUploading] = useState(false);

  const handleSearch = async () => {
    if (!searchQuery.trim()) return;
    setSearching(true);
    try {
      const results = await searchVideos(searchQuery, 6);
      setSearchResults(results);
      if (results.length === 0) toast.info("Nenhum vídeo encontrado.");
    } catch { toast.error("Erro ao buscar vídeos"); }
    finally { setSearching(false); }
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) { toast.error("Selecione um arquivo"); return; }
    const isVideo = file.type.startsWith("video/");
    const isImage = file.type.startsWith("image/");
    if (!isVideo && !isImage) { toast.error("Selecione uma imagem ou vídeo"); return; }
    setUploading(true);
    try {
      const ext = file.name.split(".").pop();
      const path = `${cardId}/${Date.now()}-swap.${ext}`;
      const { error } = await supabase.storage.from("card-uploads").upload(path, file, { contentType: file.type });
      if (error) throw error;
      const { data: urlData } = supabase.storage.from("card-uploads").getPublicUrl(path);
      if (isVideo) {
        onVideoSwapped(currentEditPage, urlData.publicUrl);
      } else {
        onImageSwapped(currentEditPage, urlData.publicUrl);
      }
      toast.success("Arquivo enviado! ✓");
      setIsOpen(false);
    } catch { toast.error("Erro ao enviar arquivo"); }
    finally { setUploading(false); }
  };

  if (!isOpen) {
    return (
      <Button variant="ghost" size="sm" onClick={() => setIsOpen(true)} className="w-full gap-2 bg-destructive text-white hover:bg-destructive/90 hover:text-white border-none">
        <Film className="h-4 w-4" />
        Trocar Vídeo do Card (Página {currentEditPage + 1})
      </Button>
    );
  }

  return (
    <div className="space-y-3 border rounded-lg p-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium">Trocar Vídeo do Card — Página {currentEditPage + 1}</span>
        <Button variant="ghost" size="sm" onClick={() => setIsOpen(false)} className="h-6 px-2 text-xs">✕</Button>
      </div>
      <label className={`cursor-pointer block ${uploading ? "pointer-events-none opacity-50" : ""}`}>
        <div className="border-2 border-dashed border-muted-foreground/30 rounded-lg p-3 text-center hover:border-primary/50 transition-colors">
          {uploading ? (
            <div className="flex items-center justify-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin text-primary" />
              <span className="text-xs text-muted-foreground">Enviando...</span>
            </div>
          ) : (
            <div className="flex items-center justify-center gap-2">
              <Upload className="h-4 w-4 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">Enviar imagem ou vídeo</span>
            </div>
          )}
        </div>
        <input type="file" accept="image/*,video/*" className="hidden" onChange={handleUpload} disabled={uploading} />
      </label>
      {/* Material images from card uploads */}
      {materialImages.length > 0 && (
        <>
          <div className="flex items-center gap-2">
            <div className="flex-1 h-px bg-border" />
            <span className="text-[10px] text-muted-foreground">📷 Fotos do cliente</span>
            <div className="flex-1 h-px bg-border" />
          </div>
          <div className="grid grid-cols-3 gap-1.5">
            {materialImages.map((imgUrl, idx) => (
              <div
                key={idx}
                onClick={() => { onImageSwapped(currentEditPage, imgUrl); toast.success("Imagem aplicada!"); setIsOpen(false); }}
                className="relative cursor-pointer rounded overflow-hidden border hover:border-primary transition-all"
              >
                <img src={imgUrl} alt={`Material ${idx + 1}`} className="w-full h-16 object-cover" />
              </div>
            ))}
          </div>
        </>
      )}
      <div className="flex items-center gap-2">
        <div className="flex-1 h-px bg-border" />
        <span className="text-[10px] text-muted-foreground">ou buscar vídeo</span>
        <div className="flex-1 h-px bg-border" />
      </div>
      <div className="flex gap-2">
        <Input placeholder="Buscar vídeos..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} onKeyDown={(e) => e.key === "Enter" && handleSearch()} className="text-xs h-8" />
        <Button size="sm" onClick={handleSearch} disabled={searching} className="h-8 px-3">
          {searching ? <Loader2 className="h-3 w-3 animate-spin" /> : "Buscar"}
        </Button>
      </div>
      {searchResults.length > 0 && (
        <div className="grid grid-cols-3 gap-1.5">
          {searchResults.map((video) => (
            <div key={video.id} onClick={() => { onVideoSwapped(currentEditPage, video.videoUrl); toast.success("Vídeo trocado!"); setIsOpen(false); }} className="relative cursor-pointer rounded overflow-hidden border hover:border-primary transition-all">
              <video src={video.videoUrl} poster={video.image} className="w-full h-16 object-cover" muted playsInline onMouseEnter={(e) => e.currentTarget.play()} onMouseLeave={(e) => { e.currentTarget.pause(); e.currentTarget.currentTime = 0; }} />
              <div className="absolute bottom-0 left-0 right-0 bg-black/60 px-1 py-0.5">
                <span className="text-[8px] text-white">{video.source}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

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
  onExported?: () => void;
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
  onExported,
}: VideoGeneratorModalProps) {
  const [status, setStatus] = useState<"loading" | "ready" | "exporting" | "error">("loading");
  const [template, setTemplate] = useState<VideoTemplateData | null>(null);
  const [videoPages, setVideoPages] = useState<VideoPages | null>(null);
  const [videoUrls, setVideoUrls] = useState<(string | null)[]>([]);
  const [exportProgress, setExportProgress] = useState(0);
  const [exportedBlob, setExportedBlob] = useState<Blob | null>(null);
  const [pageTexts, setPageTexts] = useState<string[]>([]);
  const [materialImages, setMaterialImages] = useState<string[]>([]);
  const [searchedImages, setSearchedImages] = useState<string[]>([]);
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

      // Fetch material uploads for this card
      let matImages: string[] = [];
      try {
        const { data: uploads } = await supabase
          .from("card_uploads")
          .select("file_url, file_type")
          .eq("card_id", cardId)
          .eq("upload_type", "material");
        matImages = (uploads || [])
          .filter(u => u.file_type.startsWith("image"))
          .map(u => u.file_url);
        setMaterialImages(matImages);
      } catch { /* ignore */ }

      // Use material images as background images for pages, or search for videos
      const bgImages: string[] = texts.map((_, idx) => matImages[idx % Math.max(matImages.length, 1)] || "");
      setSearchedImages(bgImages);

      let bgVideoUrls: (string | null)[] = texts.map(() => null);
      if (matImages.length === 0) {
        // No material uploads — search for stock videos
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
      }
      setVideoUrls(bgVideoUrls);

      const useAdj = adj || adjustments;
      const pages = await generateAllVideoPages(tmpl, texts, brandKit, matImages.length > 0 ? bgImages : [], useAdj, ptAdj, piAdj);
      setVideoPages(pages);
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
        setSearchedImages(preloadedData.searchedImages || []);
        setMaterialImages(preloadedData.materialImages || []);
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
      setMaterialImages([]);
      setSearchedImages([]);
    }
  }, [isOpen]);

  const applyAdjustments = async () => {
    if (!template) return;
    setIsApplyingAdjustments(true);
    try {
      const pages = await generateAllVideoPages(template, pageTexts, brandKit, searchedImages, adjustments, pageTextAdjustments, pageImageAdjustments);
      setVideoPages(pages);
      toast.success("Ajustes aplicados!");
    } catch (err) {
      console.error("Error applying adjustments:", err);
      toast.error("Erro ao aplicar ajustes");
    }
    setIsApplyingAdjustments(false);
  };

  const isMobileDevice = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
  const isIOS = /iPhone|iPad|iPod/i.test(navigator.userAgent);


  const handleExport = async (stripAudio: boolean) => {
    if (!template || !videoPages) return;

    // Mobile: WebCodecs handles video encoding now (no MediaRecorder)
    // encodeVideoToMP4 already routes to WebCodecs on mobile

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

      // On mobile, skip reencodeForWhatsApp (FFmpeg WASM too heavy), WebCodecs already produces good MP4
      if (!isMobileDevice) {
        const numPages = videoPages.pages.length;
        const expectedDuration = numPages * template.pageDuration;
        try {
          finalBlob = await reencodeForWhatsApp(blob, () => {}, { stripAudio, expectedDuration });
        } catch { /* use original */ }
      }

      setExportedBlob(finalBlob);
      setStatus("ready");

      const safeName = `${clientName}-${cardTitle.slice(0, 20)}.mp4`;

      // iOS: use Web Share API for native "Save Video"
      if (isIOS && navigator.share && navigator.canShare) {
        const file = new File([finalBlob], safeName, { type: "video/mp4" });
        const shareData = { files: [file] };
        if (navigator.canShare(shareData)) {
          try {
            await navigator.share(shareData);
          } catch (shareErr: any) {
            if (shareErr?.name !== 'AbortError') {
              const url = URL.createObjectURL(finalBlob);
              const link = document.createElement("a");
              link.href = url; link.download = safeName; link.click();
              setTimeout(() => URL.revokeObjectURL(url), 30000);
            }
          }
        }
      } else {
        const url = URL.createObjectURL(finalBlob);
        const link = document.createElement("a");
        link.href = url; link.download = safeName; link.click();
        setTimeout(() => URL.revokeObjectURL(url), 30000);
      }

      // Upload to storage for 24h availability
      try {
        const storagePath = `${cardId}/${Date.now()}-generated.mp4`;
        const { error: uploadErr } = await supabase.storage
          .from("card-uploads")
          .upload(storagePath, finalBlob, { contentType: "video/mp4" });
        if (!uploadErr) {
          const { data: urlData } = supabase.storage.from("card-uploads").getPublicUrl(storagePath);
          const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
          await supabase
            .from("project_briefs")
            .update({ generated_video_url: urlData.publicUrl, generated_video_expires_at: expiresAt })
            .eq("id", cardId);
        }
      } catch (e) {
        console.error("Failed to save generated video:", e);
      }

      toast.success("Vídeo exportado! ✓");
      onExported?.();
    } catch (err) {
      console.error("Export error:", err);
      toast.error("Erro ao exportar vídeo");
      setStatus("ready");
    }
  };

  const isContentPage = template && videoPages ? currentEditPage < videoPages.pages.length - 1 : true;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-lg max-h-[90vh] flex flex-col overflow-hidden">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Film className="h-5 w-5" />
            Baixar Vídeo Feito
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3 overflow-y-auto flex-1 min-h-0">
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
                Baixando vídeo... {Math.round(exportProgress * 100)}%
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
              <div className="rounded-lg overflow-hidden border bg-black flex justify-center items-center" style={{ height: 'min(35vh, 400px)' }}>
                {isEditing ? (
                  <div className="relative h-full" style={{ aspectRatio: `${template.width}/${template.height}` }}>
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
                    className="h-full w-auto aspect-[9/16]"
                  />
                )}
              </div>

              {/* Template info + action buttons */}
              <div className="flex items-center justify-between">
                <p className="text-xs text-muted-foreground">
                  Template: {template.name}
                </p>
                {isEditing && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={applyAdjustments}
                    disabled={isApplyingAdjustments}
                    className="gap-1.5"
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                    Aplicar Ajustes
                  </Button>
                )}
              </div>

              {/* Download buttons - always visible */}
              <div className="grid grid-cols-2 gap-2">
                <Button onClick={() => handleExport(false)} className="gap-2">
                  <Download className="h-4 w-4" />
                  Baixar Com Áudio
                </Button>
                <Button variant="outline" onClick={() => handleExport(true)} className="gap-2">
                  <Download className="h-4 w-4" />
                  Baixar Sem Áudio
                </Button>
              </div>

              {/* Video swap section */}
              <VideoSwapSection
                videoUrls={videoUrls}
                currentEditPage={currentEditPage}
                cardId={cardId}
                materialImages={materialImages}
                onVideoSwapped={(pageIdx, url) => {
                  // Clear the searched image for this page so video takes priority
                  setSearchedImages(prev => {
                    const next = [...prev];
                    next[pageIdx] = "";
                    return next;
                  });
                  setVideoUrls(prev => {
                    const next = [...prev];
                    next[pageIdx] = url;
                    return next;
                  });
                  // Re-render pages without bg image for this page
                  if (template) {
                    const newImages = [...searchedImages];
                    newImages[pageIdx] = "";
                    generateAllVideoPages(template, pageTexts, brandKit, newImages, adjustments, pageTextAdjustments, pageImageAdjustments)
                      .then(pages => setVideoPages(pages));
                  }
                }}
                onImageSwapped={(pageIdx, imageUrl) => {
                  // Use image as background, clear video for this page
                  setVideoUrls(prev => {
                    const next = [...prev];
                    next[pageIdx] = null;
                    return next;
                  });
                  setSearchedImages(prev => {
                    const next = [...prev];
                    next[pageIdx] = imageUrl;
                    return next;
                  });
                  // Re-render pages with new image
                  if (template) {
                    const newImages = [...searchedImages];
                    newImages[pageIdx] = imageUrl;
                    generateAllVideoPages(template, pageTexts, brandKit, newImages, adjustments, pageTextAdjustments, pageImageAdjustments)
                      .then(pages => setVideoPages(pages));
                  }
                }}
              />
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
