import { useState, useEffect, useCallback, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Loader2, Download, Film, Volume2, VolumeX, Pencil, RotateCcw, Upload, Search, Check, Mail, Move } from "lucide-react";
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
import { translateToEnglishLocal } from "@/lib/localTranslate";
import { encodeVideoToMP4, reencodeForWhatsApp, type MotionEffect, type TransitionEffect, type TextAnimation, type LogoAnimation } from "@/lib/videoEncoder";
import { Input } from "@/components/ui/input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";

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
  const [searchPage, setSearchPage] = useState(1);
  const [isLoadingMore, setIsLoadingMore] = useState(false);

  const handleSearch = async () => {
    if (!searchQuery.trim()) return;
    setSearching(true);
    setSearchPage(1);
    try {
      const results = await searchVideos(searchQuery, 12, 1);
      setSearchResults(results);
      if (results.length === 0) toast.info("Nenhum vídeo encontrado.");
    } catch { toast.error("Erro ao buscar vídeos"); }
    finally { setSearching(false); }
  };

  const handleLoadMore = async () => {
    if (!searchQuery.trim()) return;
    const nextPage = searchPage + 1;
    setIsLoadingMore(true);
    try {
      const results = await searchVideos(searchQuery, 12, nextPage);
      if (results.length > 0) {
        setSearchResults(prev => [...prev, ...results]);
        setSearchPage(nextPage);
      } else {
        toast.info("Sem mais resultados");
      }
    } catch { toast.error("Erro ao carregar mais"); }
    finally { setIsLoadingMore(false); }
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
        <>
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
          <div className="flex justify-center pt-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleLoadMore}
              disabled={isLoadingMore}
              className="h-7 text-xs"
            >
              {isLoadingMore ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : null}
              Carregar Mais
            </Button>
          </div>
        </>
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
  clientId?: string;
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
  clientId,
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
  const [isEditing, setIsEditing] = useState(true);
  const [currentEditPage, setCurrentEditPage] = useState(0);
  const [adjustments, setAdjustments] = useState<ElementAdjustments>({ ...defaultAdjustments });
  const [pageTextAdjustments, setPageTextAdjustments] = useState<PageTextAdjustment[]>([]);
  const [pageImageAdjustments, setPageImageAdjustments] = useState<PageImageAdjustment[]>([]);
  const adjustmentsRef = useRef<ElementAdjustments>({ ...defaultAdjustments });
  const pageTextAdjustmentsRef = useRef<PageTextAdjustment[]>([]);
  const pageImageAdjustmentsRef = useRef<PageImageAdjustment[]>([]);
  const [isApplyingAdjustments, setIsApplyingAdjustments] = useState(false);
  const [photoInteractionMode, setPhotoInteractionMode] = useState<"content" | "frame">("content");
  const [selectedAudioTrack, setSelectedAudioTrack] = useState<"1" | "2" | "none">("1");
  const [isSendingEmail, setIsSendingEmail] = useState(false);
  const [emailProgress, setEmailProgress] = useState(0);
  const [emailSubject, setEmailSubject] = useState("");
  const [customOverlays, setCustomOverlays] = useState<Record<number, { url: string; x: number; y: number; width: number; height: number; isVideo?: boolean }[]>>({});

  useEffect(() => { adjustmentsRef.current = adjustments; }, [adjustments]);
  useEffect(() => { pageTextAdjustmentsRef.current = pageTextAdjustments; }, [pageTextAdjustments]);
  useEffect(() => { pageImageAdjustmentsRef.current = pageImageAdjustments; }, [pageImageAdjustments]);

  const currentPageOverlays = customOverlays[currentEditPage] || [];
  const setCurrentPageOverlays = useCallback((overlays: typeof currentPageOverlays) => {
    setCustomOverlays(prev => ({ ...prev, [currentEditPage]: overlays }));
  }, [currentEditPage]);

  const handleAddVideoOverlay = useCallback((file: File) => {
    const reader = new FileReader();
    const isVideo = file.type.startsWith("video");
    reader.onload = (ev) => {
      const url = ev.target?.result as string;
      if (!url || !template) return;
      const newOv = { url, x: template.width / 4, y: template.height / 4, width: template.width / 2, height: template.height / 2, isVideo };
      setCustomOverlays(prev => ({ ...prev, [currentEditPage]: [...(prev[currentEditPage] || []), newOv] }));
    };
    reader.readAsDataURL(file);
  }, [currentEditPage, template]);

  const handleDeleteVideoOverlay = useCallback((idx: number) => {
    setCustomOverlays(prev => {
      const updated = [...(prev[currentEditPage] || [])];
      updated.splice(idx, 1);
      return { ...prev, [currentEditPage]: updated };
    });
  }, [currentEditPage]);

  const handleSendEmail = async (videoUrl: string, videoCoverUrl?: string) => {
    if (!clientId) return;
    setIsSendingEmail(true);
    try {
      const { data: clientData } = await supabase.from("client_data").select("email, email_2, email_3").eq("id", clientId).single();
      if (!clientData) throw new Error("Cliente não encontrado");
      const emails = [clientData.email, (clientData as any).email_2, (clientData as any).email_3].filter(Boolean);
      if (emails.length === 0) { toast.error("Nenhum e-mail cadastrado"); setIsSendingEmail(false); return; }

      const { data, error } = await supabase.functions.invoke("send-media-email", {
        body: {
          emails,
          subject: emailSubject.trim() || `Vídeo - ${clientName}`,
          mediaUrl: videoUrl,
          mediaType: "video",
          clientName,
          cardText: cardText || cardTitle,
          caption: undefined,
          videoCoverUrl,
        },
      });
      if (error) throw error;
      toast.success(data?.message || "E-mail(s) enviado(s)!");
      setTimeout(() => onClose(), 600);
    } catch (err: any) {
      console.error("Email error:", err);
      toast.error("Erro ao enviar e-mail: " + (err.message || ""));
    } finally {
      setIsSendingEmail(false);
    }
  };

  const handleExportAndEmail = async (stripAudio: boolean) => {
    if (!template || !videoPages || !clientId) return;
    setIsSendingEmail(true);
    setEmailProgress(0);

    try {
      const textAnim = getTextAnimation(template);
      const logoAnim = getLogoAnimation(template);
      const textAnimDuration = getTextAnimDuration(template);
      const imageRect = getImagePlaceholderRect(template.contentElements, template.width, template.height);
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
        customOverlayPages: customOverlays,
        audioUrl: stripAudio ? undefined : (
          selectedAudioTrack === "1" ? (template.audioUrl1 || template.audioUrl2 || undefined) :
          selectedAudioTrack === "2" ? (template.audioUrl2 || template.audioUrl1 || undefined) :
          undefined
        ),
        requireEmailSafePreview: true,
        onProgress: setEmailProgress,
      });

      let finalBlob = blob;
      const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
      if (!isMobile) {
        const numPages = videoPages.pages.length;
        const expectedDuration = numPages * template.pageDuration;
        try {
          finalBlob = await reencodeForWhatsApp(blob, () => {}, { stripAudio, expectedDuration });
        } catch { /* use original */ }
      }

      // Upload to storage
      const storagePath = `${cardId}/${Date.now()}-generated.mp4`;
      const { error: uploadErr } = await supabase.storage
        .from("card-uploads")
        .upload(storagePath, finalBlob, { contentType: "video/mp4" });
      if (uploadErr) throw uploadErr;

      const { data: urlData } = supabase.storage.from("card-uploads").getPublicUrl(storagePath);
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
      await supabase
        .from("project_briefs")
        .update({ generated_video_url: urlData.publicUrl, generated_video_expires_at: expiresAt })
        .eq("id", cardId);

      // Send email
      await handleSendEmail(urlData.publicUrl, videoPages.pages[0]);
      setExportedBlob(finalBlob);
      onExported?.();
    } catch (err: any) {
      console.error("Export+Email error:", err);
      toast.error("Erro ao enviar: " + (err?.message || "").slice(0, 120));
    } finally {
      setIsSendingEmail(false);
      setEmailProgress(0);
    }
  };

  // Adjustment helpers (sync refs first so onCommit always sees latest value)
  const updateAdj = useCallback((key: keyof ElementAdjustments, value: number) => {
    const nextAdj = { ...adjustmentsRef.current, [key]: value };
    adjustmentsRef.current = nextAdj;
    setAdjustments(nextAdj);
  }, []);

  const setShapeOverridesLocal = useCallback((next: Record<string, { x: number; y: number; width: number; height: number }>) => {
    const nextAdj = { ...adjustmentsRef.current, shapeOverrides: next };
    adjustmentsRef.current = nextAdj;
    setAdjustments(nextAdj);
  }, []);

  const updatePageTextAdj = useCallback((pageIdx: number, key: keyof PageTextAdjustment, value: number) => {
    const next = [...pageTextAdjustmentsRef.current];
    while (next.length <= pageIdx) next.push({ ...defaultPageTextAdjustment });
    next[pageIdx] = { ...next[pageIdx], [key]: value };
    pageTextAdjustmentsRef.current = next;
    setPageTextAdjustments(next);
  }, []);

  const updatePageImageAdj = useCallback((pageIdx: number, key: keyof PageImageAdjustment, value: number) => {
    const next = [...pageImageAdjustmentsRef.current];
    while (next.length <= pageIdx) next.push({ ...defaultPageImageAdjustment });
    next[pageIdx] = { ...next[pageIdx], [key]: value };
    pageImageAdjustmentsRef.current = next;
    setPageImageAdjustments(next);
  }, []);

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
        .eq("deleted", false)
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

      // Use material images as background images
      const bgImages: string[] = texts.map((_, idx) => matImages[idx % Math.max(matImages.length, 1)] || "");
      setSearchedImages(bgImages);

      // Open fast with pages first; fill stock videos in background if needed
      let bgVideoUrls: (string | null)[] = texts.map(() => null);
      setVideoUrls(bgVideoUrls);

      const useAdj = adj || adjustments;
      const pages = await generateAllVideoPages(tmpl, texts, brandKit, matImages.length > 0 ? bgImages : [], useAdj, ptAdj, piAdj);
      setVideoPages(pages);
      setStatus("ready");

      if (matImages.length === 0) {
        void (async () => {
          try {
            const searchContext = fullText.split(" ").slice(0, 12).join(" ");
            let searchTerms = translateToEnglishLocal(searchContext).trim();
            if (!searchTerms) {
              searchTerms = searchContext
                .replace(/[^\p{L}\p{N}\s]+/gu, " ")
                .replace(/\s+/g, " ")
                .trim()
                .split(" ")
                .slice(0, 6)
                .join(" ");
            }
            if (!searchTerms) searchTerms = "business technology";

            const results = await searchVideos(searchTerms, Math.max(texts.length, 3));
            if (results.length === 0) return;

            bgVideoUrls = texts.map((_, idx) => results[idx % results.length]?.videoUrl || null);
            setVideoUrls(bgVideoUrls);
          } catch (err) {
            console.error("Video search error:", err);
          }
        })();
      }
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
      const pages = await generateAllVideoPages(
        template,
        pageTexts,
        brandKit,
        searchedImages,
        adjustmentsRef.current,
        pageTextAdjustmentsRef.current,
        pageImageAdjustmentsRef.current
      );
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
        customOverlayPages: customOverlays,
        audioUrl: stripAudio ? undefined : (
          selectedAudioTrack === "1" ? (template.audioUrl1 || template.audioUrl2 || undefined) :
          selectedAudioTrack === "2" ? (template.audioUrl2 || template.audioUrl1 || undefined) :
          undefined
        ),
        requireEmailSafePreview: true,
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
    } catch (err: any) {
      console.error("Export error:", err);
      const msg = err?.message || String(err);
      toast.error("Erro ao exportar vídeo: " + msg.slice(0, 120));
      setStatus("ready");
    }
  };

  const isContentPage = template && videoPages ? currentEditPage < videoPages.pages.length - 1 : true;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[98vh] flex flex-col overflow-hidden">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Film className="h-5 w-5" />
            Baixar Vídeo Feito
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3 overflow-y-auto flex-1 min-h-0">
          {status === "loading" && (
            <div className="flex flex-col items-center justify-center py-16 gap-3">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <p className="text-sm text-muted-foreground">Gerando vídeo...</p>
            </div>
          )}
          {status === "error" && (
            <div className="flex flex-col items-center justify-center py-16 gap-3">
              <p className="text-sm text-destructive">Erro ao gerar vídeo</p>
              <Button variant="outline" size="sm" onClick={() => generateVideo()}>Tentar novamente</Button>
            </div>
          )}
          {status === "ready" && videoPages && template && (
            <>
              {/* Preview or Edit mode */}
              <div
                className="rounded-lg overflow-hidden border bg-black flex justify-center items-center"
                style={{ height: isEditing ? 'min(60vh, 550px)' : 'min(45vh, 450px)' }}
              >
                {isEditing ? (
                  <div className="relative h-full" style={{ aspectRatio: `${template.width}/${template.height}` }}>
                    <VideoAdjustOverlay
                      template={{
                        width: template.width,
                        height: template.height,
                        contentElements: template.contentElements as any[],
                        signatureElements: template.signatureElements as any[],
                      }}
                      previewUrl={(!isContentPage && videoPages.fullPages?.[currentEditPage]) ? videoPages.fullPages[currentEditPage] : (videoPages.pages[currentEditPage] || null)}
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
                      preImageOverlayUrl={videoPages.preImageOverlayPages?.[currentEditPage] || ""}
                      textOverlayUrl={videoPages.overlayPages?.[currentEditPage] || ""}
                      logoOverlayUrl={videoPages.logoOverlayPages?.[currentEditPage] || ""}
                      backgroundImageUrl={searchedImages[currentEditPage] || ""}
                      backgroundVideoUrl={videoUrls[currentEditPage] || ""}
                      backgroundPngUrl={!isContentPage ? (brandKit?.backgroundPng || brandKit?.background_png || "") : ""}
                      backgroundColor={template.backgroundColor || "#1a1a2e"}
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
                       customOverlays={currentPageOverlays}
                      setCustomOverlays={setCurrentPageOverlays}
                      onAddOverlay={handleAddVideoOverlay}
                      onDeleteOverlay={handleDeleteVideoOverlay}
                      shapeOverrides={adjustments.shapeOverrides || {}}
                      setShapeOverrides={setShapeOverridesLocal}
                      photoInteractionMode={photoInteractionMode}
                    />
                    {/* Photo interaction mode toggle */}
                    {isContentPage && (
                      <div className="absolute top-2 left-2 z-20">
                        <Button
                          variant={photoInteractionMode === "content" ? "default" : "outline"}
                          size="sm"
                          onClick={() => setPhotoInteractionMode((prev) => (prev === "content" ? "frame" : "content"))}
                          className="gap-1.5 shadow-lg text-xs h-7"
                        >
                          <Move className="h-3 w-3" />
                          {photoInteractionMode === "content" ? "Zoom da foto" : "Mover moldura"}
                        </Button>
                      </div>
                    )}
                    {/* Page navigation in edit mode */}
                    {videoPages.pages.length > 2 && (
                      <div className="absolute bottom-2 left-0 right-0 flex justify-center gap-1 z-20">
                        {videoPages.pages.slice(0, -1).map((_, idx) => (
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
                    customOverlays={customOverlays}
                    templateWidth={template.width}
                    templateHeight={template.height}
                    className="h-full w-auto aspect-[9/16]"
                  />
                )}
              </div>

              {/* Template info + action buttons */}
              <div className="flex items-center justify-between">
                <p className="text-xs text-muted-foreground">
                  Template: {template.name}
                </p>
              </div>

              {/* Audio track selector + download/email buttons */}
              {template.audioUrl1 || template.audioUrl2 ? (
                <>
                  <div className="space-y-2 border rounded-lg p-3 bg-muted/30">
                    <p className="text-xs font-medium flex items-center gap-1.5">
                      <Volume2 className="h-3.5 w-3.5" />
                      Música de fundo
                    </p>
                    <RadioGroup value={selectedAudioTrack} onValueChange={(v) => setSelectedAudioTrack(v as "1" | "2" | "none")} className="flex flex-col gap-1.5">
                      {template.audioUrl1 && (
                        <div className="flex items-center gap-2">
                          <RadioGroupItem value="1" id="audio-1" />
                          <Label htmlFor="audio-1" className="text-xs cursor-pointer">Música 1</Label>
                        </div>
                      )}
                      {template.audioUrl2 && (
                        <div className="flex items-center gap-2">
                          <RadioGroupItem value="2" id="audio-2" />
                          <Label htmlFor="audio-2" className="text-xs cursor-pointer">Música 2</Label>
                        </div>
                      )}
                    </RadioGroup>
                  </div>
                  <div className="flex gap-2">
                    <Button onClick={() => handleExport(false)} disabled={isSendingEmail} className="gap-2 flex-1">
                      <Download className="h-4 w-4" />
                      Baixar Com Áudio
                    </Button>
                    <Button variant="outline" onClick={() => handleExport(true)} disabled={isSendingEmail} className="gap-2 flex-1">
                      <VolumeX className="h-4 w-4" />
                      Baixar Sem Áudio
                    </Button>
                  </div>
                  {clientId && (
                    <div className="space-y-2">
                      <Input
                        placeholder="Título do e-mail (obrigatório)"
                        value={emailSubject}
                        onChange={(e) => setEmailSubject(e.target.value)}
                        className={`h-9 text-sm ${!emailSubject.trim() ? 'border-destructive' : ''}`}
                      />
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          onClick={() => handleExportAndEmail(false)}
                          disabled={isSendingEmail || !emailSubject.trim()}
                          className="gap-2 flex-1 border-primary/30 hover:border-primary/60"
                        >
                          {isSendingEmail ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
                          {isSendingEmail && emailProgress > 0 ? `Enviando... ${Math.round(emailProgress * 100)}%` : "📧 Com Áudio"}
                        </Button>
                        <Button
                          variant="outline"
                          onClick={() => handleExportAndEmail(true)}
                          disabled={isSendingEmail || !emailSubject.trim()}
                          className="gap-2 flex-1 border-primary/30 hover:border-primary/60"
                        >
                          {isSendingEmail ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
                          📧 Sem Áudio
                        </Button>
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <>
                  <Button onClick={() => handleExport(true)} disabled={isSendingEmail} className="gap-2 w-full">
                    <Download className="h-4 w-4" />
                    Baixar Vídeo
                  </Button>
                  {clientId && (
                    <div className="space-y-2">
                      <Input
                        placeholder="Título do e-mail (obrigatório)"
                        value={emailSubject}
                        onChange={(e) => setEmailSubject(e.target.value)}
                        className={`h-9 text-sm ${!emailSubject.trim() ? 'border-destructive' : ''}`}
                      />
                      <Button
                        variant="outline"
                        onClick={() => handleExportAndEmail(true)}
                        disabled={isSendingEmail || !emailSubject.trim()}
                        className="gap-2 w-full border-primary/30 hover:border-primary/60"
                      >
                        {isSendingEmail ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
                        {isSendingEmail && emailProgress > 0 ? `Enviando... ${Math.round(emailProgress * 100)}%` : "📧 Enviar por E-mail"}
                      </Button>
                    </div>
                  )}
                </>
              )}

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
