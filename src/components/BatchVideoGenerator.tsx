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
  overlayPages?: string[]; // Array of page images (base64) - transparent background for video compositing
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
    adjustments: ElementAdjustments = defaultAdjustments,
    textAdjustment: PageTextAdjustment = defaultPageTextAdjustment,
    imageAdjustment: PageImageAdjustment = defaultPageImageAdjustment,
    transparentBackground: boolean = false,
    excludeLogo: boolean = false
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
        const fontFamily = brandKit?.fontFamily || "Arial";
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
    if (!logoEl) return "";

    const logoUrl = brandKit?.pngs?.[0] || brandKit?.logo;
    if (!logoUrl) return "";

    const canvas = document.createElement("canvas");
    canvas.width = template.width || 1080;
    canvas.height = template.height || 1920;
    const ctx = canvas.getContext("2d")!;
    // transparent background

    const img = await loadImage(logoUrl);
    if (!img) return "";

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

  const generateVideoForClient = async (video: ClientVideo, searchedImages: string[], videoUrls?: (string | null)[]): Promise<{ pages: string[]; overlayPages: string[]; logoOverlayPages: string[] }> => {
    const pages: string[] = [];
    const overlayPages: string[] = [];
    const logoOverlayPages: string[] = [];

    // Generate content pages (one per text segment)
    for (let i = 0; i < video.pageTexts.length; i++) {
      const text = video.pageTexts[i];
      const bgImage = searchedImages[i] || undefined;
      const textAdj = video.pageTextAdjustments[i] || defaultPageTextAdjustment;
      const imageAdj = video.pageImageAdjustments[i] || defaultPageImageAdjustment;
      const hasVideo = videoUrls?.[i];

      // Normal page (with background)
      const pageImage = await generatePageImage(
        template.contentElements,
        text,
        video.brandKit,
        false,
        bgImage,
        video.adjustments,
        textAdj,
        imageAdj
      );
      pages.push(pageImage);

      // If this page has a video background, also generate transparent overlay
      if (hasVideo) {
        const overlayImage = await generatePageImage(
          template.contentElements,
          text,
          video.brandKit,
          false,
          undefined, // no background image
          video.adjustments,
          textAdj,
          imageAdj,
          true, // transparent background
          true  // excludeLogo - logo rendered separately
        );
        overlayPages.push(overlayImage);

        // Generate logo-only overlay for separate animation
        const logoOverlay = await generateLogoOverlay(
          template.contentElements, video.brandKit, false, video.adjustments
        );
        logoOverlayPages.push(logoOverlay);
      } else {
        overlayPages.push(""); // no overlay needed
        logoOverlayPages.push("");
      }
    }

    // Always add signature page at the end (no text adjustment needed for signature)
    const signaturePage = await generatePageImage(
      template.signatureElements,
      "",
      video.brandKit,
      true,
      undefined,
      video.adjustments,
      defaultPageTextAdjustment,
      defaultPageImageAdjustment
    );
    pages.push(signaturePage);
    overlayPages.push(""); // signature has no video
    logoOverlayPages.push("");

    return { pages, overlayPages, logoOverlayPages };
  };

  const regenerateSingleVideo = async (video: ClientVideo): Promise<{ pages: string[]; overlayPages: string[]; logoOverlayPages: string[] }> => {
    const pages: string[] = [];
    const overlayPages: string[] = [];
    const logoOverlayPages: string[] = [];

    // Generate content pages with current searchedImages
    for (let i = 0; i < video.pageTexts.length; i++) {
      const text = video.pageTexts[i];
      const bgImage = video.searchedImages?.[i] || undefined;
      const textAdj = video.pageTextAdjustments[i] || defaultPageTextAdjustment;
      const imageAdj = video.pageImageAdjustments[i] || defaultPageImageAdjustment;
      const hasVideo = video.previewVideoUrls?.[i];

      const pageImage = await generatePageImage(
        template.contentElements,
        text,
        video.brandKit,
        false,
        bgImage,
        video.adjustments,
        textAdj,
        imageAdj
      );
      pages.push(pageImage);

      if (hasVideo) {
        const overlayImage = await generatePageImage(
          template.contentElements,
          text,
          video.brandKit,
          false,
          undefined,
          video.adjustments,
          textAdj,
          imageAdj,
          true, // transparent
          true  // excludeLogo
        );
        overlayPages.push(overlayImage);

        const logoOverlay = await generateLogoOverlay(
          template.contentElements, video.brandKit, false, video.adjustments
        );
        logoOverlayPages.push(logoOverlay);
      } else {
        overlayPages.push("");
        logoOverlayPages.push("");
      }
    }

    // Add signature page
    const signaturePage = await generatePageImage(
      template.signatureElements,
      "",
      video.brandKit,
      true,
      undefined,
      video.adjustments,
      defaultPageTextAdjustment,
      defaultPageImageAdjustment
    );
    pages.push(signaturePage);
    overlayPages.push("");
    logoOverlayPages.push("");

    return { pages, overlayPages, logoOverlayPages };
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
        const updatedVideo = { ...base, pages: result.pages, overlayPages: result.overlayPages, logoOverlayPages: result.logoOverlayPages };

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

            // Search Pexels videos and use their thumbnail as background
            const videos = await searchPexelsVideos(searchTerms, 1);
            if (videos.length > 0) {
              searchedImages.push(videos[0].image);
              pexelsVideoUrls.push(videos[0].videoUrl); // Store actual video URL
            } else {
              // Fallback to image search if no videos found
              const images = await searchImages(searchTerms, 1);
              if (images.length > 0) {
                searchedImages.push(images[0].urls.regular);
              } else {
                searchedImages.push("");
              }
              pexelsVideoUrls.push(null);
            }
          } catch (error) {
            console.error("Error searching video for page:", error);
            searchedImages.push("");
            pexelsVideoUrls.push(null);
          }
        }

        const result = await generateVideoForClient(video, searchedImages, pexelsVideoUrls);
        updatedVideos[i] = { ...video, pages: result.pages, overlayPages: result.overlayPages, logoOverlayPages: result.logoOverlayPages, searchedImages, previewVideoUrls: pexelsVideoUrls };
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
      const finalVideo = { ...updatedVideo, pages: result.pages, overlayPages: result.overlayPages, logoOverlayPages: result.logoOverlayPages };

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
      const finalVideo = { ...updatedVideo, pages: result.pages, overlayPages: result.overlayPages, logoOverlayPages: result.logoOverlayPages };
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
      const finalVideo = { ...updatedVideo, pages: result.pages, overlayPages: result.overlayPages, logoOverlayPages: result.logoOverlayPages };
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
          backgroundVideoUrls: video.previewVideoUrls || undefined,
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
          </select>
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
    </div>
  );
};
