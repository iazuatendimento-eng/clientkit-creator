import { useState, useEffect, useRef, useCallback, memo } from "react";
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
  Upload,
  ClipboardPaste,
  Save,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { getTaggedCardsForArtGeneration, createCardUpload, clearArtGenerationTags, updateProjectBrief, autoTagFirstCardsForAllActiveClients } from "@/lib/clientDatabase";
import { searchImages, SearchImage, searchPexelsVideos } from "@/lib/imageSearch";
import { supabase } from "@/integrations/supabase/client";
import { saveBatchGeneration, BatchItem } from "@/lib/batchHistory";
import { encodeVideoToMP4, MotionEffect, TransitionEffect, TextAnimation, LogoAnimation } from "@/lib/videoEncoder";
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
  type: "rect" | "circle" | "text" | "image" | "logo" | "contact" | "mascot" | "polkaDots" | "dotsGrid" | "confetti" | "splatter" | "zigzag" | "spiral";
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
  opacity?: number;
  borderRadius?: number;
  borderWidth?: number;
  borderColor?: string;
  shadowBlur?: number;
  shadowColor?: string;
  shadowOffsetX?: number;
  shadowOffsetY?: number;
  gradient?: {
    type: "linear" | "radial";
    color1: string;
    color2: string;
    opacity1?: number;
    opacity2?: number;
    angle?: number;
    fadeMode?: boolean;
  };
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

interface PageTextAdjustment {
  textScale: number;
  textX: number;
  textY: number;
}

interface PageImageAdjustment {
  imageX: number;
  imageY: number;
  imageScale: number;
}

const defaultPageTextAdjustment: PageTextAdjustment = {
  textScale: 100,
  textX: 0,
  textY: 0,
};

const defaultPageImageAdjustment: PageImageAdjustment = {
  imageX: 0,
  imageY: 0,
  imageScale: 100,
};

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
  // Signature page specific adjustments
  sigLogoScaleX: number;
  sigLogoScaleY: number;
  sigLogoX: number;
  sigLogoY: number;
  sigContactScaleX: number;
  sigContactScaleY: number;
  sigContactX: number;
  sigContactY: number;
  sigMascotScaleX: number;
  sigMascotScaleY: number;
  sigMascotX: number;
  sigMascotY: number;
  // Deprecated - keeping for backward compatibility but not used for text anymore
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
  sigLogoScaleX: 100,
  sigLogoScaleY: 100,
  sigLogoX: 0,
  sigLogoY: 0,
  sigContactScaleX: 100,
  sigContactScaleY: 100,
  sigContactX: 0,
  sigContactY: 0,
  sigMascotScaleX: 100,
  sigMascotScaleY: 100,
  sigMascotX: 0,
  sigMascotY: 0,
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
  pages: string[]; // Array of page images (base64) - with background
  overlayPages?: string[]; // Array of page images (base64) - text only on transparent background
  frameOverlayPages?: string[]; // Array of page images (base64) - decorative shapes only (static frame)
  logoOverlayPages?: string[]; // Array of page images (base64) - logo only for separate animation
  videoUrl: string | null;
  status: "pending" | "approved" | "rejected";
  backgroundImages?: string[];
  pageTexts: string[]; // Text for each content page
  searchedImages?: string[]; // Images found for each page
  previewVideoUrls?: (string | null)[]; // Video URLs for preview playback per page
  adjustments: ElementAdjustments;
  pageTextAdjustments: PageTextAdjustment[]; // Per-page text adjustments
  pageImageAdjustments: PageImageAdjustment[]; // Per-page image adjustments
  team?: string;
  imageType?: string;
}

interface BatchVideoGeneratorProps {
  template: VideoTemplate;
  initialTeamFilter?: string;
  initialBatch?: import("@/lib/batchHistory").BatchGeneration;
  onBack: () => void;
  onComplete: () => void;
}

// Image cache to avoid reloading the same large base64/URL images
const imageCache = new Map<string, HTMLImageElement>();

// Helper to load image with caching and retry
const loadImage = async (url: string, retries = 2): Promise<HTMLImageElement | null> => {
  if (!url) return null;
  
  // Use cache key (for base64, use first 100 chars as key to avoid huge map keys)
  const cacheKey = url.length > 200 ? url.substring(0, 100) + url.length : url;
  const cached = imageCache.get(cacheKey);
  if (cached) return cached;
  
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const img = await new Promise<HTMLImageElement | null>((resolve) => {
        const el = new Image();
        // Don't set crossOrigin for data URIs (unnecessary and can cause issues in some browsers)
        if (!url.startsWith("data:")) {
          el.crossOrigin = "anonymous";
        }
        el.onload = () => resolve(el);
        el.onerror = () => {
          console.warn(`[loadImage] Failed to load image (attempt ${attempt + 1}), url starts with: ${url.substring(0, 50)}`);
          resolve(null);
        };
        el.src = url;
      });
      if (img) {
        imageCache.set(cacheKey, img);
        return img;
      }
    } catch (e) {
      console.warn(`[loadImage] Exception on attempt ${attempt + 1}:`, e);
    }
  }
  console.error(`[loadImage] All attempts failed for url starting with: ${url.substring(0, 50)}`);
  return null;
};

// System fonts that don't need Google Fonts loading
const SYSTEM_FONTS = new Set([
  "Arial", "Verdana", "Helvetica", "Tahoma", "Trebuchet MS",
  "Times New Roman", "Georgia", "Garamond", "Courier New",
  "Impact", "Comic Sans MS", "Segoe UI", "Lucida Sans",
]);

// Load Google Font dynamically for canvas rendering
const loadGoogleFont = async (fontFamily: string): Promise<void> => {
  if (!fontFamily || SYSTEM_FONTS.has(fontFamily)) return;
  const id = `google-font-${fontFamily.replace(/\s+/g, "-")}`;
  if (document.getElementById(id)) return;
  const link = document.createElement("link");
  link.id = id;
  link.rel = "stylesheet";
  link.href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(fontFamily)}:wght@400;700&display=swap`;
  document.head.appendChild(link);
  // Wait for font to be available
  try {
    await document.fonts.load(`16px "${fontFamily}"`);
  } catch { /* font may still work */ }
};

// Card cover with auto page cycling
const CardCoverPreview = memo(({
  video,
  motionEffect,
  transitionEffect,
  textAnimation,
  logoAnimation,
  textAnimDuration = 1.5,
  pageDuration,
  onClick,
}: {
  video: ClientVideo;
  motionEffect: MotionEffect;
  transitionEffect: TransitionEffect;
  textAnimation: TextAnimation;
  logoAnimation: LogoAnimation;
  textAnimDuration?: number;
  pageDuration: number;
  onClick: () => void;
}) => {
  const [currentPage, setCurrentPage] = useState(0);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const totalPages = video.pages.length;

  useEffect(() => {
    if (totalPages <= 1) return;
    const interval = window.setInterval(() => {
      setIsTransitioning(true);
      setTimeout(() => {
        setCurrentPage((p) => (p + 1) % totalPages);
        setTimeout(() => setIsTransitioning(false), 300);
      }, 300);
    }, pageDuration * 1000);
    return () => window.clearInterval(interval);
  }, [totalPages, pageDuration]);

  const isSignaturePage = currentPage === totalPages - 1 && totalPages > 1;
  // Use current page video, or fallback to first available video (but not for signature page)
  const currentVideoUrl = video.previewVideoUrls?.[currentPage] || null;
  const fallbackVideoUrl = !isSignaturePage ? (video.previewVideoUrls?.find(v => v && v !== "") || null) : null;
  const activeVideoUrl = currentVideoUrl || fallbackVideoUrl;
  const hasVideo = !!activeVideoUrl;
  const overlayPage = video.overlayPages?.[currentPage];
  const frameOverlay = video.frameOverlayPages?.[currentPage];
  const logoOverlay = video.logoOverlayPages?.[currentPage];

  const transitionClass = isTransitioning ? "opacity-0" : "opacity-100";

  return (
    <div
      className="aspect-[9/16] bg-muted relative group cursor-pointer overflow-hidden"
      onClick={onClick}
    >
      <div className={`absolute inset-0 transition-opacity duration-300 ease-out ${transitionClass}`}>
        {/* Layer 1: Background - wrapped to prevent edge trembling */}
        <div className="absolute inset-0 overflow-hidden">
          <div className="absolute inset-0">
            {hasVideo ? (
              <video
                key={`card-vid-${video.cardId}-${currentPage}`}
                ref={(el) => {
                  if (el) {
                    el.muted = true;
                    el.playsInline = true;
                    el.play().catch(() => {});
                  }
                }}
                src={activeVideoUrl!}
                className="w-full h-full object-cover"
                muted
                loop
                autoPlay
                playsInline
              />
            ) : video.pages[currentPage] ? (
              <img
                key={`card-img-${video.cardId}-${currentPage}`}
                src={video.pages[currentPage]}
                alt={video.clientName}
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            )}
          </div>
        </div>

        {/* Layer 2: Frame overlay (static shapes - no animation) */}
        {frameOverlay && frameOverlay !== "" && (
          <img
            key={`frame-${video.cardId}-${currentPage}`}
            src={frameOverlay}
            alt=""
            className="absolute inset-0 w-full h-full object-contain z-[1] pointer-events-none"
            draggable={false}
          />
        )}

        {/* Layer 3: Text overlay (animated) */}
        {overlayPage && overlayPage !== "" && (
          <img
            key={`overlay-${video.cardId}-${currentPage}-${textAnimation}`}
            src={overlayPage}
            alt=""
            className={`absolute inset-0 w-full h-full object-contain z-[2] pointer-events-none ${textAnimation !== "none" ? `card-animate-text-${textAnimation}` : ""}`}
            style={{ animationDuration: `${textAnimDuration}s` }}
            draggable={false}
          />
        )}

        {/* Layer 4: Logo overlay (animated) */}
        {logoOverlay && logoOverlay !== "" && (
          <img
            key={`logo-${video.cardId}-${currentPage}-${logoAnimation}`}
            src={logoOverlay}
            alt=""
            className={`absolute inset-0 w-full h-full object-contain z-[3] pointer-events-none ${logoAnimation !== "none" ? `card-animate-logo-${logoAnimation}` : ""}`}
            draggable={false}
          />
        )}
      </div>

      {/* Page indicator */}
      <div className="absolute bottom-2 left-1/2 -translate-x-1/2 bg-black/70 px-2 py-1 rounded text-xs text-white z-10">
        {currentPage + 1} / {totalPages}
      </div>

      {/* Status overlay */}
      {video.status !== "pending" && (
        <div
          className={`absolute inset-0 flex items-center justify-center z-10 ${
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
  );
});

export const BatchVideoGenerator = ({ template, initialTeamFilter, initialBatch, onBack, onComplete }: BatchVideoGeneratorProps) => {
  const [clientVideos, setClientVideos] = useState<ClientVideo[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationStatus, setGenerationStatus] = useState<string>("");
  const [selectedVideo, setSelectedVideo] = useState<ClientVideo | null>(null);
  const [currentPreviewPage, setCurrentPreviewPage] = useState(0);
  const [isPlayingPreview, setIsPlayingPreview] = useState(false);
  const [isImageDialogOpen, setIsImageDialogOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchImage[]>([]);
  const [searchVideoUrlMap, setSearchVideoUrlMap] = useState<Record<string, string>>({});
  const [isSearching, setIsSearching] = useState(false);
  const [isApplyingAdjustments, setIsApplyingAdjustments] = useState(false);
  const [customImageUrl, setCustomImageUrl] = useState("");
  const [motionEffect, setMotionEffect] = useState<MotionEffect>("ken-burns");
  const [transitionEffect, setTransitionEffect] = useState<TransitionEffect>("fade");
  const [textAnimation, setTextAnimation] = useState<TextAnimation>("fade-in");
  const [logoAnimation, setLogoAnimation] = useState<LogoAnimation>("fade-in");
  const [textAnimDuration, setTextAnimDuration] = useState(2.5); // seconds

  const selectedVideoRef = useRef<ClientVideo | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { toast } = useToast();

  useEffect(() => {
    selectedVideoRef.current = selectedVideo;
  }, [selectedVideo]);

  useEffect(() => {
    if (initialBatch) {
      loadFromExistingBatch(initialBatch);
    } else {
      loadTaggedCards();
    }
  }, []);

  useEffect(() => {
    if (
      clientVideos.length > 0 &&
      !isLoading &&
      !isGenerating &&
      !clientVideos.some((v) => v.pages.length > 0) &&
      !initialBatch
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

  const loadFromExistingBatch = async (batch: import("@/lib/batchHistory").BatchGeneration) => {
    try {
      setIsLoading(true);
      
      const clientIds = [...new Set(batch.items.map(item => item.clientId))];
      const { data: clientsData } = await supabase
        .from("client_data")
        .select("id, image_type")
        .in("id", clientIds);
      const imageTypeMap: Record<string, string> = {};
      clientsData?.forEach(c => { if (c.image_type) imageTypeMap[c.id] = c.image_type; });

      const videos: ClientVideo[] = batch.items.map((item) => {
        const pageTexts = item.files.length > 1
          ? item.files.slice(0, -1).map((_, i) => item.cardText?.split(";")[i]?.trim() || item.cardTitle)
          : [item.cardText || item.cardTitle];

        return {
          clientId: item.clientId,
          clientName: item.clientName,
          company: item.company,
          cardId: item.cardId,
          cardTitle: item.cardTitle,
          cardText: item.cardText,
          brandKit: item.brandKit,
          pages: item.files || [],
          videoUrl: null,
          status: "pending" as const,
          pageTexts,
          searchedImages: item.backgroundImages,
          adjustments: { ...defaultAdjustments },
          pageTextAdjustments: pageTexts.map(() => ({ ...defaultPageTextAdjustment })),
          pageImageAdjustments: pageTexts.map(() => ({ ...defaultPageImageAdjustment })),
          imageType: imageTypeMap[item.clientId] || undefined,
        };
      });

      setClientVideos(videos);
    } catch (error) {
      console.error("Error loading batch:", error);
      toast({
        title: "Erro ao carregar lote",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const loadTaggedCards = async () => {
    try {
      setIsLoading(true);
      
      await autoTagFirstCardsForAllActiveClients(initialTeamFilter);
      const taggedCards = await getTaggedCardsForArtGeneration();

      const videos: ClientVideo[] = taggedCards.map((card: any) => {
        const fullText = card.description || card.title;
        // Split by semicolons for carousel pages
        const textParts = fullText
          .split(";")
          .map((t: string) => t.trim())
          .filter((t: string) => t.length > 0);

        const brandKit = card.client?.brand_kit;
        const pageTexts = textParts.length > 0 ? textParts : [fullText];

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
          pageTexts,
          adjustments: { ...defaultAdjustments },
          pageTextAdjustments: pageTexts.map(() => ({ ...defaultPageTextAdjustment })),
          pageImageAdjustments: pageTexts.map(() => ({ ...defaultPageImageAdjustment })),
          team: card.client?.team || undefined,
          imageType: card.client?.image_type || undefined,
        };
      });

      setClientVideos(videos);

      if (videos.length === 0) {
        toast({
          title: "Nenhum card marcado",
          description: "Marque os cards pelo botão 'Criar Artes' no dashboard.",
        });
      } else {
        // Auto-fetch Pexels videos for card covers
        autoFetchPexelsCovers(videos);
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

  // Automatically fetch Pexels video for all cards on load
  const autoFetchPexelsCovers = async (videos: ClientVideo[]) => {
    const updatedVideos = [...videos];
    for (let i = 0; i < updatedVideos.length; i++) {
      const video = updatedVideos[i];
      const firstText = video.pageTexts[0] || video.cardTitle || "";
      if (!firstText) continue;
      try {
        let searchTerms = firstText.split(" ").slice(0, 5).join(" ");
        try {
          const { data, error } = await Promise.race([
            supabase.functions.invoke("translate-text", { body: { text: firstText } }),
            new Promise<never>((_, reject) => setTimeout(() => reject(new Error("Timeout")), 8000)),
          ]);
          if (!error && data?.translatedText) searchTerms = data.translatedText;
        } catch {}

        // Try search, retry with simpler terms if needed
        let results = await searchPexelsVideos(searchTerms, 3);
        if (results.length === 0) {
          const simpleTerms = searchTerms.split(" ").slice(0, 2).join(" ");
          results = await searchPexelsVideos(simpleTerms, 3);
        }
        if (results.length === 0) {
          // Generic fallback
          results = await searchPexelsVideos("business technology", 3);
        }

        if (results.length > 0) {
          // Set the same video URL for ALL content pages (not just page 0)
          const pexelsVideoUrls = video.pageTexts.map(() => results[0].videoUrl as string | null);
          updatedVideos[i] = {
            ...updatedVideos[i],
            searchedImages: [results[0].image, ...(updatedVideos[i].searchedImages?.slice(1) || [])],
            previewVideoUrls: pexelsVideoUrls,
          };
          setClientVideos([...updatedVideos]);
        }
      } catch (err) {
        console.error("Auto-fetch Pexels cover error:", err);
      }
    }
  };

  const generatePageImage = async (
    elements: CanvasElement[],
    text: string,
    brandKit: any,
    isSignature: boolean,
    backgroundImage?: string,
    adjustments: ElementAdjustments = defaultAdjustments,
    textAdjustment: PageTextAdjustment = defaultPageTextAdjustment,
    imageAdjustment: PageImageAdjustment = defaultPageImageAdjustment,
    transparentBackground: boolean = false,
    excludeLogo: boolean = false,
    excludeText: boolean = false
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

    // Helper to convert hex to rgba
    const hexToRgba = (hex: string, opacity: number): string => {
      const r = parseInt(hex.slice(1, 3), 16);
      const g = parseInt(hex.slice(3, 5), 16);
      const b = parseInt(hex.slice(5, 7), 16);
      return `rgba(${r}, ${g}, ${b}, ${opacity / 100})`;
    };

    // Helper to get fill style with gradient support
    const getElementFillStyle = (el: CanvasElement, x: number, y: number, elW: number, elH: number, defaultColor: string): string | CanvasGradient => {
      if (el.gradient) {
        let gradient;
        if (el.gradient.type === "linear") {
          const angle = (el.gradient.angle || 0) * Math.PI / 180;
          const dx = Math.cos(angle) * elW;
          const dy = Math.sin(angle) * elH;
          gradient = ctx.createLinearGradient(x, y, x + dx, y + dy);
        } else {
          gradient = ctx.createRadialGradient(
            x + elW / 2, y + elH / 2, 0,
            x + elW / 2, y + elH / 2, Math.max(elW, elH) / 2
          );
        }
        // Apply colorRole to gradient colors if set
        let color1 = el.gradient.color1;
        let color2 = el.gradient.color2;
        if (el.colorRole) {
          const roleColor = getElementColor(el, defaultColor);
          color1 = roleColor;
          color2 = el.gradient.fadeMode ? roleColor : el.gradient.color2;
        }
        gradient.addColorStop(0, hexToRgba(color1, el.gradient.opacity1 ?? 100));
        gradient.addColorStop(1, hexToRgba(color2, el.gradient.opacity2 ?? 100));
        return gradient;
      }
      return getElementColor(el, defaultColor);
    };

    // Helper to apply element styles (opacity, shadow)
    const applyElementStyles = (el: CanvasElement) => {
      ctx.globalAlpha = (el.opacity ?? 100) / 100;
      if (el.shadowBlur && el.shadowBlur > 0) {
        ctx.shadowBlur = el.shadowBlur;
        ctx.shadowColor = el.shadowColor || "#000000";
        ctx.shadowOffsetX = el.shadowOffsetX || 0;
        ctx.shadowOffsetY = el.shadowOffsetY || 0;
      } else {
        ctx.shadowBlur = 0;
        ctx.shadowColor = "transparent";
        ctx.shadowOffsetX = 0;
        ctx.shadowOffsetY = 0;
      }
    };

    // Draw background (skip if transparent for video overlay)
    if (!transparentBackground) {
      ctx.fillStyle = bgColor;
      ctx.fillRect(0, 0, w, h);
    }

    // Draw background image if provided (skip if transparent for video overlay)
    if (backgroundImage && !transparentBackground) {
      const bgImg = await loadImage(backgroundImage);
      if (bgImg) {
        // Cover the canvas with the image, applying adjustments
        const scale = imageAdjustment.imageScale / 100;
        const imgAspect = bgImg.width / bgImg.height;
        const canvasAspect = w / h;
        let drawWidth, drawHeight, drawX, drawY;

        if (imgAspect > canvasAspect) {
          drawHeight = h * scale;
          drawWidth = drawHeight * imgAspect;
          drawX = (w - drawWidth) / 2 + imageAdjustment.imageX;
          drawY = (h - drawHeight) / 2 + imageAdjustment.imageY;
        } else {
          drawWidth = w * scale;
          drawHeight = drawWidth / imgAspect;
          drawX = (w - drawWidth) / 2 + imageAdjustment.imageX;
          drawY = (h - drawHeight) / 2 + imageAdjustment.imageY;
        }

        ctx.drawImage(bgImg, drawX, drawY, drawWidth, drawHeight);

        // Add overlay for text readability
        ctx.fillStyle = "rgba(0, 0, 0, 0.4)";
        ctx.fillRect(0, 0, w, h);
      }
    }

    // Draw elements
    for (const el of elements) {
      // Skip logo if generating overlay without logo (logo has its own layer)
      if (excludeLogo && el.type === "logo") continue;
      // For text-only overlay: skip everything except text and contact
      if (transparentBackground && excludeLogo && !excludeText) {
        if (!["text", "contact"].includes(el.type)) continue;
      }
      // For frame-only overlay: skip text, contact, logo, image
      if (transparentBackground && excludeText) {
        if (["text", "contact", "logo", "image"].includes(el.type)) continue;
      }
      // For transparent overlays, skip background images
      if (transparentBackground && el.type === "image") continue;
      ctx.save();
      applyElementStyles(el);
      
      if (el.type === "rect") {
        ctx.fillStyle = getElementFillStyle(el, el.x, el.y, el.width, el.height, accessoryColor1);
        if (el.borderRadius && el.borderRadius > 0) {
          ctx.beginPath();
          ctx.roundRect(el.x, el.y, el.width, el.height, el.borderRadius);
          ctx.fill();
        } else {
          ctx.fillRect(el.x, el.y, el.width, el.height);
        }
      } else if (el.type === "circle") {
        ctx.fillStyle = getElementFillStyle(el, el.x, el.y, el.width, el.height, accessoryColor2);
        ctx.beginPath();
        ctx.ellipse(el.x + el.width / 2, el.y + el.height / 2, el.width / 2, el.height / 2, 0, 0, Math.PI * 2);
        ctx.fill();
      } else if (el.type === "polkaDots") {
        const color = getElementColor(el, accessoryColor1);
        const dotRadius = Math.min(el.width, el.height) * 0.08;
        const spacing = dotRadius * 3;
        const cols = Math.max(1, Math.floor(el.width / spacing));
        const rows = Math.max(1, Math.floor(el.height / spacing));
        const offsetX = (el.width - (cols - 1) * spacing) / 2;
        const offsetY = (el.height - (rows - 1) * spacing) / 2;

        ctx.fillStyle = color;
        for (let row = 0; row < rows; row++) {
          for (let col = 0; col < cols; col++) {
            const cx = el.x + offsetX + col * spacing;
            const cy = el.y + offsetY + row * spacing;
            ctx.beginPath();
            ctx.arc(cx, cy, dotRadius, 0, Math.PI * 2);
            ctx.fill();
          }
        }
      } else if (el.type === "dotsGrid") {
        const color = getElementColor(el, accessoryColor2);
        const dotCount = 25;
        ctx.fillStyle = color;

        const seed = el.x + el.y + el.width + el.height;
        const random = (i: number) => {
          const n = Math.sin(seed + i * 9.999) * 10000;
          return n - Math.floor(n);
        };

        for (let i = 0; i < dotCount; i++) {
          const cx = el.x + random(i * 2) * el.width;
          const cy = el.y + random(i * 2 + 1) * el.height;
          const radius = 3 + random(i * 3) * 12;
          ctx.beginPath();
          ctx.arc(cx, cy, radius, 0, Math.PI * 2);
          ctx.fill();
        }
      } else if (el.type === "confetti") {
        const base = getElementColor(el, accessoryColor1);
        const palette = [base, accessoryColor1, accessoryColor2, textColor];
        const shapeCount = 30;

        const seed = el.x + el.y + el.width + el.height;
        const random = (i: number) => {
          const n = Math.sin(seed + i * 9.999) * 10000;
          return n - Math.floor(n);
        };

        for (let i = 0; i < shapeCount; i++) {
          const cx = el.x + random(i * 2) * el.width;
          const cy = el.y + random(i * 2 + 1) * el.height;
          const size = 5 + random(i * 3) * 15;
          const rot = random(i * 4) * Math.PI * 2;
          ctx.fillStyle = palette[Math.floor(random(i * 5) * palette.length)];

          ctx.save();
          ctx.translate(cx, cy);
          ctx.rotate(rot);

          const shapeType = Math.floor(random(i * 6) * 3);
          if (shapeType === 0) {
            ctx.fillRect(-size / 2, -size / 4, size, size / 2);
          } else if (shapeType === 1) {
            ctx.beginPath();
            ctx.arc(0, 0, size / 3, 0, Math.PI * 2);
            ctx.fill();
          } else {
            ctx.beginPath();
            ctx.moveTo(0, -size / 2);
            ctx.lineTo(size / 2, size / 2);
            ctx.lineTo(-size / 2, size / 2);
            ctx.closePath();
            ctx.fill();
          }

          ctx.restore();
        }
      } else if (el.type === "splatter") {
        const color = getElementColor(el, accessoryColor2);
        ctx.fillStyle = color;

        const seed = el.x + el.y + el.width + el.height;
        const random = (i: number) => {
          const n = Math.sin(seed + i * 9.999) * 10000;
          return n - Math.floor(n);
        };

        const cx = el.x + el.width / 2;
        const cy = el.y + el.height / 2;
        const mainRadius = Math.min(el.width, el.height) * 0.28;
        ctx.beginPath();
        ctx.arc(cx, cy, mainRadius, 0, Math.PI * 2);
        ctx.fill();

        for (let i = 0; i < 20; i++) {
          const angle = random(i) * Math.PI * 2;
          const dist = mainRadius * (0.8 + random(i + 10) * 1.5);
          const r = 2 + random(i + 20) * 10;
          ctx.beginPath();
          ctx.arc(cx + Math.cos(angle) * dist, cy + Math.sin(angle) * dist, r, 0, Math.PI * 2);
          ctx.fill();
        }
      } else if (el.type === "zigzag") {
        const color = getElementColor(el, accessoryColor1);
        ctx.strokeStyle = color;
        ctx.lineWidth = Math.max(2, el.height * 0.08);
        ctx.lineCap = "round";

        const zigzags = 8;
        const stepX = el.width / zigzags;
        ctx.beginPath();
        ctx.moveTo(el.x, el.y + el.height / 2);
        for (let i = 1; i <= zigzags; i++) {
          const px = el.x + i * stepX;
          const py = el.y + (i % 2 === 0 ? el.height * 0.2 : el.height * 0.8);
          ctx.lineTo(px, py);
        }
        ctx.stroke();
      } else if (el.type === "spiral") {
        const color = getElementColor(el, accessoryColor2);
        ctx.strokeStyle = color;
        ctx.lineWidth = Math.max(2, Math.min(el.width, el.height) * 0.03);
        ctx.lineCap = "round";

        const cx = el.x + el.width / 2;
        const cy = el.y + el.height / 2;
        const maxR = Math.min(el.width, el.height) * 0.45;
        const turns = 3;

        ctx.beginPath();
        for (let t = 0; t <= 1; t += 0.02) {
          const angle = t * turns * Math.PI * 2;
          const r = t * maxR;
          const px = cx + Math.cos(angle) * r;
          const py = cy + Math.sin(angle) * r;
          if (t === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
        ctx.stroke();
      } else if (el.type === "text") {
        ctx.fillStyle = textColor;
        const baseFontSize = el.fontSize || 48;
        const fontSize = Math.round(baseFontSize * (textAdjustment.textScale / 100));
        const fontFamily = brandKit?.font || brandKit?.fontFamily || "Arial";
        ctx.font = `${fontSize}px ${fontFamily}`;
        
        // Use card text for content pages, placeholder for signature
        const displayText = isSignature ? (el.text || "") : text;
        
        // Word wrap with adjusted position
        const adjustedX = el.x + textAdjustment.textX;
        const adjustedY = el.y + textAdjustment.textY;
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
            const logoX = isSignature ? (adjustments.sigLogoX ?? adjustments.logoX) : adjustments.logoX;
            const logoY = isSignature ? (adjustments.sigLogoY ?? adjustments.logoY) : adjustments.logoY;
            const logoScaleX = isSignature ? (adjustments.sigLogoScaleX ?? adjustments.logoScaleX) : adjustments.logoScaleX;
            const logoScaleY = isSignature ? (adjustments.sigLogoScaleY ?? adjustments.logoScaleY) : adjustments.logoScaleY;
            const adjustedX = el.x + logoX;
            const adjustedY = el.y + logoY;
            const adjustedW = el.width * (logoScaleX / 100);
            const adjustedH = el.height * (logoScaleY / 100);
            console.log(`[generatePageImage] Drawing logo on ${isSignature ? 'signature' : 'content'} page at (${adjustedX}, ${adjustedY}) size ${adjustedW}x${adjustedH}`);
            ctx.drawImage(img, adjustedX, adjustedY, adjustedW, adjustedH);
          } else {
            console.error(`[generatePageImage] Logo image failed to load for ${isSignature ? 'signature' : 'content'} page`);
          }
        } else {
          console.warn(`[generatePageImage] No logo URL in brandKit for ${isSignature ? 'signature' : 'content'} page`);
          ctx.fillStyle = "rgba(59, 130, 246, 0.3)";
          ctx.fillRect(el.x, el.y, el.width, el.height);
        }
      } else if (el.type === "contact") {
        const contactUrl = brandKit?.pngs?.[1] || brandKit?.contactInfo;
        if (contactUrl) {
          const img = await loadImage(contactUrl);
          if (img) {
            const contactX = isSignature ? (adjustments.sigContactX ?? adjustments.contactX) : adjustments.contactX;
            const contactY = isSignature ? (adjustments.sigContactY ?? adjustments.contactY) : adjustments.contactY;
            const contactScaleX = isSignature ? (adjustments.sigContactScaleX ?? adjustments.contactScaleX) : adjustments.contactScaleX;
            const contactScaleY = isSignature ? (adjustments.sigContactScaleY ?? adjustments.contactScaleY) : adjustments.contactScaleY;
            const adjustedX = el.x + contactX;
            const adjustedY = el.y + contactY;
            const adjustedW = el.width * (contactScaleX / 100);
            const adjustedH = el.height * (contactScaleY / 100);
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
            const mascotX = isSignature ? (adjustments.sigMascotX ?? adjustments.mascotX) : adjustments.mascotX;
            const mascotY = isSignature ? (adjustments.sigMascotY ?? adjustments.mascotY) : adjustments.mascotY;
            const mascotScaleX = isSignature ? (adjustments.sigMascotScaleX ?? adjustments.mascotScaleX) : adjustments.mascotScaleX;
            const mascotScaleY = isSignature ? (adjustments.sigMascotScaleY ?? adjustments.mascotScaleY) : adjustments.mascotScaleY;
            const adjustedX = el.x + mascotX;
            const adjustedY = el.y + mascotY;
            const adjustedW = el.width * (mascotScaleX / 100);
            const adjustedH = el.height * (mascotScaleY / 100);
            ctx.drawImage(img, adjustedX, adjustedY, adjustedW, adjustedH);
          }
        }
      }
      ctx.restore();
    }

    return canvas.toDataURL("image/png");
  };

  // Generate a logo-only overlay (transparent PNG with only logo element)
  const generateLogoOverlay = async (
    elements: CanvasElement[],
    brandKit: any,
    isSignature: boolean,
    adjustments: ElementAdjustments = defaultAdjustments
  ): Promise<string> => {
    const logoEl = elements.find((e) => e.type === "logo");
    if (!logoEl) {
      console.warn(`[generateLogoOverlay] No logo element found in ${isSignature ? 'signature' : 'content'} elements (${elements.length} elements, types: ${elements.map(e => e.type).join(',')})`);
      return "";
    }

    const logoUrl = brandKit?.pngs?.[0] || brandKit?.logo;
    if (!logoUrl) {
      console.warn(`[generateLogoOverlay] No logo URL in brandKit for ${isSignature ? 'signature' : 'content'} page`);
      return "";
    }

    const canvas = document.createElement("canvas");
    canvas.width = template.width || 1080;
    canvas.height = template.height || 1920;
    const ctx = canvas.getContext("2d")!;
    // transparent background

    const img = await loadImage(logoUrl);
    if (!img) {
      console.error(`[generateLogoOverlay] Failed to load logo image for ${isSignature ? 'signature' : 'content'} page`);
      return "";
    }

    const logoX = isSignature ? (adjustments.sigLogoX ?? adjustments.logoX) : adjustments.logoX;
    const logoY = isSignature ? (adjustments.sigLogoY ?? adjustments.logoY) : adjustments.logoY;
    const logoScaleX = isSignature ? (adjustments.sigLogoScaleX ?? adjustments.logoScaleX) : adjustments.logoScaleX;
    const logoScaleY = isSignature ? (adjustments.sigLogoScaleY ?? adjustments.logoScaleY) : adjustments.logoScaleY;
    const adjustedX = logoEl.x + logoX;
    const adjustedY = logoEl.y + logoY;
    const adjustedW = logoEl.width * (logoScaleX / 100);
    const adjustedH = logoEl.height * (logoScaleY / 100);
    ctx.drawImage(img, adjustedX, adjustedY, adjustedW, adjustedH);

    return canvas.toDataURL("image/png");
  };

  const generateVideoForClient = async (video: ClientVideo, searchedImages: string[], videoUrls?: (string | null)[]): Promise<{ pages: string[]; overlayPages: string[]; frameOverlayPages: string[]; logoOverlayPages: string[] }> => {
    const pages: string[] = [];
    const overlayPages: string[] = [];
    const frameOverlayPages: string[] = [];
    const logoOverlayPages: string[] = [];

    for (let i = 0; i < video.pageTexts.length; i++) {
      const text = video.pageTexts[i];
      const bgImage = searchedImages[i] || undefined;
      const textAdj = video.pageTextAdjustments[i] || defaultPageTextAdjustment;
      const imageAdj = video.pageImageAdjustments[i] || defaultPageImageAdjustment;

      const pageImage = await generatePageImage(
        template.contentElements, text, video.brandKit, false, bgImage,
        video.adjustments, textAdj, imageAdj
      );
      pages.push(pageImage);

      // Text-only overlay (animated)
      const overlayImage = await generatePageImage(
        template.contentElements, text, video.brandKit, false, undefined,
        video.adjustments, textAdj, imageAdj, true, true, false
      );
      overlayPages.push(overlayImage);

      // Frame-only overlay (static shapes, no text/logo)
      const frameOverlay = await generatePageImage(
        template.contentElements, "", video.brandKit, false, undefined,
        video.adjustments, textAdj, imageAdj, true, true, true
      );
      frameOverlayPages.push(frameOverlay);

      const logoOverlay = await generateLogoOverlay(
        template.contentElements, video.brandKit, false, video.adjustments
      );
      logoOverlayPages.push(logoOverlay);
    }

    const signaturePage = await generatePageImage(
      template.signatureElements, "", video.brandKit, true, undefined,
      video.adjustments, defaultPageTextAdjustment, defaultPageImageAdjustment
    );
    pages.push(signaturePage);
    overlayPages.push("");
    frameOverlayPages.push("");
    // Generate logo overlay for signature page using signatureElements
    const sigLogoOverlay = await generateLogoOverlay(
      template.signatureElements, video.brandKit, true, video.adjustments
    );
    logoOverlayPages.push(sigLogoOverlay);

    return { pages, overlayPages, frameOverlayPages, logoOverlayPages };
  };

  const regenerateSingleVideo = async (video: ClientVideo): Promise<{ pages: string[]; overlayPages: string[]; frameOverlayPages: string[]; logoOverlayPages: string[] }> => {
    const pages: string[] = [];
    const overlayPages: string[] = [];
    const frameOverlayPages: string[] = [];
    const logoOverlayPages: string[] = [];

    for (let i = 0; i < video.pageTexts.length; i++) {
      const text = video.pageTexts[i];
      const bgImage = video.searchedImages?.[i] || undefined;
      const textAdj = video.pageTextAdjustments[i] || defaultPageTextAdjustment;
      const imageAdj = video.pageImageAdjustments[i] || defaultPageImageAdjustment;

      const pageImage = await generatePageImage(
        template.contentElements, text, video.brandKit, false, bgImage,
        video.adjustments, textAdj, imageAdj
      );
      pages.push(pageImage);

      // Text-only overlay
      const overlayImage = await generatePageImage(
        template.contentElements, text, video.brandKit, false, undefined,
        video.adjustments, textAdj, imageAdj, true, true, false
      );
      overlayPages.push(overlayImage);

      // Frame-only overlay
      const frameOverlay = await generatePageImage(
        template.contentElements, "", video.brandKit, false, undefined,
        video.adjustments, textAdj, imageAdj, true, true, true
      );
      frameOverlayPages.push(frameOverlay);

      const logoOverlay = await generateLogoOverlay(
        template.contentElements, video.brandKit, false, video.adjustments
      );
      logoOverlayPages.push(logoOverlay);
    }

    const signaturePage = await generatePageImage(
      template.signatureElements, "", video.brandKit, true, undefined,
      video.adjustments, defaultPageTextAdjustment, defaultPageImageAdjustment
    );
    pages.push(signaturePage);
    overlayPages.push("");
    frameOverlayPages.push("");
    // Generate logo overlay for signature page using signatureElements
    const sigLogoOverlay2 = await generateLogoOverlay(
      template.signatureElements, video.brandKit, true, video.adjustments
    );
    logoOverlayPages.push(sigLogoOverlay2);

    return { pages, overlayPages, frameOverlayPages, logoOverlayPages };
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

  // Update text adjustment for a specific page
  const updatePageTextAdjustment = useCallback((pageIndex: number, key: keyof PageTextAdjustment, value: number) => {
    const current = selectedVideoRef.current;
    if (!current) return;

    const updatedPageTextAdjustments = [...current.pageTextAdjustments];
    if (!updatedPageTextAdjustments[pageIndex]) {
      updatedPageTextAdjustments[pageIndex] = { ...defaultPageTextAdjustment };
    }
    updatedPageTextAdjustments[pageIndex] = {
      ...updatedPageTextAdjustments[pageIndex],
      [key]: value,
    };

    selectedVideoRef.current = {
      ...current,
      pageTextAdjustments: updatedPageTextAdjustments,
    };

    setSelectedVideo((prev) =>
      prev ? { ...prev, pageTextAdjustments: updatedPageTextAdjustments } : prev
    );

    setClientVideos((prev) =>
      prev.map((v) =>
        v.cardId === current.cardId
          ? { ...v, pageTextAdjustments: updatedPageTextAdjustments }
          : v
      )
    );
  }, []);

  // Update image adjustment for a specific page
  const updatePageImageAdjustment = useCallback((pageIndex: number, key: keyof PageImageAdjustment, value: number) => {
    const current = selectedVideoRef.current;
    if (!current) return;

    const updatedPageImageAdjustments = [...current.pageImageAdjustments];
    if (!updatedPageImageAdjustments[pageIndex]) {
      updatedPageImageAdjustments[pageIndex] = { ...defaultPageImageAdjustment };
    }
    updatedPageImageAdjustments[pageIndex] = {
      ...updatedPageImageAdjustments[pageIndex],
      [key]: value,
    };

    selectedVideoRef.current = {
      ...current,
      pageImageAdjustments: updatedPageImageAdjustments,
    };

    setSelectedVideo((prev) =>
      prev ? { ...prev, pageImageAdjustments: updatedPageImageAdjustments } : prev
    );

    setClientVideos((prev) =>
      prev.map((v) =>
        v.cardId === current.cardId
          ? { ...v, pageImageAdjustments: updatedPageImageAdjustments }
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
        const result = await regenerateSingleVideo(base);
        const updatedVideo = { ...base, pages: result.pages, overlayPages: result.overlayPages, frameOverlayPages: result.frameOverlayPages, logoOverlayPages: result.logoOverlayPages };

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
    setGenerationStatus("Preparando geração...");

    try {
      const updatedVideos = [...clientVideos];

      // Preload all unique fonts from brand kits
      const uniqueFonts = new Set(updatedVideos.map(v => v.brandKit?.font || v.brandKit?.fontFamily).filter(Boolean));
      await Promise.all([...uniqueFonts].map(f => loadGoogleFont(f)));

      for (let i = 0; i < updatedVideos.length; i++) {
        const video = updatedVideos[i];
        setGenerationStatus(`Gerando páginas (${i + 1}/${updatedVideos.length}) • ${video.clientName}`);

        // Search for videos from Pexels for each content page with translation
        const searchedImages: string[] = [];
        const pexelsVideoUrls: (string | null)[] = [];
        for (const text of video.pageTexts) {
          try {
            let searchTerms = text.split(" ").slice(0, 5).join(" ");

            // Translate to English for better search results (with timeout)
            try {
              const translatePromise = supabase.functions.invoke("translate-text", {
                body: { text },
              });

              const timeoutPromise = new Promise<never>((_, reject) =>
                setTimeout(() => reject(new Error("Timeout na tradução")), 15000)
              );

              const { data, error } = await Promise.race([translatePromise, timeoutPromise]);

              if (!error && data?.translatedText) {
                searchTerms = data.translatedText;
              }
            } catch (translateError) {
              console.error("Translation failed, using original text:", translateError);
            }

            // Search Pexels videos with multiple fallback strategies
            let foundVideo = false;
            let videos = await searchPexelsVideos(searchTerms, 3);
            if (videos.length === 0) {
              // Retry with simpler terms
              const simpleTerms = searchTerms.split(" ").slice(0, 2).join(" ");
              videos = await searchPexelsVideos(simpleTerms, 3);
            }
            if (videos.length === 0) {
              // Generic fallback
              videos = await searchPexelsVideos("business technology", 3);
            }
            if (videos.length > 0) {
              searchedImages.push(videos[0].image);
              pexelsVideoUrls.push(videos[0].videoUrl);
              foundVideo = true;
            }
            if (!foundVideo) {
              // Last resort: still try to get an image
              const images = await searchImages(searchTerms, 1);
              searchedImages.push(images.length > 0 ? images[0].urls.regular : "");
              pexelsVideoUrls.push(null);
            }
          } catch (error) {
            console.error("Error searching video for page:", error);
            searchedImages.push("");
            pexelsVideoUrls.push(null);
          }
        }

        const result = await generateVideoForClient(video, searchedImages, pexelsVideoUrls);
        updatedVideos[i] = { ...video, pages: result.pages, overlayPages: result.overlayPages, frameOverlayPages: result.frameOverlayPages, logoOverlayPages: result.logoOverlayPages, searchedImages, previewVideoUrls: pexelsVideoUrls };
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
        description: error instanceof Error ? error.message : undefined,
        variant: "destructive",
      });
    } finally {
      setIsGenerating(false);
      setGenerationStatus("");
    }
  };

  // Refresh brand kit from database and regenerate video
  const refreshBrandKitAndRegenerate = async (index: number) => {
    const video = clientVideos[index];
    try {
      const { data: clientData, error } = await supabase
        .from("client_data")
        .select("brand_kit")
        .eq("id", video.clientId)
        .single();

      if (error || !clientData) {
        toast({ title: "Erro ao buscar dados do cliente", variant: "destructive" });
        return;
      }

      setIsGenerating(true);
      setGenerationStatus(`Atualizando ${video.clientName}...`);

      const updatedVideo: ClientVideo = { ...video, brandKit: clientData.brand_kit };
      const result = await regenerateSingleVideo(updatedVideo);
      const finalVideo = { ...updatedVideo, pages: result.pages, overlayPages: result.overlayPages, frameOverlayPages: result.frameOverlayPages, logoOverlayPages: result.logoOverlayPages };

      setClientVideos((prev) =>
        prev.map((v, i) => (i === index ? finalVideo : v))
      );

      toast({ title: "Kit de marca atualizado!", description: `Cores de ${video.clientName} recarregadas.` });
    } catch (error) {
      console.error("Error refreshing brand kit:", error);
      toast({ title: "Erro ao atualizar kit de marca", variant: "destructive" });
    } finally {
      setIsGenerating(false);
      setGenerationStatus("");
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
      // Search Pexels videos first, fallback to images
      const videos = await searchPexelsVideos(searchQuery, 12);
      if (videos.length > 0) {
        // Convert video results to SearchImage format using thumbnails
        const videoUrlMap: Record<string, string> = {};
        const videoAsImages: SearchImage[] = videos.map(v => {
          videoUrlMap[v.id] = v.videoUrl;
          return {
            id: v.id,
            urls: {
              regular: v.image,
              small: v.image,
              thumb: v.image,
            },
            photographer: v.photographer,
            photographerUrl: '',
            description: v.description,
            source: 'pexels' as const,
          };
        });
        setSearchVideoUrlMap(videoUrlMap);
        setSearchResults(videoAsImages);
      } else {
        const images = await searchImages(searchQuery, 12);
        setSearchResults(images);
      }
    } catch (error) {
      toast({
        title: "Erro ao buscar vídeos",
        variant: "destructive",
      });
    } finally {
      setIsSearching(false);
    }
  };

  const handleSelectImage = async (image: SearchImage) => {
    const video = selectedVideoRef.current;
    if (!video) return;

    // Only change image for content pages (not signature page)
    const isSignaturePage = currentPreviewPage === video.pages.length - 1;
    if (isSignaturePage) {
      toast({
        title: "Página de assinatura",
        description: "A página de assinatura não usa imagem de fundo.",
        variant: "destructive",
      });
      return;
    }

    // Update the searchedImages array for the current page
    const newSearchedImages = [...(video.searchedImages || [])];
    newSearchedImages[currentPreviewPage] = image.urls.regular;

    // Store Pexels video URL for preview playback
    const pexelsVideoUrl = searchVideoUrlMap[image.id] || null;
    const newPreviewVideoUrls = [...(video.previewVideoUrls || video.pageTexts.map(() => null))];
    newPreviewVideoUrls[currentPreviewPage] = pexelsVideoUrl;

    const updatedVideo: ClientVideo = {
      ...video,
      searchedImages: newSearchedImages,
      previewVideoUrls: newPreviewVideoUrls,
    };

    selectedVideoRef.current = updatedVideo;
    setSelectedVideo(updatedVideo);
    setClientVideos((prev) =>
      prev.map((v) => (v.cardId === updatedVideo.cardId ? updatedVideo : v))
    );

    setIsImageDialogOpen(false);
    setCustomImageUrl("");

    // Regenerate video with new image
    setIsApplyingAdjustments(true);
    try {
      const result = await regenerateSingleVideo(updatedVideo);
      const finalVideo = { ...updatedVideo, pages: result.pages, overlayPages: result.overlayPages, frameOverlayPages: result.frameOverlayPages, logoOverlayPages: result.logoOverlayPages };
      selectedVideoRef.current = finalVideo;
      setSelectedVideo(finalVideo);
      setClientVideos((prev) =>
        prev.map((v) => (v.cardId === finalVideo.cardId ? finalVideo : v))
      );
      toast({
        title: "Foto aplicada!",
        description: "Vídeo regenerado com a nova imagem.",
      });
    } finally {
      setIsApplyingAdjustments(false);
    }
  };

  const handleCustomImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.type.startsWith("video/")) {
      // For video files, extract a frame as thumbnail and store video URL for preview
      const videoUrl = URL.createObjectURL(file);
      const videoEl = document.createElement("video");
      videoEl.crossOrigin = "anonymous";
      videoEl.muted = true;
      videoEl.preload = "auto";
      videoEl.src = videoUrl;
      videoEl.onloadeddata = () => {
        videoEl.currentTime = 0.5; // seek to 0.5s for a good frame
      };
      videoEl.onseeked = () => {
        const canvas = document.createElement("canvas");
        canvas.width = videoEl.videoWidth;
        canvas.height = videoEl.videoHeight;
        const ctx = canvas.getContext("2d");
        if (ctx) {
          ctx.drawImage(videoEl, 0, 0, canvas.width, canvas.height);
          const thumbnail = canvas.toDataURL("image/jpeg", 0.85);
          // Store thumbnail as background and video URL for preview playback
          applyCustomImage(thumbnail, videoUrl);
        }
      };
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const base64 = event.target?.result as string;
      applyCustomImage(base64);
    };
    reader.readAsDataURL(file);
  };

  const handleCustomImageUrl = () => {
    if (!customImageUrl.trim()) return;
    applyCustomImage(customImageUrl.trim());
  };

  const applyCustomImage = async (imageUrl: string, videoUrl?: string) => {
    const video = selectedVideoRef.current;
    if (!video) return;

    // Only change image for content pages
    const isSignaturePage = currentPreviewPage === video.pages.length - 1;
    if (isSignaturePage) {
      toast({
        title: "Página de assinatura",
        description: "A página de assinatura não usa imagem de fundo.",
        variant: "destructive",
      });
      return;
    }

    const newSearchedImages = [...(video.searchedImages || [])];
    newSearchedImages[currentPreviewPage] = imageUrl;

    // Store video URL for preview playback
    const newPreviewVideoUrls = [...(video.previewVideoUrls || video.pageTexts.map(() => null))];
    newPreviewVideoUrls[currentPreviewPage] = videoUrl || null;

    const updatedVideo: ClientVideo = {
      ...video,
      searchedImages: newSearchedImages,
      previewVideoUrls: newPreviewVideoUrls,
    };

    selectedVideoRef.current = updatedVideo;
    setSelectedVideo(updatedVideo);
    setClientVideos((prev) =>
      prev.map((v) => (v.cardId === updatedVideo.cardId ? updatedVideo : v))
    );

    setIsImageDialogOpen(false);
    setCustomImageUrl("");

    // Regenerate video
    setIsApplyingAdjustments(true);
    try {
      const result = await regenerateSingleVideo(updatedVideo);
      const finalVideo = { ...updatedVideo, pages: result.pages, overlayPages: result.overlayPages, frameOverlayPages: result.frameOverlayPages, logoOverlayPages: result.logoOverlayPages };
      selectedVideoRef.current = finalVideo;
      setSelectedVideo(finalVideo);
      setClientVideos((prev) =>
        prev.map((v) => (v.cardId === finalVideo.cardId ? finalVideo : v))
      );
      toast({
        title: "Imagem aplicada!",
        description: "Vídeo regenerado com a nova imagem.",
      });
    } finally {
      setIsApplyingAdjustments(false);
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
    setGenerationStatus("Iniciando exportação MP4...");

    try {
      for (let idx = 0; idx < approvedVideos.length; idx++) {
        const video = approvedVideos[idx];

        setGenerationStatus(`Gerando MP4 (${idx + 1}/${approvedVideos.length}) • ${video.clientName}`);

        toast({
          title: `Gerando vídeo MP4...`,
          description: `Processando ${video.clientName} (pode demorar alguns segundos)`,
        });

        // Encode video from pages to MP4
        const videoBlob = await encodeVideoToMP4(video.pages, {
          width: template.width,
          height: template.height,
          pageDuration: template.pageDuration,
          fps: 24,
          motionEffect,
          transitionEffect,
          textAnimation,
          logoAnimation,
          textAnimDuration: textAnimDuration / (template.pageDuration || 3), // convert seconds to fraction of page
          backgroundVideoUrls: video.previewVideoUrls || undefined,
          frameOverlayPages: video.frameOverlayPages || undefined,
          overlayPages: video.overlayPages || undefined,
          logoOverlayPages: video.logoOverlayPages || undefined,
          onProgress: (p) => console.log(`Progresso ${video.clientName}: ${Math.round(p * 100)}%`),
        });

        const fileName = `video_${video.cardId}_${Date.now()}.mp4`;

        // Upload video file
        const { error: uploadError } = await supabase.storage
          .from("card-uploads")
          .upload(`videos/${fileName}`, videoBlob, {
            contentType: "video/mp4",
          });

        if (uploadError) {
          console.error("Upload error:", uploadError);
          throw uploadError;
        }

        const { data: urlData } = supabase.storage
          .from("card-uploads")
          .getPublicUrl(`videos/${fileName}`);

        // Create card upload record for video
        await createCardUpload({
          card_id: video.cardId,
          file_name: fileName,
          file_url: urlData.publicUrl,
          file_type: "video/mp4",
          upload_type: "final",
        });

        // Also upload first frame as thumbnail
        setGenerationStatus(`Gerando capa (${idx + 1}/${approvedVideos.length}) • ${video.clientName}`);
        const thumbResponse = await fetch(video.pages[0]);
        const thumbBlob = await thumbResponse.blob();
        const thumbFileName = `thumb_${video.cardId}_${Date.now()}.png`;

        const { error: thumbUploadError } = await supabase.storage
          .from("card-uploads")
          .upload(`videos/${thumbFileName}`, thumbBlob, {
            contentType: "image/png",
          });

        if (thumbUploadError) {
          console.error("Thumb upload error:", thumbUploadError);
          throw thumbUploadError;
        }

        const { data: thumbUrlData } = supabase.storage
          .from("card-uploads")
          .getPublicUrl(`videos/${thumbFileName}`);

        // Update card with video URL and thumbnail
        await updateProjectBrief(video.cardId, {
          cover_image: thumbUrlData.publicUrl,
          cover_video: urlData.publicUrl,
          brief_type: "video",
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
        description: error instanceof Error ? error.message : undefined,
        variant: "destructive",
      });
    } finally {
      setIsGenerating(false);
      setGenerationStatus("");
    }
  };

  // Save current state as draft to history (without finalizing)
  const handleSaveDraft = async () => {
    const videosWithPages = clientVideos.filter((v) => v.pages.length > 0);
    
    if (videosWithPages.length === 0) {
      toast({
        title: "Nenhum vídeo gerado",
        description: "Gere os vídeos antes de salvar o rascunho.",
        variant: "destructive",
      });
      return;
    }

    try {
      const batchItems: BatchItem[] = videosWithPages.map((video) => ({
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

      await clearArtGenerationTags();

      toast({
        title: "Rascunho salvo!",
        description: `${videosWithPages.length} vídeos salvos no histórico. Você pode continuar editando depois.`,
      });

      onComplete();
    } catch (error) {
      console.error("Error saving draft:", error);
      toast({
        title: "Erro ao salvar rascunho",
        variant: "destructive",
      });
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
          
          {/* Save Draft button */}
          {clientVideos.some((v) => v.pages.length > 0) && (
            <Button
              variant="outline"
              onClick={handleSaveDraft}
            >
              <Save className="mr-2 h-4 w-4" />
              Salvar Rascunho
            </Button>
          )}
          
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

      {/* Effect Controls */}
      <div className="border-b bg-card/50 px-6 py-3 flex items-center gap-6 flex-wrap">
        <div className="flex items-center gap-2">
          <Label className="text-sm whitespace-nowrap">Movimento:</Label>
          <select
            value={motionEffect}
            onChange={(e) => setMotionEffect(e.target.value as MotionEffect)}
            className="h-8 px-2 text-sm border rounded-md bg-background"
          >
            <option value="none">Nenhum</option>
            <option value="ken-burns">Ken Burns</option>
            <option value="ken-burns-reverse">Ken Burns Reverso</option>
            <option value="pulse">Pulsar Suave</option>
            <option value="pulse-strong">Pulsar Forte</option>
            <option value="float">Flutuar</option>
            <option value="float-diagonal">Flutuar Diagonal</option>
            <option value="sway">Balançar</option>
            <option value="breathe">Respirar</option>
            <option value="drift">Deriva</option>
            <option value="wobble">Bambolear</option>
            <option value="zoom-pulse">Zoom Pulsar</option>
            <option value="pan-left">Pan Esquerda</option>
            <option value="pan-right">Pan Direita</option>
          </select>
        </div>
        <div className="flex items-center gap-2">
          <Label className="text-sm whitespace-nowrap">Transição:</Label>
          <select
            value={transitionEffect}
            onChange={(e) => setTransitionEffect(e.target.value as TransitionEffect)}
            className="h-8 px-2 text-sm border rounded-md bg-background"
          >
            <option value="fade">Fade</option>
            <option value="slide-left">Deslizar Esquerda</option>
            <option value="slide-right">Deslizar Direita</option>
            <option value="slide-up">Deslizar Cima</option>
            <option value="slide-down">Deslizar Baixo</option>
            <option value="zoom">Zoom In</option>
            <option value="zoom-out">Zoom Out</option>
          </select>
        </div>
        <div className="flex items-center gap-2">
          <Label className="text-sm whitespace-nowrap">Texto:</Label>
          <select
            value={textAnimation}
            onChange={(e) => setTextAnimation(e.target.value as TextAnimation)}
            className="h-8 px-2 text-sm border rounded-md bg-background"
          >
            <option value="none">Nenhum</option>
            <option value="fade-in">Fade In</option>
            <option value="slide-up">Subir</option>
            <option value="slide-down">Descer</option>
            <option value="slide-left">Deslizar Esquerda</option>
            <option value="slide-right">Deslizar Direita</option>
            <option value="scale-in">Zoom In</option>
            <option value="bounce-in">Quicar</option>
            <option value="rotate-in">Rotacionar</option>
            <option value="blur-in">Desfocar</option>
            <option value="drop-in">Cair</option>
            <option value="swing-in">Balançar</option>
            <option value="elastic-in">Elástico</option>
            <option value="flip-in">Virar</option>
          </select>
        </div>
        <div className="flex items-center gap-2">
          <Label className="text-sm whitespace-nowrap">Duração:</Label>
          <input
            type="range"
            min={0.5}
            max={8}
            step={0.1}
            value={textAnimDuration}
            onChange={(e) => setTextAnimDuration(parseFloat(e.target.value))}
            className="w-24 h-2 accent-primary"
          />
          <span className="text-xs text-muted-foreground w-8">{textAnimDuration}s</span>
        </div>
        <div className="flex items-center gap-2">
          <Label className="text-sm whitespace-nowrap">Logo:</Label>
          <select
            value={logoAnimation}
            onChange={(e) => setLogoAnimation(e.target.value as LogoAnimation)}
            className="h-8 px-2 text-sm border rounded-md bg-background"
          >
            <option value="none">Nenhum</option>
            <option value="fade-in">Fade In</option>
            <option value="slide-up">Subir</option>
            <option value="slide-down">Descer</option>
            <option value="slide-left">Deslizar Esquerda</option>
            <option value="slide-right">Deslizar Direita</option>
            <option value="scale-in">Zoom In</option>
            <option value="bounce-in">Quicar</option>
            <option value="spin-in">Girar</option>
            <option value="flip-in">Virar</option>
            <option value="swing">Balançar</option>
          </select>
        </div>
        <span className="text-xs text-muted-foreground">
          Efeitos aplicados no vídeo final MP4
        </span>
      </div>

      {/* Content */}
      <ScrollArea className="flex-1 p-6">
        {isGenerating ? (
          <div className="flex flex-col items-center justify-center h-64 gap-2">
            <Loader2 className="h-12 w-12 animate-spin text-primary" />
            <p className="text-muted-foreground">{generationStatus || "Gerando vídeos..."}</p>
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
                {/* Video Preview with page cycling */}
                <CardCoverPreview
                  video={video}
                  motionEffect={motionEffect}
                  transitionEffect={transitionEffect}
                  textAnimation={textAnimation}
                  logoAnimation={logoAnimation}
                  textAnimDuration={textAnimDuration}
                  pageDuration={template.pageDuration || 3}
                  onClick={() => {
                    setSelectedVideo(video);
                    setCurrentPreviewPage(0);
                    setIsPlayingPreview(true);
                  }}
                />

                {/* Info */}
                <div className="p-3 space-y-2">
                  <div>
                    <h3 className="font-medium truncate">{video.clientName}</h3>
                    <p className="text-xs text-muted-foreground truncate">{video.company}</p>
                    {video.team && (
                      <p className="text-xs text-primary/70 truncate">{video.team}</p>
                    )}
                  </div>

                  <p className="text-xs line-clamp-2">{video.cardTitle}</p>
                  {video.imageType && (
                    <p className="text-xs text-primary/70 truncate">{video.imageType}</p>
                  )}

                  {/* Actions */}
                  <div className="flex gap-2 pt-2">
                    <Button
                      variant="outline"
                      size="sm"
                      title="Atualizar cores do cadastro e regenerar"
                      onClick={(e) => {
                        e.stopPropagation();
                        refreshBrandKitAndRegenerate(index);
                      }}
                      disabled={isGenerating}
                    >
                      <RefreshCw className="h-4 w-4" />
                    </Button>
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
                  motionEffect={motionEffect}
                  transitionEffect={transitionEffect}
                  textAnimation={textAnimation}
                  logoAnimation={logoAnimation}
                  textAnimDuration={textAnimDuration}
                  videoUrls={selectedVideo.previewVideoUrls}
                  overlayPages={selectedVideo.overlayPages}
                  logoOverlayPages={selectedVideo.logoOverlayPages}
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
                    isContentPage={currentPreviewPage < selectedVideo.pages.length - 1}
                    logoX={currentPreviewPage < selectedVideo.pages.length - 1 
                      ? selectedVideo.adjustments.logoX 
                      : (selectedVideo.adjustments.sigLogoX ?? selectedVideo.adjustments.logoX)}
                    logoY={currentPreviewPage < selectedVideo.pages.length - 1 
                      ? selectedVideo.adjustments.logoY 
                      : (selectedVideo.adjustments.sigLogoY ?? selectedVideo.adjustments.logoY)}
                    logoScaleX={currentPreviewPage < selectedVideo.pages.length - 1 
                      ? selectedVideo.adjustments.logoScaleX 
                      : (selectedVideo.adjustments.sigLogoScaleX ?? selectedVideo.adjustments.logoScaleX)}
                    logoScaleY={currentPreviewPage < selectedVideo.pages.length - 1 
                      ? selectedVideo.adjustments.logoScaleY 
                      : (selectedVideo.adjustments.sigLogoScaleY ?? selectedVideo.adjustments.logoScaleY)}
                    setLogoX={(v) => updateAdjustmentLocal(
                      currentPreviewPage < selectedVideo.pages.length - 1 ? "logoX" : "sigLogoX", v
                    )}
                    setLogoY={(v) => updateAdjustmentLocal(
                      currentPreviewPage < selectedVideo.pages.length - 1 ? "logoY" : "sigLogoY", v
                    )}
                    setLogoScaleX={(v) => updateAdjustmentLocal(
                      currentPreviewPage < selectedVideo.pages.length - 1 ? "logoScaleX" : "sigLogoScaleX", v
                    )}
                    setLogoScaleY={(v) => updateAdjustmentLocal(
                      currentPreviewPage < selectedVideo.pages.length - 1 ? "logoScaleY" : "sigLogoScaleY", v
                    )}
                    contactX={currentPreviewPage < selectedVideo.pages.length - 1 
                      ? selectedVideo.adjustments.contactX 
                      : (selectedVideo.adjustments.sigContactX ?? selectedVideo.adjustments.contactX)}
                    contactY={currentPreviewPage < selectedVideo.pages.length - 1 
                      ? selectedVideo.adjustments.contactY 
                      : (selectedVideo.adjustments.sigContactY ?? selectedVideo.adjustments.contactY)}
                    contactScaleX={currentPreviewPage < selectedVideo.pages.length - 1 
                      ? selectedVideo.adjustments.contactScaleX 
                      : (selectedVideo.adjustments.sigContactScaleX ?? selectedVideo.adjustments.contactScaleX)}
                    contactScaleY={currentPreviewPage < selectedVideo.pages.length - 1 
                      ? selectedVideo.adjustments.contactScaleY 
                      : (selectedVideo.adjustments.sigContactScaleY ?? selectedVideo.adjustments.contactScaleY)}
                    setContactX={(v) => updateAdjustmentLocal(
                      currentPreviewPage < selectedVideo.pages.length - 1 ? "contactX" : "sigContactX", v
                    )}
                    setContactY={(v) => updateAdjustmentLocal(
                      currentPreviewPage < selectedVideo.pages.length - 1 ? "contactY" : "sigContactY", v
                    )}
                    setContactScaleX={(v) => updateAdjustmentLocal(
                      currentPreviewPage < selectedVideo.pages.length - 1 ? "contactScaleX" : "sigContactScaleX", v
                    )}
                    setContactScaleY={(v) => updateAdjustmentLocal(
                      currentPreviewPage < selectedVideo.pages.length - 1 ? "contactScaleY" : "sigContactScaleY", v
                    )}
                    mascotX={currentPreviewPage < selectedVideo.pages.length - 1 
                      ? selectedVideo.adjustments.mascotX 
                      : (selectedVideo.adjustments.sigMascotX ?? selectedVideo.adjustments.mascotX)}
                    mascotY={currentPreviewPage < selectedVideo.pages.length - 1 
                      ? selectedVideo.adjustments.mascotY 
                      : (selectedVideo.adjustments.sigMascotY ?? selectedVideo.adjustments.mascotY)}
                    mascotScaleX={currentPreviewPage < selectedVideo.pages.length - 1 
                      ? selectedVideo.adjustments.mascotScaleX 
                      : (selectedVideo.adjustments.sigMascotScaleX ?? selectedVideo.adjustments.mascotScaleX)}
                    mascotScaleY={currentPreviewPage < selectedVideo.pages.length - 1 
                      ? selectedVideo.adjustments.mascotScaleY 
                      : (selectedVideo.adjustments.sigMascotScaleY ?? selectedVideo.adjustments.mascotScaleY)}
                    setMascotX={(v) => updateAdjustmentLocal(
                      currentPreviewPage < selectedVideo.pages.length - 1 ? "mascotX" : "sigMascotX", v
                    )}
                    setMascotY={(v) => updateAdjustmentLocal(
                      currentPreviewPage < selectedVideo.pages.length - 1 ? "mascotY" : "sigMascotY", v
                    )}
                    setMascotScaleX={(v) => updateAdjustmentLocal(
                      currentPreviewPage < selectedVideo.pages.length - 1 ? "mascotScaleX" : "sigMascotScaleX", v
                    )}
                    setMascotScaleY={(v) => updateAdjustmentLocal(
                      currentPreviewPage < selectedVideo.pages.length - 1 ? "mascotScaleY" : "sigMascotScaleY", v
                    )}
                    textX={selectedVideo.pageTextAdjustments[currentPreviewPage]?.textX || 0}
                    textY={selectedVideo.pageTextAdjustments[currentPreviewPage]?.textY || 0}
                    textScale={selectedVideo.pageTextAdjustments[currentPreviewPage]?.textScale || 100}
                    setTextX={(v) => updatePageTextAdjustment(currentPreviewPage, "textX", v)}
                    setTextY={(v) => updatePageTextAdjustment(currentPreviewPage, "textY", v)}
                    setTextScale={(v) => updatePageTextAdjustment(currentPreviewPage, "textScale", v)}
                    imageX={selectedVideo.pageImageAdjustments[currentPreviewPage]?.imageX || 0}
                    imageY={selectedVideo.pageImageAdjustments[currentPreviewPage]?.imageY || 0}
                    imageScale={selectedVideo.pageImageAdjustments[currentPreviewPage]?.imageScale || 100}
                    setImageX={(v) => updatePageImageAdjustment(currentPreviewPage, "imageX", v)}
                    setImageY={(v) => updatePageImageAdjustment(currentPreviewPage, "imageY", v)}
                    setImageScale={(v) => updatePageImageAdjustment(currentPreviewPage, "imageScale", v)}
                  />

                  <p className="text-center text-xs text-muted-foreground">
                    Arraste os elementos para mover. Arraste as alças nos cantos para redimensionar.
                    <br />
                    <span className="text-primary/80">Ajustes de logo, contato, mascote, texto e foto são independentes entre página de conteúdo e assinatura.</span>
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

                  {/* Video preview playback */}
                  {selectedVideo.previewVideoUrls?.[currentPreviewPage] && (
                    <div className="space-y-2">
                      <p className="text-xs text-center text-primary font-medium">Preview do Vídeo de Fundo:</p>
                      <div className="relative aspect-[9/16] max-h-[300px] mx-auto rounded-lg overflow-hidden border border-primary/30 bg-black">
                        <video
                          src={selectedVideo.previewVideoUrls[currentPreviewPage]!}
                          controls
                          autoPlay
                          loop
                          muted
                          playsInline
                          className="w-full h-full object-contain"
                        />
                      </div>
                    </div>
                  )}

                  <div className="flex gap-2 justify-center">
                    {/* Only show change photo button for content pages */}
                    {currentPreviewPage < selectedVideo.pages.length - 1 && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          const pageText = selectedVideo.pageTexts[currentPreviewPage] || "";
                          setSearchQuery(pageText.split(" ").slice(0, 3).join(" "));
                          setIsImageDialogOpen(true);
                        }}
                      >
                        <Film className="mr-2 h-4 w-4" />
                        Trocar Vídeo
                      </Button>
                    )}
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        if (!selectedVideo) return;
                        const resetVideo: ClientVideo = {
                          ...selectedVideo,
                          adjustments: { ...defaultAdjustments },
                          pageTextAdjustments: selectedVideo.pageTexts.map(() => ({ ...defaultPageTextAdjustment })),
                          pageImageAdjustments: selectedVideo.pageTexts.map(() => ({ ...defaultPageImageAdjustment })),
                        };

                        selectedVideoRef.current = resetVideo;
                        setSelectedVideo(resetVideo);
                        setClientVideos((prev) =>
                          prev.map((v) =>
                            v.cardId === resetVideo.cardId
                              ? { 
                                  ...v, 
                                  adjustments: { ...defaultAdjustments },
                                  pageTextAdjustments: selectedVideo.pageTexts.map(() => ({ ...defaultPageTextAdjustment })),
                                  pageImageAdjustments: selectedVideo.pageTexts.map(() => ({ ...defaultPageImageAdjustment })),
                                }
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

      {/* Image Search Dialog */}
      <Dialog open={isImageDialogOpen} onOpenChange={(open) => {
        setIsImageDialogOpen(open);
        if (!open) setCustomImageUrl("");
      }}>
        <DialogContent className="max-w-3xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle>Trocar Vídeo da Página {currentPreviewPage + 1}</DialogTitle>
          </DialogHeader>

          <Tabs defaultValue="bank" className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="bank">
                <Search className="h-4 w-4 mr-2" />
                Banco de Vídeos
              </TabsTrigger>
              <TabsTrigger value="custom">
                <Upload className="h-4 w-4 mr-2" />
                Meu Arquivo
              </TabsTrigger>
            </TabsList>

            <TabsContent value="bank" className="space-y-4">
              <div className="flex gap-2">
                <Input
                  placeholder="Buscar vídeos..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleSearchImages()}
                />
                <Button onClick={handleSearchImages} disabled={isSearching}>
                  {isSearching ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Search className="h-4 w-4" />
                  )}
                </Button>
              </div>

              <ScrollArea className="h-[350px]">
                <div className="grid grid-cols-3 gap-2">
                  {searchResults.map((image) => (
                    <div
                      key={image.id}
                      className="aspect-[9/16] rounded-lg overflow-hidden cursor-pointer hover:ring-2 ring-primary transition-all relative"
                      onClick={() => handleSelectImage(image)}
                    >
                      <img
                        src={image.urls.small}
                        alt={image.description || "Video"}
                        className="w-full h-full object-cover"
                      />
                      <div className="absolute inset-0 flex items-center justify-center">
                        <Play className="h-8 w-8 text-white/80 drop-shadow-lg" />
                      </div>
                      <div className="absolute bottom-1 right-1 bg-background/80 text-[10px] px-1 rounded">
                        Pexels
                      </div>
                    </div>
                  ))}
                </div>
                {searchResults.length === 0 && (
                  <div className="text-center py-8 text-muted-foreground">
                    <p>Busque por vídeos acima</p>
                    <p className="text-xs mt-2">Digite um termo e clique em buscar</p>
                  </div>
                )}
              </ScrollArea>
            </TabsContent>

            <TabsContent value="custom" className="space-y-6" onPaste={(e) => {
              const items = e.clipboardData?.items;
              if (!items) return;
              for (const item of Array.from(items)) {
                if (item.type.startsWith("image/")) {
                  e.preventDefault();
                  const file = item.getAsFile();
                  if (!file) return;
                  const reader = new FileReader();
                  reader.onload = (ev) => {
                    const base64 = ev.target?.result as string;
                    applyCustomImage(base64);
                  };
                  reader.readAsDataURL(file);
                  return;
                }
              }
            }}>
              {/* Paste from clipboard */}
              <div className="space-y-3">
                <Label className="text-sm font-medium">Colar Imagem/Vídeo</Label>
                <Button
                  variant="outline"
                  className="w-full h-16 border-dashed"
                  onClick={async () => {
                    try {
                      const clipboardItems = await navigator.clipboard.read();
                      for (const item of clipboardItems) {
                        const imageType = item.types.find(t => t.startsWith("image/"));
                        if (imageType) {
                          const blob = await item.getType(imageType);
                          const reader = new FileReader();
                          reader.onload = (ev) => {
                            const base64 = ev.target?.result as string;
                            applyCustomImage(base64);
                          };
                          reader.readAsDataURL(blob);
                          return;
                        }
                      }
                      toast({ title: "Nenhuma imagem na área de transferência", variant: "destructive" });
                    } catch {
                      toast({ title: "Use Ctrl+V para colar a imagem aqui", description: "O navegador não permitiu acesso à área de transferência." });
                    }
                  }}
                >
                  <div className="flex flex-col items-center gap-1">
                    <ClipboardPaste className="h-5 w-5" />
                    <span className="text-xs">Clique ou pressione Ctrl+V para colar</span>
                  </div>
                </Button>
              </div>

              {/* File Upload */}
              <div className="space-y-3">
                <Label className="text-sm font-medium">Fazer Upload</Label>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*,video/*"
                  className="hidden"
                  onChange={handleCustomImageUpload}
                />
                <Button 
                  variant="outline" 
                  className="w-full h-16 border-dashed"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <div className="flex flex-col items-center gap-1">
                    <Upload className="h-5 w-5" />
                    <span className="text-xs">Clique para selecionar imagem ou vídeo</span>
                  </div>
                </Button>
              </div>

              {/* URL Paste */}
              <div className="space-y-3">
                <Label className="text-sm font-medium">Ou cole uma URL</Label>
                <div className="flex gap-2">
                  <Input
                    placeholder="https://exemplo.com/video.mp4"
                    value={customImageUrl}
                    onChange={(e) => setCustomImageUrl(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleCustomImageUrl()}
                  />
                  <Button onClick={handleCustomImageUrl} disabled={!customImageUrl.trim()}>
                    Aplicar
                  </Button>
                </div>
              </div>
            </TabsContent>
          </Tabs>
        </DialogContent>
      </Dialog>
      {/* Card cover animation styles */}
      <style>{`
        @keyframes kb { 0% { transform: translate3d(0,0,0) scale(1); } 25% { transform: translate3d(-1%,-1%,0) scale(1.05); } 50% { transform: translate3d(1%,1%,0) scale(1.08); } 75% { transform: translate3d(-1%,1%,0) scale(1.05); } 100% { transform: translate3d(0,0,0) scale(1); } }
        @keyframes kb-r { 0% { transform: translate3d(1%,1%,0) scale(1.08); } 50% { transform: translate3d(0,0,0) scale(1); } 100% { transform: translate3d(1%,1%,0) scale(1.08); } }
        @keyframes ps { 0%,100% { transform: translate3d(0,0,0) scale(1); } 50% { transform: translate3d(0,0,0) scale(1.02); } }
        @keyframes pst { 0%,100% { transform: translate3d(0,0,0) scale(1); } 50% { transform: translate3d(0,0,0) scale(1.08); } }
        @keyframes fl { 0%,100% { transform: translate3d(0,0,0); } 50% { transform: translate3d(0,-8px,0); } }
        @keyframes fld { 0%,100% { transform: translate3d(0,0,0); } 25% { transform: translate3d(5px,-5px,0); } 50% { transform: translate3d(0,-10px,0); } 75% { transform: translate3d(-5px,-5px,0); } }
        @keyframes sw { 0%,100% { transform: translate3d(0,0,0) rotate(-2deg); } 50% { transform: translate3d(0,0,0) rotate(2deg); } }
        @keyframes br { 0%,100% { transform: translate3d(0,0,0) scale(1); opacity:1; } 50% { transform: translate3d(0,0,0) scale(1.03); opacity:0.95; } }
        @keyframes dr { 0%,100% { transform: translate3d(0,0,0); } 25% { transform: translate3d(3px,-3px,0); } 50% { transform: translate3d(0,-5px,0); } 75% { transform: translate3d(-3px,-3px,0); } }
        @keyframes wb { 0%,100% { transform: translate3d(0,0,0) rotate(0) scale(1); } 15% { transform: translate3d(0,0,0) rotate(-3deg) scale(1.02); } 45% { transform: translate3d(0,0,0) rotate(-2deg) scale(1.01); } 75% { transform: translate3d(0,0,0) rotate(-1deg); } }
        @keyframes zp { 0%,100% { transform: translate3d(0,0,0) scale(1); } 50% { transform: translate3d(0,0,0) scale(1.05); } }
        @keyframes pl { 0% { transform: translate3d(3%,0,0); } 100% { transform: translate3d(-3%,0,0); } }
        @keyframes pr { 0% { transform: translate3d(-3%,0,0); } 100% { transform: translate3d(3%,0,0); } }
        @keyframes sks { 0%,100% { transform: translate3d(0,0,0); } 25% { transform: translate3d(-2px,0,0); } 75% { transform: translate3d(2px,0,0); } }
        @keyframes skst { 0%,100% { transform: translate3d(0,0,0); } 10%,30%,50%,70%,90% { transform: translate3d(-5px,0,0); } 20%,40%,60%,80% { transform: translate3d(5px,0,0); } }

        [class*="card-animate-"] {
          -webkit-backface-visibility: hidden;
          backface-visibility: hidden;
          will-change: transform;
          contain: layout style;
        }

        .card-animate-ken-burns { animation: kb 8s ease-in-out infinite; }
        .card-animate-ken-burns-reverse { animation: kb-r 8s ease-in-out infinite; }
        .card-animate-pulse { animation: ps 2s ease-in-out infinite; }
        .card-animate-pulse-strong { animation: pst 1.5s ease-in-out infinite; }
        .card-animate-float { animation: fl 3s ease-in-out infinite; }
        .card-animate-float-diagonal { animation: fld 4s ease-in-out infinite; }
        .card-animate-shake { animation: sks 0.5s ease-in-out infinite; }
        .card-animate-shake-strong { animation: skst 0.8s ease-in-out infinite; }
        .card-animate-sway { animation: sw 3s ease-in-out infinite; }
        .card-animate-breathe { animation: br 4s ease-in-out infinite; }
        .card-animate-drift { animation: dr 6s ease-in-out infinite; }
        .card-animate-wobble { animation: wb 2s ease-in-out infinite; }
        .card-animate-zoom-pulse { animation: zp 2s ease-in-out infinite; }
        .card-animate-pan-left { animation: pl 8s linear infinite alternate; }
        .card-animate-pan-right { animation: pr 8s linear infinite alternate; }

        @keyframes tfi { from { opacity:0; } to { opacity:1; } }
        @keyframes tsu { from { opacity:0; transform: translateY(30%); } to { opacity:1; transform: translateY(0); } }
        @keyframes tsd { from { opacity:0; transform: translateY(-30%); } to { opacity:1; transform: translateY(0); } }
        @keyframes tsl { from { opacity:0; transform: translateX(30%); } to { opacity:1; transform: translateX(0); } }
        @keyframes tsr { from { opacity:0; transform: translateX(-30%); } to { opacity:1; transform: translateX(0); } }
        @keyframes tsc { from { opacity:0; transform: scale(0.3); } to { opacity:1; transform: scale(1); } }
        @keyframes tbi { 0% { opacity:0; transform: scale(0.2) translateY(20%); } 40% { opacity:1; transform: scale(1.15); } 55% { transform: scale(0.9); } 70% { transform: scale(1.05); } 100% { opacity:1; transform: scale(1); } }
        @keyframes tri { from { opacity:0; transform: rotate(15deg) scale(0.7); } to { opacity:1; transform: rotate(0) scale(1); } }
        @keyframes tbli { from { opacity:0; filter: blur(20px); transform: scale(1.05); } to { opacity:1; filter: blur(0); transform: scale(1); } }
        @keyframes tdi { 0% { opacity:0; transform: translateY(-50%); } 40% { opacity:1; transform: translateY(0); } 55% { transform: translateY(-8%); } 70% { transform: translateY(0); } 80% { transform: translateY(-3%); } 100% { transform: translateY(0); } }
        @keyframes tswi { 0% { opacity:0; transform: translateX(-20%); } 20% { transform: translateX(15%); } 40% { transform: translateX(-10%); } 60% { transform: translateX(5%); } 80% { transform: translateX(-2%); } 100% { opacity:1; transform: translateX(0); } }
        @keyframes teli { 0% { opacity:0; transform: scale(0.3); } 30% { transform: scale(1.15); } 45% { transform: scale(0.85); } 60% { opacity:1; transform: scale(1.08); } 75% { transform: scale(0.95); } 100% { transform: scale(1); } }
        @keyframes tfli { 0% { opacity:0; transform: perspective(400px) rotateX(90deg) translateY(15%); } 40% { transform: perspective(400px) rotateX(-15deg); } 60% { opacity:1; transform: perspective(400px) rotateX(8deg); } 100% { transform: perspective(400px) rotateX(0) translateY(0); } }

        .card-animate-text-fade-in { animation: tfi ease-out forwards; }
        .card-animate-text-slide-up { animation: tsu ease-out forwards; }
        .card-animate-text-slide-down { animation: tsd ease-out forwards; }
        .card-animate-text-slide-left { animation: tsl ease-out forwards; }
        .card-animate-text-slide-right { animation: tsr ease-out forwards; }
        .card-animate-text-scale-in { animation: tsc ease-out forwards; }
        .card-animate-text-bounce-in { animation: tbi ease-out forwards; }
        .card-animate-text-rotate-in { animation: tri ease-out forwards; }
        .card-animate-text-blur-in { animation: tbli ease-out forwards; }
        .card-animate-text-drop-in { animation: tdi ease-out forwards; }
        .card-animate-text-swing-in { animation: tswi ease-out forwards; }
        .card-animate-text-elastic-in { animation: teli ease-out forwards; }
        .card-animate-text-flip-in { animation: tfli ease-out forwards; }

        @keyframes lfi { from { opacity:0; } to { opacity:1; } }
        @keyframes lsu { from { opacity:0; transform: translateY(20%); } to { opacity:1; transform: translateY(0); } }
        @keyframes lsd { from { opacity:0; transform: translateY(-20%); } to { opacity:1; transform: translateY(0); } }
        @keyframes lsl { from { opacity:0; transform: translateX(20%); } to { opacity:1; transform: translateX(0); } }
        @keyframes lsr { from { opacity:0; transform: translateX(-20%); } to { opacity:1; transform: translateX(0); } }
        @keyframes lsc { from { opacity:0; transform: scale(0.3); } to { opacity:1; transform: scale(1); } }
        @keyframes lbi { 0% { opacity:0; transform: scale(0.2); } 50% { opacity:1; transform: scale(1.15); } 100% { opacity:1; transform: scale(1); } }
        @keyframes lsi { from { opacity:0; transform: scale(0.3) rotate(360deg); } to { opacity:1; transform: scale(1) rotate(0); } }
        @keyframes lfli { 0% { opacity:0; transform: perspective(400px) rotateY(90deg); } 60% { opacity:1; transform: perspective(400px) rotateY(10deg); } 100% { opacity:1; transform: perspective(400px) rotateY(0); } }
        @keyframes lsw { 0% { opacity:0; transform: rotate(15deg); } 50% { opacity:1; transform: rotate(5deg); } 100% { opacity:1; transform: rotate(0); } }

        .card-animate-logo-fade-in { animation: lfi 0.9s ease-out forwards; }
        .card-animate-logo-slide-up { animation: lsu 0.9s ease-out forwards; }
        .card-animate-logo-slide-down { animation: lsd 0.9s ease-out forwards; }
        .card-animate-logo-slide-left { animation: lsl 0.9s ease-out forwards; }
        .card-animate-logo-slide-right { animation: lsr 0.9s ease-out forwards; }
        .card-animate-logo-scale-in { animation: lsc 0.9s ease-out forwards; }
        .card-animate-logo-bounce-in { animation: lbi 0.9s ease-out forwards; }
        .card-animate-logo-spin-in { animation: lsi 1s ease-out forwards; }
        .card-animate-logo-flip-in { animation: lfli 1s ease forwards; }
        .card-animate-logo-swing { animation: lsw 1s ease-out forwards; }
      `}</style>
    </div>
  );
};
