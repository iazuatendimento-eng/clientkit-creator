import { useState, useEffect, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  ArrowLeft,
  Check,
  X,
  Loader2,
  Download,
  RefreshCw,
  CheckCircle2,
  Image as ImageIcon,
  Search,
  Play,
  Film,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { getTaggedCardsForArtGeneration, createCardUpload, clearArtGenerationTags, updateProjectBrief, autoTagFirstCardsForAllActiveClients } from "@/lib/clientDatabase";
import { searchImages, SearchImage } from "@/lib/imageSearch";
import { supabase } from "@/integrations/supabase/client";
import { saveBatchGeneration, BatchItem } from "@/lib/batchHistory";
import { encodeVideoSimple } from "@/lib/videoEncoder";
import { VideoAdjustOverlay } from "./VideoAdjustOverlay";
import { VideoPreviewPlayer } from "./VideoPreviewPlayer";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface CanvasElement {
  id: string;
  type: "rect" | "circle" | "text" | "image" | "logo" | "contact" | "mascot";
  x: number;
  y: number;
  width: number;
  height: number;
  color?: string;
  text?: string;
  fontSize?: number;
  imageUrl?: string;
  placeholder?: boolean;
  colorRole?: "background" | "text" | "accessory1" | "accessory2";
}

interface VideoTemplate {
  id: string;
  name: string;
  contentElements: CanvasElement[];
  signatureElements: CanvasElement[];
  width: number;
  height: number;
  backgroundColor: string;
  pageDuration: number;
}

interface ElementAdjustments {
  logoScaleX: number;
  logoScaleY: number;
  logoX: number;
  logoY: number;
  contactScaleX: number;
  contactScaleY: number;
  contactX: number;
  contactY: number;
  mascotScaleX: number;
  mascotScaleY: number;
  mascotX: number;
  mascotY: number;
  textScale: number;
  textX: number;
  textY: number;
}

const defaultAdjustments: ElementAdjustments = {
  logoScaleX: 100,
  logoScaleY: 100,
  logoX: 0,
  logoY: 0,
  contactScaleX: 100,
  contactScaleY: 100,
  contactX: 0,
  contactY: 0,
  mascotScaleX: 100,
  mascotScaleY: 100,
  mascotX: 0,
  mascotY: 0,
  textScale: 100,
  textX: 0,
  textY: 0,
};

interface ClientVideo {
  clientId: string;
  clientName: string;
  company: string;
  cardId: string;
  cardTitle: string;
  cardText: string;
  brandKit: any;
  pages: string[]; // Array of page images (base64)
  videoUrl: string | null;
  status: "pending" | "approved" | "rejected";
  backgroundImages?: string[];
  pageTexts: string[]; // Text for each content page
  searchedImages?: string[]; // Images found for each page
  adjustments: ElementAdjustments;
}

interface BatchVideoGeneratorProps {
  template: VideoTemplate;
  onBack: () => void;
  onComplete: () => void;
}

// Helper to load image
const loadImage = async (url: string): Promise<HTMLImageElement | null> => {
  if (!url) return null;
  
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = url;
  });
};

export const BatchVideoGenerator = ({ template, onBack, onComplete }: BatchVideoGeneratorProps) => {
  const [clientVideos, setClientVideos] = useState<ClientVideo[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);
  const [selectedVideo, setSelectedVideo] = useState<ClientVideo | null>(null);
  const [currentPreviewPage, setCurrentPreviewPage] = useState(0);
  const [isPlayingPreview, setIsPlayingPreview] = useState(false);
  const [isImageDialogOpen, setIsImageDialogOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchImage[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isApplyingAdjustments, setIsApplyingAdjustments] = useState(false);

  const selectedVideoRef = useRef<ClientVideo | null>(null);

  const { toast } = useToast();

  useEffect(() => {
    selectedVideoRef.current = selectedVideo;
  }, [selectedVideo]);

  useEffect(() => {
    loadTaggedCards();
  }, []);

  useEffect(() => {
    if (
      clientVideos.length > 0 &&
      !isLoading &&
      !isGenerating &&
      !clientVideos.some((v) => v.pages.length > 0)
    ) {
      generateAllVideos();
    }
  }, [clientVideos, isLoading]);

  useEffect(() => {
    if (!selectedVideo || !isPlayingPreview) return;
    if (selectedVideo.pages.length <= 1) return;

    const interval = window.setInterval(() => {
      setCurrentPreviewPage((p) => (p + 1) % selectedVideo.pages.length);
    }, 1000);

    return () => window.clearInterval(interval);
  }, [selectedVideo, isPlayingPreview]);

  const loadTaggedCards = async () => {
    try {
      setIsLoading(true);
      
      await autoTagFirstCardsForAllActiveClients();
      const taggedCards = await getTaggedCardsForArtGeneration();

      const videos: ClientVideo[] = taggedCards.map((card: any) => {
        const fullText = card.description || card.title;
        // Split by semicolons for carousel pages
        const textParts = fullText
          .split(";")
          .map((t: string) => t.trim())
          .filter((t: string) => t.length > 0);

        const brandKit = card.client?.brand_kit;

        return {
          clientId: card.client?.id || card.client_id,
          clientName: card.client?.name || "Cliente",
          company: card.client?.company || card.client?.name || "Cliente",
          cardId: card.id,
          cardTitle: card.title,
          cardText: fullText,
          brandKit: brandKit,
          pages: [],
          videoUrl: null,
          status: "pending" as const,
          pageTexts: textParts.length > 0 ? textParts : [fullText],
          adjustments: { ...defaultAdjustments },
        };
      });

      setClientVideos(videos);

      if (videos.length === 0) {
        toast({
          title: "Nenhum card marcado",
          description: "Marque os cards pelo botão 'Criar Artes' no dashboard.",
        });
      }
    } catch (error) {
      console.error("Error loading tagged cards:", error);
      toast({
        title: "Erro ao carregar cards",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const generatePageImage = async (
    elements: CanvasElement[],
    text: string,
    brandKit: any,
    isSignature: boolean,
    backgroundImage?: string,
    adjustments: ElementAdjustments = defaultAdjustments
  ): Promise<string> => {
    const canvas = document.createElement("canvas");
    canvas.width = template.width || 1080;
    canvas.height = template.height || 1920;
    const ctx = canvas.getContext("2d")!;

    const w = canvas.width;
    const h = canvas.height;

    const ensureColor = (value: unknown, fallback: string) =>
      typeof value === "string" && value.trim().length > 0 ? value : fallback;

    // Colors from brand kit - ensure proper extraction
    const colors = Array.isArray(brandKit?.colors) ? brandKit.colors : [];
    const bgColor = ensureColor(colors[0], template.backgroundColor || "#1a1a2e");
    const textColor = ensureColor(colors[1], "#ffffff");
    const accessoryColor1 = ensureColor(colors[2], "#cccccc");
    const accessoryColor2 = ensureColor(colors[3], "#aaaaaa");

    // Helper to get color based on colorRole
    const getElementColor = (el: CanvasElement, defaultColor: string): string => {
      if (el.colorRole === "background") return bgColor;
      if (el.colorRole === "text") return textColor;
      if (el.colorRole === "accessory1") return accessoryColor1;
      if (el.colorRole === "accessory2") return accessoryColor2;
      return el.color || defaultColor;
    };

    // Draw background
    ctx.fillStyle = bgColor;
    ctx.fillRect(0, 0, w, h);

    // Draw background image if provided
    if (backgroundImage) {
      const bgImg = await loadImage(backgroundImage);
      if (bgImg) {
        // Cover the canvas with the image
        const imgAspect = bgImg.width / bgImg.height;
        const canvasAspect = w / h;
        let drawWidth, drawHeight, drawX, drawY;

        if (imgAspect > canvasAspect) {
          drawHeight = h;
          drawWidth = drawHeight * imgAspect;
          drawX = (w - drawWidth) / 2;
          drawY = 0;
        } else {
          drawWidth = w;
          drawHeight = drawWidth / imgAspect;
          drawX = 0;
          drawY = (h - drawHeight) / 2;
        }

        ctx.drawImage(bgImg, drawX, drawY, drawWidth, drawHeight);

        // Add overlay for text readability
        ctx.fillStyle = "rgba(0, 0, 0, 0.4)";
        ctx.fillRect(0, 0, w, h);
      }
    }

    // Draw elements
    for (const el of elements) {
      if (el.type === "rect") {
        ctx.fillStyle = getElementColor(el, accessoryColor1);
        ctx.fillRect(el.x, el.y, el.width, el.height);
      } else if (el.type === "circle") {
        ctx.fillStyle = getElementColor(el, accessoryColor2);
        ctx.beginPath();
        ctx.ellipse(el.x + el.width / 2, el.y + el.height / 2, el.width / 2, el.height / 2, 0, 0, Math.PI * 2);
        ctx.fill();
      } else if (el.type === "text") {
        ctx.fillStyle = textColor;
        const baseFontSize = el.fontSize || 48;
        const fontSize = Math.round(baseFontSize * (adjustments.textScale / 100));
        const fontFamily = brandKit?.fontFamily || "Arial";
        ctx.font = `${fontSize}px ${fontFamily}`;
        
        // Use card text for content pages, placeholder for signature
        const displayText = isSignature ? (el.text || "") : text;
        
        // Word wrap with adjusted position
        const adjustedX = el.x + adjustments.textX;
        const adjustedY = el.y + adjustments.textY;
        const words = displayText.split(" ");
        let line = "";
        let y = adjustedY + fontSize;
        const maxWidth = el.width || 800;
        const lineHeight = fontSize * 1.3;
        
        for (let i = 0; i < words.length; i++) {
          const testLine = line + words[i] + " ";
          const metrics = ctx.measureText(testLine);
          if (metrics.width > maxWidth && i > 0) {
            ctx.fillText(line.trim(), adjustedX, y);
            line = words[i] + " ";
            y += lineHeight;
          } else {
            line = testLine;
          }
        }
        ctx.fillText(line.trim(), adjustedX, y);
      } else if (el.type === "logo") {
        const logoUrl = brandKit?.pngs?.[0] || brandKit?.logo;
        if (logoUrl) {
          const img = await loadImage(logoUrl);
          if (img) {
            const adjustedX = el.x + adjustments.logoX;
            const adjustedY = el.y + adjustments.logoY;
            const adjustedW = el.width * (adjustments.logoScaleX / 100);
            const adjustedH = el.height * (adjustments.logoScaleY / 100);
            ctx.drawImage(img, adjustedX, adjustedY, adjustedW, adjustedH);
          }
        } else {
          ctx.fillStyle = "rgba(59, 130, 246, 0.3)";
          ctx.fillRect(el.x, el.y, el.width, el.height);
        }
      } else if (el.type === "contact") {
        const contactUrl = brandKit?.pngs?.[1] || brandKit?.contactInfo;
        if (contactUrl) {
          const img = await loadImage(contactUrl);
          if (img) {
            const adjustedX = el.x + adjustments.contactX;
            const adjustedY = el.y + adjustments.contactY;
            const adjustedW = el.width * (adjustments.contactScaleX / 100);
            const adjustedH = el.height * (adjustments.contactScaleY / 100);
            ctx.drawImage(img, adjustedX, adjustedY, adjustedW, adjustedH);
          }
        } else {
          ctx.fillStyle = "rgba(16, 185, 129, 0.3)";
          ctx.fillRect(el.x, el.y, el.width, el.height);
        }
      } else if (el.type === "mascot") {
        const mascotUrl = brandKit?.pngs?.[2] || brandKit?.mascot;
        if (mascotUrl) {
          const img = await loadImage(mascotUrl);
          if (img) {
            const adjustedX = el.x + adjustments.mascotX;
            const adjustedY = el.y + adjustments.mascotY;
            const adjustedW = el.width * (adjustments.mascotScaleX / 100);
            const adjustedH = el.height * (adjustments.mascotScaleY / 100);
            ctx.drawImage(img, adjustedX, adjustedY, adjustedW, adjustedH);
          }
        }
      }
    }

    return canvas.toDataURL("image/png");
  };

  const generateVideoForClient = async (video: ClientVideo, searchedImages: string[]): Promise<string[]> => {
    const pages: string[] = [];

    // Generate content pages (one per text segment)
    for (let i = 0; i < video.pageTexts.length; i++) {
      const text = video.pageTexts[i];
      const bgImage = searchedImages[i] || undefined;
      const pageImage = await generatePageImage(
        template.contentElements,
        text,
        video.brandKit,
        false,
        bgImage,
        video.adjustments
      );
      pages.push(pageImage);
    }

    // Always add signature page at the end
    const signaturePage = await generatePageImage(
      template.signatureElements,
      "",
      video.brandKit,
      true,
      undefined,
      video.adjustments
    );
    pages.push(signaturePage);

    return pages;
  };

  const regenerateSingleVideo = async (video: ClientVideo): Promise<string[]> => {
    const pages: string[] = [];

    // Generate content pages with current searchedImages
    for (let i = 0; i < video.pageTexts.length; i++) {
      const text = video.pageTexts[i];
      const bgImage = video.searchedImages?.[i] || undefined;
      const pageImage = await generatePageImage(
        template.contentElements,
        text,
        video.brandKit,
        false,
        bgImage,
        video.adjustments
      );
      pages.push(pageImage);
    }

    // Add signature page
    const signaturePage = await generatePageImage(
      template.signatureElements,
      "",
      video.brandKit,
      true,
      undefined,
      video.adjustments
    );
    pages.push(signaturePage);

    return pages;
  };

  const updateAdjustmentLocal = useCallback((key: keyof ElementAdjustments, value: number) => {
    const current = selectedVideoRef.current;
    if (!current) return;

    // Update ref synchronously so "onCommit" always sees the latest values
    selectedVideoRef.current = {
      ...current,
      adjustments: { ...current.adjustments, [key]: value },
    };

    setSelectedVideo((prev) =>
      prev ? { ...prev, adjustments: { ...prev.adjustments, [key]: value } } : prev
    );

    setClientVideos((prev) =>
      prev.map((v) =>
        v.cardId === current.cardId
          ? { ...v, adjustments: { ...v.adjustments, [key]: value } }
          : v
      )
    );
  }, []);

  const applyAdjustments = useCallback(
    async (override?: ClientVideo) => {
      const base = override ?? selectedVideoRef.current;
      if (!base) return;

      setIsApplyingAdjustments(true);
      try {
        const newPages = await regenerateSingleVideo(base);
        const updatedVideo = { ...base, pages: newPages };

        selectedVideoRef.current = updatedVideo;

        setClientVideos((prev) =>
          prev.map((v) => (v.cardId === updatedVideo.cardId ? updatedVideo : v))
        );
        setSelectedVideo(updatedVideo);
      } finally {
        setIsApplyingAdjustments(false);
      }
    },
    []
  );


  const generateAllVideos = async () => {
    setIsGenerating(true);
    try {
      const updatedVideos = [...clientVideos];

      for (let i = 0; i < updatedVideos.length; i++) {
        const video = updatedVideos[i];
        
        // Search for images for each content page with translation
        const searchedImages: string[] = [];
        for (const text of video.pageTexts) {
          try {
            let searchTerms = text.split(" ").slice(0, 5).join(" ");

            // Translate to English for better image search results
            try {
              const { data, error } = await supabase.functions.invoke("translate-text", {
                body: { text },
              });

              if (!error && data?.translatedText) {
                searchTerms = data.translatedText;
              }
            } catch (translateError) {
              console.error("Translation failed, using original text:", translateError);
            }

            const images = await searchImages(searchTerms, 1);
            if (images.length > 0) {
              searchedImages.push(images[0].urls.regular);
            } else {
              searchedImages.push("");
            }
          } catch (error) {
            console.error("Error searching image for video:", error);
            searchedImages.push("");
          }
        }
        
        const pages = await generateVideoForClient(video, searchedImages);
        updatedVideos[i] = { ...video, pages, searchedImages };
        setClientVideos([...updatedVideos]);
      }

      toast({
        title: "Vídeos gerados!",
        description: `${updatedVideos.length} vídeos foram gerados com sucesso.`,
      });
    } catch (error) {
      console.error("Error generating videos:", error);
      toast({
        title: "Erro ao gerar vídeos",
        variant: "destructive",
      });
    } finally {
      setIsGenerating(false);
    }
  };

  const handleApprove = (index: number) => {
    const updatedVideos = [...clientVideos];
    updatedVideos[index] = { ...updatedVideos[index], status: "approved" };
    setClientVideos(updatedVideos);
  };

  const handleReject = (index: number) => {
    const updatedVideos = [...clientVideos];
    updatedVideos[index] = { ...updatedVideos[index], status: "rejected" };
    setClientVideos(updatedVideos);
  };

  const handleSearchImages = async () => {
    if (!searchQuery.trim()) return;
    setIsSearching(true);
    try {
      const images = await searchImages(searchQuery, 12);
      setSearchResults(images);
    } catch (error) {
      toast({
        title: "Erro ao buscar imagens",
        variant: "destructive",
      });
    } finally {
      setIsSearching(false);
    }
  };

  const handleApproveAll = async () => {
    const approvedVideos = clientVideos.filter((v) => v.status === "approved" && v.pages.length > 0);

    if (approvedVideos.length === 0) {
      toast({
        title: "Nenhum vídeo aprovado",
        description: "Aprove os vídeos antes de salvar.",
        variant: "destructive",
      });
      return;
    }

    setIsGenerating(true);
    
    try {
      for (const video of approvedVideos) {
        toast({
          title: `Gerando vídeo...`,
          description: `Processando ${video.clientName}`,
        });

        // Encode video from pages
        const videoBlob = await encodeVideoSimple(video.pages, {
          width: template.width,
          height: template.height,
          pageDuration: template.pageDuration,
          fps: 24,
        });

        const fileName = `video_${video.cardId}_${Date.now()}.webm`;

        // Upload video file
        const { data: uploadData, error: uploadError } = await supabase.storage
          .from("card-uploads")
          .upload(`videos/${fileName}`, videoBlob, {
            contentType: "video/webm",
          });

        if (uploadError) {
          console.error("Upload error:", uploadError);
          toast({
            title: "Erro ao fazer upload",
            description: `Erro para ${video.clientName}`,
            variant: "destructive",
          });
          continue;
        }

        const { data: urlData } = supabase.storage
          .from("card-uploads")
          .getPublicUrl(`videos/${fileName}`);

        // Create card upload record for video
        await createCardUpload({
          card_id: video.cardId,
          file_name: fileName,
          file_url: urlData.publicUrl,
          file_type: "video/webm",
          upload_type: "final",
        });

        // Also upload first frame as thumbnail
        const thumbResponse = await fetch(video.pages[0]);
        const thumbBlob = await thumbResponse.blob();
        const thumbFileName = `thumb_${video.cardId}_${Date.now()}.png`;

        await supabase.storage
          .from("card-uploads")
          .upload(`videos/${thumbFileName}`, thumbBlob, {
            contentType: "image/png",
          });

        const { data: thumbUrlData } = supabase.storage
          .from("card-uploads")
          .getPublicUrl(`videos/${thumbFileName}`);

        // Update card with video URL and thumbnail
        await updateProjectBrief(video.cardId, { 
          cover_image: thumbUrlData.publicUrl,
          cover_video: urlData.publicUrl,
          brief_type: 'video'
        });
      }

      await clearArtGenerationTags();

      // Save batch to history
      const batchItems: BatchItem[] = approvedVideos.map((video) => ({
        cardId: video.cardId,
        clientId: video.clientId,
        clientName: video.clientName,
        company: video.company,
        cardTitle: video.cardTitle,
        cardText: video.cardText,
        brandKit: video.brandKit,
        files: video.pages,
        backgroundImages: video.searchedImages,
      }));
      await saveBatchGeneration("video", template, batchItems);

      // Dispatch event to notify ProjectBoard to reload
      window.dispatchEvent(new Event("bulkBriefsUpdated"));

      toast({
        title: "Vídeos salvos!",
        description: `${approvedVideos.length} vídeos foram gerados e salvos.`,
      });

      onComplete();
    } catch (error) {
      console.error("Error saving videos:", error);
      toast({
        title: "Erro ao salvar vídeos",
        variant: "destructive",
      });
    } finally {
      setIsGenerating(false);
    }
  };

  const approvedCount = clientVideos.filter((v) => v.status === "approved").length;
  const pendingCount = clientVideos.filter((v) => v.status === "pending").length;

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <div className="border-b bg-card px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="outline" onClick={onBack}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Voltar ao Editor
          </Button>
          <div>
            <h1 className="text-lg font-semibold flex items-center gap-2">
              <Film className="h-5 w-5" />
              Geração em Lote de Vídeos
            </h1>
            <p className="text-sm text-muted-foreground">
              {template.name} • {template.pageDuration}s/página
            </p>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="flex gap-2">
            <Badge variant="outline" className="bg-yellow-500/20 text-yellow-500">
              Pendentes: {pendingCount}
            </Badge>
            <Badge variant="outline" className="bg-green-500/20 text-green-500">
              Aprovados: {approvedCount}
            </Badge>
          </div>
          <Button
            onClick={handleApproveAll}
            disabled={approvedCount === 0}
            className="bg-gradient-primary"
          >
            <CheckCircle2 className="mr-2 h-4 w-4" />
            Salvar Aprovados ({approvedCount})
          </Button>
        </div>
      </div>

      {/* Content */}
      <ScrollArea className="flex-1 p-6">
        {isGenerating ? (
          <div className="flex flex-col items-center justify-center h-64 gap-4">
            <Loader2 className="h-12 w-12 animate-spin text-primary" />
            <p className="text-muted-foreground">Gerando vídeos...</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {clientVideos.map((video, index) => (
              <div
                key={`${video.cardId}-${index}`}
                className={`bg-card rounded-lg border overflow-hidden transition-all ${
                  video.status === "approved"
                    ? "border-green-500 ring-2 ring-green-500/30"
                    : video.status === "rejected"
                    ? "border-red-500 ring-2 ring-red-500/30"
                    : "border-border"
                }`}
              >
                {/* Video Preview */}
                <div
                  className="aspect-[9/16] bg-muted relative group cursor-pointer"
                  onClick={() => {
                    setSelectedVideo(video);
                    setCurrentPreviewPage(0);
                    setIsPlayingPreview(true);
                  }}
                >
                  {video.pages[0] ? (
                    <img
                      src={video.pages[0]}
                      alt={video.clientName}
                      className="w-full h-full object-contain"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                    </div>
                  )}
                  
                  {/* Page indicator */}
                  <div className="absolute bottom-2 left-1/2 -translate-x-1/2 bg-black/70 px-2 py-1 rounded text-xs text-white">
                    {video.pages.length} páginas
                  </div>

                  {/* Status overlay */}
                  {video.status !== "pending" && (
                    <div
                      className={`absolute inset-0 flex items-center justify-center ${
                        video.status === "approved" ? "bg-green-500/20" : "bg-red-500/20"
                      }`}
                    >
                      {video.status === "approved" ? (
                        <Check className="h-16 w-16 text-green-500" />
                      ) : (
                        <X className="h-16 w-16 text-red-500" />
                      )}
                    </div>
                  )}
                </div>

                {/* Info */}
                <div className="p-3 space-y-2">
                  <div>
                    <h3 className="font-medium truncate">{video.clientName}</h3>
                    <p className="text-xs text-muted-foreground truncate">{video.company}</p>
                  </div>

                  <p className="text-xs line-clamp-2">{video.cardTitle}</p>

                  {/* Actions */}
                  <div className="flex gap-2 pt-2">
                    <Button
                      variant={video.status === "approved" ? "default" : "outline"}
                      size="sm"
                      className="flex-1"
                      onClick={() => handleApprove(index)}
                    >
                      <Check className="h-4 w-4" />
                    </Button>
                    <Button
                      variant={video.status === "rejected" ? "destructive" : "outline"}
                      size="sm"
                      className="flex-1"
                      onClick={() => handleReject(index)}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </ScrollArea>

      {/* Preview Dialog */}
      <Dialog
        open={!!selectedVideo}
        onOpenChange={() => {
          setSelectedVideo(null);
          setIsPlayingPreview(false);
        }}
      >
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{selectedVideo?.clientName}</DialogTitle>
          </DialogHeader>

          {selectedVideo && (
            <Tabs defaultValue="preview" className="w-full">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="preview">Preview com Efeitos</TabsTrigger>
                <TabsTrigger value="adjust">Ajustar Elementos</TabsTrigger>
              </TabsList>
              
              <TabsContent value="preview" className="mt-4">
                <VideoPreviewPlayer
                  pages={selectedVideo.pages}
                  pageDuration={template.pageDuration || 3}
                  onPageChange={setCurrentPreviewPage}
                />
              </TabsContent>
              
              <TabsContent value="adjust" className="mt-4">
                <div className="space-y-4">
                  {/* Adjust Overlay - drag corners to resize */}
                  <VideoAdjustOverlay
                    template={{
                      width: template.width,
                      height: template.height,
                      contentElements: template.contentElements,
                      signatureElements: template.signatureElements,
                    }}
                    previewUrl={selectedVideo.pages[currentPreviewPage] || null}
                    isBusy={isApplyingAdjustments}
                    onCommit={() => applyAdjustments()}
                    logoX={selectedVideo.adjustments.logoX}
                    logoY={selectedVideo.adjustments.logoY}
                    logoScaleX={selectedVideo.adjustments.logoScaleX}
                    logoScaleY={selectedVideo.adjustments.logoScaleY}
                    setLogoX={(v) => updateAdjustmentLocal("logoX", v)}
                    setLogoY={(v) => updateAdjustmentLocal("logoY", v)}
                    setLogoScaleX={(v) => updateAdjustmentLocal("logoScaleX", v)}
                    setLogoScaleY={(v) => updateAdjustmentLocal("logoScaleY", v)}
                    contactX={selectedVideo.adjustments.contactX}
                    contactY={selectedVideo.adjustments.contactY}
                    contactScaleX={selectedVideo.adjustments.contactScaleX}
                    contactScaleY={selectedVideo.adjustments.contactScaleY}
                    setContactX={(v) => updateAdjustmentLocal("contactX", v)}
                    setContactY={(v) => updateAdjustmentLocal("contactY", v)}
                    setContactScaleX={(v) => updateAdjustmentLocal("contactScaleX", v)}
                    setContactScaleY={(v) => updateAdjustmentLocal("contactScaleY", v)}
                    mascotX={selectedVideo.adjustments.mascotX}
                    mascotY={selectedVideo.adjustments.mascotY}
                    mascotScaleX={selectedVideo.adjustments.mascotScaleX}
                    mascotScaleY={selectedVideo.adjustments.mascotScaleY}
                    setMascotX={(v) => updateAdjustmentLocal("mascotX", v)}
                    setMascotY={(v) => updateAdjustmentLocal("mascotY", v)}
                    setMascotScaleX={(v) => updateAdjustmentLocal("mascotScaleX", v)}
                    setMascotScaleY={(v) => updateAdjustmentLocal("mascotScaleY", v)}
                    textX={selectedVideo.adjustments.textX}
                    textY={selectedVideo.adjustments.textY}
                    textScale={selectedVideo.adjustments.textScale}
                    setTextX={(v) => updateAdjustmentLocal("textX", v)}
                    setTextY={(v) => updateAdjustmentLocal("textY", v)}
                    setTextScale={(v) => updateAdjustmentLocal("textScale", v)}
                  />

                  <p className="text-center text-xs text-muted-foreground">
                    Arraste os elementos para mover. Arraste as alças nos cantos para redimensionar.
                  </p>

                  {/* Page navigation */}
                  <div className="flex gap-2 overflow-x-auto pb-1 justify-center">
                    {selectedVideo.pages.map((page, idx) => (
                      <button
                        key={idx}
                        type="button"
                        className={`shrink-0 rounded-md border overflow-hidden transition-colors ${
                          currentPreviewPage === idx
                            ? "border-primary ring-2 ring-primary/30"
                            : "border-border"
                        }`}
                        onClick={() => {
                          setIsPlayingPreview(false);
                          setCurrentPreviewPage(idx);
                        }}
                        aria-label={`Abrir página ${idx + 1}`}
                      >
                        <img
                          src={page}
                          alt={`Miniatura da página ${idx + 1}`}
                          className="h-12 w-8 object-cover"
                          loading="lazy"
                        />
                      </button>
                    ))}
                  </div>

                  <p className="text-center text-sm text-muted-foreground">
                    Página {currentPreviewPage + 1} de {selectedVideo.pages.length}
                    {currentPreviewPage === selectedVideo.pages.length - 1 && " (Assinatura)"}
                  </p>

                  <div className="flex gap-2 justify-center">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        if (!selectedVideo) return;
                        const resetVideo: ClientVideo = {
                          ...selectedVideo,
                          adjustments: { ...defaultAdjustments },
                        };

                        setSelectedVideo(resetVideo);
                        setClientVideos((prev) =>
                          prev.map((v) =>
                            v.cardId === resetVideo.cardId
                              ? { ...v, adjustments: { ...defaultAdjustments } }
                              : v
                          )
                        );

                        void applyAdjustments(resetVideo);
                      }}
                    >
                      <RefreshCw className="mr-2 h-4 w-4" />
                      Resetar
                    </Button>
                  </div>
                </div>
              </TabsContent>
            </Tabs>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};
