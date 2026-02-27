import { useState, useEffect, useRef, useCallback, memo, useMemo } from "react";
import { drawNewShape } from "@/lib/canvasShapes";
import {
  DndContext,
  DragEndEvent,
  PointerSensor,
  useSensor,
  useSensors,
  closestCenter,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  rectSortingStrategy,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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
  ClipboardCopy,
  Save,
  ChevronLeft,
  ChevronRight,
  MessageSquareWarning,
  GripVertical,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { getTaggedCardsForArtGeneration, createCardUpload, clearArtGenerationTags, updateProjectBrief, autoTagFirstCardsForAllActiveClients } from "@/lib/clientDatabase";
import { searchImages, SearchImage, searchPexelsVideos, searchVideos } from "@/lib/imageSearch";
import { supabase } from "@/integrations/supabase/client";
import { saveBatchGeneration, getBatchById, BatchItem, updateBatchItem, sanitizeBrandKitForStorage } from "@/lib/batchHistory";
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
  type: "rect" | "circle" | "text" | "image" | "logo" | "contact" | "mascot" | "triangle" | "line" | "star" | "diamond" | "hexagon" | "pentagon" | "polkaDots" | "dotsGrid" | "confetti" | "splatter" | "zigzag" | "spiral" | "wave" | "blob" | "arch" | "arrow" | "badge" | "ribbon" | "heart" | "cross" | "cloud" | "speechBubble" | "lightning" | "shield" | "crescent";
  x: number;
  y: number;
  width: number;
  height: number;
  color?: string;
  text?: string;
  fontSize?: number;
  textAlign?: "left" | "center" | "right";
  lineHeight?: number;
  imageUrl?: string;
  placeholder?: boolean;
  rotation?: number;
  colorRole?: "background" | "text" | "accessory1" | "accessory2";
  opacity?: number;
  borderRadius?: number;
  borderWidth?: number;
  borderColor?: string;
  borderColorRole?: "background" | "text" | "accessory1" | "accessory2";
  shadowBlur?: number;
  shadowColor?: string;
  shadowOffsetX?: number;
  shadowOffsetY?: number;
  clipShape?: "rect" | "circle" | "triangle" | "diamond" | "hexagon" | "pentagon" | "star";
  gradient?: {
    type: "linear" | "radial";
    color1: string;
    color2: string;
    opacity1?: number;
    opacity2?: number;
    angle?: number;
    fadeMode?: boolean;
    color1Role?: "background" | "text" | "accessory1" | "accessory2";
    color2Role?: "background" | "text" | "accessory1" | "accessory2";
  };
  animated?: boolean;
  animationType?: string;
  animDuration?: number;
  animLoop?: boolean;
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
  audioUrl1?: string;
  audioUrl2?: string;
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
  frameOverlayPages?: string[]; // Array of page images (base64) - decorative shapes AFTER image element (above video)
  preImageOverlayPages?: string[]; // Array of page images (base64) - decorative shapes BEFORE image element (below video)
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
  particularityType?: string;
  briefing?: string;
  hasMaterialUploads?: boolean;
  selectedAudio?: 1 | 2;
  note?: string;
  noteRead?: boolean;
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
// PRIMARY: fetch as blob (bypasses CORS, keeps canvas clean for toDataURL)
// FALLBACK: Image element with/without crossOrigin
const loadImage = async (url: string, retries = 2): Promise<HTMLImageElement | null> => {
  if (!url) return null;
  
  const cacheKey = url.length > 200 ? url.substring(0, 100) + url.length : url;
  const cached = imageCache.get(cacheKey);
  if (cached) return cached;
  
  // Data URIs: load directly
  if (url.startsWith("data:")) {
    const img = await new Promise<HTMLImageElement | null>((resolve) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => resolve(null);
      el.src = url;
    });
    if (img) imageCache.set(cacheKey, img);
    return img;
  }
  
  // Strategy 1 (PRIMARY): fetch → blob → objectURL (bypasses CORS entirely for canvas)
  for (let attempt = 0; attempt <= 1; attempt++) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15000);
      const response = await fetch(url, { signal: controller.signal });
      clearTimeout(timeout);
      if (response.ok) {
        const blob = await response.blob();
        const objectUrl = URL.createObjectURL(blob);
        const img = await new Promise<HTMLImageElement | null>((resolve) => {
          const el = new Image();
          el.onload = () => resolve(el);
          el.onerror = () => resolve(null);
          el.src = objectUrl;
        });
        if (img) {
          imageCache.set(cacheKey, img);
          console.log(`[loadImage] ✅ blob OK: ${url.substring(0, 80)}`);
          return img;
        }
      } else {
        console.warn(`[loadImage] fetch status ${response.status}: ${url.substring(0, 80)}`);
      }
    } catch (e) {
      console.warn(`[loadImage] fetch failed (attempt ${attempt + 1}): ${url.substring(0, 80)}`, e instanceof Error ? e.message : e);
    }
  }
  
  // Strategy 2: Image with crossOrigin (works if server sends CORS headers)
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const img = await new Promise<HTMLImageElement | null>((resolve) => {
        const el = new Image();
        el.crossOrigin = "anonymous";
        el.onload = () => resolve(el);
        el.onerror = () => resolve(null);
        el.src = url;
      });
      if (img) {
        imageCache.set(cacheKey, img);
        console.log(`[loadImage] ✅ CORS OK: ${url.substring(0, 80)}`);
        return img;
      }
    } catch (e) { /* retry */ }
  }
  
  // Strategy 3: Image without crossOrigin (canvas tainted but visible)
  const img = await new Promise<HTMLImageElement | null>((resolve) => {
    const el = new Image();
    el.onload = () => resolve(el);
    el.onerror = () => resolve(null);
    el.src = url;
  });
  if (img) {
    imageCache.set(cacheKey, img);
    console.warn(`[loadImage] ⚠️ no-CORS (tainted): ${url.substring(0, 80)}`);
    return img;
  }
  
  console.error(`[loadImage] ❌ ALL failed: ${url.substring(0, 80)}`);
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

// Compute image placeholder rect as percentage of template dimensions
const getImagePlaceholderRect = (elements: CanvasElement[], templateWidth: number, templateHeight: number) => {
  const imageEl = elements.find(e => e.type === "image");
  if (!imageEl) return null;
  return {
    left: (imageEl.x / templateWidth) * 100,
    top: (imageEl.y / templateHeight) * 100,
    width: (imageEl.width / templateWidth) * 100,
    height: (imageEl.height / templateHeight) * 100,
  };
};

// Get image element size in template coords for video transform calculations
const getImageElSize = (elements: CanvasElement[]) => {
  const imageEl = elements.find(e => e.type === "image");
  return imageEl ? { width: imageEl.width, height: imageEl.height } : null;
};

// Get clip shape from image element
const getImageClipShape = (elements: CanvasElement[]): string => {
  const imageEl = elements.find(e => e.type === "image");
  return imageEl?.clipShape || "rect";
};

// CSS clip-path for geometric shapes
const getCSSClipPath = (shape: string): string | undefined => {
  switch (shape) {
    case "circle": return "ellipse(50% 50% at 50% 50%)";
    case "triangle": return "polygon(50% 0%, 100% 100%, 0% 100%)";
    case "diamond": return "polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%)";
    case "hexagon": return "polygon(50% 0%, 93.3% 25%, 93.3% 75%, 50% 100%, 6.7% 75%, 6.7% 25%)";
    case "pentagon": return "polygon(50% 0%, 97.6% 34.5%, 79.4% 90.5%, 20.6% 90.5%, 2.4% 34.5%)";
    case "star": return "polygon(50% 0%, 61.8% 34.5%, 97.6% 34.5%, 69% 55.9%, 79.4% 90.5%, 50% 69%, 20.6% 90.5%, 31% 55.9%, 2.4% 34.5%, 38.2% 34.5%)";
    default: return undefined;
  }
};

// Card cover with auto page cycling
const CardCoverPreview = memo(({
  video,
  motionEffect,
  transitionEffect,
  textAnimation,
  logoAnimation,
  textAnimDuration = 1.5,
  shapeAnimation = "none",
  shapeAnimDuration = 2.5,
  pageDuration,
  onClick,
  imageRect,
  imageElSize,
  imageClipShape,
  templateWidth,
  templateHeight,
}: {
  video: ClientVideo;
  motionEffect: MotionEffect;
  transitionEffect: TransitionEffect;
  textAnimation: TextAnimation;
  logoAnimation: LogoAnimation;
  textAnimDuration?: number;
  shapeAnimation?: string;
  shapeAnimDuration?: number;
  pageDuration: number;
  onClick: () => void;
  imageRect?: { left: number; top: number; width: number; height: number } | null;
  imageElSize?: { width: number; height: number } | null;
  imageClipShape?: string;
  templateWidth?: number;
  templateHeight?: number;
}) => {
  const [currentPage, setCurrentPage] = useState(0);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [videoFailed, setVideoFailed] = useState<Record<number, boolean>>({});
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

  // Reset video failed state when video URLs change
  useEffect(() => {
    setVideoFailed({});
  }, [video.previewVideoUrls]);

  const isSignaturePage = currentPage === totalPages - 1 && totalPages > 1;
  const currentVideoUrl = video.previewVideoUrls?.[currentPage] || null;
  const fallbackVideoUrl = !isSignaturePage ? (video.previewVideoUrls?.find(v => v && v !== "") || null) : null;
  const activeVideoUrl = currentVideoUrl || fallbackVideoUrl;
  const hasVideo = !!activeVideoUrl && !videoFailed[currentPage];
  const overlayPage = video.overlayPages?.[currentPage];
  const frameOverlay = video.frameOverlayPages?.[currentPage];
  const preImageOverlay = video.preImageOverlayPages?.[currentPage];
  const logoOverlay = video.logoOverlayPages?.[currentPage];

  const transitionClass = isTransitioning ? "opacity-0" : "opacity-100";

  // Debug: log video state on mount and changes
  useEffect(() => {
    console.log(`[CardCover] ${video.clientName} page=${currentPage}: hasVideo=${hasVideo}, url=${activeVideoUrl?.substring(0, 80) || 'NONE'}, previewVideoUrls=`, video.previewVideoUrls, 'imageRect=', imageRect);
  }, [hasVideo, activeVideoUrl, currentPage, video.clientName]);

  return (
    <div
      className="bg-muted relative group cursor-pointer overflow-hidden"
      style={{ aspectRatio: `${templateWidth || 1080} / ${templateHeight || 1920}` }}
      onClick={onClick}
    >
      <div className={`absolute inset-0 overflow-hidden transition-opacity duration-300 ease-out ${transitionClass} ${motionEffect !== "none" ? `card-animate-${motionEffect}` : ""}`}>
        {/* Layer 0: Always render static page as base (z-0) */}
        {video.pages[currentPage] ? (
          <img
            key={`card-base-${video.cardId}-${currentPage}`}
            src={video.pages[currentPage]}
            alt={video.clientName}
            className="absolute inset-0 w-full h-full object-contain z-0"
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center z-0">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        )}

        {/* Layer 0.5: Pre-image overlay (shapes before image element, animated, below video) */}
        {preImageOverlay && preImageOverlay !== "" && (
          <img
            key={`pre-img-${video.cardId}-${currentPage}-${shapeAnimation}`}
            src={preImageOverlay}
            alt=""
            className={`absolute inset-0 w-full h-full object-contain z-[1] pointer-events-none ${shapeAnimation !== "none" ? `card-animate-${shapeAnimation}` : ""}`}
            style={shapeAnimation !== "none" ? { animationDuration: `${shapeAnimDuration}s` } : undefined}
            draggable={false}
          />
        )}

        {/* Layer 1: Video playing IN the image frame (z-[2]) */}
        {hasVideo && imageRect && (() => {
          const adj = video.pageImageAdjustments?.[currentPage];
          const videoTransform: React.CSSProperties = {};
          if (adj && imageElSize && (adj.imageScale !== 100 || adj.imageX !== 0 || adj.imageY !== 0)) {
            const scale = adj.imageScale / 100;
            const xPct = (adj.imageX / imageElSize.width) * 100;
            const yPct = (adj.imageY / imageElSize.height) * 100;
            videoTransform.transform = `scale(${scale}) translate(${xPct}%, ${yPct}%)`;
            videoTransform.transformOrigin = 'center center';
          }

          // Compute clip-path in CARD-relative coordinates (0-100%)
          // This avoids issues with containers extending beyond card boundaries
          const shape = imageClipShape || "rect";
          const cx = imageRect.left + imageRect.width / 2;
          const cy = imageRect.top + imageRect.height / 2;
          const rx = imageRect.width / 2;
          const ry = imageRect.height / 2;

          let cardClipPath: string | undefined;
          if (shape === "circle") {
            cardClipPath = `ellipse(${rx}% ${ry}% at ${cx}% ${cy}%)`;
          } else if (shape === "triangle") {
            const x1 = imageRect.left + imageRect.width / 2;
            const y1 = imageRect.top;
            const x2 = imageRect.left + imageRect.width;
            const y2 = imageRect.top + imageRect.height;
            const x3 = imageRect.left;
            const y3 = imageRect.top + imageRect.height;
            cardClipPath = `polygon(${x1}% ${y1}%, ${x2}% ${y2}%, ${x3}% ${y3}%)`;
          } else if (shape === "diamond") {
            cardClipPath = `polygon(${cx}% ${imageRect.top}%, ${imageRect.left + imageRect.width}% ${cy}%, ${cx}% ${imageRect.top + imageRect.height}%, ${imageRect.left}% ${cy}%)`;
          }
          // For "rect" and others, use overflow-hidden on the positioned container

          if (cardClipPath) {
            // Full-card container with clip-path in card-relative coords
            // NO overflow-hidden here — clip-path handles clipping; overflow-hidden would
            // cut off video parts positioned with negative offsets before clip-path applies
            return (
              <div
                className="absolute inset-0 z-[2]"
                style={{ clipPath: cardClipPath }}
              >
                <video
                  key={`card-vid-${video.cardId}-${activeVideoUrl}`}
                  src={activeVideoUrl!}
                  className="absolute object-cover"
                  style={{
                    left: `${imageRect.left}%`, top: `${imageRect.top}%`,
                    width: `${imageRect.width}%`, height: `${imageRect.height}%`,
                    ...videoTransform,
                  }}
                  muted
                  loop
                  autoPlay
                  playsInline
                  onError={() => {
                    console.error(`[CardCover] ❌ Video FAILED: ${activeVideoUrl?.substring(0, 80)}`);
                    setVideoFailed(prev => ({ ...prev, [currentPage]: true }));
                  }}
                  onLoadedData={() => {
                    console.log(`[CardCover] ✅ Video loaded OK: ${video.clientName}`);
                  }}
                />
              </div>
            );
          }

          // Fallback for rect: positioned container with overflow-hidden
          return (
            <div
              className="absolute overflow-hidden z-[2]"
              style={{
                left: `${imageRect.left}%`, top: `${imageRect.top}%`,
                width: `${imageRect.width}%`, height: `${imageRect.height}%`,
              }}
            >
              <video
                key={`card-vid-${video.cardId}-${activeVideoUrl}`}
                src={activeVideoUrl!}
                className="w-full h-full object-cover"
                style={videoTransform}
                muted
                loop
                autoPlay
                playsInline
                onError={() => {
                  console.error(`[CardCover] ❌ Video FAILED: ${activeVideoUrl?.substring(0, 80)}`);
                  setVideoFailed(prev => ({ ...prev, [currentPage]: true }));
                }}
                onLoadedData={() => {
                  console.log(`[CardCover] ✅ Video loaded OK: ${video.clientName}`);
                }}
              />
            </div>
          );
        })()}

        {/* Layer 3: Frame overlay (shapes AFTER image, with animation) - z-[3] */}
        {frameOverlay && frameOverlay !== "" && (
          <img
            key={`frame-${video.cardId}-${currentPage}-${shapeAnimation}`}
            src={frameOverlay}
            alt=""
            className={`absolute inset-0 w-full h-full object-contain z-[3] pointer-events-none ${shapeAnimation !== "none" ? `card-animate-${shapeAnimation}` : ""}`}
            style={shapeAnimation !== "none" ? { animationDuration: `${shapeAnimDuration}s` } : undefined}
            draggable={false}
          />
        )}

        {/* Layer 4: Text overlay (animated) - z-[4] */}
        {overlayPage && overlayPage !== "" && (
          <img
            key={`overlay-${video.cardId}-${currentPage}-${textAnimation}`}
            src={overlayPage}
            alt=""
            className={`absolute inset-0 w-full h-full object-contain z-[4] pointer-events-none ${textAnimation !== "none" ? `card-animate-text-${textAnimation}` : ""}`}
            style={{ animationDuration: `${textAnimDuration}s` }}
            draggable={false}
          />
        )}

        {/* Layer 5: Logo overlay (animated) - z-[5] */}
        {logoOverlay && logoOverlay !== "" && (
          <img
            key={`logo-${video.cardId}-${currentPage}-${logoAnimation}`}
            src={logoOverlay}
            alt=""
            className={`absolute inset-0 w-full h-full object-contain z-[5] pointer-events-none ${logoAnimation !== "none" ? `card-animate-logo-${logoAnimation}` : ""}`}
            draggable={false}
          />
        )}
      </div>

      {/* Page indicator with navigation arrows */}
      <div className="absolute bottom-2 left-1/2 -translate-x-1/2 bg-black/70 px-1.5 py-1 rounded text-xs text-white z-10 flex items-center gap-1.5">
        <button
          className="hover:text-primary transition-colors p-0.5"
          onClick={(e) => {
            e.stopPropagation();
            setIsTransitioning(true);
            setTimeout(() => {
              setCurrentPage((p) => (p - 1 + totalPages) % totalPages);
              setTimeout(() => setIsTransitioning(false), 100);
            }, 100);
          }}
        >
          <ChevronLeft className="h-3.5 w-3.5" />
        </button>
        <span>{currentPage + 1} / {totalPages}</span>
        <button
          className="hover:text-primary transition-colors p-0.5"
          onClick={(e) => {
            e.stopPropagation();
            setIsTransitioning(true);
            setTimeout(() => {
              setCurrentPage((p) => (p + 1) % totalPages);
              setTimeout(() => setIsTransitioning(false), 100);
            }, 100);
          }}
        >
          <ChevronRight className="h-3.5 w-3.5" />
        </button>
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
// Sortable wrapper for video cards
const SortableVideoCard = ({ id, status, children }: { id: string; status: string; children: React.ReactNode }) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };
  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`bg-card rounded-lg border overflow-hidden transition-all flex flex-col ${
        status === "approved"
          ? "border-green-500 ring-2 ring-green-500/30"
          : status === "rejected"
          ? "border-red-500 ring-2 ring-red-500/30"
          : "border-border"
      }`}
    >
      <div {...attributes} {...listeners} className="cursor-grab active:cursor-grabbing flex items-center justify-center py-1 hover:bg-muted/50 transition-colors">
        <GripVertical className="h-4 w-4 text-muted-foreground" />
      </div>
      {children}
    </div>
  );
};

export const BatchVideoGenerator = ({ template, initialTeamFilter, initialBatch, onBack, onComplete }: BatchVideoGeneratorProps) => {
  const [clientVideos, setClientVideos] = useState<ClientVideo[]>([]);
  const [currentBatchId, setCurrentBatchId] = useState<string | null>(initialBatch?.id || null);
  const [isLoading, setIsLoading] = useState(true);
  const [teamFilter, setTeamFilter] = useState<string | undefined>(initialTeamFilter);
  const [teams, setTeams] = useState<{ id: string; name: string }[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationStatus, setGenerationStatus] = useState<string>("");
  const [selectedVideo, setSelectedVideo] = useState<ClientVideo | null>(null);
  const [currentPreviewPage, setCurrentPreviewPage] = useState(0);
  const [isPlayingPreview, setIsPlayingPreview] = useState(false);
  const [activeDialogTab, setActiveDialogTab] = useState("adjust");
  const [isImageDialogOpen, setIsImageDialogOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchImage[]>([]);
  const [searchVideoUrlMap, setSearchVideoUrlMap] = useState<Record<string, string>>({});
  const [isSearching, setIsSearching] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [videoSearchPage, setVideoSearchPage] = useState(1);
  const [isApplyingAdjustments, setIsApplyingAdjustments] = useState(false);
  const [customImageUrl, setCustomImageUrl] = useState("");
  // Extract animation settings from template elements
  const getTemplateTextAnimation = (): TextAnimation => {
    const allEls = [...(template.contentElements || []), ...(template.signatureElements || [])];
    const textEl = allEls.find(e => (e.type === "text" || e.type === "contact") && e.animationType && e.animationType !== "none");
    return (textEl?.animationType as TextAnimation) || "none";
  };
  const getTemplateLogoAnimation = (): LogoAnimation => {
    const allEls = [...(template.contentElements || []), ...(template.signatureElements || [])];
    const logoEl = allEls.find(e => (e.type === "logo" || e.type === "mascot") && e.animationType && e.animationType !== "none");
    return (logoEl?.animationType as LogoAnimation) || "none";
  };
  const getTemplateTextAnimDuration = (): number => {
    const allEls = [...(template.contentElements || []), ...(template.signatureElements || [])];
    const textEl = allEls.find(e => (e.type === "text" || e.type === "contact") && e.animationType && e.animationType !== "none");
    return textEl?.animDuration || 2.5;
  };
  const getTemplateShapeAnimation = (): string => {
    const allEls = [...(template.contentElements || []), ...(template.signatureElements || [])];
    const shapeEl = allEls.find(e => !["text", "contact", "logo", "mascot", "image"].includes(e.type) && e.animationType && e.animationType !== "none");
    return shapeEl?.animationType || "none";
  };
  const getTemplateShapeAnimDuration = (): number => {
    const allEls = [...(template.contentElements || []), ...(template.signatureElements || [])];
    const shapeEl = allEls.find(e => !["text", "contact", "logo", "mascot", "image"].includes(e.type) && e.animationType && e.animationType !== "none");
    return shapeEl?.animDuration || 2.5;
  };

  const [motionEffect, setMotionEffect] = useState<MotionEffect>("ken-burns");
  const [transitionEffect, setTransitionEffect] = useState<TransitionEffect>("fade");
  const [textAnimation, setTextAnimation] = useState<TextAnimation>(getTemplateTextAnimation);
  const [logoAnimation, setLogoAnimation] = useState<LogoAnimation>(getTemplateLogoAnimation);
  const [textAnimDuration, setTextAnimDuration] = useState(getTemplateTextAnimDuration);
  const [shapeAnimation, setShapeAnimation] = useState<string>(getTemplateShapeAnimation);
  const [shapeAnimDuration, setShapeAnimDuration] = useState(getTemplateShapeAnimDuration);

  const selectedVideoRef = useRef<ClientVideo | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { toast } = useToast();

  // DnD for card reordering
  const dndSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  );
  const videoIds = useMemo(() => clientVideos.map((v, i) => `${v.cardId}-${i}`), [clientVideos]);
  const [cardTypeFilter, setCardTypeFilter] = useState<"all" | "post" | "carousel">("all");
  const filteredVideos = useMemo(() => {
    if (cardTypeFilter === "all") return clientVideos;
    if (cardTypeFilter === "post") return clientVideos.filter(v => v.pageTexts.length <= 1);
    return clientVideos.filter(v => v.pageTexts.length > 1);
  }, [clientVideos, cardTypeFilter]);
  const filteredVideoIds = useMemo(() => filteredVideos.map((v) => {
    const i = clientVideos.indexOf(v);
    return `${v.cardId}-${i}`;
  }), [filteredVideos, clientVideos]);
  const handleDndEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    setClientVideos((prev) => {
      const oldIndex = prev.findIndex((_, i) => `${prev[i].cardId}-${i}` === active.id);
      const newIndex = prev.findIndex((_, i) => `${prev[i].cardId}-${i}` === over.id);
      if (oldIndex === -1 || newIndex === -1) return prev;
      return arrayMove(prev, oldIndex, newIndex);
    });
  }, []);

  useEffect(() => {
    selectedVideoRef.current = selectedVideo;
  }, [selectedVideo]);

  useEffect(() => {
    // Load teams list
    supabase.from("teams").select("id, name").order("name").then(({ data }) => {
      if (data) setTeams(data);
    });
  }, []);

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
    // Don't auto-cycle pages when in adjust mode
    if (activeDialogTab === "adjust") return;

    const interval = window.setInterval(() => {
      setCurrentPreviewPage((p) => (p + 1) % selectedVideo.pages.length);
    }, 1000);

    return () => window.clearInterval(interval);
  }, [selectedVideo, isPlayingPreview, activeDialogTab]);

  const loadFromExistingBatch = async (batch: import("@/lib/batchHistory").BatchGeneration) => {
    try {
      setIsLoading(true);
      
      // The list query excludes heavy 'items' column, so fetch full batch data
      let batchItems = batch.items;
      if (!batchItems || batchItems.length === 0) {
        const { getBatchById } = await import("@/lib/batchHistory");
        const fullBatch = await getBatchById(batch.id);
        if (fullBatch) {
          batchItems = fullBatch.items;
        }
      }
      
      if (!batchItems || batchItems.length === 0) {
        toast({ title: "Lote sem itens", variant: "destructive" });
        setIsLoading(false);
        return;
      }
      
      const clientIds = [...new Set(batchItems.map(item => item.clientId))];

      // Only fetch image_type and particularity_type (lightweight)
      const { data: clientsData } = await supabase
        .from("client_data")
        .select("id, image_type, particularity_type")
        .in("id", clientIds);

      const imageTypeMap: Record<string, string> = {};
      const particularityMap: Record<string, string> = {};
      clientsData?.forEach(c => { 
        if (c.image_type) imageTypeMap[c.id] = c.image_type;
        if (c.particularity_type) particularityMap[c.id] = c.particularity_type;
      });

      const videos: ClientVideo[] = batchItems.map((item) => {
        // Use saved text/brandKit from the batch snapshot (preserve history as-is)
        const savedText = item.cardText || item.cardTitle;
        const textParts = savedText
          .split(";")
          .map((t: string) => t.trim())
          .filter((t: string) => t.length > 0);
        const pageTexts = textParts.length > 0 ? textParts : [savedText];

        // Restore saved pages (file URLs) from the batch items
        const savedPages = (item.files || []).map((url: string) => url);

        return {
          clientId: item.clientId,
          clientName: item.clientName,
          company: item.company,
          cardId: item.cardId,
          cardTitle: item.cardTitle,
          cardText: savedText,
          brandKit: item.brandKit,
          pages: savedPages,
          videoUrl: null,
          status: savedPages.length > 0 ? ("approved" as const) : ("pending" as const),
          pageTexts,
          searchedImages: item.backgroundImages,
          // Filter out blob: URLs — they only exist in the browser session that created them
          // and will fail on other computers. The auto-fetch logic below will re-fetch them.
          previewVideoUrls: item.previewVideoUrls
            ? item.previewVideoUrls.map((u: string | null) => u && !u.startsWith("blob:") ? u : null)
            : undefined,
          adjustments: item.adjustments ? { ...defaultAdjustments, ...item.adjustments } : { ...defaultAdjustments },
          pageTextAdjustments: item.pageTextAdjustments && item.pageTextAdjustments.length > 0
            ? item.pageTextAdjustments.map((a: any) => ({ ...defaultPageTextAdjustment, ...a }))
            : pageTexts.map(() => ({ ...defaultPageTextAdjustment })),
          pageImageAdjustments: item.pageImageAdjustments && item.pageImageAdjustments.length > 0
            ? item.pageImageAdjustments.map((a: any) => ({ ...defaultPageImageAdjustment, ...a }))
            : pageTexts.map(() => ({ ...defaultPageImageAdjustment })),
          imageType: imageTypeMap[item.clientId] || undefined,
          particularityType: particularityMap[item.clientId] || undefined,
          note: item.note,
          noteRead: item.noteRead,
        };
      });

      // Check which cards have material uploads
      if (videos.length > 0) {
        const cardIds = videos.map(v => v.cardId);
        const { data: uploads } = await supabase
          .from("card_uploads")
          .select("card_id")
          .in("card_id", cardIds)
          .eq("upload_type", "material");
        const cardsWithUploads = new Set((uploads || []).map(u => u.card_id));
        videos.forEach(v => {
          v.hasMaterialUploads = cardsWithUploads.has(v.cardId);
        });
      }

      setClientVideos(videos);

      // Regenerate overlay layers (text/logo/frame) using saved data
      // The base pages exclude text/logo (they're animated overlays), so we need to rebuild them
      setIsGenerating(true);
      setGenerationStatus("Reconstruindo camadas de texto...");
      try {
        const updatedVideos = [...videos];
        for (let i = 0; i < updatedVideos.length; i++) {
          const video = updatedVideos[i];
          setGenerationStatus(`Reconstruindo ${video.clientName}... (${i + 1}/${updatedVideos.length})`);
          const result = await regenerateSingleVideo(video);
          updatedVideos[i] = {
            ...video,
            pages: result.pages,
            overlayPages: result.overlayPages,
            frameOverlayPages: result.frameOverlayPages,
            preImageOverlayPages: result.preImageOverlayPages,
            logoOverlayPages: result.logoOverlayPages,
          };
          setClientVideos([...updatedVideos]);
        }

        // If any videos lack previewVideoUrls (old batches saved before this field existed),
        // auto-fetch from Pexels so previews show video instead of static images
        const videosNeedingFetch = updatedVideos.filter(v => !v.previewVideoUrls || v.previewVideoUrls.every(u => !u));
        if (videosNeedingFetch.length > 0) {
          setGenerationStatus("Buscando vídeos de fundo...");
          await autoFetchPexelsCovers(updatedVideos);
        }
      } finally {
        setIsGenerating(false);
        setGenerationStatus("");
      }
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

  const loadTaggedCards = async (filterOverride?: string) => {
    try {
      setIsLoading(true);
      
      const activeFilter = filterOverride !== undefined ? filterOverride : teamFilter;
      await autoTagFirstCardsForAllActiveClients(activeFilter || undefined);
      const taggedCards = await getTaggedCardsForArtGeneration();

      const videos: ClientVideo[] = taggedCards.map((card: any) => {
        const fullText = card.title || card.description;
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
          particularityType: card.client?.particularity_type || undefined,
          briefing: card.client?.briefing || undefined,
        };
      });

      // Check which cards have material uploads
      if (videos.length > 0) {
        const cardIds = videos.map(v => v.cardId);
        const { data: uploads } = await supabase
          .from("card_uploads")
          .select("card_id")
          .in("card_id", cardIds)
          .eq("upload_type", "material");
        const cardsWithUploads = new Set((uploads || []).map(u => u.card_id));
        videos.forEach(v => {
          v.hasMaterialUploads = cardsWithUploads.has(v.cardId);
        });
      }

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
      // Skip videos that already have valid previewVideoUrls (user-chosen videos)
      if (video.previewVideoUrls && video.previewVideoUrls.some(u => u && u !== "")) continue;
      // Combine ALL page texts, card title, imageType, briefing and company for a complete search query
      const allTexts = [...video.pageTexts, video.cardTitle, video.imageType, video.briefing, video.company].filter(Boolean).join(" ");
      const firstText = allTexts || "";
      if (!firstText) continue;
      try {
        const combinedText = firstText;
        let searchTerms = combinedText.split(" ").slice(0, 8).join(" ");
        try {
          const { data, error } = await Promise.race([
            supabase.functions.invoke("translate-text", { body: { text: combinedText } }),
            new Promise<never>((_, reject) => setTimeout(() => reject(new Error("Timeout")), 8000)),
          ]);
          if (!error && data?.translatedText) searchTerms = data.translatedText;
        } catch {}

        // Try search - fetch enough results for all content pages
        const contentPageCount = video.pageTexts.length;
        const fetchCount = Math.max(contentPageCount, 5);
        let results = await searchVideos(searchTerms, fetchCount);
        if (results.length === 0) {
          const simpleTerms = searchTerms.split(" ").slice(0, 2).join(" ");
          results = await searchVideos(simpleTerms, fetchCount);
        }
        if (results.length === 0) {
          results = await searchVideos("business technology", fetchCount);
        }

        if (results.length > 0) {
          // Assign different videos to each content page when possible
          const pexelsVideoUrls = video.pageTexts.map((_, pageIdx) => {
            const resultIdx = pageIdx % results.length;
            return results[resultIdx].videoUrl as string | null;
          });
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
    excludeText: boolean = false,
    shapeFilter: "all" | "before-image" | "after-image" = "all"
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

    // Helper to get border color based on borderColorRole
    const getBorderColor = (el: CanvasElement): string => {
      if (el.borderColorRole === "background") return bgColor;
      if (el.borderColorRole === "text") return textColor;
      if (el.borderColorRole === "accessory1") return accessoryColor1;
      if (el.borderColorRole === "accessory2") return accessoryColor2;
      return el.borderColor || "#000000";
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
          const cx = x + elW / 2;
          const cy = y + elH / 2;
          const dx = Math.cos(angle) * elW / 2;
          const dy = Math.sin(angle) * elH / 2;
          gradient = ctx.createLinearGradient(cx - dx, cy - dy, cx + dx, cy + dy);
        } else {
          gradient = ctx.createRadialGradient(
            x + elW / 2, y + elH / 2, 0,
            x + elW / 2, y + elH / 2, Math.max(elW, elH) / 2
          );
        }
        // Apply gradient color roles from brand kit, or use fixed colors
        const color1 = el.gradient.color1Role === "background" ? bgColor
          : el.gradient.color1Role === "text" ? textColor
          : el.gradient.color1Role === "accessory1" ? accessoryColor1
          : el.gradient.color1Role === "accessory2" ? accessoryColor2
          : el.gradient.color1;
        // In fade mode, color2 should match color1 (only opacity differs) to avoid color bleeding
        const color2Raw = el.gradient.color2Role === "background" ? bgColor
          : el.gradient.color2Role === "text" ? textColor
          : el.gradient.color2Role === "accessory1" ? accessoryColor1
          : el.gradient.color2Role === "accessory2" ? accessoryColor2
          : el.gradient.color2;
        const color2 = el.gradient.fadeMode ? color1 : color2Raw;
        const op1 = el.gradient.opacity1 ?? 100;
        const op2 = el.gradient.opacity2 ?? (el.gradient.fadeMode ? 0 : 100);
        gradient.addColorStop(0, hexToRgba(color1, op1));
        gradient.addColorStop(1, hexToRgba(color2, op2));
        return gradient;
      }
      return getElementColor(el, defaultColor);
    };

    // Helper to apply element styles (opacity, shadow)
    const applyElementStyles = (el: CanvasElement) => {
      // For fadeMode on the transparent overlay: use globalAlpha=1 so the solid end
      // fully blocks the video underneath, matching the template where the solid end
      // blends with the same-color background and appears fully opaque.
      // The gradient stops already encode their own alpha transition (opacity1→opacity2).
      if (el.gradient?.fadeMode && transparentBackground) {
        ctx.globalAlpha = 1;
      } else {
        ctx.globalAlpha = (el.opacity ?? 100) / 100;
      }
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

    // Background image drawing is deferred to the elements loop (when el.type === "image" is encountered)
    // to respect z-order. This prevents shapes below the image from being covered.

    // Find image element index for shapeFilter
    const imageElIndex = elements.findIndex(e => e.type === "image");

    // Draw elements
    for (let elIdx = 0; elIdx < elements.length; elIdx++) {
      const el = elements[elIdx];
      const isAnimated = el.animated !== false; // default true

      // shapeFilter: skip elements based on their position relative to the image element
      if (shapeFilter === "before-image" && imageElIndex >= 0) {
        // Only render shapes BEFORE the image element
        if (elIdx >= imageElIndex) continue;
      } else if (shapeFilter === "after-image" && imageElIndex >= 0) {
        // Only render shapes AFTER the image element (skip image itself and everything before)
        if (elIdx <= imageElIndex) continue;
      }
      // Skip logo/mascot if excludeLogo is set AND element is animated (non-animated logos/mascots stay on base)
      if (excludeLogo && (el.type === "logo" || el.type === "mascot") && isAnimated) continue;
      // Skip text/contact if excludeText is set AND element is animated (non-animated text stays on base)
      if (excludeText && ["text", "contact"].includes(el.type) && isAnimated) continue;
      // FadeMode gradient shapes render ONLY on frame overlay (transparent), not on base page.
      // This ensures the fade reveals the video behind it, matching the intended compositing.
      if (!transparentBackground && el.gradient?.fadeMode) continue;
      // For text-only overlay (transparent + !excludeText): only render animated text/contact
      if (transparentBackground && !excludeText) {
        if (!["text", "contact"].includes(el.type)) continue;
        if (!isAnimated) continue; // Non-animated text stays on base, not on animated overlay
      }
      // For frame-only overlay: render only truly animated shapes, fadeMode gradients, and image borders
      if (transparentBackground && excludeText) {
        // Skip non-visual elements
        if (["text", "contact", "logo", "mascot"].includes(el.type)) continue;
        // Only render elements that are TRULY animated (have explicit animationType) or have fadeMode gradient
        // Elements without animationType are static shapes that belong on the base layer
        const hasTrueAnimation = el.animationType && el.animationType !== "none";
        if (!hasTrueAnimation && !el.gradient?.fadeMode) continue;
        
        // For image elements, draw just the border
        if (el.type === "image") {
          if (el.borderWidth && el.borderWidth > 0) {
            ctx.save();
            applyElementStyles(el);
            if (el.rotation) {
              const cx = el.x + el.width / 2;
              const cy = el.y + el.height / 2;
              ctx.translate(cx, cy);
              ctx.rotate((el.rotation * Math.PI) / 180);
              ctx.translate(-cx, -cy);
            }
            ctx.globalAlpha = 1;
            ctx.strokeStyle = getBorderColor(el);
            ctx.lineWidth = el.borderWidth;
            const shape = el.clipShape || "rect";
            ctx.beginPath();
            if (shape === "circle") {
              ctx.ellipse(el.x + el.width / 2, el.y + el.height / 2, el.width / 2, el.height / 2, 0, 0, Math.PI * 2);
            } else if (shape === "triangle") {
              ctx.moveTo(el.x + el.width / 2, el.y);
              ctx.lineTo(el.x + el.width, el.y + el.height);
              ctx.lineTo(el.x, el.y + el.height);
              ctx.closePath();
            } else if (shape === "diamond") {
              ctx.moveTo(el.x + el.width / 2, el.y);
              ctx.lineTo(el.x + el.width, el.y + el.height / 2);
              ctx.lineTo(el.x + el.width / 2, el.y + el.height);
              ctx.lineTo(el.x, el.y + el.height / 2);
              ctx.closePath();
            } else if (shape === "hexagon") {
              const hcx = el.x + el.width / 2, hcy = el.y + el.height / 2, hr = Math.min(el.width, el.height) / 2;
              for (let i = 0; i < 6; i++) { const a = (Math.PI / 3) * i - Math.PI / 2; if (i === 0) ctx.moveTo(hcx + hr * Math.cos(a), hcy + hr * Math.sin(a)); else ctx.lineTo(hcx + hr * Math.cos(a), hcy + hr * Math.sin(a)); }
              ctx.closePath();
            } else if (shape === "pentagon") {
              const pcx = el.x + el.width / 2, pcy = el.y + el.height / 2, pr = Math.min(el.width, el.height) / 2;
              for (let i = 0; i < 5; i++) { const a = (Math.PI * 2 / 5) * i - Math.PI / 2; if (i === 0) ctx.moveTo(pcx + pr * Math.cos(a), pcy + pr * Math.sin(a)); else ctx.lineTo(pcx + pr * Math.cos(a), pcy + pr * Math.sin(a)); }
              ctx.closePath();
            } else if (shape === "star") {
              const scx = el.x + el.width / 2, scy = el.y + el.height / 2;
              const outerR = Math.min(el.width, el.height) / 2, innerR = outerR * 0.4;
              for (let i = 0; i < 10; i++) { const a = (Math.PI / 5) * i - Math.PI / 2; const r = i % 2 === 0 ? outerR : innerR; if (i === 0) ctx.moveTo(scx + r * Math.cos(a), scy + r * Math.sin(a)); else ctx.lineTo(scx + r * Math.cos(a), scy + r * Math.sin(a)); }
              ctx.closePath();
            } else {
              if (el.borderRadius && el.borderRadius > 0) {
                ctx.roundRect(el.x, el.y, el.width, el.height, el.borderRadius);
              } else {
                ctx.rect(el.x, el.y, el.width, el.height);
              }
            }
            ctx.stroke();
            ctx.restore();
          }
          continue;
        }
        
        // For shape elements (rect, circle, triangle, etc.), render them fully on the frame overlay
        // so they appear on top of the video background
        // Fall through to normal rendering below
      }
      // For text-only overlay: skip image and shape elements
      if (transparentBackground && !excludeText && !["text", "contact"].includes(el.type)) continue;

      // Draw background image at the image element's z-position (respects layer order)
      if (el.type === "image" && !transparentBackground && backgroundImage) {
        const bgImg = await loadImage(backgroundImage);
        if (bgImg) {
          const destX = el.x;
          const destY = el.y;
          const destW = el.width;
          const destH = el.height;

          const scale = imageAdjustment.imageScale / 100;
          const imgAspect = bgImg.width / bgImg.height;
          const destAspect = destW / destH;
          let drawWidth, drawHeight, drawX, drawY;

          if (imgAspect > destAspect) {
            drawHeight = destH * scale;
            drawWidth = drawHeight * imgAspect;
            drawX = destX + (destW - drawWidth) / 2 + imageAdjustment.imageX;
            drawY = destY + (destH - drawHeight) / 2 + imageAdjustment.imageY;
          } else {
            drawWidth = destW * scale;
            drawHeight = drawWidth / imgAspect;
            drawX = destX + (destW - drawWidth) / 2 + imageAdjustment.imageX;
            drawY = destY + (destH - drawHeight) / 2 + imageAdjustment.imageY;
          }

          ctx.save();
          ctx.beginPath();
          const clipShape = el.clipShape || "rect";
          if (clipShape === "circle") {
            ctx.ellipse(destX + destW / 2, destY + destH / 2, destW / 2, destH / 2, 0, 0, Math.PI * 2);
          } else if (clipShape === "triangle") {
            ctx.moveTo(destX + destW / 2, destY);
            ctx.lineTo(destX + destW, destY + destH);
            ctx.lineTo(destX, destY + destH);
            ctx.closePath();
          } else if (clipShape === "diamond") {
            ctx.moveTo(destX + destW / 2, destY);
            ctx.lineTo(destX + destW, destY + destH / 2);
            ctx.lineTo(destX + destW / 2, destY + destH);
            ctx.lineTo(destX, destY + destH / 2);
            ctx.closePath();
          } else if (clipShape === "hexagon") {
            const hcx = destX + destW / 2, hcy = destY + destH / 2, hr = Math.min(destW, destH) / 2;
            for (let i = 0; i < 6; i++) { const a = (Math.PI / 3) * i - Math.PI / 2; if (i === 0) ctx.moveTo(hcx + hr * Math.cos(a), hcy + hr * Math.sin(a)); else ctx.lineTo(hcx + hr * Math.cos(a), hcy + hr * Math.sin(a)); }
            ctx.closePath();
          } else if (clipShape === "pentagon") {
            const pcx = destX + destW / 2, pcy = destY + destH / 2, pr = Math.min(destW, destH) / 2;
            for (let i = 0; i < 5; i++) { const a = (Math.PI * 2 / 5) * i - Math.PI / 2; if (i === 0) ctx.moveTo(pcx + pr * Math.cos(a), pcy + pr * Math.sin(a)); else ctx.lineTo(pcx + pr * Math.cos(a), pcy + pr * Math.sin(a)); }
            ctx.closePath();
          } else if (clipShape === "star") {
            const scx = destX + destW / 2, scy = destY + destH / 2;
            const outerR = Math.min(destW, destH) / 2, innerR = outerR * 0.4;
            for (let i = 0; i < 10; i++) { const a = (Math.PI / 5) * i - Math.PI / 2; const r = i % 2 === 0 ? outerR : innerR; if (i === 0) ctx.moveTo(scx + r * Math.cos(a), scy + r * Math.sin(a)); else ctx.lineTo(scx + r * Math.cos(a), scy + r * Math.sin(a)); }
            ctx.closePath();
          } else {
            ctx.rect(destX, destY, destW, destH);
          }
          ctx.clip();
          ctx.drawImage(bgImg, drawX, drawY, drawWidth, drawHeight);
          ctx.restore();
        }
        continue;
      } else if (el.type === "image") {
        continue;
      }

      ctx.save();
      applyElementStyles(el);
      
      // Apply rotation
      if (el.rotation) {
        const cx = el.x + el.width / 2;
        const cy = el.y + el.height / 2;
        ctx.translate(cx, cy);
        ctx.rotate((el.rotation * Math.PI) / 180);
        ctx.translate(-cx, -cy);
      }
      
      if (el.type === "rect") {
        ctx.fillStyle = getElementFillStyle(el, el.x, el.y, el.width, el.height, accessoryColor1);
        if (el.borderRadius && el.borderRadius > 0) {
          ctx.beginPath();
          ctx.roundRect(el.x, el.y, el.width, el.height, el.borderRadius);
          ctx.fill();
        } else {
          ctx.fillRect(el.x, el.y, el.width, el.height);
        }
        if (el.borderWidth && el.borderWidth > 0) { ctx.globalAlpha = 1; ctx.strokeStyle = getBorderColor(el); ctx.lineWidth = el.borderWidth; ctx.stroke(); }
      } else if (el.type === "circle") {
        ctx.fillStyle = getElementFillStyle(el, el.x, el.y, el.width, el.height, accessoryColor2);
        ctx.beginPath();
        ctx.ellipse(el.x + el.width / 2, el.y + el.height / 2, el.width / 2, el.height / 2, 0, 0, Math.PI * 2);
        ctx.fill();
        if (el.borderWidth && el.borderWidth > 0) { ctx.globalAlpha = 1; ctx.strokeStyle = getBorderColor(el); ctx.lineWidth = el.borderWidth; ctx.stroke(); }
      } else if (el.type === "triangle") {
        ctx.fillStyle = getElementFillStyle(el, el.x, el.y, el.width, el.height, accessoryColor1);
        ctx.beginPath();
        ctx.moveTo(el.x + el.width / 2, el.y);
        ctx.lineTo(el.x + el.width, el.y + el.height);
        ctx.lineTo(el.x, el.y + el.height);
        ctx.closePath();
        ctx.fill();
        if (el.borderWidth && el.borderWidth > 0) { ctx.globalAlpha = 1; ctx.strokeStyle = getBorderColor(el); ctx.lineWidth = el.borderWidth; ctx.stroke(); }
      } else if (el.type === "diamond") {
        ctx.fillStyle = getElementFillStyle(el, el.x, el.y, el.width, el.height, accessoryColor1);
        ctx.beginPath();
        ctx.moveTo(el.x + el.width / 2, el.y);
        ctx.lineTo(el.x + el.width, el.y + el.height / 2);
        ctx.lineTo(el.x + el.width / 2, el.y + el.height);
        ctx.lineTo(el.x, el.y + el.height / 2);
        ctx.closePath();
        ctx.fill();
        if (el.borderWidth && el.borderWidth > 0) { ctx.globalAlpha = 1; ctx.strokeStyle = getBorderColor(el); ctx.lineWidth = el.borderWidth; ctx.stroke(); }
      } else if (el.type === "hexagon") {
        ctx.fillStyle = getElementFillStyle(el, el.x, el.y, el.width, el.height, accessoryColor1);
        const hcx = el.x + el.width / 2, hcy = el.y + el.height / 2, hr = Math.min(el.width, el.height) / 2;
        ctx.beginPath();
        for (let i = 0; i < 6; i++) { const a = (Math.PI / 3) * i - Math.PI / 2; if (i === 0) ctx.moveTo(hcx + hr * Math.cos(a), hcy + hr * Math.sin(a)); else ctx.lineTo(hcx + hr * Math.cos(a), hcy + hr * Math.sin(a)); }
        ctx.closePath();
        ctx.fill();
        if (el.borderWidth && el.borderWidth > 0) { ctx.globalAlpha = 1; ctx.strokeStyle = getBorderColor(el); ctx.lineWidth = el.borderWidth; ctx.stroke(); }
      } else if (el.type === "pentagon") {
        ctx.fillStyle = getElementFillStyle(el, el.x, el.y, el.width, el.height, accessoryColor1);
        const pcx = el.x + el.width / 2, pcy = el.y + el.height / 2, pr = Math.min(el.width, el.height) / 2;
        ctx.beginPath();
        for (let i = 0; i < 5; i++) { const a = (Math.PI * 2 / 5) * i - Math.PI / 2; if (i === 0) ctx.moveTo(pcx + pr * Math.cos(a), pcy + pr * Math.sin(a)); else ctx.lineTo(pcx + pr * Math.cos(a), pcy + pr * Math.sin(a)); }
        ctx.closePath();
        ctx.fill();
        if (el.borderWidth && el.borderWidth > 0) { ctx.globalAlpha = 1; ctx.strokeStyle = getBorderColor(el); ctx.lineWidth = el.borderWidth; ctx.stroke(); }
      } else if (el.type === "star") {
        ctx.fillStyle = getElementFillStyle(el, el.x, el.y, el.width, el.height, accessoryColor2);
        const scx = el.x + el.width / 2, scy = el.y + el.height / 2;
        const outerR = Math.min(el.width, el.height) / 2, innerR = outerR * 0.4;
        ctx.beginPath();
        for (let i = 0; i < 10; i++) { const a = (Math.PI / 5) * i - Math.PI / 2; const r = i % 2 === 0 ? outerR : innerR; if (i === 0) ctx.moveTo(scx + r * Math.cos(a), scy + r * Math.sin(a)); else ctx.lineTo(scx + r * Math.cos(a), scy + r * Math.sin(a)); }
        ctx.closePath();
        ctx.fill();
        if (el.borderWidth && el.borderWidth > 0) { ctx.globalAlpha = 1; ctx.strokeStyle = getBorderColor(el); ctx.lineWidth = el.borderWidth; ctx.stroke(); }
      } else if (el.type === "line") {
        ctx.strokeStyle = getElementColor(el, accessoryColor1);
        ctx.lineWidth = el.height || 4;
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(el.x, el.y + el.height / 2);
        ctx.lineTo(el.x + el.width, el.y + el.height / 2);
        ctx.stroke();
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
      } else if (drawNewShape(ctx, el.type, el.x, el.y, el.width, el.height, ctx.fillStyle as string)) {
        // New shape drawn by helper
      } else if (el.type === "text") {
        ctx.fillStyle = textColor;
        const baseFontSize = el.fontSize || 48;
        const fontSize = Math.round(baseFontSize * (textAdjustment.textScale / 100));
        const fontFamily = brandKit?.font || brandKit?.fontFamily || "Arial";
        ctx.font = `${fontSize}px ${fontFamily}`;
        
        // Use card text for content pages, placeholder for signature
        const displayText = isSignature ? (el.text || "") : text;
        
        // Text alignment
        const align = el.textAlign || "left";
        ctx.textAlign = align;
        
        // Word wrap with adjusted position
        const adjustedX = el.x + textAdjustment.textX;
        const adjustedY = el.y + textAdjustment.textY;
        const drawX = align === "center" ? adjustedX + (el.width || 800) / 2 : align === "right" ? adjustedX + (el.width || 800) : adjustedX;
        const words = displayText.split(" ");
        let line = "";
        let y = adjustedY + fontSize;
        const maxWidth = el.width || 800;
        const lineHeight = (el.lineHeight || 1.3) * fontSize;
        
        for (let i = 0; i < words.length; i++) {
          const testLine = line + words[i] + " ";
          const metrics = ctx.measureText(testLine);
          if (metrics.width > maxWidth && i > 0) {
            ctx.fillText(line.trim(), drawX, y);
            line = words[i] + " ";
            y += lineHeight;
          } else {
            line = testLine;
          }
        }
        ctx.fillText(line.trim(), drawX, y);
        ctx.textAlign = "left";
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

    try {
      return canvas.toDataURL("image/png");
    } catch (e) {
      console.error(`[generatePageImage] canvas.toDataURL FAILED (tainted canvas?):`, e);
      // If tainted, redraw without the external image
      if (backgroundImage) {
        const canvas2 = document.createElement("canvas");
        canvas2.width = w;
        canvas2.height = h;
        const ctx2 = canvas2.getContext("2d")!;
        ctx2.fillStyle = bgColor;
        ctx2.fillRect(0, 0, w, h);
        // Draw a placeholder indicator
        const imageEl = elements.find(e => e.type === "image");
        if (imageEl) {
          ctx2.fillStyle = "rgba(100, 100, 255, 0.3)";
          ctx2.fillRect(imageEl.x, imageEl.y, imageEl.width, imageEl.height);
          ctx2.fillStyle = "#fff";
          ctx2.font = "24px Arial";
          ctx2.fillText("⚠ Imagem CORS", imageEl.x + 10, imageEl.y + imageEl.height / 2);
        }
        return canvas2.toDataURL("image/png");
      }
      return "";
    }
  };

  // Generate a logo+mascot overlay (transparent PNG with logo and mascot elements)
  const generateLogoOverlay = async (
    elements: CanvasElement[],
    brandKit: any,
    isSignature: boolean,
    adjustments: ElementAdjustments = defaultAdjustments
  ): Promise<string> => {
    const logoEl = elements.find((e) => e.type === "logo");
    const mascotEl = elements.find((e) => e.type === "mascot");
    
    if (!logoEl && !mascotEl) {
      console.warn(`[generateLogoOverlay] No logo or mascot element found in ${isSignature ? 'signature' : 'content'} elements`);
      return "";
    }

    // If both logo and mascot are non-animated, skip overlay
    const logoAnimated = logoEl ? logoEl.animated !== false : false;
    const mascotAnimated = mascotEl ? mascotEl.animated !== false : false;
    if (!logoAnimated && !mascotAnimated) return "";

    const canvas = document.createElement("canvas");
    canvas.width = template.width || 1080;
    canvas.height = template.height || 1920;
    const ctx = canvas.getContext("2d")!;
    // transparent background

    // Draw logo if present and animated
    if (logoEl && logoAnimated) {
      const logoUrl = brandKit?.pngs?.[0] || brandKit?.logo;
      if (logoUrl) {
        const img = await loadImage(logoUrl);
        if (img) {
          const logoX = isSignature ? (adjustments.sigLogoX ?? adjustments.logoX) : adjustments.logoX;
          const logoY = isSignature ? (adjustments.sigLogoY ?? adjustments.logoY) : adjustments.logoY;
          const logoScaleX = isSignature ? (adjustments.sigLogoScaleX ?? adjustments.logoScaleX) : adjustments.logoScaleX;
          const logoScaleY = isSignature ? (adjustments.sigLogoScaleY ?? adjustments.logoScaleY) : adjustments.logoScaleY;
          const adjustedX = logoEl.x + logoX;
          const adjustedY = logoEl.y + logoY;
          const adjustedW = logoEl.width * (logoScaleX / 100);
          const adjustedH = logoEl.height * (logoScaleY / 100);
          ctx.drawImage(img, adjustedX, adjustedY, adjustedW, adjustedH);
        }
      }
    }

    // Draw mascot if present and animated
    if (mascotEl && mascotAnimated) {
      const mascotUrl = brandKit?.pngs?.[2] || brandKit?.mascot;
      if (mascotUrl) {
        const img = await loadImage(mascotUrl);
        if (img) {
          const mascotX = isSignature ? (adjustments.sigMascotX ?? adjustments.mascotX) : adjustments.mascotX;
          const mascotY = isSignature ? (adjustments.sigMascotY ?? adjustments.mascotY) : adjustments.mascotY;
          const mascotScaleX = isSignature ? (adjustments.sigMascotScaleX ?? adjustments.mascotScaleX) : adjustments.mascotScaleX;
          const mascotScaleY = isSignature ? (adjustments.sigMascotScaleY ?? adjustments.mascotScaleY) : adjustments.mascotScaleY;
          const adjustedX = mascotEl.x + mascotX;
          const adjustedY = mascotEl.y + mascotY;
          const adjustedW = mascotEl.width * (mascotScaleX / 100);
          const adjustedH = mascotEl.height * (mascotScaleY / 100);
          ctx.drawImage(img, adjustedX, adjustedY, adjustedW, adjustedH);
        }
      }
    }

    return canvas.toDataURL("image/png");
  };

  const generateVideoForClient = async (video: ClientVideo, searchedImages: string[], videoUrls?: (string | null)[]): Promise<{ pages: string[]; overlayPages: string[]; frameOverlayPages: string[]; preImageOverlayPages: string[]; logoOverlayPages: string[] }> => {
    const pages: string[] = [];
    const overlayPages: string[] = [];
    const preImageOverlayPages: string[] = [];
    const frameOverlayPages: string[] = [];
    const logoOverlayPages: string[] = [];

    for (let i = 0; i < video.pageTexts.length; i++) {
      const text = video.pageTexts[i];
      const bgImage = searchedImages[i] || undefined;
      const textAdj = video.pageTextAdjustments[i] || defaultPageTextAdjustment;
      const imageAdj = video.pageImageAdjustments[i] || defaultPageImageAdjustment;

      // Base page: exclude text and logo since they come from animated overlay layers
      const pageImage = await generatePageImage(
        template.contentElements, text, video.brandKit, false, bgImage,
        video.adjustments, textAdj, imageAdj, false, true, true
      );
      pages.push(pageImage);

      // Text-only overlay (animated)
      const overlayImage = await generatePageImage(
        template.contentElements, text, video.brandKit, false, undefined,
        video.adjustments, textAdj, imageAdj, true, true, false
      );
      overlayPages.push(overlayImage);

      // Pre-image overlay (shapes BEFORE image element, below video)
      const preImageOverlay = await generatePageImage(
        template.contentElements, "", video.brandKit, false, undefined,
        video.adjustments, textAdj, imageAdj, true, true, true, "before-image"
      );
      preImageOverlayPages.push(preImageOverlay);

      // Frame-only overlay (shapes AFTER image element, above video)
      const frameOverlay = await generatePageImage(
        template.contentElements, "", video.brandKit, false, undefined,
        video.adjustments, textAdj, imageAdj, true, true, true, "after-image"
      );
      frameOverlayPages.push(frameOverlay);

      const logoOverlay = await generateLogoOverlay(
        template.contentElements, video.brandKit, false, video.adjustments
      );
      logoOverlayPages.push(logoOverlay);
    }

    // Signature base: exclude logo since it comes from the logo overlay layer
    const signaturePage = await generatePageImage(
      template.signatureElements, "", video.brandKit, true, undefined,
      video.adjustments, defaultPageTextAdjustment, defaultPageImageAdjustment, false, true, true
    );
    pages.push(signaturePage);
    // Text overlay for signature page (contact info, etc.)
    const sigTextOverlay = await generatePageImage(
      template.signatureElements, "", video.brandKit, true, undefined,
      video.adjustments, defaultPageTextAdjustment, defaultPageImageAdjustment, true, true, false
    );
    overlayPages.push(sigTextOverlay);
    // Pre-image overlay for signature (usually empty since sig pages rarely have image elements)
    const sigPreImgOverlay = await generatePageImage(
      template.signatureElements, "", video.brandKit, true, undefined,
      video.adjustments, defaultPageTextAdjustment, defaultPageImageAdjustment, true, true, true, "before-image"
    );
    preImageOverlayPages.push(sigPreImgOverlay);
    // Frame overlay for signature
    const sigFrameOverlay = await generatePageImage(
      template.signatureElements, "", video.brandKit, true, undefined,
      video.adjustments, defaultPageTextAdjustment, defaultPageImageAdjustment, true, true, true, "after-image"
    );
    frameOverlayPages.push(sigFrameOverlay);
    // Generate logo overlay for signature page using signatureElements
    const sigLogoOverlay = await generateLogoOverlay(
      template.signatureElements, video.brandKit, true, video.adjustments
    );
    logoOverlayPages.push(sigLogoOverlay);

    return { pages, overlayPages, frameOverlayPages, preImageOverlayPages, logoOverlayPages };
  };

  const regenerateSingleVideo = async (video: ClientVideo): Promise<{ pages: string[]; overlayPages: string[]; frameOverlayPages: string[]; preImageOverlayPages: string[]; logoOverlayPages: string[] }> => {
    const pages: string[] = [];
    const overlayPages: string[] = [];
    const frameOverlayPages: string[] = [];
    const preImageOverlayPages: string[] = [];
    const logoOverlayPages: string[] = [];

    for (let i = 0; i < video.pageTexts.length; i++) {
      const text = video.pageTexts[i];
      const bgImage = video.searchedImages?.[i] || undefined;
      const textAdj = video.pageTextAdjustments[i] || defaultPageTextAdjustment;
      const imageAdj = video.pageImageAdjustments[i] || defaultPageImageAdjustment;

      // Base page: exclude text and logo since they come from animated overlay layers
      const pageImage = await generatePageImage(
        template.contentElements, text, video.brandKit, false, bgImage,
        video.adjustments, textAdj, imageAdj, false, true, true
      );
      pages.push(pageImage);

      // Text-only overlay
      const overlayImage = await generatePageImage(
        template.contentElements, text, video.brandKit, false, undefined,
        video.adjustments, textAdj, imageAdj, true, true, false
      );
      overlayPages.push(overlayImage);

      // Pre-image overlay (shapes BEFORE image element)
      const preImgOverlay = await generatePageImage(
        template.contentElements, "", video.brandKit, false, undefined,
        video.adjustments, textAdj, imageAdj, true, true, true, "before-image"
      );
      preImageOverlayPages.push(preImgOverlay);

      // Frame-only overlay (shapes AFTER image element)
      const frameOverlay = await generatePageImage(
        template.contentElements, "", video.brandKit, false, undefined,
        video.adjustments, textAdj, imageAdj, true, true, true, "after-image"
      );
      frameOverlayPages.push(frameOverlay);

      const logoOverlay = await generateLogoOverlay(
        template.contentElements, video.brandKit, false, video.adjustments
      );
      logoOverlayPages.push(logoOverlay);
    }

    // Signature page
    const signaturePage = await generatePageImage(
      template.signatureElements, "", video.brandKit, true, undefined,
      video.adjustments, defaultPageTextAdjustment, defaultPageImageAdjustment, false, true, true
    );
    pages.push(signaturePage);
    const sigTextOverlay2 = await generatePageImage(
      template.signatureElements, "", video.brandKit, true, undefined,
      video.adjustments, defaultPageTextAdjustment, defaultPageImageAdjustment, true, true, false
    );
    overlayPages.push(sigTextOverlay2);
    const sigPreImgOverlay2 = await generatePageImage(
      template.signatureElements, "", video.brandKit, true, undefined,
      video.adjustments, defaultPageTextAdjustment, defaultPageImageAdjustment, true, true, true, "before-image"
    );
    preImageOverlayPages.push(sigPreImgOverlay2);
    const sigFrameOverlay2 = await generatePageImage(
      template.signatureElements, "", video.brandKit, true, undefined,
      video.adjustments, defaultPageTextAdjustment, defaultPageImageAdjustment, true, true, true, "after-image"
    );
    frameOverlayPages.push(sigFrameOverlay2);
    const sigLogoOverlay2 = await generateLogoOverlay(
      template.signatureElements, video.brandKit, true, video.adjustments
    );
    logoOverlayPages.push(sigLogoOverlay2);

    return { pages, overlayPages, frameOverlayPages, preImageOverlayPages, logoOverlayPages };
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
        // Pre-load brand kit images before regenerating
        const bk = base.brandKit;
        if (bk) {
          const urls = [bk.pngs?.[0] || bk.logo, bk.pngs?.[1] || bk.contactInfo, bk.pngs?.[2] || bk.mascot].filter(Boolean);
          await Promise.all(urls.map(u => loadImage(u, 3)));
        }
        const result = await regenerateSingleVideo(base);
        const updatedVideo = { ...base, pages: result.pages, overlayPages: result.overlayPages, frameOverlayPages: result.frameOverlayPages, preImageOverlayPages: result.preImageOverlayPages, logoOverlayPages: result.logoOverlayPages };

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
    // Clear image cache to force fresh loads with current strategy
    imageCache.clear();

    try {
      const updatedVideos = [...clientVideos];

      // Preload all unique fonts from brand kits
      const uniqueFonts = new Set(updatedVideos.map(v => v.brandKit?.font || v.brandKit?.fontFamily).filter(Boolean));
      await Promise.all([...uniqueFonts].map(f => loadGoogleFont(f)));

      // Pre-load all brand kit images (logo, contact, mascot) into cache
      setGenerationStatus("Pré-carregando logos e contatos...");
      const preloadPromises: Promise<any>[] = [];
      const seenUrls = new Set<string>();
      for (const video of updatedVideos) {
        const bk = video.brandKit;
        if (!bk) continue;
        const urls = [
          bk.pngs?.[0] || bk.logo,
          bk.pngs?.[1] || bk.contactInfo,
          bk.pngs?.[2] || bk.mascot,
        ].filter(Boolean);
        for (const url of urls) {
          const key = url.length > 200 ? url.substring(0, 100) + url.length : url;
          if (!seenUrls.has(key)) {
            seenUrls.add(key);
            preloadPromises.push(
              loadImage(url, 3).then(img => {
                if (!img) console.error(`[preload] FAILED to load brand kit image: ${url.substring(0, 60)}...`);
                else console.log(`[preload] Loaded brand kit image: ${url.substring(0, 60)}...`);
              })
            );
          }
        }
      }
      await Promise.all(preloadPromises);
      console.log(`[preload] Finished pre-loading ${preloadPromises.length} brand kit images`);

      for (let i = 0; i < updatedVideos.length; i++) {
        const video = updatedVideos[i];
        setGenerationStatus(`Gerando páginas (${i + 1}/${updatedVideos.length}) • ${video.clientName}`);

        // Reuse existing user-chosen videos/images when available; only search for missing pages
        const existingVideoUrls = video.previewVideoUrls || [];
        const existingImages = video.searchedImages || [];
        const searchedImages: string[] = [];
        const pexelsVideoUrls: (string | null)[] = [];

        for (let pageIdx = 0; pageIdx < video.pageTexts.length; pageIdx++) {
          const text = video.pageTexts[pageIdx];
          const existingUrl = existingVideoUrls[pageIdx];
          const existingImg = existingImages[pageIdx];

          // If this page already has a user-chosen video, keep it
          if (existingUrl && existingUrl !== "") {
            searchedImages.push(existingImg || "");
            pexelsVideoUrls.push(existingUrl);
            continue;
          }

          try {
            // Combine page text + card title + imageType + briefing + company for complete search context
            const fullContext = [text, video.cardTitle, video.imageType, video.briefing, video.company].filter(Boolean).join(" ");
            let searchTerms = fullContext;

            // Translate to English for better search results (with timeout)
            try {
              const translatePromise = supabase.functions.invoke("translate-text", {
                body: { text: fullContext },
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
            let videos = await searchVideos(searchTerms, 3);
            if (videos.length === 0) {
              const simpleTerms = searchTerms.split(" ").slice(0, 2).join(" ");
              videos = await searchVideos(simpleTerms, 3);
            }
            if (videos.length === 0) {
              videos = await searchVideos("business technology", 3);
            }
            if (videos.length > 0) {
              searchedImages.push(videos[0].image);
              pexelsVideoUrls.push(videos[0].videoUrl);
              foundVideo = true;
            }
            if (!foundVideo) {
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

        console.log(`[BatchVideo] ${video.clientName}: searchedImages=${searchedImages.map(s => s ? 'OK' : 'EMPTY').join(',')}, videoUrls=${pexelsVideoUrls.map(v => v ? 'OK' : 'NULL').join(',')}`);
        const result = await generateVideoForClient(video, searchedImages, pexelsVideoUrls);
        updatedVideos[i] = { ...video, pages: result.pages, overlayPages: result.overlayPages, frameOverlayPages: result.frameOverlayPages, preImageOverlayPages: result.preImageOverlayPages, logoOverlayPages: result.logoOverlayPages, searchedImages, previewVideoUrls: pexelsVideoUrls };
        setClientVideos([...updatedVideos]);
      }

      toast({
        title: "Vídeos gerados!",
        description: `${updatedVideos.length} vídeos foram gerados com sucesso.`,
      });

      // Auto-save as draft immediately after generation
      try {
        const videosToSave = updatedVideos.filter((v) => v.pages.length > 0);
        if (videosToSave.length > 0) {
          const batchItems: BatchItem[] = videosToSave.map((video) => ({
            cardId: video.cardId,
            clientId: video.clientId,
            clientName: video.clientName,
            company: video.company,
            cardTitle: video.cardTitle,
            cardText: video.cardText,
            brandKit: sanitizeBrandKitForStorage(video.brandKit),
            files: [],
            backgroundImages: video.searchedImages,
            previewVideoUrls: video.previewVideoUrls?.map(u => u && !u.startsWith("blob:") ? u : null),
            adjustments: video.adjustments as any,
            pageTextAdjustments: video.pageTextAdjustments,
            pageImageAdjustments: video.pageImageAdjustments,
            note: video.note,
            noteRead: video.noteRead,
          }));
          const hasUnresolvedNotes = batchItems.some(i => i.note && !i.noteRead);
          const snapshotWithTeam = { ...template, teamFilter: teamFilter || (template as any).teamFilter || null, hasUnresolvedNotes };
          const savedId = await saveBatchGeneration("video", snapshotWithTeam, batchItems, currentBatchId || undefined);
          if (savedId) setCurrentBatchId(savedId);
          console.log("Auto-saved batch draft after generation:", savedId);
        }
      } catch (autoSaveError) {
        console.error("Auto-save draft failed (non-critical):", autoSaveError);
      }
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

  // Refresh brand kit + card text from database and regenerate video
  const refreshBrandKitAndRegenerate = async (index: number) => {
    const video = clientVideos[index];
    try {
      // Fetch brand kit from client_data
      const { data: clientData, error: clientError } = await supabase
        .from("client_data")
        .select("brand_kit, name, briefing, image_type, company")
        .eq("id", video.clientId)
        .single();

      if (clientError || !clientData) {
        toast({ title: "Erro ao buscar dados do cliente", variant: "destructive" });
        return;
      }

      // Fetch card title and description from project_briefs
      const { data: cardData, error: cardError } = await supabase
        .from("project_briefs")
        .select("title, description")
        .eq("id", video.cardId)
        .single();

      setIsGenerating(true);
      setGenerationStatus(`Atualizando ${video.clientName}...`);

      // Build updated video with refreshed brand kit and card text
      // Use title as primary text source (it's what the user edits on the card)
      const newCardTitle = cardData?.title || video.cardTitle;
      const newCardText = cardData?.title || cardData?.description || video.cardText;
      
      // Rebuild pageTexts from updated card text (split by newlines for multi-page)
      const rawTexts = newCardText ? newCardText.split(";").map((t: string) => t.trim()).filter((t: string) => t.length > 0) : [newCardTitle];
      const newPageTexts = rawTexts.length > 0 ? rawTexts : [newCardTitle];

      const updatedVideo: ClientVideo = {
        ...video,
        brandKit: clientData.brand_kit,
        clientName: clientData.name || video.clientName,
        company: clientData.company || clientData.name || video.company,
        briefing: clientData.briefing || video.briefing,
        imageType: clientData.image_type || video.imageType,
        cardTitle: newCardTitle,
        cardText: newCardText,
        pageTexts: newPageTexts,
        // Ensure pageTextAdjustments array matches new page count
        pageTextAdjustments: newPageTexts.map((_, i) => video.pageTextAdjustments[i] || { ...defaultPageTextAdjustment }),
        pageImageAdjustments: newPageTexts.map((_, i) => video.pageImageAdjustments[i] || { ...defaultPageImageAdjustment }),
      };
      
      const result = await regenerateSingleVideo(updatedVideo);
      const finalVideo = { ...updatedVideo, pages: result.pages, overlayPages: result.overlayPages, frameOverlayPages: result.frameOverlayPages, preImageOverlayPages: result.preImageOverlayPages, logoOverlayPages: result.logoOverlayPages };

      setClientVideos((prev) =>
        prev.map((v, i) => (i === index ? finalVideo : v))
      );

      toast({ title: "Dados atualizados!", description: `Kit de marca e texto de ${video.clientName} recarregados.` });
    } catch (error) {
      console.error("Error refreshing brand kit:", error);
      toast({ title: "Erro ao atualizar dados", variant: "destructive" });
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
    setVideoSearchPage(1);
    try {
      // Search Pexels videos first, fallback to images
      const videos = await searchVideos(searchQuery, 12, 1);
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
            source: (v.source || 'pexels') as any,
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

  const handleLoadMoreVideos = async () => {
    if (!searchQuery.trim()) return;
    const nextPage = videoSearchPage + 1;
    setIsLoadingMore(true);
    try {
      const videos = await searchVideos(searchQuery, 12, nextPage);
      if (videos.length > 0) {
        const newVideoUrlMap: Record<string, string> = {};
        const videoAsImages: SearchImage[] = videos.map(v => {
          newVideoUrlMap[v.id] = v.videoUrl;
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
            source: (v.source || 'pexels') as any,
          };
        });
        setSearchVideoUrlMap(prev => ({ ...prev, ...newVideoUrlMap }));
        setSearchResults(prev => [...prev, ...videoAsImages]);
        setVideoSearchPage(nextPage);
      } else {
        toast({ title: "Sem mais resultados" });
      }
    } catch (error) {
      toast({ title: "Erro ao carregar mais vídeos", variant: "destructive" });
    } finally {
      setIsLoadingMore(false);
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
      const finalVideo = { ...updatedVideo, pages: result.pages, overlayPages: result.overlayPages, frameOverlayPages: result.frameOverlayPages, preImageOverlayPages: result.preImageOverlayPages, logoOverlayPages: result.logoOverlayPages };
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
      const finalVideo = { ...updatedVideo, pages: result.pages, overlayPages: result.overlayPages, frameOverlayPages: result.frameOverlayPages, preImageOverlayPages: result.preImageOverlayPages, logoOverlayPages: result.logoOverlayPages };
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
          textAnimDuration: textAnimDuration / (template.pageDuration || 3),
          backgroundVideoUrls: video.previewVideoUrls || undefined,
          frameOverlayPages: video.frameOverlayPages || undefined,
          overlayPages: video.overlayPages || undefined,
          logoOverlayPages: video.logoOverlayPages || undefined,
          imageRect: getImagePlaceholderRect(template.contentElements as CanvasElement[], template.width, template.height),
          imageClipShape: getImageClipShape(template.contentElements as CanvasElement[]),
          pageImageAdjustments: video.pageImageAdjustments,
          audioUrl: (() => {
            const sel = video.selectedAudio || 1;
            return sel === 2 ? template.audioUrl2 : template.audioUrl1;
          })(),
          onProgress: (p) => console.log(`Progresso ${video.clientName}: ${Math.round(p * 100)}%`),
        });

        const isActualMP4 = videoBlob.type === "video/mp4";
        const fileExt = isActualMP4 ? "mp4" : "webm";
        const contentType = isActualMP4 ? "video/mp4" : "video/webm";
        const fileName = `video_${video.cardId}_${Date.now()}.${fileExt}`;
        const thumbFileName = `thumb_${video.cardId}_${Date.now()}.png`;

        console.log("[BatchSave] Video blob type:", videoBlob.type, "size:", videoBlob.size, "ext:", fileExt);

        // Prepare thumbnail blob in parallel with video upload
        setGenerationStatus(`Subindo arquivos (${idx + 1}/${approvedVideos.length}) • ${video.clientName}`);

        const thumbBlobPromise = fetch(video.pages[0]).then(r => r.blob());

        // Upload video + prepare thumb simultaneously
        const [videoUploadResult, thumbBlob] = await Promise.all([
          supabase.storage.from("card-uploads").upload(`videos/${fileName}`, videoBlob, { contentType }),
          thumbBlobPromise,
        ]);

        if (videoUploadResult.error) {
          console.error("Upload error:", videoUploadResult.error);
          throw videoUploadResult.error;
        }

        // Upload thumbnail
        const thumbUploadResult = await supabase.storage
          .from("card-uploads")
          .upload(`videos/${thumbFileName}`, thumbBlob, { contentType: "image/png" });

        if (thumbUploadResult.error) {
          console.error("Thumb upload error:", thumbUploadResult.error);
          throw thumbUploadResult.error;
        }

        const { data: urlData } = supabase.storage.from("card-uploads").getPublicUrl(`videos/${fileName}`);
        const { data: thumbUrlData } = supabase.storage.from("card-uploads").getPublicUrl(`videos/${thumbFileName}`);

        // DB writes in parallel (card_upload record + brief update)
        await Promise.all([
          createCardUpload({
            card_id: video.cardId,
            file_name: fileName,
            file_url: urlData.publicUrl,
            file_type: contentType,
            upload_type: "final",
          }),
          updateProjectBrief(video.cardId, {
            cover_image: thumbUrlData.publicUrl,
            cover_video: urlData.publicUrl,
            brief_type: "video",
          }),
        ]);
      }

      // Clear tags + save batch history in parallel (batch save is non-blocking)
      const newBatchItems: BatchItem[] = approvedVideos.map((video) => ({
        cardId: video.cardId,
        clientId: video.clientId,
        clientName: video.clientName,
        company: video.company,
        cardTitle: video.cardTitle,
        cardText: video.cardText,
        brandKit: sanitizeBrandKitForStorage(video.brandKit),
        files: [], // Don't store base64 pages in DB - they're already in Storage
        backgroundImages: video.searchedImages,
        previewVideoUrls: video.previewVideoUrls?.map(u => u && !u.startsWith("blob:") ? u : null),
        adjustments: video.adjustments as any,
        pageTextAdjustments: video.pageTextAdjustments,
        pageImageAdjustments: video.pageImageAdjustments,
        note: video.note,
        noteRead: video.noteRead,
      }));

      // Merge with existing batch items to preserve non-edited items
      let batchItems = newBatchItems;
      if (currentBatchId) {
        try {
          const existingBatch = await getBatchById(currentBatchId);
          if (existingBatch && existingBatch.items.length > 0) {
            const updatedCardIds = new Set(newBatchItems.map((i) => i.cardId));
            const preservedItems = existingBatch.items.filter((i) => !updatedCardIds.has(i.cardId));
            batchItems = [...preservedItems, ...newBatchItems];
          }
        } catch (e) {
          console.warn("Could not merge with existing batch items:", e);
        }
      }

      const hasUnresolvedNotes = batchItems.some(i => i.note && !i.noteRead);
      const snapshotWithTeam = { ...template, teamFilter: teamFilter || (template as any).teamFilter || null, hasUnresolvedNotes };
      await Promise.all([
        clearArtGenerationTags(),
        saveBatchGeneration("video", snapshotWithTeam, batchItems, currentBatchId || undefined).then((id) => {
          if (id) setCurrentBatchId(id);
        }).catch((e) =>
          console.error("Batch history save failed (non-critical):", e)
        ),
      ]);

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
      const newBatchItems: BatchItem[] = videosWithPages.map((video) => ({
        cardId: video.cardId,
        clientId: video.clientId,
        clientName: video.clientName,
        company: video.company,
        cardTitle: video.cardTitle,
        cardText: video.cardText,
        brandKit: sanitizeBrandKitForStorage(video.brandKit),
        files: [], // Don't store base64 pages in DB to avoid payload bloat / timeouts
        backgroundImages: video.searchedImages,
        previewVideoUrls: video.previewVideoUrls?.map(u => u && !u.startsWith("blob:") ? u : null),
        adjustments: video.adjustments as any,
        pageTextAdjustments: video.pageTextAdjustments,
        pageImageAdjustments: video.pageImageAdjustments,
        note: video.note,
        noteRead: video.noteRead,
      }));

      // Merge with existing batch items to preserve non-edited items
      let batchItems = newBatchItems;
      if (currentBatchId) {
        try {
          const existingBatch = await getBatchById(currentBatchId);
          if (existingBatch && existingBatch.items.length > 0) {
            const updatedCardIds = new Set(newBatchItems.map((i) => i.cardId));
            const preservedItems = existingBatch.items.filter((i) => !updatedCardIds.has(i.cardId));
            batchItems = [...preservedItems, ...newBatchItems];
          }
        } catch (e) {
          console.warn("Could not merge with existing batch items:", e);
        }
      }

      const hasUnresolvedNotes = batchItems.some(i => i.note && !i.noteRead);
      const snapshotWithTeam = { ...template, teamFilter: teamFilter || (template as any).teamFilter || null, hasUnresolvedNotes };
      const savedId = await saveBatchGeneration("video", snapshotWithTeam, batchItems, currentBatchId || undefined);
      if (savedId) setCurrentBatchId(savedId);

      await clearArtGenerationTags();

      toast({
        title: "Rascunho salvo!",
        description: `${videosWithPages.length} vídeos salvos no histórico.`,
      });
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
          {/* Team selector */}
          <Select
            value={teamFilter || "__all__"}
            onValueChange={(val) => {
              const newFilter = val === "__all__" ? undefined : val;
              setTeamFilter(newFilter);
              loadTaggedCards(newFilter ?? "");
            }}
          >
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Todas as equipes" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">Todas as equipes</SelectItem>
              {teams.map((t) => (
                <SelectItem key={t.id} value={t.name}>{t.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center gap-4">
          {/* Card type filter */}
          <div className="flex gap-1">
            <Button
              variant={cardTypeFilter === "all" ? "default" : "outline"}
              size="sm"
              onClick={() => setCardTypeFilter("all")}
            >
              Todos
            </Button>
            <Button
              variant={cardTypeFilter === "post" ? "default" : "outline"}
              size="sm"
              onClick={() => setCardTypeFilter("post")}
            >
              Post
            </Button>
            <Button
              variant={cardTypeFilter === "carousel" ? "default" : "outline"}
              size="sm"
              onClick={() => setCardTypeFilter("carousel")}
            >
              Carrossel
            </Button>
          </div>

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


      {/* Content */}
      <ScrollArea className="flex-1 p-6">
        {isGenerating ? (
          <div className="flex flex-col items-center justify-center h-64 gap-2">
            <Loader2 className="h-12 w-12 animate-spin text-primary" />
            <p className="text-muted-foreground">{generationStatus || "Gerando vídeos..."}</p>
          </div>
        ) : (
          <DndContext sensors={dndSensors} collisionDetection={closestCenter} onDragEnd={handleDndEnd}>
            <SortableContext items={filteredVideoIds} strategy={rectSortingStrategy}>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                {filteredVideos.map((video) => {
                  const index = clientVideos.indexOf(video);
                  return (
                  <SortableVideoCard key={`${video.cardId}-${index}`} id={`${video.cardId}-${index}`} status={video.status}>
                {/* Checkbox to send to end */}
                <div className="px-3 pt-2 flex items-center gap-2">
                  <button
                    className="h-5 w-5 rounded border border-primary flex items-center justify-center hover:bg-primary/20 transition-colors shrink-0"
                    title="Enviar para o final da lista"
                    onClick={(e) => {
                      e.stopPropagation();
                      setClientVideos((prev) => {
                        const item = prev[index];
                        const rest = prev.filter((_, i) => i !== index);
                        return [...rest, item];
                      });
                    }}
                  >
                    <Check className="h-3 w-3 text-primary" />
                  </button>
                  <h3 className="font-medium truncate text-sm flex-1">{video.clientName}</h3>
                </div>

                {/* Video Preview with page cycling */}
                <CardCoverPreview
                  video={video}
                  motionEffect={motionEffect}
                  transitionEffect={transitionEffect}
                  textAnimation={textAnimation}
                  logoAnimation={logoAnimation}
                  textAnimDuration={textAnimDuration}
                  shapeAnimation={shapeAnimation}
                  shapeAnimDuration={shapeAnimDuration}
                  pageDuration={template.pageDuration || 3}
                   imageRect={getImagePlaceholderRect(template.contentElements as CanvasElement[], template.width, template.height)}
                   imageElSize={getImageElSize(template.contentElements as CanvasElement[])}
                   imageClipShape={getImageClipShape(template.contentElements as CanvasElement[])}
                   templateWidth={template.width}
                   templateHeight={template.height}
                   onClick={() => {
                    setSelectedVideo(video);
                    setCurrentPreviewPage(0);
                    setIsPlayingPreview(true);
                  }}
                />

                {/* Info */}
                <div className="p-3 space-y-1 flex-1 overflow-y-auto min-h-0">
                  <div className="flex items-start justify-between gap-1">
                    <div className="min-w-0">
                      <p className="text-xs text-muted-foreground truncate">{video.company}</p>
                      {video.team && (
                        <p className="text-xs text-primary/70 truncate">{video.team}</p>
                      )}
                    </div>
                    <button
                      className="shrink-0 p-1 rounded hover:bg-muted transition-colors"
                      title="Copiar texto do card"
                      onClick={(e) => {
                        e.stopPropagation();
                        const parts = [
                          video.cardTitle,
                          video.imageType,
                        ].filter(Boolean).join("\n");
                        navigator.clipboard.writeText(parts);
                        toast({ title: "Texto copiado!" });
                      }}
                    >
                      <ClipboardCopy className="h-3.5 w-3.5 text-muted-foreground" />
                    </button>
                  </div>

                  <p className="text-xs whitespace-pre-wrap break-words">{video.cardTitle}</p>
                  {video.imageType && (
                    <p className="text-xs text-primary/70 truncate">{video.imageType}</p>
                  )}
                  {video.particularityType && (
                    <p className="text-xs text-muted-foreground/80 truncate">⚠️ {video.particularityType}</p>
                  )}
                  {video.hasMaterialUploads && (
                    <p className="text-xs text-yellow-500 truncate">⚠ cliente tem foto no card</p>
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
                     <Popover>
                       <PopoverTrigger asChild>
                         <Button
                           variant="ghost"
                           size="sm"
                           className="relative px-2"
                           title="Anotação"
                           onClick={(e) => {
                             e.stopPropagation();
                             if (video.note && !video.noteRead) {
                               setClientVideos((prev) =>
                                 prev.map((v, i) => i === index ? { ...v, noteRead: true } : v)
                               );
                             }
                           }}
                         >
                           <MessageSquareWarning className="h-4 w-4" />
                           {video.note && !video.noteRead && (
                             <span className="absolute -top-1 -right-1 h-2.5 w-2.5 bg-red-500 rounded-full animate-pulse" />
                           )}
                         </Button>
                       </PopoverTrigger>
                       <PopoverContent className="w-64 p-3" onClick={(e) => e.stopPropagation()}>
                         <div className="space-y-2">
                           <p className="text-xs font-medium text-foreground">Anotação</p>
                           <Textarea
                             placeholder="Escreva uma observação..."
                             className="text-xs min-h-[60px] resize-none"
                             value={video.note || ""}
                             onChange={(e) => {
                               const val = e.target.value;
                               setClientVideos((prev) =>
                                 prev.map((v, i) => i === index ? { ...v, note: val, noteRead: false } : v)
                               );
                             }}
                           />
                            <Button
                              size="sm"
                              variant="default"
                              className="w-full text-xs"
                              onClick={async () => {
                                if (currentBatchId) {
                                  const success = await updateBatchItem(currentBatchId, index, { note: video.note || "", noteRead: !video.note ? true : false });
                                  if (success) {
                                    toast({ title: "Anotação salva" });
                                  } else {
                                    toast({ title: "Erro ao salvar anotação", variant: "destructive" });
                                  }
                                } else {
                                  toast({ title: "Salve o lote primeiro (gere ou aprove)", variant: "destructive" });
                                }
                              }}
                            >
                              <Save className="h-3 w-3 mr-1" /> Salvar
                            </Button>
                            {video.note && (
                              <Button
                                size="sm"
                                variant="outline"
                                className="w-full text-xs"
                                onClick={async () => {
                                  setClientVideos((prev) =>
                                    prev.map((v, i) => i === index ? { ...v, note: "", noteRead: true } : v)
                                  );
                                  if (currentBatchId) {
                                    await updateBatchItem(currentBatchId, index, { note: "", noteRead: true });
                                  }
                                }}
                              >
                                <Check className="h-3 w-3 mr-1" /> Resolvido
                              </Button>
                            )}
                         </div>
                       </PopoverContent>
                     </Popover>
                   </div>

                  {/* Audio selector */}
                  {(template.audioUrl1 || template.audioUrl2) && (
                    <div className="flex items-center gap-2 pt-1">
                      <span className="text-[10px] text-muted-foreground">🎵</span>
                      <select
                        className="flex-1 h-7 text-xs rounded border border-border bg-background px-2"
                        value={video.selectedAudio || 1}
                        onClick={(e) => e.stopPropagation()}
                        onChange={(e) => {
                          e.stopPropagation();
                          const val = Number(e.target.value) as 1 | 2;
                          setClientVideos((prev) =>
                            prev.map((v, i) =>
                              i === index ? { ...v, selectedAudio: val } : v
                            )
                          );
                        }}
                      >
                        {template.audioUrl1 && <option value={1}>Áudio 1</option>}
                        {template.audioUrl2 && <option value={2}>Áudio 2</option>}
                      </select>
                    </div>
                   )}
                </div>
                  </SortableVideoCard>
                  );
                })}
              </div>
            </SortableContext>
          </DndContext>
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
                <div className="space-y-4 mt-4">
                  {/* Page info panel - BEFORE the overlay so it's always visible */}
                  <div className="bg-muted/50 rounded-lg p-3 space-y-2 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-foreground">
                        Página {currentPreviewPage + 1} de {selectedVideo.pages.length}
                      </span>
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${
                        currentPreviewPage === selectedVideo.pages.length - 1
                          ? "bg-accent text-accent-foreground"
                          : "bg-primary/10 text-primary"
                      }`}>
                        {currentPreviewPage === selectedVideo.pages.length - 1 ? "Assinatura" : "Conteúdo"}
                      </span>
                  </div>

                    {/* Page text */}
                    {currentPreviewPage < selectedVideo.pageTexts.length ? (
                      <div>
                        <span className="text-muted-foreground">Texto da página {currentPreviewPage + 1}:</span>
                        <p className="text-foreground mt-0.5 whitespace-pre-wrap bg-background/50 rounded p-1.5 border border-border/50">{selectedVideo.pageTexts[currentPreviewPage] || "(vazio)"}</p>
                      </div>
                    ) : (
                      <div>
                        <span className="text-muted-foreground">Página de assinatura</span>
                        <p className="text-foreground/60 mt-0.5 text-[10px]">Esta página usa os elementos do template (logo, contato, mascote).</p>
                      </div>
                    )}

                    {/* Card title/description */}
                    <div className="space-y-0.5">
                      <p className="text-muted-foreground">📋 Card: <span className="text-foreground">{selectedVideo.cardTitle}</span></p>
                      {selectedVideo.cardText && selectedVideo.cardText !== selectedVideo.cardTitle && (
                        <p className="text-muted-foreground/70 line-clamp-2">{selectedVideo.cardText}</p>
                      )}
                    </div>

                    {/* Brand kit + metadata */}
                    <div className="flex flex-wrap gap-2">
                      {selectedVideo.brandKit?.colors?.length > 0 && (
                        <div className="flex items-center gap-1">
                          <span className="text-muted-foreground">Cores:</span>
                          {selectedVideo.brandKit.colors.slice(0, 5).map((c: string, i: number) => (
                            <span key={i} className="inline-block w-3.5 h-3.5 rounded-sm border border-border" style={{ backgroundColor: c }} />
                          ))}
                        </div>
                      )}
                      {selectedVideo.brandKit?.logo && <span className="text-muted-foreground">✓ Logo</span>}
                      {selectedVideo.brandKit?.mascot && <span className="text-muted-foreground">✓ Mascote</span>}
                      {selectedVideo.brandKit?.contactInfo && <span className="text-muted-foreground">✓ Contato</span>}
                    </div>
                    {selectedVideo.imageType && <p className="text-primary/70">🎬 {selectedVideo.imageType}</p>}
                    {selectedVideo.particularityType && <p className="text-muted-foreground">⚠️ {selectedVideo.particularityType}</p>}
                    {selectedVideo.hasMaterialUploads && <p className="text-yellow-500">⚠ cliente tem foto no card</p>}

                    {/* Adjustment values */}
                    <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[10px] text-muted-foreground/70">
                      {currentPreviewPage < selectedVideo.pages.length - 1 && (
                        <span>Foto: x={selectedVideo.pageImageAdjustments[currentPreviewPage]?.imageX || 0} y={selectedVideo.pageImageAdjustments[currentPreviewPage]?.imageY || 0} zoom={selectedVideo.pageImageAdjustments[currentPreviewPage]?.imageScale || 100}%</span>
                      )}
                      <span>Texto: x={selectedVideo.pageTextAdjustments[currentPreviewPage]?.textX || 0} y={selectedVideo.pageTextAdjustments[currentPreviewPage]?.textY || 0} zoom={selectedVideo.pageTextAdjustments[currentPreviewPage]?.textScale || 100}%</span>
                    </div>
                  </div>

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
                    pageText={selectedVideo.pageTexts[currentPreviewPage] || ""}
                    fontFamily={selectedVideo.brandKit?.font || selectedVideo.brandKit?.fontFamily || ""}
                    textColor={Array.isArray(selectedVideo.brandKit?.colors) && selectedVideo.brandKit.colors[1] ? selectedVideo.brandKit.colors[1] : "#ffffff"}
                    logoUrl={selectedVideo.brandKit?.pngs?.[0] || selectedVideo.brandKit?.logo || ""}
                    contactUrl={selectedVideo.brandKit?.pngs?.[1] || selectedVideo.brandKit?.contactInfo || ""}
                    mascotUrl={selectedVideo.brandKit?.pngs?.[2] || selectedVideo.brandKit?.mascot || ""}
                    frameOverlayUrl={selectedVideo.frameOverlayPages?.[currentPreviewPage] || ""}
                    textOverlayUrl={selectedVideo.overlayPages?.[currentPreviewPage] || ""}
                    logoOverlayUrl={selectedVideo.logoOverlayPages?.[currentPreviewPage] || ""}
                    backgroundImageUrl={selectedVideo.searchedImages?.[currentPreviewPage] || ""}
                    backgroundVideoUrl={selectedVideo.previewVideoUrls?.[currentPreviewPage] || (currentPreviewPage < selectedVideo.pages.length - 1 ? (selectedVideo.previewVideoUrls?.find(v => v && v !== "") || "") : "")}
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

                  <p className="text-center text-[10px] text-muted-foreground">
                    Arraste os elementos para mover. Arraste as alças dos cantos para redimensionar.
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

                  {/* Page text + copy button */}
                  {selectedVideo.pageTexts[currentPreviewPage] && (
                    <div className="space-y-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[10px] text-muted-foreground font-medium">Texto da Página {currentPreviewPage + 1}:</span>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 px-2 text-[10px]"
                          onClick={() => {
                            const parts = [
                              selectedVideo.pageTexts[currentPreviewPage],
                              selectedVideo.imageType,
                            ].filter(Boolean).join("\n");
                            navigator.clipboard.writeText(parts);
                            toast({ title: "Copiado!", description: "Texto da página + tipo de imagem copiados." });
                          }}
                        >
                          <ClipboardCopy className="h-3 w-3 mr-1" />
                          Copiar
                        </Button>
                      </div>
                      <p className="text-[11px] text-foreground whitespace-pre-wrap bg-background/50 rounded p-1.5 border border-border/50 max-h-24 overflow-y-auto">
                        {selectedVideo.pageTexts[currentPreviewPage]}
                      </p>
                    </div>
                  )}

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
                          const cardTitle = selectedVideo.cardTitle || "";
                          const fullSearch = [pageText, cardTitle, selectedVideo.imageType, selectedVideo.briefing, selectedVideo.company].filter(Boolean).join(" ").trim();
                          setSearchQuery(fullSearch);
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
          )}
        </DialogContent>
      </Dialog>

      {/* Image Search Dialog */}
      <Dialog open={isImageDialogOpen} onOpenChange={(open) => {
        setIsImageDialogOpen(open);
        if (!open) setCustomImageUrl("");
      }}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
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

              <ScrollArea className="h-[280px]">
                <div className="grid grid-cols-3 gap-2 pr-2">
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
                      <div className="absolute bottom-1 right-1 bg-background/80 text-[10px] px-1 rounded capitalize">
                        {image.source === 'pixabay' ? 'Pixabay' : 'Pexels'}
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
              {searchResults.length > 0 && (
                <div className="flex justify-center pt-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleLoadMoreVideos}
                    disabled={isLoadingMore}
                  >
                    {isLoadingMore ? (
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    ) : null}
                    Carregar Mais
                  </Button>
                </div>
              )}
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
