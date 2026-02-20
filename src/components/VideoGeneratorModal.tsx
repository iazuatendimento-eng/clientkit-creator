import { useState, useEffect, useCallback } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Loader2, Download, Film, Volume2, VolumeX } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  generateAllVideoPages,
  getImagePlaceholderRect,
  getImageElSize,
  getImageClipShape,
  loadGoogleFont,
  type VideoTemplateData,
  type CanvasElement,
  type VideoPages,
} from "@/lib/videoRenderer";
import { VideoPreviewPlayer } from "@/components/VideoPreviewPlayer";
import { searchVideos } from "@/lib/imageSearch";
import { encodeVideoToMP4, reencodeForWhatsApp, type MotionEffect, type TransitionEffect, type TextAnimation, type LogoAnimation } from "@/lib/videoEncoder";

interface VideoGeneratorModalProps {
  isOpen: boolean;
  onClose: () => void;
  cardId: string;
  cardTitle: string;
  cardText: string;
  brandKit: any;
  clientName: string;
  cardIndex: number; // Used for template rotation
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
}: VideoGeneratorModalProps) {
  const [status, setStatus] = useState<"loading" | "ready" | "exporting" | "error">("loading");
  const [template, setTemplate] = useState<VideoTemplateData | null>(null);
  const [videoPages, setVideoPages] = useState<VideoPages | null>(null);
  const [videoUrls, setVideoUrls] = useState<(string | null)[]>([]);
  const [exportProgress, setExportProgress] = useState(0);
  const [exportedBlob, setExportedBlob] = useState<Blob | null>(null);

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

  const generateVideo = useCallback(async () => {
    setStatus("loading");
    setExportedBlob(null);

    try {
      // 1. Load all templates
      const { data: templates, error } = await supabase
        .from("master_video_templates")
        .select("*")
        .order("created_at", { ascending: true });

      if (error || !templates || templates.length === 0) {
        toast.error("Nenhum template de vídeo encontrado");
        setStatus("error");
        return;
      }

      // 2. Pick template by rotation
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

      // 3. Load font
      const fontFamily = brandKit?.font || brandKit?.fontFamily || "Arial";
      await loadGoogleFont(fontFamily);

      // 4. Split text into pages (by semicolon)
      const fullText = cardText || cardTitle || "";
      const pageTexts = fullText.split(";").map((t: string) => t.trim()).filter((t: string) => t.length > 0);
      if (pageTexts.length === 0) pageTexts.push(fullText || clientName);

      // 5. Search for background videos
      let bgVideoUrls: (string | null)[] = pageTexts.map(() => null);
      try {
        const searchTerms = fullText.split(" ").slice(0, 6).join(" ");
        // Try to translate for better search results
        let translatedTerms = searchTerms;
        try {
          const { data: transData } = await Promise.race([
            supabase.functions.invoke("translate-text", { body: { text: searchTerms } }),
            new Promise<never>((_, reject) => setTimeout(() => reject(new Error("Timeout")), 5000)),
          ]);
          if (transData?.translatedText) translatedTerms = transData.translatedText;
        } catch { /* use original */ }

        let results = await searchVideos(translatedTerms, Math.max(pageTexts.length, 3));
        if (results.length === 0) {
          results = await searchVideos(translatedTerms.split(" ").slice(0, 2).join(" "), 3);
        }
        if (results.length === 0) {
          results = await searchVideos("business technology", 3);
        }

        if (results.length > 0) {
          bgVideoUrls = pageTexts.map((_, idx) => results[idx % results.length]?.videoUrl || null);
        }
      } catch (err) {
        console.error("Video search error:", err);
      }
      setVideoUrls(bgVideoUrls);

      // 6. Generate all pages
      const pages = await generateAllVideoPages(tmpl, pageTexts, brandKit, []);
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
      generateVideo();
    } else {
      setStatus("loading");
      setVideoPages(null);
      setVideoUrls([]);
      setExportedBlob(null);
      setTemplate(null);
    }
  }, [isOpen, generateVideo]);

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
        audioUrl: stripAudio ? undefined : (template.audioUrl1 || template.audioUrl2 || undefined),
        onProgress: setExportProgress,
      });

      // Re-encode for WhatsApp
      let finalBlob = blob;
      try {
        finalBlob = await reencodeForWhatsApp(blob, () => {}, { stripAudio });
      } catch { /* use original */ }

      setExportedBlob(finalBlob);
      setStatus("ready");

      // Auto download
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
              <Button variant="outline" onClick={generateVideo}>Tentar novamente</Button>
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
              {/* Preview */}
              <div className="rounded-lg overflow-hidden border bg-black">
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
                  className="w-full aspect-[9/16] max-h-[50vh]"
                />
              </div>

              {/* Template info */}
              <p className="text-xs text-muted-foreground text-center">
                Template: {template.name}
              </p>

              {/* Download buttons */}
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
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
