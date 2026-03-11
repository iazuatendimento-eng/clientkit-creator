import { useState, useEffect, useRef, useCallback } from "react";
import { cn } from "@/lib/utils";
import { drawNewShape } from "@/lib/canvasShapes";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";

import { Label } from "@/components/ui/label";
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
  Move,
  Upload,
  Link,
  ZoomIn,
  ZoomOut,
  Scissors,
  Eraser,
  Save,
  ClipboardPaste,
  MessageSquareWarning,
  Mail,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { getTaggedCardsForArtGeneration, createCardUpload, clearArtGenerationTags, updateProjectBrief, autoTagFirstCardsForAllActiveClients } from "@/lib/clientDatabase";
import { searchImages, SearchImage, getConfiguredApis } from "@/lib/imageSearch";
import { supabase } from "@/integrations/supabase/client";
import { saveBatchGeneration, getBatchById, BatchItem, updateBatchItem, sanitizeBrandKitForStorage, deleteBatch } from "@/lib/batchHistory";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ArtAdjustOverlay } from "@/components/ArtAdjustOverlay";
import { removeBackground } from "@/lib/backgroundRemoval";
import { ImageEraserModal } from "./ImageEraserModal";

interface CanvasElement {
  id: string;
  type: "rect" | "circle" | "text" | "image" | "logo" | "contact" | "mascot" | "triangle" | "line" | "star" | "diamond" | "hexagon" | "pentagon" | "polkaDots" | "dotsGrid" | "confetti" | "splatter" | "zigzag" | "spiral" | "heart" | "cross" | "cloud" | "speechBubble" | "lightning" | "shield" | "crescent" | "wave" | "blob" | "arch" | "arrow" | "badge" | "ribbon";
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
  colorRole?: "background" | "text" | "accessory1" | "accessory2";
  opacity?: number;
  borderRadius?: number;
  borderWidth?: number;
  borderColor?: string;
  borderColorRole?: "background" | "text" | "accessory1" | "accessory2";
  clipShape?: "rect" | "circle";
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
    color1Role?: "background" | "text" | "accessory1" | "accessory2";
    color2Role?: "background" | "text" | "accessory1" | "accessory2";
  };
}

interface MasterTemplate {
  id: string;
  name: string;
  elements: CanvasElement[];
  width: number;
  height: number;
  backgroundColor: string;
}

type ShapeOverride = { x: number; y: number; width: number; height: number };

interface ElementOverrides {
  logoX?: number;
  logoY?: number;
  logoScale?: number;
  logoScaleX?: number;
  logoScaleY?: number;
  textX?: number;
  textY?: number;
  textFontSize?: number;
  contactX?: number;
  contactY?: number;
  contactScale?: number;
  contactScaleX?: number;
  contactScaleY?: number;
  mascotX?: number;
  mascotY?: number;
  mascotScaleX?: number;
  mascotScaleY?: number;
  photoScale?: number;
  // When set, resizes/moves the photo placeholder frame (instead of zooming the crop)
  photoFrame?: ShapeOverride;
  shapes?: Record<string, ShapeOverride>;
}

interface ClientArt {
  clientId: string;
  clientName: string;
  company: string;
  cardId: string;
  cardTitle: string;
  cardText: string;
  brandKit: any;
  imageUrl: string | null;
  status: "pending" | "approved" | "rejected";
  backgroundImage?: string;
  photoImage?: string;
  photoOffset?: { x: number; y: number };
  elementOverrides?: ElementOverrides;
  pageIndex?: number; // For carousel - which page this is (0-based)
  totalPages?: number; // For carousel - total pages in this card
  imageType?: string; // Tipo de imagem do cadastro do cliente
  narrationType?: string; // Tipo de narração do cadastro do cliente
  briefing?: string; // Briefing do cadastro do cliente
  note?: string; // Anotação do operador
  noteRead?: boolean; // Se a anotação foi marcada como lida
}

// Image cache to avoid reloading
const imageCache = new Map<string, HTMLImageElement>();

// Resilient image loader: fetch-as-blob (PRIMARY) → CORS → no-CORS (FALLBACK)
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
          console.log(`[loadImage-art] ✅ blob OK: ${url.substring(0, 80)}`);
          return img;
        }
      } else {
        console.warn(`[loadImage-art] fetch status ${response.status}: ${url.substring(0, 80)}`);
      }
    } catch (e) {
      console.warn(`[loadImage-art] fetch failed (attempt ${attempt + 1}): ${url.substring(0, 80)}`, e instanceof Error ? e.message : e);
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
        console.log(`[loadImage-art] ✅ CORS OK: ${url.substring(0, 80)}`);
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
    console.warn(`[loadImage-art] ⚠️ no-CORS (tainted): ${url.substring(0, 80)}`);
    return img;
  }
  
  console.error(`[loadImage-art] ❌ ALL failed: ${url.substring(0, 80)}`);
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
  try {
    await document.fonts.load(`16px "${fontFamily}"`);
  } catch { /* font may still work */ }
};

interface BatchArtGeneratorProps {
  template: MasterTemplate;
  initialTeamFilter?: string;
  initialBatch?: import("@/lib/batchHistory").BatchGeneration;
  onBack: () => void;
  onComplete: () => void;
}

export const BatchArtGenerator = ({ template, initialTeamFilter, initialBatch, onBack, onComplete }: BatchArtGeneratorProps) => {
  const [clientArts, setClientArts] = useState<ClientArt[]>([]);
  const [currentBatchId, setCurrentBatchId] = useState<string | null>(initialBatch?.id || null);
  const [isLoading, setIsLoading] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSendingEmails, setIsSendingEmails] = useState(false);
  const [selectedArt, setSelectedArt] = useState<ClientArt | null>(null);
  const [selectedArtIndex, setSelectedArtIndex] = useState<number>(-1);
  const [isImageDialogOpen, setIsImageDialogOpen] = useState(false);
  const [isAdjustDialogOpen, setIsAdjustDialogOpen] = useState(false);
  const [photoOffsetX, setPhotoOffsetX] = useState(0);
  const [photoOffsetY, setPhotoOffsetY] = useState(0);
  const [photoScale, setPhotoScale] = useState(100);
  const [photoFrame, setPhotoFrame] = useState<ShapeOverride | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchImages_results, setSearchImagesResults] = useState<SearchImage[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [customImageUrl, setCustomImageUrl] = useState("");
  // Team filter is now fixed based on initial selection - no runtime switching
  const teamFilter = initialTeamFilter;
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // Element override states
  const [logoX, setLogoX] = useState(0);
  const [logoY, setLogoY] = useState(0);
  const [logoScale, setLogoScale] = useState(100);
  const [textX, setTextX] = useState(0);
  const [textY, setTextY] = useState(0);
  const [textFontSize, setTextFontSize] = useState(100);
  const [contactX, setContactX] = useState(0);
  const [contactY, setContactY] = useState(0);
  const [contactScale, setContactScale] = useState(100);
  const [contactScaleX, setContactScaleX] = useState(100);
  const [contactScaleY, setContactScaleY] = useState(100);
  const [logoScaleX, setLogoScaleX] = useState(100);
  const [logoScaleY, setLogoScaleY] = useState(100);
  const [shapeOverrides, setShapeOverrides] = useState<Record<string, ShapeOverride>>({});
  const [livePreviewUrl, setLivePreviewUrl] = useState<string | null>(null);
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [isRemovingBg, setIsRemovingBg] = useState(false);
  const [removeBgProgress, setRemoveBgProgress] = useState("");
  const [eraserModalOpen, setEraserModalOpen] = useState(false);
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);
  
  const { toast } = useToast();
  
  // Handle eraser save - update the photo with erased version
  const handleEraserSave = async (newImageUrl: string) => {
    if (!selectedArt) return;
    
    const index = clientArts.findIndex((a) => 
      a.clientId === selectedArt.clientId && 
      a.cardId === selectedArt.cardId &&
      a.pageIndex === selectedArt.pageIndex
    );
    if (index === -1) return;

    const updatedArt = { ...clientArts[index], photoImage: newImageUrl };
    const updatedArts = [...clientArts];
    updatedArts[index] = updatedArt;
    setClientArts(updatedArts);
    setSelectedArt(updatedArt);

    // Regenerate the art with cleaned photo
    const artImageUrl = await generateArtForClient(updatedArt);
    const finalArts = [...updatedArts];
    finalArts[index] = { ...updatedArt, imageUrl: artImageUrl };
    setClientArts(finalArts);
    setSelectedArt({ ...updatedArt, imageUrl: artImageUrl });
    setLivePreviewUrl(artImageUrl);
    
    toast({
      title: "Imagem limpa!",
      description: "A foto foi atualizada e a arte regenerada.",
    });
  };

  // Handle background removal for current photo
  const handleRemoveBackground = async () => {
    if (!selectedArt || !selectedArt.photoImage) {
      toast({
        title: "Nenhuma foto selecionada",
        description: "Primeiro selecione ou adicione uma foto à arte.",
        variant: "destructive",
      });
      return;
    }

    setIsRemovingBg(true);
    setRemoveBgProgress("Iniciando...");
    
    try {
      const newImageUrl = await removeBackground(selectedArt.photoImage, setRemoveBgProgress);
      
      // Apply the new image without background
      const index = clientArts.findIndex((a) => 
        a.clientId === selectedArt.clientId && 
        a.cardId === selectedArt.cardId &&
        a.pageIndex === selectedArt.pageIndex
      );
      if (index === -1) return;

      const updatedArt = { ...clientArts[index], photoImage: newImageUrl, photoOffset: { x: 0, y: 0 } };
      const updatedArts = [...clientArts];
      updatedArts[index] = updatedArt;
      setClientArts(updatedArts);
      setSelectedArt(updatedArt);

      // Regenerate the art with new photo
      const artImageUrl = await generateArtForClient(updatedArt);
      const finalArts = [...updatedArts];
      finalArts[index] = { ...updatedArt, imageUrl: artImageUrl };
      setClientArts(finalArts);
      setSelectedArt({ ...updatedArt, imageUrl: artImageUrl });
      setLivePreviewUrl(artImageUrl);
      
      toast({
        title: "Fundo removido!",
        description: "A imagem foi processada e a arte regenerada.",
      });
    } catch (error) {
      console.error('Error removing background:', error);
      toast({
        title: "Erro ao remover fundo",
        description: "Não foi possível processar a imagem. Tente outra imagem.",
        variant: "destructive",
      });
    } finally {
      setIsRemovingBg(false);
      setRemoveBgProgress("");
    }
  };

  useEffect(() => {
    if (initialBatch) {
      loadFromExistingBatch(initialBatch);
    } else {
      loadTaggedCards(teamFilter);
    }
  }, []);

  // Auto-generate arts when cards are loaded (only for new batches, not existing ones)
  useEffect(() => {
    if (clientArts.length > 0 && !isLoading && !isGenerating && !clientArts.some(a => a.imageUrl) && !initialBatch) {
      generateAllArts();
    }
  }, [clientArts, isLoading]);

  const loadFromExistingBatch = async (batch: import("@/lib/batchHistory").BatchGeneration) => {
    // Collect unique client IDs to fetch image_type, narration_type, briefing
    const clientIds = [...new Set(batch.items.map(item => item.clientId))];
    const { data: clientsData } = await supabase
      .from("client_data")
      .select("id, image_type, narration_type, briefing")
      .in("id", clientIds);
    const imageTypeMap: Record<string, string> = {};
    const narrationTypeMap: Record<string, string> = {};
    const briefingMap: Record<string, string> = {};
    clientsData?.forEach(c => { 
      if (c.image_type) imageTypeMap[c.id] = c.image_type;
      if (c.narration_type) narrationTypeMap[c.id] = c.narration_type;
      if (c.briefing) briefingMap[c.id] = c.briefing;
    });

    const arts: ClientArt[] = batch.items.map((item, index) => ({
      clientId: item.clientId,
      clientName: item.clientName,
      company: item.company,
      cardId: item.cardId,
      cardTitle: item.cardTitle,
      cardText: item.cardText,
      brandKit: item.brandKit,
      imageUrl: item.files?.[0] || null,
      backgroundImage: item.backgroundImages?.[0],
      imageType: (item as any).imageType || imageTypeMap[item.clientId] || undefined,
      narrationType: (item as any).narrationType || narrationTypeMap[item.clientId] || undefined,
      briefing: (item as any).briefing || briefingMap[item.clientId] || undefined,
      status: "pending" as const,
      note: item.note,
      noteRead: item.noteRead,
    }));
    setClientArts(arts);
    setIsLoading(false);
  };

  const loadTaggedCards = async (filter?: string) => {
    try {
      setIsLoading(true);
      setClientArts([]); // Clear existing arts when filter changes
      
      // Auto-tag first cards of all active clients (with optional team filter)
      await autoTagFirstCardsForAllActiveClients(filter);
      
      const taggedCards = await getTaggedCardsForArtGeneration();

      const arts: ClientArt[] = [];
      
      taggedCards.forEach((card: any) => {
        const fullText = card.description || card.title;
        // Check if text contains semicolons - indicates carousel
        const textParts = fullText.split(';').map((t: string) => t.trim()).filter((t: string) => t.length > 0);
        const isCarousel = textParts.length > 1;
        
        if (isCarousel) {
          // Create multiple arts for carousel
          textParts.forEach((text: string, pageIndex: number) => {
            arts.push({
              clientId: card.client?.id || card.client_id,
              clientName: card.client?.name || "Cliente",
              company: card.client?.company || card.client?.name || "Cliente",
              cardId: card.id,
              cardTitle: card.title,
              cardText: text,
              brandKit: card.client?.brand_kit,
              imageType: card.client?.image_type || undefined,
              narrationType: card.client?.narration_type || undefined,
              briefing: card.client?.briefing || undefined,
              imageUrl: null,
              status: "pending",
              pageIndex,
              totalPages: textParts.length,
            });
          });
        } else {
          // Single art
          arts.push({
            clientId: card.client?.id || card.client_id,
            clientName: card.client?.name || "Cliente",
            company: card.client?.company || card.client?.name || "Cliente",
            cardId: card.id,
            cardTitle: card.title,
            cardText: fullText,
            brandKit: card.client?.brand_kit,
            imageType: card.client?.image_type || undefined,
            narrationType: card.client?.narration_type || undefined,
            briefing: card.client?.briefing || undefined,
            imageUrl: null,
            status: "pending",
          });
        }
      });

      setClientArts(arts);

      if (arts.length === 0) {
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

  const generateArtForClient = async (art: ClientArt): Promise<string> => {
    console.log("Generating art for:", art.clientName, "Template elements:", template.elements.length);
    
    const canvas = document.createElement("canvas");
    canvas.width = template.width;
    canvas.height = template.height;
    const ctx = canvas.getContext("2d")!;

    // Color mapping from brand kit:
    // colors[0] = background color
    // colors[1] = text color  
    // colors[2] = accessory color 1
    // colors[3] = accessory color 2
    const bgColor = art.brandKit?.colors?.[0] || template.backgroundColor;
    const textColor = art.brandKit?.colors?.[1] || "#000000";
    const accessoryColor1 = art.brandKit?.colors?.[2] || "#cccccc";
    const accessoryColor2 = art.brandKit?.colors?.[3] || "#aaaaaa";
    
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

    // Helper to draw border after fill (always full opacity)
    const drawShapeBorder = (el: CanvasElement) => {
      if (el.borderWidth && el.borderWidth > 0) {
        ctx.globalAlpha = 1;
        ctx.strokeStyle = getBorderColor(el);
        ctx.lineWidth = el.borderWidth;
        ctx.stroke();
        ctx.globalAlpha = (el.opacity ?? 100) / 100;
      }
    };

    // Helper to convert hex to rgba
    const hexToRgba = (hex: string, opacity: number): string => {
      const r = parseInt(hex.slice(1, 3), 16);
      const g = parseInt(hex.slice(3, 5), 16);
      const b = parseInt(hex.slice(5, 7), 16);
      return `rgba(${r}, ${g}, ${b}, ${opacity / 100})`;
    };

    // Helper to get fill style with gradient support
    const getElementFillStyle = (el: CanvasElement, x: number, y: number, w: number, h: number, defaultColor: string): string | CanvasGradient => {
      if (el.gradient) {
        let gradient;
        if (el.gradient.type === "linear") {
          const angle = (el.gradient.angle || 0) * Math.PI / 180;
          const cx = x + w / 2;
          const cy = y + h / 2;
          const dx = Math.cos(angle) * w / 2;
          const dy = Math.sin(angle) * h / 2;
          gradient = ctx.createLinearGradient(cx - dx, cy - dy, cx + dx, cy + dy);
        } else {
          gradient = ctx.createRadialGradient(
            x + w / 2, y + h / 2, 0,
            x + w / 2, y + h / 2, Math.max(w, h) / 2
          );
        }
        // Apply gradient color roles from brand kit, or use fixed colors
        const color1 = el.gradient.color1Role === "background" ? bgColor
          : el.gradient.color1Role === "text" ? textColor
          : el.gradient.color1Role === "accessory1" ? accessoryColor1
          : el.gradient.color1Role === "accessory2" ? accessoryColor2
          : el.gradient.color1;
        const color2Raw = el.gradient.color2Role === "background" ? bgColor
          : el.gradient.color2Role === "text" ? textColor
          : el.gradient.color2Role === "accessory1" ? accessoryColor1
          : el.gradient.color2Role === "accessory2" ? accessoryColor2
          : el.gradient.color2;
        // In fade mode, color2 should match color1 (only opacity differs) to avoid color bleeding
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

    // Helper to reset styles
    const resetStyles = () => {
      ctx.globalAlpha = 1;
      ctx.shadowBlur = 0;
      ctx.shadowColor = "transparent";
      ctx.shadowOffsetX = 0;
      ctx.shadowOffsetY = 0;
    };
    
    ctx.fillStyle = bgColor;
    ctx.fillRect(0, 0, template.width, template.height);

    // Draw background image if set
    if (art.backgroundImage) {
      const bgImg = await loadImage(art.backgroundImage);
      if (bgImg) {
        ctx.drawImage(bgImg, 0, 0, template.width, template.height);
      }
    }

    // Draw elements
    for (const el of template.elements) {
      ctx.save();
      applyElementStyles(el);
      
      if (el.type === "rect") {
        const ov = art.elementOverrides?.shapes?.[el.id];
        const x = ov?.x ?? el.x;
        const y = ov?.y ?? el.y;
        const w = ov?.width ?? el.width;
        const h = ov?.height ?? el.height;
        ctx.fillStyle = getElementFillStyle(el, x, y, w, h, accessoryColor1);
        if (el.borderRadius && el.borderRadius > 0) {
          ctx.beginPath();
          ctx.roundRect(x, y, w, h, el.borderRadius);
          ctx.fill();
          drawShapeBorder(el);
        } else {
          ctx.fillRect(x, y, w, h);
          drawShapeBorder(el);
        }
      } else if (el.type === "circle") {
        const ov = art.elementOverrides?.shapes?.[el.id];
        const x = ov?.x ?? el.x;
        const y = ov?.y ?? el.y;
        const w = ov?.width ?? el.width;
        const h = ov?.height ?? el.height;
        ctx.fillStyle = getElementFillStyle(el, x, y, w, h, accessoryColor2);
        ctx.beginPath();
        ctx.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, 0, 0, Math.PI * 2);
        ctx.fill();
        drawShapeBorder(el);
      } else if (el.type === "triangle") {
        const ov = art.elementOverrides?.shapes?.[el.id];
        const x = ov?.x ?? el.x;
        const y = ov?.y ?? el.y;
        const w = ov?.width ?? el.width;
        const h = ov?.height ?? el.height;
        ctx.fillStyle = getElementFillStyle(el, x, y, w, h, accessoryColor1);
        ctx.beginPath();
        ctx.moveTo(x + w / 2, y);
        ctx.lineTo(x + w, y + h);
        ctx.lineTo(x, y + h);
        ctx.closePath();
        ctx.fill();
        drawShapeBorder(el);
      } else if (el.type === "diamond") {
        const ov = art.elementOverrides?.shapes?.[el.id];
        const x = ov?.x ?? el.x;
        const y = ov?.y ?? el.y;
        const w = ov?.width ?? el.width;
        const h = ov?.height ?? el.height;
        ctx.fillStyle = getElementFillStyle(el, x, y, w, h, accessoryColor2);
        ctx.beginPath();
        ctx.moveTo(x + w / 2, y);
        ctx.lineTo(x + w, y + h / 2);
        ctx.lineTo(x + w / 2, y + h);
        ctx.lineTo(x, y + h / 2);
        ctx.closePath();
        ctx.fill();
        drawShapeBorder(el);
      } else if (el.type === "hexagon") {
        const ov = art.elementOverrides?.shapes?.[el.id];
        const x = ov?.x ?? el.x;
        const y = ov?.y ?? el.y;
        const w = ov?.width ?? el.width;
        const h = ov?.height ?? el.height;
        ctx.fillStyle = getElementFillStyle(el, x, y, w, h, accessoryColor1);
        const cx = x + w / 2;
        const cy = y + h / 2;
        const r = Math.min(w, h) / 2;
        ctx.beginPath();
        for (let i = 0; i < 6; i++) {
          const angle = (Math.PI / 3) * i - Math.PI / 2;
          const px = cx + r * Math.cos(angle);
          const py = cy + r * Math.sin(angle);
          if (i === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
        ctx.closePath();
        ctx.fill();
        drawShapeBorder(el);
      } else if (el.type === "pentagon") {
        const ov = art.elementOverrides?.shapes?.[el.id];
        const x = ov?.x ?? el.x;
        const y = ov?.y ?? el.y;
        const w = ov?.width ?? el.width;
        const h = ov?.height ?? el.height;
        ctx.fillStyle = getElementFillStyle(el, x, y, w, h, accessoryColor2);
        const cx = x + w / 2;
        const cy = y + h / 2;
        const r = Math.min(w, h) / 2;
        ctx.beginPath();
        for (let i = 0; i < 5; i++) {
          const angle = (Math.PI * 2 / 5) * i - Math.PI / 2;
          const px = cx + r * Math.cos(angle);
          const py = cy + r * Math.sin(angle);
          if (i === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
        ctx.closePath();
        ctx.fill();
        drawShapeBorder(el);
      } else if (el.type === "star") {
        const ov = art.elementOverrides?.shapes?.[el.id];
        const x = ov?.x ?? el.x;
        const y = ov?.y ?? el.y;
        const w = ov?.width ?? el.width;
        const h = ov?.height ?? el.height;
        ctx.fillStyle = getElementFillStyle(el, x, y, w, h, accessoryColor1);
        const cx = x + w / 2;
        const cy = y + h / 2;
        const outerR = Math.min(w, h) / 2;
        const innerR = outerR * 0.4;
        ctx.beginPath();
        for (let i = 0; i < 10; i++) {
          const angle = (Math.PI / 5) * i - Math.PI / 2;
          const r = i % 2 === 0 ? outerR : innerR;
          const px = cx + r * Math.cos(angle);
          const py = cy + r * Math.sin(angle);
          if (i === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
        ctx.closePath();
        ctx.fill();
        drawShapeBorder(el);
      } else if (el.type === "line") {
        const ov = art.elementOverrides?.shapes?.[el.id];
        const x = ov?.x ?? el.x;
        const y = ov?.y ?? el.y;
        const w = ov?.width ?? el.width;
        const h = ov?.height ?? el.height;
        ctx.strokeStyle = getElementColor(el, accessoryColor1);
        ctx.lineWidth = h || 4;
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(x, y + h / 2);
        ctx.lineTo(x + w, y + h / 2);
        ctx.stroke();
      } else if (el.type === "polkaDots") {
        const ov = art.elementOverrides?.shapes?.[el.id];
        const x = ov?.x ?? el.x;
        const y = ov?.y ?? el.y;
        const w = ov?.width ?? el.width;
        const h = ov?.height ?? el.height;

        const color = getElementColor(el, accessoryColor1);
        const dotRadius = Math.min(w, h) * 0.08;
        const spacing = dotRadius * 3;
        const cols = Math.max(1, Math.floor(w / spacing));
        const rows = Math.max(1, Math.floor(h / spacing));
        const offsetX = (w - (cols - 1) * spacing) / 2;
        const offsetY = (h - (rows - 1) * spacing) / 2;

        ctx.fillStyle = color;
        for (let row = 0; row < rows; row++) {
          for (let col = 0; col < cols; col++) {
            const cx = x + offsetX + col * spacing;
            const cy = y + offsetY + row * spacing;
            ctx.beginPath();
            ctx.arc(cx, cy, dotRadius, 0, Math.PI * 2);
            ctx.fill();
          }
        }
      } else if (el.type === "dotsGrid") {
        const ov = art.elementOverrides?.shapes?.[el.id];
        const x = ov?.x ?? el.x;
        const y = ov?.y ?? el.y;
        const w = ov?.width ?? el.width;
        const h = ov?.height ?? el.height;

        const color = getElementColor(el, accessoryColor2);
        const dotCount = 25;
        ctx.fillStyle = color;

        const seed = x + y + w + h;
        const random = (i: number) => {
          const n = Math.sin(seed + i * 9.999) * 10000;
          return n - Math.floor(n);
        };

        for (let i = 0; i < dotCount; i++) {
          const cx = x + random(i * 2) * w;
          const cy = y + random(i * 2 + 1) * h;
          const radius = 3 + random(i * 3) * 12;
          ctx.beginPath();
          ctx.arc(cx, cy, radius, 0, Math.PI * 2);
          ctx.fill();
        }
      } else if (el.type === "confetti") {
        const ov = art.elementOverrides?.shapes?.[el.id];
        const x = ov?.x ?? el.x;
        const y = ov?.y ?? el.y;
        const w = ov?.width ?? el.width;
        const h = ov?.height ?? el.height;

        const base = getElementColor(el, accessoryColor1);
        const palette = [base, accessoryColor1, accessoryColor2, textColor];
        const shapeCount = 30;

        const seed = x + y + w + h;
        const random = (i: number) => {
          const n = Math.sin(seed + i * 9.999) * 10000;
          return n - Math.floor(n);
        };

        for (let i = 0; i < shapeCount; i++) {
          const cx = x + random(i * 2) * w;
          const cy = y + random(i * 2 + 1) * h;
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
        const ov = art.elementOverrides?.shapes?.[el.id];
        const x = ov?.x ?? el.x;
        const y = ov?.y ?? el.y;
        const w = ov?.width ?? el.width;
        const h = ov?.height ?? el.height;

        const color = getElementColor(el, accessoryColor2);
        ctx.fillStyle = color;

        const seed = x + y + w + h;
        const random = (i: number) => {
          const n = Math.sin(seed + i * 9.999) * 10000;
          return n - Math.floor(n);
        };

        const cx = x + w / 2;
        const cy = y + h / 2;
        const mainRadius = Math.min(w, h) * 0.28;
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
        const ov = art.elementOverrides?.shapes?.[el.id];
        const x = ov?.x ?? el.x;
        const y = ov?.y ?? el.y;
        const w = ov?.width ?? el.width;
        const h = ov?.height ?? el.height;

        const color = getElementColor(el, accessoryColor1);
        ctx.strokeStyle = color;
        ctx.lineWidth = Math.max(2, h * 0.08);
        ctx.lineCap = "round";

        const zigzags = 8;
        const stepX = w / zigzags;
        ctx.beginPath();
        ctx.moveTo(x, y + h / 2);
        for (let i = 1; i <= zigzags; i++) {
          const px = x + i * stepX;
          const py = y + (i % 2 === 0 ? h * 0.2 : h * 0.8);
          ctx.lineTo(px, py);
        }
        ctx.stroke();
      } else if (el.type === "spiral") {
        const ov = art.elementOverrides?.shapes?.[el.id];
        const x = ov?.x ?? el.x;
        const y = ov?.y ?? el.y;
        const w = ov?.width ?? el.width;
        const h = ov?.height ?? el.height;

        const color = getElementColor(el, accessoryColor2);
        ctx.strokeStyle = color;
        ctx.lineWidth = Math.max(2, Math.min(w, h) * 0.03);
        ctx.lineCap = "round";

        const cx = x + w / 2;
        const cy = y + h / 2;
        const maxR = Math.min(w, h) * 0.45;
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
        // Text uses color 2 and client's font
        ctx.fillStyle = textColor;
        const baseFontSize = el.fontSize || 32;
        const fontSizeMultiplier = (art.elementOverrides?.textFontSize || 100) / 100;
        const fontSize = Math.round(baseFontSize * fontSizeMultiplier);
        const fontFamily = art.brandKit?.font || art.brandKit?.fontFamily || "Arial";
        ctx.font = `${fontSize}px ${fontFamily}`;
        
        // Use card text for text elements
        const text = art.cardText || el.text || "";
        
        // Apply text position overrides
        const textOffsetX = art.elementOverrides?.textX || 0;
        const textOffsetY = art.elementOverrides?.textY || 0;
        const baseX = el.x + textOffsetX;
        const baseY = el.y + textOffsetY;
        
        // Text alignment
        const align = el.textAlign || "left";
        ctx.textAlign = align;
        const drawX = align === "center" ? baseX + (el.width || 400) / 2 : align === "right" ? baseX + (el.width || 400) : baseX;
        
        // Word wrap text within element width
        const words = text.split(' ');
        let line = '';
        let y = baseY + fontSize;
        const maxWidth = el.width || 400;
        const lineHeight = (el.lineHeight || 1.2) * fontSize;
        
        for (let i = 0; i < words.length; i++) {
          const testLine = line + words[i] + ' ';
          const metrics = ctx.measureText(testLine);
          if (metrics.width > maxWidth && i > 0) {
            ctx.fillText(line.trim(), drawX, y);
            line = words[i] + ' ';
            y += lineHeight;
          } else {
            line = testLine;
          }
        }
        ctx.fillText(line.trim(), drawX, y);
        ctx.textAlign = "left";
        console.log("Drew text at:", baseX, baseY, "Text:", text.substring(0, 50), "Font:", fontFamily);
      } else if (el.type === "image" && el.placeholder && art.photoImage) {
        // Draw photo with pan (offset) + zoom (photoScale)
        const img = await loadImage(art.photoImage);
        const frameOv = art.elementOverrides?.photoFrame;
        const frameW = frameOv?.width ?? el.width;
        const frameH = frameOv?.height ?? el.height;
        const frameX = frameOv?.x ?? el.x;
        const frameY = frameOv?.y ?? el.y;

        if (img) {
          const offset = art.photoOffset || { x: 0, y: 0 };
          const zoom = (art.elementOverrides?.photoScale || 100) / 100; // < 1 = zoom out, > 1 = zoom in

          const imgAspect = img.width / img.height;
          const frameAspect = frameW / frameH;

          // Start with "cover" crop
          let sw = img.width;
          let sh = img.height;

          if (imgAspect > frameAspect) {
            sh = img.height;
            sw = sh * frameAspect;
          } else {
            sw = img.width;
            sh = sw / frameAspect;
          }

          // Apply zoom: zoom < 1 = zoom out (show more), zoom > 1 = zoom in
          sw = sw / zoom;
          sh = sh / zoom;

          // Clamp crop to image bounds
          if (sw > img.width) {
            sw = img.width;
            sh = sw / frameAspect;
          }
          if (sh > img.height) {
            sh = img.height;
            sw = sh * frameAspect;
          }

          // Center and apply panning
          let sx = (img.width - sw) / 2;
          let sy = (img.height - sh) / 2;

          const maxPanX = (img.width - sw) / 2;
          const maxPanY = (img.height - sh) / 2;
          sx += (offset.x / 100) * maxPanX;
          sy += (offset.y / 100) * maxPanY;

          sx = Math.max(0, Math.min(sx, img.width - sw));
          sy = Math.max(0, Math.min(sy, img.height - sh));

          // Apply clip shape (circle or rounded rect)
          const clipShape = (el as any).clipShape || "rect";
          const radius = el.borderRadius || 0;
          
          if (clipShape === "circle") {
            ctx.save();
            ctx.beginPath();
            ctx.ellipse(frameX + frameW / 2, frameY + frameH / 2, frameW / 2, frameH / 2, 0, 0, Math.PI * 2);
            ctx.clip();
            ctx.drawImage(img, sx, sy, sw, sh, frameX, frameY, frameW, frameH);
            ctx.restore();
          } else if (radius > 0) {
            ctx.save();
            ctx.beginPath();
            ctx.roundRect(frameX, frameY, frameW, frameH, radius);
            ctx.clip();
            ctx.drawImage(img, sx, sy, sw, sh, frameX, frameY, frameW, frameH);
            ctx.restore();
          } else {
            ctx.drawImage(img, sx, sy, sw, sh, frameX, frameY, frameW, frameH);
          }
        } else {
          ctx.fillStyle = "#e5e7eb";
          ctx.fillRect(frameX, frameY, frameW, frameH);
        }
      } else if (el.type === "logo") {
        // Logo uses PNG[0] from brand kit with optional overrides
        const logoUrl = art.brandKit?.pngs?.[0] || art.brandKit?.logo;
        console.log("Loading logo from:", logoUrl?.substring(0, 50));
        if (logoUrl) {
          const img = await loadImage(logoUrl);
          if (img) {
            const logoOffsetX = art.elementOverrides?.logoX || 0;
            const logoOffsetY = art.elementOverrides?.logoY || 0;
            // Use separate X/Y scaling if available
            const logoScaleXMult = (art.elementOverrides?.logoScaleX || art.elementOverrides?.logoScale || 100) / 100;
            const logoScaleYMult = (art.elementOverrides?.logoScaleY || art.elementOverrides?.logoScale || 100) / 100;
            const newWidth = el.width * logoScaleXMult;
            const newHeight = el.height * logoScaleYMult;
            ctx.drawImage(img, el.x + logoOffsetX, el.y + logoOffsetY, newWidth, newHeight);
          }
        }
      } else if (el.type === "contact") {
        // Contact uses PNG[1] from brand kit with optional overrides
        const contactUrl = art.brandKit?.pngs?.[1] || art.brandKit?.contactInfo;
        console.log("Loading contact from:", contactUrl?.substring(0, 50));
        if (contactUrl) {
          const img = await loadImage(contactUrl);
          if (img) {
            const contactOffsetX = art.elementOverrides?.contactX || 0;
            const contactOffsetY = art.elementOverrides?.contactY || 0;
            // Use separate X/Y scaling if available
            const contactScaleXMult = (art.elementOverrides?.contactScaleX || art.elementOverrides?.contactScale || 100) / 100;
            const contactScaleYMult = (art.elementOverrides?.contactScaleY || art.elementOverrides?.contactScale || 100) / 100;
            const newWidth = el.width * contactScaleXMult;
            const newHeight = el.height * contactScaleYMult;
            ctx.drawImage(img, el.x + contactOffsetX, el.y + contactOffsetY, newWidth, newHeight);
          }
        }
      } else if (el.type === "mascot") {
        // Mascot uses PNG[2] from brand kit with optional overrides
        const mascotUrl = art.brandKit?.pngs?.[2] || art.brandKit?.mascot;
        console.log("[mascot] Loading from:", mascotUrl ? mascotUrl.substring(0, 80) : "EMPTY/NULL");
        if (mascotUrl) {
          const img = await loadImage(mascotUrl);
          if (img) {
            const mascotOffsetX = art.elementOverrides?.mascotX || 0;
            const mascotOffsetY = art.elementOverrides?.mascotY || 0;
            const mascotScaleXMult = (art.elementOverrides?.mascotScaleX || 100) / 100;
            const mascotScaleYMult = (art.elementOverrides?.mascotScaleY || 100) / 100;
            const newWidth = el.width * mascotScaleXMult;
            const newHeight = el.height * mascotScaleYMult;
            ctx.drawImage(img, el.x + mascotOffsetX, el.y + mascotOffsetY, newWidth, newHeight);
            console.log("[mascot] ✅ Drew mascot at", el.x + mascotOffsetX, el.y + mascotOffsetY, newWidth, newHeight);
          } else {
            console.warn("[mascot] ❌ Image failed to load");
          }
        } else {
          console.warn("[mascot] ⚠️ No mascot URL in brand kit for", art.clientName);
        }
      }
      ctx.restore();
    }

    return canvas.toDataURL("image/png");
  };

  const generateAllArts = async () => {
    setIsGenerating(true);
    try {
      const updatedArts = [...clientArts];

      // Preload all unique fonts from brand kits
      const uniqueFonts = new Set(updatedArts.map(a => a.brandKit?.font || a.brandKit?.fontFamily).filter(Boolean));
      await Promise.all([...uniqueFonts].map(f => loadGoogleFont(f)));
      
      // Check if template has image placeholders
      const hasImagePlaceholder = template.elements.some(el => el.type === "image" && el.placeholder);

      for (let i = 0; i < updatedArts.length; i++) {
        const art = updatedArts[i];
        
        // Search for relevant image if template has image placeholder
        if (hasImagePlaceholder && !art.photoImage) {
          try {
            // Build rich search context from client metadata + page text
            const contextParts = [art.imageType, art.narrationType, art.briefing, art.cardText].filter(Boolean);
            const fullContext = contextParts.join(" ").split(" ").slice(0, 15).join(" ");
            let searchTerms = fullContext;
            
            try {
              const translateResponse = await fetch(
                `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/translate-text`,
                {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
                  },
                  body: JSON.stringify({ text: fullContext }),
                }
              );
              
              if (translateResponse.ok) {
                const { translatedText } = await translateResponse.json();
                searchTerms = translatedText;
                console.log("Searching images with translated terms:", searchTerms);
              }
            } catch (translateError) {
              console.error("Translation failed, using original text:", translateError);
            }
            
            const images = await searchImages(searchTerms, 1);
            if (images.length > 0) {
              updatedArts[i] = { ...art, photoImage: images[0].urls.regular };
            }
          } catch (error) {
            console.error("Error searching image for:", art.cardText);
          }
        }
        
        const imageUrl = await generateArtForClient(updatedArts[i]);
        updatedArts[i] = { ...updatedArts[i], imageUrl };
        setClientArts([...updatedArts]);
      }

      toast({
        title: "Artes geradas!",
        description: `${updatedArts.length} artes foram geradas com sucesso.`,
      });

      // Auto-save as draft immediately after generation
      try {
        const artsToSave = updatedArts.filter((a) => a.imageUrl);
        if (artsToSave.length > 0) {
          const batchItems: BatchItem[] = artsToSave.map((art) => ({
            cardId: art.cardId,
            clientId: art.clientId,
            clientName: art.clientName,
            company: art.company,
            cardTitle: art.cardTitle,
            cardText: art.cardText,
            brandKit: sanitizeBrandKitForStorage(art.brandKit),
            files: [art.imageUrl!],
            backgroundImages: art.backgroundImage ? [art.backgroundImage] : undefined,
            note: art.note,
            noteRead: art.noteRead,
          }));
          const hasUnresolvedNotes = batchItems.some(i => i.note && !i.noteRead);
          const snapshotWithTeam = { ...template, teamFilter: initialTeamFilter || null, hasUnresolvedNotes };
          const savedId = await saveBatchGeneration("art", snapshotWithTeam, batchItems, currentBatchId || undefined);
          if (savedId) setCurrentBatchId(savedId);
          console.log("Auto-saved batch draft after generation:", savedId);
        }
      } catch (autoSaveError) {
        console.error("Auto-save draft failed (non-critical):", autoSaveError);
      }
    } catch (error) {
      console.error("Error generating arts:", error);
      toast({
        title: "Erro ao gerar artes",
        variant: "destructive",
      });
    } finally {
      setIsGenerating(false);
    }
  };

  const regenerateArt = async (index: number) => {
    const art = clientArts[index];
    const imageUrl = await generateArtForClient(art);
    const updatedArts = [...clientArts];
    updatedArts[index] = { ...art, imageUrl };
    setClientArts(updatedArts);
  };

  const handleApprove = (index: number) => {
    const updatedArts = [...clientArts];
    updatedArts[index] = { ...updatedArts[index], status: "approved" };
    setClientArts(updatedArts);
  };

  const handleReject = (index: number) => {
    const updatedArts = [...clientArts];
    updatedArts[index] = { ...updatedArts[index], status: "rejected" };
    setClientArts(updatedArts);
  };

  const handleSearchImages = async () => {
    if (!searchQuery.trim()) return;
    setIsSearching(true);
    try {
      const images = await searchImages(searchQuery, 15);
      setSearchImagesResults(images);
      
      const apis = getConfiguredApis();
      if (!apis.pexels && !apis.unsplash) {
        toast({
          title: "Busca limitada",
          description: "Configure VITE_PEXELS_API_KEY para busca real de imagens.",
        });
      }
    } catch (error) {
      toast({
        title: "Erro ao buscar imagens",
        variant: "destructive",
      });
    } finally {
      setIsSearching(false);
    }
  };

  const handleSelectPhotoImage = async (image: SearchImage) => {
    if (!selectedArt || selectedArtIndex < 0) return;
    const index = selectedArtIndex;
    if (index >= clientArts.length) return;

    const updatedArt = { ...clientArts[index], photoImage: image.urls.regular, photoOffset: { x: 0, y: 0 } };
    const updatedArts = [...clientArts];
    updatedArts[index] = updatedArt;
    setClientArts(updatedArts);
    setSelectedArt(updatedArt); // Update selectedArt too
    setIsImageDialogOpen(false);
    setCustomImageUrl("");

    // Regenerate the art with new photo and update state
    const newImageUrl = await generateArtForClient(updatedArt);
    const finalArts = [...updatedArts];
    finalArts[index] = { ...updatedArt, imageUrl: newImageUrl };
    setClientArts(finalArts);
    setSelectedArt({ ...updatedArt, imageUrl: newImageUrl });
    
    toast({
      title: "Foto aplicada!",
      description: "Arte regenerada com a nova imagem.",
    });
  };

  const handleCustomImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !selectedArt) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const base64 = event.target?.result as string;
      applyCustomImage(base64);
    };
    reader.readAsDataURL(file);
  };

  const handleCustomImageUrl = () => {
    if (!customImageUrl.trim() || !selectedArt) return;
    applyCustomImage(customImageUrl.trim());
  };

  const applyCustomImage = async (imageUrl: string) => {
    if (!selectedArt || selectedArtIndex < 0) return;
    const index = selectedArtIndex;
    if (index >= clientArts.length) return;

    const updatedArt = { ...clientArts[index], photoImage: imageUrl, photoOffset: { x: 0, y: 0 } };
    const updatedArts = [...clientArts];
    updatedArts[index] = updatedArt;
    setClientArts(updatedArts);
    setSelectedArt(updatedArt);
    setIsImageDialogOpen(false);
    setCustomImageUrl("");

    // Regenerate the art with new photo
    const newImageUrl = await generateArtForClient(updatedArt);
    const finalArts = [...updatedArts];
    finalArts[index] = { ...updatedArt, imageUrl: newImageUrl };
    setClientArts(finalArts);
    setSelectedArt({ ...updatedArt, imageUrl: newImageUrl });
    
    toast({
      title: "Imagem aplicada!",
      description: "Arte regenerada com a nova imagem.",
    });
  };

  const openAdjustDialog = (art: ClientArt) => {
    const idx = clientArts.indexOf(art);
    setSelectedArt(art);
    setSelectedArtIndex(idx);
    setLivePreviewUrl(art.imageUrl); // Start with current image
    setPhotoOffsetX(art.photoOffset?.x || 0);
    setPhotoOffsetY(art.photoOffset?.y || 0);
    setPhotoScale(art.elementOverrides?.photoScale || 100);
    setPhotoFrame(art.elementOverrides?.photoFrame || null);
    // Load element overrides
    setLogoX(art.elementOverrides?.logoX || 0);
    setLogoY(art.elementOverrides?.logoY || 0);
    setLogoScale(art.elementOverrides?.logoScale || 100);
    setLogoScaleX(art.elementOverrides?.logoScaleX || art.elementOverrides?.logoScale || 100);
    setLogoScaleY(art.elementOverrides?.logoScaleY || art.elementOverrides?.logoScale || 100);
    setTextX(art.elementOverrides?.textX || 0);
    setTextY(art.elementOverrides?.textY || 0);
    setTextFontSize(art.elementOverrides?.textFontSize || 100);
    setContactX(art.elementOverrides?.contactX || 0);
    setContactY(art.elementOverrides?.contactY || 0);
    setContactScale(art.elementOverrides?.contactScale || 100);
    setContactScaleX(art.elementOverrides?.contactScaleX || art.elementOverrides?.contactScale || 100);
    setContactScaleY(art.elementOverrides?.contactScaleY || art.elementOverrides?.contactScale || 100);
    setShapeOverrides(art.elementOverrides?.shapes || {});
    setIsAdjustDialogOpen(true);
  };

  // Refs that always hold current override values (no stale closures)
  const overridesRef = useRef({
    photoOffsetX, photoOffsetY, photoScale, photoFrame,
    logoX, logoY, logoScale, logoScaleX, logoScaleY,
    textX, textY, textFontSize,
    contactX, contactY, contactScale, contactScaleX, contactScaleY,
    shapeOverrides,
  });
  // Synchronous ref updater — called by wrapper setters so the ref is always
  // up-to-date even before React re-renders.
  const syncRef = useCallback((patch: Partial<typeof overridesRef.current>) => {
    overridesRef.current = { ...overridesRef.current, ...patch };
  }, []);

  // Wrapper setters that update state + ref synchronously
  const syncSetPhotoOffsetX = useCallback((v: number) => { setPhotoOffsetX(v); syncRef({ photoOffsetX: v }); }, [syncRef]);
  const syncSetPhotoOffsetY = useCallback((v: number) => { setPhotoOffsetY(v); syncRef({ photoOffsetY: v }); }, [syncRef]);
  const syncSetPhotoScale = useCallback((v: number) => { setPhotoScale(v); syncRef({ photoScale: v }); }, [syncRef]);
  const syncSetPhotoFrame = useCallback((v: ShapeOverride | null) => { setPhotoFrame(v); syncRef({ photoFrame: v }); }, [syncRef]);
  const syncSetLogoX = useCallback((v: number) => { setLogoX(v); syncRef({ logoX: v }); }, [syncRef]);
  const syncSetLogoY = useCallback((v: number) => { setLogoY(v); syncRef({ logoY: v }); }, [syncRef]);
  const syncSetLogoScaleX = useCallback((v: number) => { setLogoScaleX(v); syncRef({ logoScaleX: v }); }, [syncRef]);
  const syncSetLogoScaleY = useCallback((v: number) => { setLogoScaleY(v); syncRef({ logoScaleY: v }); }, [syncRef]);
  const syncSetTextX = useCallback((v: number) => { setTextX(v); syncRef({ textX: v }); }, [syncRef]);
  const syncSetTextY = useCallback((v: number) => { setTextY(v); syncRef({ textY: v }); }, [syncRef]);
  const syncSetTextFontSize = useCallback((v: number) => { setTextFontSize(v); syncRef({ textFontSize: v }); }, [syncRef]);
  const syncSetContactX = useCallback((v: number) => { setContactX(v); syncRef({ contactX: v }); }, [syncRef]);
  const syncSetContactY = useCallback((v: number) => { setContactY(v); syncRef({ contactY: v }); }, [syncRef]);
  const syncSetContactScaleX = useCallback((v: number) => { setContactScaleX(v); syncRef({ contactScaleX: v }); }, [syncRef]);
  const syncSetContactScaleY = useCallback((v: number) => { setContactScaleY(v); syncRef({ contactScaleY: v }); }, [syncRef]);
  const syncSetShapeOverrides = useCallback((v: Record<string, ShapeOverride>) => { setShapeOverrides(v); syncRef({ shapeOverrides: v }); }, [syncRef]);

  const selectedArtRef = useRef(selectedArt);
  useEffect(() => { selectedArtRef.current = selectedArt; });
  const clientArtsRef = useRef(clientArts);
  useEffect(() => { clientArtsRef.current = clientArts; });

  // Live preview regeneration using refs (always current values)
  const regenerateFromRefs = useCallback(async () => {
    const art = selectedArtRef.current;
    if (!art) return;
    const ov = overridesRef.current;
    
    const tempArt: ClientArt = {
      ...art,
      photoOffset: { x: ov.photoOffsetX, y: ov.photoOffsetY },
      elementOverrides: {
        logoX: ov.logoX, logoY: ov.logoY, logoScale: ov.logoScale,
        logoScaleX: ov.logoScaleX, logoScaleY: ov.logoScaleY,
        textX: ov.textX, textY: ov.textY, textFontSize: ov.textFontSize,
        contactX: ov.contactX, contactY: ov.contactY,
        contactScale: ov.contactScale, contactScaleX: ov.contactScaleX, contactScaleY: ov.contactScaleY,
        photoScale: ov.photoScale, photoFrame: ov.photoFrame || undefined,
        shapes: ov.shapeOverrides,
      }
    };
    
    setIsRegenerating(true);
    try {
      const newImageUrl = await generateArtForClient(tempArt);
      setLivePreviewUrl(newImageUrl);
    } catch (error) {
      console.error("Error regenerating preview:", error);
    } finally {
      setIsRegenerating(false);
    }
  }, [generateArtForClient]);

  // Save current overrides back to clientArts
  const commitOverridesToArt = useCallback(() => {
    const art = selectedArtRef.current;
    if (!art) return;
    const arts = clientArtsRef.current;
    const index = arts.findIndex((a) => 
      a.clientId === art.clientId && 
      a.cardId === art.cardId &&
      a.pageIndex === art.pageIndex
    );
    if (index === -1) return;

    const ov = overridesRef.current;
    const updatedArts = [...arts];
    updatedArts[index] = { 
      ...updatedArts[index], 
      photoOffset: { x: ov.photoOffsetX, y: ov.photoOffsetY },
      elementOverrides: {
        logoX: ov.logoX, logoY: ov.logoY, logoScale: ov.logoScale,
        logoScaleX: ov.logoScaleX, logoScaleY: ov.logoScaleY,
        textX: ov.textX, textY: ov.textY, textFontSize: ov.textFontSize,
        contactX: ov.contactX, contactY: ov.contactY,
        contactScale: ov.contactScale, contactScaleX: ov.contactScaleX, contactScaleY: ov.contactScaleY,
        photoScale: ov.photoScale, photoFrame: ov.photoFrame || undefined,
        shapes: ov.shapeOverrides,
      }
    };
    setClientArts(updatedArts);
  }, []);

  // On drag end: regenerate preview + persist (reads from refs = always current)
  const handleDragEnd = useCallback(() => {
    commitOverridesToArt();
    // Debounce regeneration
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    debounceTimerRef.current = setTimeout(() => {
      regenerateFromRefs();
    }, 80);
  }, [commitOverridesToArt, regenerateFromRefs]);

  // Auto-trigger preview when dialog opens
  useEffect(() => {
    if (isAdjustDialogOpen && selectedArt) {
      regenerateFromRefs();
    }
  }, [isAdjustDialogOpen, selectedArt]);

  // When closing the adjust dialog, do a final full regeneration
  const handleCloseAdjustDialog = useCallback(async () => {
    commitOverridesToArt();
    setIsAdjustDialogOpen(false);

    // Final regeneration using refs
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    await regenerateFromRefs();
    
    // Update the main art list with the final image
    const art = selectedArtRef.current;
    if (!art) return;
    const arts = clientArtsRef.current;
    const index = arts.findIndex((a) => 
      a.clientId === art.clientId && 
      a.cardId === art.cardId &&
      a.pageIndex === art.pageIndex
    );
    if (index === -1) return;

    const ov = overridesRef.current;
    const updatedArts = [...arts];
    updatedArts[index] = { 
      ...updatedArts[index], 
      photoOffset: { x: ov.photoOffsetX, y: ov.photoOffsetY },
      elementOverrides: {
        logoX: ov.logoX, logoY: ov.logoY, logoScale: ov.logoScale,
        logoScaleX: ov.logoScaleX, logoScaleY: ov.logoScaleY,
        textX: ov.textX, textY: ov.textY, textFontSize: ov.textFontSize,
        contactX: ov.contactX, contactY: ov.contactY,
        contactScale: ov.contactScale, contactScaleX: ov.contactScaleX, contactScaleY: ov.contactScaleY,
        photoScale: ov.photoScale, photoFrame: ov.photoFrame || undefined,
        shapes: ov.shapeOverrides,
      }
    };
    const imageUrl = await generateArtForClient(updatedArts[index]);
    updatedArts[index] = { ...updatedArts[index], imageUrl };
    setClientArts([...updatedArts]);
  }, [commitOverridesToArt, regenerateFromRefs, generateArtForClient]);

  // Refresh brand kit from database and regenerate art
  const refreshBrandKitAndRegenerate = async (index: number) => {
    const art = clientArts[index];
    try {
      // Fetch fresh client data from database
      const { data: clientData, error } = await supabase
        .from("client_data")
        .select("brand_kit")
        .eq("id", art.clientId)
        .single();

      if (error || !clientData) {
        toast({ title: "Erro ao buscar dados do cliente", variant: "destructive" });
        return;
      }

      // Update the brand kit in state
      const updatedArts = [...clientArts];
      updatedArts[index] = { ...updatedArts[index], brandKit: clientData.brand_kit, imageUrl: null };
      setClientArts(updatedArts);

      // Regenerate art with new brand kit
      const newImageUrl = await generateArtForClient({ ...updatedArts[index] });
      updatedArts[index] = { ...updatedArts[index], imageUrl: newImageUrl };
      setClientArts([...updatedArts]);

      toast({ title: "Kit de marca atualizado!", description: `Cores de ${art.clientName} recarregadas.` });
    } catch (error) {
      console.error("Error refreshing brand kit:", error);
      toast({ title: "Erro ao atualizar kit de marca", variant: "destructive" });
    }
  };

  // Save current state as draft to history (without finalizing)
  const handleSaveDraft = async () => {
    const artsWithImages = clientArts.filter((a) => a.imageUrl);
    
    if (artsWithImages.length === 0) {
      toast({
        title: "Nenhuma arte gerada",
        description: "Gere as artes antes de salvar o rascunho.",
        variant: "destructive",
      });
      return;
    }

    try {
      // Save batch to history as draft (not finalized)
      const newBatchItems: BatchItem[] = artsWithImages.map((art) => ({
        cardId: art.cardId,
        clientId: art.clientId,
        clientName: art.clientName,
        company: art.company,
        cardTitle: art.cardTitle,
        cardText: art.cardText,
        brandKit: sanitizeBrandKitForStorage(art.brandKit),
        files: [art.imageUrl!],
        backgroundImages: art.backgroundImage ? [art.backgroundImage] : undefined,
        note: art.note,
        noteRead: art.noteRead,
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
      const snapshotWithTeam = { ...template, teamFilter: initialTeamFilter || null, hasUnresolvedNotes };
      const savedId = await saveBatchGeneration("art", snapshotWithTeam, batchItems, currentBatchId || undefined);
      if (savedId) setCurrentBatchId(savedId);

      // Clear the art generation tags so they can regenerate later
      await clearArtGenerationTags();

      toast({
        title: "Rascunho salvo!",
        description: `${artsWithImages.length} artes salvas no histórico. Você pode continuar editando depois.`,
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


  const handleSendEmails = async () => {
    const approvedArts = clientArts.filter((a) => a.status === "approved" && a.imageUrl);

    if (approvedArts.length === 0) {
      toast({
        title: "Nenhuma arte aprovada",
        description: "Aprove as artes antes de enviar.",
        variant: "destructive",
      });
      return;
    }

    setIsSendingEmails(true);

    try {
      // Group approved arts by clientId
      const byClient = new Map<string, typeof approvedArts>();
      for (const art of approvedArts) {
        const list = byClient.get(art.clientId) || [];
        list.push(art);
        byClient.set(art.clientId, list);
      }

      // Fetch emails for all clients
      const clientIds = [...byClient.keys()];
      const { data: clientsData } = await supabase
        .from("client_data")
        .select("id, email, email_2, email_3")
        .in("id", clientIds);

      let sentCount = 0;
      const uploadedPaths: string[] = []; // track for cleanup

      for (const [clientId, arts] of byClient) {
        const clientRow = clientsData?.find((c) => c.id === clientId);
        if (!clientRow) continue;

        const emails = [clientRow.email, clientRow.email_2, clientRow.email_3].filter(
          (e): e is string => !!e && e.includes("@")
        );
        if (emails.length === 0) {
          toast({ title: `${arts[0].clientName}: sem e-mail cadastrado`, variant: "destructive" });
          continue;
        }

        // Upload each art image to temp storage and collect URLs
        const mediaUrls: string[] = [];
        for (const art of arts) {
          const response = await fetch(art.imageUrl!);
          const blob = await response.blob();
          const fileName = `temp_email_${art.cardId}_${Date.now()}.png`;
          const path = `artes/${fileName}`;

          const { error: uploadError } = await supabase.storage
            .from("card-uploads")
            .upload(path, blob, { contentType: "image/png" });

          if (uploadError) {
            console.error("Upload error:", uploadError);
            continue;
          }

          uploadedPaths.push(path);
          const { data: urlData } = supabase.storage.from("card-uploads").getPublicUrl(path);
          mediaUrls.push(urlData.publicUrl);
        }

        if (mediaUrls.length === 0) continue;

        // Send email
        const { data, error } = await supabase.functions.invoke("send-media-email", {
          body: {
            emails,
            subject: `Arte - ${arts[0].company || arts[0].clientName}`,
            mediaUrls,
            mediaUrl: mediaUrls[0],
            mediaType: "art",
            clientName: arts[0].company || arts[0].clientName,
            cardText: arts[0].cardText || arts[0].cardTitle,
            caption: undefined,
          },
        });

        if (error) {
          console.error("Email error:", error);
          toast({ title: `Erro ao enviar e-mail para ${arts[0].clientName}`, variant: "destructive" });
        } else {
          sentCount++;
        }
      }

      // Clean up temp files from storage
      if (uploadedPaths.length > 0) {
        await supabase.storage.from("card-uploads").remove(uploadedPaths);
      }

      // Clear art generation tags
      await clearArtGenerationTags();

      // Delete batch from history if exists
      if (currentBatchId) {
        await deleteBatch(currentBatchId);
        setCurrentBatchId(null);
      }

      toast({
        title: "E-mails enviados!",
        description: `${sentCount}/${byClient.size} clientes receberam as artes.`,
      });

      onComplete();
    } catch (error) {
      console.error("Error sending emails:", error);
      toast({
        title: "Erro ao enviar e-mails",
        variant: "destructive",
      });
    } finally {
      setIsSendingEmails(false);
    }
  };

  const approvedCount = clientArts.filter((a) => a.status === "approved").length;
  const pendingCount = clientArts.filter((a) => a.status === "pending").length;

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
      <div className="border-b bg-card px-4 py-3 flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={onBack}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="font-semibold">Geração em Lote</h1>
            <p className="text-sm text-muted-foreground">
              {clientArts.length} cards marcados para geração
            </p>
          </div>
        </div>
        
        {/* Show which team is being generated */}
        {teamFilter && (
          <Badge variant="secondary" className="text-sm">
            {teamFilter}
          </Badge>
        )}
        
        <div className="flex items-center gap-4">
          <div className="flex gap-2">
            <Badge variant="outline">{pendingCount} pendentes</Badge>
            <Badge className="bg-green-500">{approvedCount} aprovadas</Badge>
          </div>
          
          {/* Save Draft button - always visible when arts are generated */}
          {clientArts.some((a) => a.imageUrl) && (
            <Button
              variant="outline"
              onClick={handleSaveDraft}
            >
              <Save className="mr-2 h-4 w-4" />
              Salvar Rascunho
            </Button>
          )}
          
          {!clientArts.some((a) => a.imageUrl) ? (
            <Button
              onClick={generateAllArts}
              disabled={isGenerating || clientArts.length === 0}
              className="bg-gradient-primary"
            >
              {isGenerating ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Gerando...
                </>
              ) : (
                "Gerar Todas as Artes"
              )}
            </Button>
          ) : (
            <Button
              onClick={handleSendEmails}
              disabled={approvedCount === 0 || isSendingEmails}
              className="bg-gradient-primary"
            >
              {isSendingEmails ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Enviando...
                </>
              ) : (
                <>
                  <Mail className="mr-2 h-4 w-4" />
                  Enviar {approvedCount} por E-mail
                </>
              )}
            </Button>
          )}
        </div>
      </div>

      {/* Inline Adjust Panel */}
      {isAdjustDialogOpen && selectedArt && (
        <div className="border-b bg-card px-4 py-4">
          <div className="max-w-2xl mx-auto space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-semibold flex items-center gap-2">
                  Ajustar Elementos — {selectedArt.company}
                  {isRegenerating && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
                </h3>
                <p className="text-xs text-muted-foreground">
                  Arraste para mover • Puxe nos cantos e nas laterais para redimensionar
                </p>
              </div>
              <Button variant="ghost" size="icon" onClick={handleCloseAdjustDialog}>
                <X className="h-5 w-5" />
              </Button>
            </div>

            <ArtAdjustOverlay
              template={template}
              previewUrl={livePreviewUrl || selectedArt?.imageUrl || null}
              isBusy={isRegenerating}
              photoOffsetX={photoOffsetX}
              photoOffsetY={photoOffsetY}
              photoScale={photoScale}
              photoFrame={photoFrame}
              setPhotoOffsetX={syncSetPhotoOffsetX}
              setPhotoOffsetY={syncSetPhotoOffsetY}
              setPhotoScale={syncSetPhotoScale}
              setPhotoFrame={syncSetPhotoFrame}
              logoX={logoX}
              logoY={logoY}
              logoScaleX={logoScaleX}
              logoScaleY={logoScaleY}
              setLogoX={syncSetLogoX}
              setLogoY={syncSetLogoY}
              setLogoScaleX={syncSetLogoScaleX}
              setLogoScaleY={syncSetLogoScaleY}
              textX={textX}
              textY={textY}
              textFontSize={textFontSize}
              setTextX={syncSetTextX}
              setTextY={syncSetTextY}
              setTextFontSize={syncSetTextFontSize}
              contactX={contactX}
              contactY={contactY}
              contactScaleX={contactScaleX}
              contactScaleY={contactScaleY}
              setContactX={syncSetContactX}
              setContactY={syncSetContactY}
              setContactScaleX={syncSetContactScaleX}
              setContactScaleY={syncSetContactScaleY}
              shapeOverrides={shapeOverrides}
              setShapeOverrides={syncSetShapeOverrides}
              onDragEnd={handleDragEnd}
            />

            {/* Remove Background & Eraser Buttons */}
            {selectedArt?.photoImage && (
              <div className="flex gap-2 items-center">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleRemoveBackground}
                  disabled={isRemovingBg || isRegenerating}
                >
                  {isRemovingBg ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      {removeBgProgress || "Processando..."}
                    </>
                  ) : (
                    <>
                      <Scissors className="h-4 w-4 mr-2" />
                      Recortar Fundo
                    </>
                  )}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setEraserModalOpen(true)}
                  disabled={isRegenerating}
                >
                  <Eraser className="h-4 w-4 mr-2" />
                  Borracha
                </Button>
                <ImageEraserModal
                  open={eraserModalOpen}
                  onOpenChange={setEraserModalOpen}
                  imageUrl={selectedArt.photoImage}
                  onSave={handleEraserSave}
                />
              </div>
            )}
          </div>
        </div>
      )}

      {/* Gallery */}
      <ScrollArea className="flex-1 p-6">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {clientArts.map((art, index) => (
            <div
              key={`${art.clientId}-${art.cardId}-${art.pageIndex ?? 0}`}
              className={`border rounded-lg overflow-hidden bg-card ${
                art.status === "approved"
                  ? "ring-2 ring-green-500"
                  : art.status === "rejected"
                  ? "ring-2 ring-red-500 opacity-50"
                  : ""
              }`}
            >
              {/* Art Preview - Click to adjust */}
              <div 
                className={cn(
                  "aspect-[4/5] bg-muted relative cursor-pointer",
                  isAdjustDialogOpen && selectedArt?.clientId === art.clientId && selectedArt?.cardId === art.cardId && selectedArt?.pageIndex === art.pageIndex && "ring-2 ring-primary"
                )}
                onClick={() => {
                  if (art.imageUrl && art.status === "pending") {
                    openAdjustDialog(art);
                  }
                }}
                title={art.status === "pending" && art.imageUrl ? "Clique para ajustar" : ""}
              >
                {art.imageUrl ? (
                  <img
                    src={art.imageUrl}
                    alt={art.company}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <ImageIcon className="h-12 w-12 text-muted-foreground" />
                  </div>
                )}

                {art.status === "approved" && (
                  <div className="absolute top-2 right-2 bg-green-500 text-white p-1 rounded-full">
                    <Check className="h-4 w-4" />
                  </div>
                )}

                {/* Carousel page indicator */}
                {art.totalPages && art.totalPages > 1 && (
                  <div className="absolute top-2 left-2 bg-primary text-primary-foreground text-xs px-2 py-1 rounded-full font-semibold">
                    {(art.pageIndex ?? 0) + 1}/{art.totalPages}
                  </div>
                )}
              </div>

              {/* Info */}
              <div className="p-3">
                <h3 className="font-semibold truncate">{art.company}</h3>
                <p className="text-sm text-muted-foreground truncate">{art.cardText}</p>
                {art.imageType && (
                  <p className="text-xs text-primary/70 truncate mt-0.5">{art.imageType}</p>
                )}

                {/* Actions */}
                {art.imageUrl && art.status === "pending" && (
                  <div className="flex gap-2 mt-3">
                    <Button
                      size="sm"
                      variant="outline"
                      title="Trocar foto"
                      onClick={() => {
                        const idx = clientArts.indexOf(art);
                        setSelectedArt(art);
                        setSelectedArtIndex(idx);
                        setSearchQuery(art.cardText.split(" ").slice(0, 3).join(" "));
                        setIsImageDialogOpen(true);
                      }}
                    >
                      <ImageIcon className="h-4 w-4" />
                    </Button>
                    {art.photoImage && (
                      <Button
                        size="sm"
                        variant="outline"
                        title="Ajustar posição da foto"
                        onClick={() => openAdjustDialog(art)}
                      >
                        <Move className="h-4 w-4" />
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="outline"
                      title="Atualizar cores do cadastro e regenerar"
                      onClick={() => refreshBrandKitAndRegenerate(index)}
                    >
                      <RefreshCw className="h-4 w-4" />
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={() => handleReject(index)}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                    <Button
                      size="sm"
                      className="bg-green-500 hover:bg-green-600"
                      onClick={() => handleApprove(index)}
                    >
                      <Check className="h-4 w-4" />
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
                            if (art.note && !art.noteRead) {
                              const updated = [...clientArts];
                              updated[index] = { ...updated[index], noteRead: true };
                              setClientArts(updated);
                            }
                          }}
                        >
                          <MessageSquareWarning className="h-4 w-4" />
                          {art.note && !art.noteRead && (
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
                            value={art.note || ""}
                            onChange={(e) => {
                              const updated = [...clientArts];
                              updated[index] = { ...updated[index], note: e.target.value, noteRead: false };
                              setClientArts(updated);
                            }}
                          />
                          <Button
                            size="sm"
                            variant="default"
                            className="w-full text-xs"
                            onClick={async () => {
                              if (currentBatchId) {
                                const success = await updateBatchItem(currentBatchId, index, { note: art.note || "", noteRead: !art.note ? true : false });
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
                          {art.note && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="w-full text-xs"
                              onClick={async () => {
                                const updated = [...clientArts];
                                updated[index] = { ...updated[index], note: "", noteRead: true };
                                setClientArts(updated);
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
                 )}

                {art.status === "approved" && (
                  <div className="mt-3 text-center">
                    <Badge className="bg-green-500">Aprovada</Badge>
                  </div>
                )}

                {art.status === "rejected" && (
                  <div className="mt-3 text-center">
                    <Badge variant="destructive">Rejeitada</Badge>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>

        {clientArts.length === 0 && (
          <div className="text-center py-12">
            <p className="text-muted-foreground">Nenhum card com prazo para hoje</p>
          </div>
        )}
      </ScrollArea>

      {/* Image Search Dialog */}
      <Dialog open={isImageDialogOpen} onOpenChange={(open) => {
        setIsImageDialogOpen(open);
        if (!open) setCustomImageUrl("");
      }}>
        <DialogContent className="max-w-3xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle>Trocar Foto</DialogTitle>
          </DialogHeader>

          <Tabs defaultValue="bank" className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="bank">
                <Search className="h-4 w-4 mr-2" />
                Banco de Imagens
              </TabsTrigger>
              <TabsTrigger value="custom">
                <Upload className="h-4 w-4 mr-2" />
                Minha Imagem
              </TabsTrigger>
            </TabsList>

            <TabsContent value="bank" className="space-y-4">
              <div className="flex gap-2">
                <Input
                  placeholder="Buscar imagens..."
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
                  {searchImages_results.map((image) => (
                    <div
                      key={image.id}
                      className="aspect-[4/5] rounded-lg overflow-hidden cursor-pointer hover:ring-2 ring-primary transition-all relative"
                      onClick={() => handleSelectPhotoImage(image)}
                    >
                      <img
                        src={image.urls.small}
                        alt={image.description || "Image"}
                        className="w-full h-full object-cover"
                      />
                      {/* Source badge */}
                      <div className="absolute bottom-1 right-1 bg-background/80 text-[10px] px-1 rounded">
                        {image.source}
                      </div>
                    </div>
                  ))}
                </div>
                {searchImages_results.length === 0 && (
                  <div className="text-center py-8 text-muted-foreground">
                    <p>Busque por imagens acima</p>
                    <p className="text-xs mt-2">
                      {!getConfiguredApis().pexels && !getConfiguredApis().unsplash 
                        ? "⚠️ Configure VITE_PEXELS_API_KEY para busca real" 
                        : "Digite um termo e clique em buscar"}
                    </p>
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
                <Label className="text-sm font-medium">Colar Imagem</Label>
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
                  accept="image/*"
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
                    <span className="text-xs">Clique para selecionar uma imagem</span>
                  </div>
                </Button>
              </div>

              {/* URL Paste */}
              <div className="space-y-3">
                <Label className="text-sm font-medium">Ou cole uma URL</Label>
                <div className="flex gap-2">
                  <Input
                    placeholder="https://exemplo.com/imagem.jpg"
                    value={customImageUrl}
                    onChange={(e) => setCustomImageUrl(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleCustomImageUrl()}
                  />
                  <Button onClick={handleCustomImageUrl} disabled={!customImageUrl.trim()}>
                    <Link className="h-4 w-4 mr-2" />
                    Usar
                  </Button>
                </div>
              </div>

              {/* Preview of custom URL */}
              {customImageUrl.trim() && (
                <div className="space-y-2">
                  <Label className="text-sm font-medium">Preview</Label>
                  <div className="aspect-video bg-muted rounded-lg overflow-hidden max-w-xs">
                    <img
                      src={customImageUrl}
                      alt="Preview"
                      className="w-full h-full object-contain"
                      onError={(e) => {
                        (e.target as HTMLImageElement).style.display = 'none';
                      }}
                    />
                  </div>
                </div>
              )}

              {/* Remove Background & Eraser Options */}
              {selectedArt?.photoImage && (
                <div className="pt-4 border-t space-y-3">
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      className="flex-1"
                      onClick={handleRemoveBackground}
                      disabled={isRemovingBg}
                    >
                      {isRemovingBg ? (
                        <>
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          {removeBgProgress || "Processando..."}
                        </>
                      ) : (
                        <>
                          <Scissors className="h-4 w-4 mr-2" />
                          Recortar Fundo
                        </>
                      )}
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => {
                        setIsImageDialogOpen(false);
                        setTimeout(() => setEraserModalOpen(true), 100);
                      }}
                    >
                      <Eraser className="h-4 w-4 mr-2" />
                      Borracha
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground text-center">
                    Recortar remove o fundo com IA. Borracha limpa artefatos manualmente.
                  </p>
                </div>
              )}
            </TabsContent>
          </Tabs>
        </DialogContent>
      </Dialog>

      {/* Element Adjustment Dialog */}
      <Dialog open={isAdjustDialogOpen} onOpenChange={(open) => {
        setIsAdjustDialogOpen(open);
        if (!open) {
          setLivePreviewUrl(null);
          if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
        }
      }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              Ajustar Elementos da Arte
              {isRegenerating && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
            </DialogTitle>
          </DialogHeader>

          <div className="py-4 space-y-3">
            <Label className="text-sm font-medium">
              Arraste para mover • Puxe nos cantos e nas laterais para redimensionar
            </Label>

            <ArtAdjustOverlay
              template={template}
              previewUrl={livePreviewUrl || selectedArt?.imageUrl || null}
              isBusy={isRegenerating}
              photoOffsetX={photoOffsetX}
              photoOffsetY={photoOffsetY}
              photoScale={photoScale}
              photoFrame={photoFrame}
              setPhotoOffsetX={syncSetPhotoOffsetX}
              setPhotoOffsetY={syncSetPhotoOffsetY}
              setPhotoScale={syncSetPhotoScale}
              setPhotoFrame={syncSetPhotoFrame}
              logoX={logoX}
              logoY={logoY}
              logoScaleX={logoScaleX}
              logoScaleY={logoScaleY}
              setLogoX={syncSetLogoX}
              setLogoY={syncSetLogoY}
              setLogoScaleX={syncSetLogoScaleX}
              setLogoScaleY={syncSetLogoScaleY}
              textX={textX}
              textY={textY}
              textFontSize={textFontSize}
              setTextX={syncSetTextX}
              setTextY={syncSetTextY}
              setTextFontSize={syncSetTextFontSize}
              contactX={contactX}
              contactY={contactY}
              contactScaleX={contactScaleX}
              contactScaleY={contactScaleY}
              setContactX={syncSetContactX}
              setContactY={syncSetContactY}
              setContactScaleX={syncSetContactScaleX}
              setContactScaleY={syncSetContactScaleY}
              shapeOverrides={shapeOverrides}
              setShapeOverrides={syncSetShapeOverrides}
              onDragEnd={handleDragEnd}
            />

            <p className="text-xs text-muted-foreground text-center pt-2">
              Clique no elemento para selecionar, arraste os cantos azuis para redimensionar.
            </p>

            {/* Remove Background & Eraser Buttons */}
            {selectedArt?.photoImage && (
              <div className="pt-4 border-t space-y-3">
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    className="flex-1"
                    onClick={handleRemoveBackground}
                    disabled={isRemovingBg || isRegenerating}
                  >
                    {isRemovingBg ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        {removeBgProgress || "Processando..."}
                      </>
                    ) : (
                      <>
                        <Scissors className="h-4 w-4 mr-2" />
                        Recortar Fundo
                      </>
                    )}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => setEraserModalOpen(true)}
                    disabled={isRegenerating}
                  >
                    <Eraser className="h-4 w-4 mr-2" />
                    Borracha
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground text-center">
                  Recortar remove o fundo com IA. Borracha limpa artefatos manualmente.
                </p>
                
                <ImageEraserModal
                  open={eraserModalOpen}
                  onOpenChange={setEraserModalOpen}
                  imageUrl={selectedArt.photoImage}
                  onSave={handleEraserSave}
                />
              </div>
            )}
          </div>

          <div className="flex gap-2 justify-end pt-4 border-t">
            <Button variant="outline" onClick={handleCloseAdjustDialog}>
              Fechar
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};
