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
import { searchImages, searchPexelsImages, searchPixabayImages, SearchImage, getConfiguredApis } from "@/lib/imageSearch";
import { translateToEnglishLocal } from "@/lib/localTranslate";
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
import { ArtCardWithOverlay } from "./ArtCardWithOverlay";

interface CanvasElement {
  id: string;
  type: "rect" | "circle" | "text" | "image" | "logo" | "contact" | "mascot" | "triangle" | "line" | "star" | "diamond" | "hexagon" | "pentagon" | "polkaDots" | "dotsGrid" | "confetti" | "splatter" | "zigzag" | "spiral" | "heart" | "cross" | "cloud" | "speechBubble" | "lightning" | "shield" | "crescent" | "wave" | "blob" | "arch" | "arrow" | "badge" | "ribbon" | "chevron";
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
  clipShape?: "rect" | "circle" | "triangle" | "diamond" | "hexagon" | "pentagon" | "star";
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
  bgOffsetX?: number;
  bgOffsetY?: number;
  bgScale?: number;
  hiddenElements?: string[]; // Element types/ids hidden per-card
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

// Helper to apply clip shape path on canvas context
function applyClipShape(
  ctx: CanvasRenderingContext2D,
  shape: string,
  x: number,
  y: number,
  w: number,
  h: number,
  radius = 0
) {
  if (shape === "circle") {
    ctx.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, 0, 0, Math.PI * 2);
  } else if (shape === "triangle") {
    ctx.moveTo(x + w / 2, y);
    ctx.lineTo(x + w, y + h);
    ctx.lineTo(x, y + h);
    ctx.closePath();
  } else if (shape === "diamond") {
    ctx.moveTo(x + w / 2, y);
    ctx.lineTo(x + w, y + h / 2);
    ctx.lineTo(x + w / 2, y + h);
    ctx.lineTo(x, y + h / 2);
    ctx.closePath();
  } else if (shape === "hexagon") {
    const cx = x + w / 2, cy = y + h / 2, r = Math.min(w, h) / 2;
    for (let i = 0; i < 6; i++) {
      const a = (Math.PI / 3) * i - Math.PI / 2;
      if (i === 0) ctx.moveTo(cx + r * Math.cos(a), cy + r * Math.sin(a));
      else ctx.lineTo(cx + r * Math.cos(a), cy + r * Math.sin(a));
    }
    ctx.closePath();
  } else if (shape === "pentagon") {
    const cx = x + w / 2, cy = y + h / 2, r = Math.min(w, h) / 2;
    for (let i = 0; i < 5; i++) {
      const a = (Math.PI * 2 / 5) * i - Math.PI / 2;
      if (i === 0) ctx.moveTo(cx + r * Math.cos(a), cy + r * Math.sin(a));
      else ctx.lineTo(cx + r * Math.cos(a), cy + r * Math.sin(a));
    }
    ctx.closePath();
  } else if (shape === "star") {
    const cx = x + w / 2, cy = y + h / 2, outerR = Math.min(w, h) / 2, innerR = outerR * 0.4;
    for (let i = 0; i < 10; i++) {
      const a = (Math.PI / 5) * i - Math.PI / 2;
      const r = i % 2 === 0 ? outerR : innerR;
      if (i === 0) ctx.moveTo(cx + r * Math.cos(a), cy + r * Math.sin(a));
      else ctx.lineTo(cx + r * Math.cos(a), cy + r * Math.sin(a));
    }
    ctx.closePath();
  } else if (radius > 0) {
    ctx.roundRect(x, y, w, h, radius);
  } else {
    ctx.rect(x, y, w, h);
  }
}

const getClientArtKey = (art: Pick<ClientArt, "clientId" | "cardId" | "pageIndex">) =>
  `${art.clientId}::${art.cardId}::${art.pageIndex ?? 0}`;

// Image cache to avoid reloading
const imageCache = new Map<string, HTMLImageElement>();
const opaqueBoundsCache = new WeakMap<HTMLImageElement, { sx: number; sy: number; sw: number; sh: number }>();

const getOpaqueBounds = (img: HTMLImageElement) => {
  const natW = img.naturalWidth || img.width;
  const natH = img.naturalHeight || img.height;
  const fallback = { sx: 0, sy: 0, sw: Math.max(1, natW), sh: Math.max(1, natH) };

  const cached = opaqueBoundsCache.get(img);
  if (cached) return cached;
  if (!natW || !natH) return fallback;

  const maxScanDim = 1024;
  const scale = Math.min(1, maxScanDim / Math.max(natW, natH));
  const scanW = Math.max(1, Math.round(natW * scale));
  const scanH = Math.max(1, Math.round(natH * scale));

  const scanCanvas = document.createElement("canvas");
  scanCanvas.width = scanW;
  scanCanvas.height = scanH;
  const scanCtx = scanCanvas.getContext("2d", { willReadFrequently: true });
  if (!scanCtx) return fallback;

  scanCtx.clearRect(0, 0, scanW, scanH);
  scanCtx.drawImage(img, 0, 0, scanW, scanH);

  let data: Uint8ClampedArray;
  try {
    data = scanCtx.getImageData(0, 0, scanW, scanH).data;
  } catch {
    opaqueBoundsCache.set(img, fallback);
    return fallback;
  }

  let minX = scanW;
  let minY = scanH;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < scanH; y++) {
    for (let x = 0; x < scanW; x++) {
      const alpha = data[(y * scanW + x) * 4 + 3];
      if (alpha > 8) {
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
    }
  }

  if (maxX < 0 || maxY < 0) {
    opaqueBoundsCache.set(img, fallback);
    return fallback;
  }

  const invScale = 1 / scale;
  const sx = Math.max(0, Math.floor(minX * invScale));
  const sy = Math.max(0, Math.floor(minY * invScale));
  const ex = Math.min(natW, Math.ceil((maxX + 1) * invScale));
  const ey = Math.min(natH, Math.ceil((maxY + 1) * invScale));

  const bounds = {
    sx,
    sy,
    sw: Math.max(1, ex - sx),
    sh: Math.max(1, ey - sy),
  };
  opaqueBoundsCache.set(img, bounds);
  return bounds;
};

// Resilient image loader: fetch-as-blob (PRIMARY) → CORS → no-CORS (FALLBACK)
const loadImage = async (url: string, retries = 2): Promise<HTMLImageElement | null> => {
  if (!url) return null;
  
  // Use the full URL as cache key to avoid collisions between different signed URLs
  // that share the same prefix/length (which could swap images across cards).
  const cacheKey = url;
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
  link.href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(fontFamily)}:wght@400;700;800;900&display=swap`;
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
  const [currentBatchId, _setCurrentBatchId] = useState<string | null>(initialBatch?.id || null);
  const batchIdRef = useRef<string | null>(initialBatch?.id || null);
  const setCurrentBatchId = (id: string | null) => {
    batchIdRef.current = id;
    _setCurrentBatchId(id);
  };
  const [isLoading, setIsLoading] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSendingEmails, setIsSendingEmails] = useState(false);
  const [emailSubject, setEmailSubject] = useState("");
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
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [searchPage, setSearchPage] = useState(1);
  const [imageSourceTab, setImageSourceTab] = useState<"pexels" | "pixabay">("pexels");
  const [customImageUrl, setCustomImageUrl] = useState("");
  // Team filter is now fixed based on initial selection - no runtime switching
  const teamFilter = initialTeamFilter;
  const hasImagePlaceholder = template.elements.some((el) => el.type === "image" && el.placeholder);

  const buildDefaultStockQuery = useCallback((art: ClientArt) => {
    const STOP_WORDS = new Set([
      "que","para","com","uma","por","como","mais","mas","dos","das",
      "nos","nas","não","nao","seu","sua","são","sao","tem","foi",
      "ser","ter","está","esta","isso","esse","essa","ele","ela",
      "são","nos","nas","aos","pra","pro","sim","dia","ano","vez",
      "uns","umas","num","numa","sem","sob","até","ate","todo","toda",
      "cada","pode","deve","seus","suas","muito","muita","sobre",
    ]);

    const tokenize = (value?: string) =>
      (value || "")
        .toLowerCase()
        .replace(/[^\w\s\u00C0-\u024F-]/g, " ")
        .split(/\s+/)
        .map((t) => t.trim())
        .filter((t) => t.length >= 3 && !/^\d+$/.test(t) && !STOP_WORDS.has(t));

    const dedupe = (tokens: string[]) => Array.from(new Set(tokens));

    const primary = dedupe([
      ...tokenize(art.cardText),
      ...tokenize(art.imageType),
    ]);

    const fallback = dedupe([
      ...tokenize(art.cardTitle),
      ...tokenize(art.company),
      ...tokenize(art.clientName),
    ]);

    const rawQuery = (primary.length > 0 ? primary : fallback).slice(0, 6).join(" ").trim();
    const translated = translateToEnglishLocal(rawQuery).trim();

    return translated || "business marketing";
  }, []);

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
    lockPhotoForArt(updatedArt, newImageUrl);
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
      lockPhotoForArt(updatedArt, newImageUrl);
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
    // The list query excludes heavy 'items' column, so fetch full batch data if needed
    let batchItems = batch.items;
    if (!batchItems || batchItems.length === 0) {
      const { getBatchById } = await import("@/lib/batchHistory");
      const fullBatch = await getBatchById(batch.id);
      if (!fullBatch || !fullBatch.items || fullBatch.items.length === 0) {
        toast({ title: "Lote sem itens", variant: "destructive" });
        setIsLoading(false);
        return;
      }
      batchItems = fullBatch.items;
    }

    const mergeBrandKitAssets = (itemBrandKit: any, latestBrandKit: any) => {
      const itemBk = itemBrandKit || {};
      const latestBk = latestBrandKit || {};

      const logo = itemBk?.pngs?.[0] || itemBk?.logo || latestBk?.pngs?.[0] || latestBk?.logo || "";
      const contact = itemBk?.pngs?.[1] || itemBk?.contactInfo || latestBk?.pngs?.[1] || latestBk?.contactInfo || "";
      const mascot = itemBk?.pngs?.[2] || itemBk?.mascot || latestBk?.pngs?.[2] || latestBk?.mascot || "";

      return {
        ...latestBk,
        ...itemBk,
        logo,
        contactInfo: contact,
        mascot,
        pngs: [logo, contact, mascot],
      };
    };

    // Render imediato com dados do lote (sem bloquear em fetch pesado)
    const initialArts: ClientArt[] = batchItems.map((item) => {
      const itemData = item as any;

      return {
        clientId: item.clientId,
        clientName: item.clientName,
        company: item.company,
        cardId: item.cardId,
        cardTitle: item.cardTitle,
        cardText: item.cardText,
        brandKit: item.brandKit || {},
        imageUrl: item.files?.[0] || null,
        backgroundImage: item.backgroundImages?.[0],
        photoImage: itemData.photoImage,
        photoOffset: itemData.photoOffset,
        elementOverrides: itemData.elementOverrides,
        pageIndex: itemData.pageIndex,
        totalPages: itemData.totalPages,
        imageType: itemData.imageType || undefined,
        narrationType: itemData.narrationType || undefined,
        briefing: itemData.briefing || undefined,
        status: "pending" as const,
        note: item.note,
        noteRead: item.noteRead,
      };
    });

    initialArts.sort((a, b) => a.company.localeCompare(b.company, "pt-BR", { numeric: true }));
    setClientArts(initialArts);
    setIsLoading(false);

    // Hidratação em background (não bloqueia abertura do editor)
    void (async () => {
      try {
        const clientIds = [...new Set(batchItems.map((item) => item.clientId).filter(Boolean))];
        const cardIds = [...new Set(batchItems.map((item) => item.cardId).filter(Boolean))];

        const [{ data: clientsData }, { data: briefsData }] = await Promise.all([
          clientIds.length > 0
            ? supabase.rpc("get_client_brand_kit_urls", { client_ids: clientIds })
            : Promise.resolve({ data: [] as any[] }),
          cardIds.length > 0
            ? supabase.from("project_briefs").select("id, cover_image").in("id", cardIds)
            : Promise.resolve({ data: [] as any[] }),
        ]);

        const imageTypeMap: Record<string, string> = {};
        const narrationTypeMap: Record<string, string> = {};
        const briefingMap: Record<string, string> = {};
        const brandKitMap: Record<string, any> = {};
        const coverImageMap: Record<string, string> = {};

        (clientsData as any[])?.forEach((c: any) => {
          if (c.image_type) imageTypeMap[c.id] = c.image_type;
          if (c.narration_type) narrationTypeMap[c.id] = c.narration_type;
          if (c.briefing) briefingMap[c.id] = c.briefing;
          brandKitMap[c.id] = {
            logo: c.logo || "",
            contactInfo: c.contact_info || "",
            mascot: c.mascot || "",
            pngs: [c.logo || "", c.contact_info || "", c.mascot || ""],
            colors: c.colors || {},
          };
        });

        (briefsData as any[])?.forEach((b: any) => {
          if (b.cover_image) coverImageMap[b.id] = b.cover_image;
        });

        setClientArts((prev) =>
          prev.map((art) => ({
            ...art,
            brandKit: mergeBrandKitAssets(art.brandKit, brandKitMap[art.clientId]),
            photoImage: art.photoImage || coverImageMap[art.cardId] || undefined,
            imageType: art.imageType || imageTypeMap[art.clientId] || undefined,
            narrationType: art.narrationType || narrationTypeMap[art.clientId] || undefined,
            briefing: art.briefing || briefingMap[art.clientId] || undefined,
          }))
        );
      } catch (error) {
        console.error("Background hydration error (batch art):", error);
      }
    })();

    // Regenerate previews in background for items that lost their images after sanitization
    const needsRegen = initialArts.filter(a => !a.imageUrl || a.imageUrl.startsWith("data:") || a.imageUrl.startsWith("blob:"));
    if (needsRegen.length > 0) {
      // Run in background – don't block UI
      (async () => {
        const updatedArts = [...initialArts];
        for (let i = 0; i < updatedArts.length; i++) {
          const a = updatedArts[i];
          if (!a.imageUrl || a.imageUrl.startsWith("data:") || a.imageUrl.startsWith("blob:")) {
            try {
              const newUrl = await generateArtForClient(a);
              updatedArts[i] = { ...a, imageUrl: newUrl };
              setClientArts([...updatedArts]);
            } catch (e) {
              console.error("Error regenerating preview for:", a.company, e);
            }
          }
        }
      })();
    }
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

      arts.sort((a, b) => a.company.localeCompare(b.company, "pt-BR", { numeric: true }));
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

  // Cache photo resolution per art to avoid hammering the backend during resize
  const photoResolveCacheRef = useRef(new Map<string, { url: string | null; ts: number }>());
  // Tracks the last frame where the photo was successfully rendered for robust fallback scaling.
  const photoRenderedFrameRef = useRef(new Map<string, ShapeOverride>());
  const onRegenerateTicketRef = useRef(new Map<string, number>());
  const pendingRegenerationsRef = useRef(new Map<string, Promise<string>>());

  const lockPhotoForArt = useCallback((art: Pick<ClientArt, "clientId" | "cardId" | "pageIndex">, url?: string | null) => {
    if (!url) return;
    photoResolveCacheRef.current.set(getClientArtKey(art), { url, ts: Date.now() });
  }, []);

  const getEffectivePhotoImage = useCallback(
    (art: Pick<ClientArt, "clientId" | "cardId" | "pageIndex"> & { photoImage?: string }) => {
      return art.photoImage || photoResolveCacheRef.current.get(getClientArtKey(art))?.url || undefined;
    },
    []
  );

  const resolvePhotoImageForArt = useCallback(
    async (art: ClientArt, options?: { allowSearch?: boolean }): Promise<string | null> => {
      const key = getClientArtKey(art);
      const allowSearch = options?.allowSearch ?? true;
      const cached = photoResolveCacheRef.current.get(key);
      if (cached) {
        // cache hit: keep positive forever; negative cache only applies to full (with search) resolution
        if (cached.url) return cached.url;
        if (allowSearch && Date.now() - cached.ts < 60_000) return null;
      }

      // 1) Prefer uploads (material)
      try {
        const { data } = await supabase
          .from("card_uploads")
          .select("file_url, uploaded_at")
          .eq("card_id", art.cardId)
          .eq("upload_type", "material")
          .order("uploaded_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (data?.file_url) {
          photoResolveCacheRef.current.set(key, { url: data.file_url, ts: Date.now() });
          return data.file_url;
        }
      } catch {
        // ignore
      }

      // 2) Then cover image from the card
      try {
        const { data } = await supabase
          .from("project_briefs")
          .select("cover_image")
          .eq("id", art.cardId)
          .maybeSingle();

        const cover = (data as any)?.cover_image as string | null | undefined;
        if (cover) {
          photoResolveCacheRef.current.set(key, { url: cover, ts: Date.now() });
          return cover;
        }
      } catch {
        // ignore
      }

      // 3) Last resort: automated search (only in full auto mode)
      if (allowSearch) {
        try {
          const rawParts = [art.imageType, art.cardTitle, art.cardText].filter(Boolean);
          const rawQuery = rawParts.join(" ").slice(0, 150);
          let query: string;
          try {
            const { data: fnData } = await supabase.functions.invoke("translate-text", {
              body: { text: rawQuery },
            });
            query = fnData?.translatedText || translateToEnglishLocal(rawQuery);
          } catch {
            query = translateToEnglishLocal(rawQuery);
          }
          const images = await searchImages(query, 1);
          const url = images?.[0]?.urls?.regular;
          if (url) {
            photoResolveCacheRef.current.set(key, { url, ts: Date.now() });
            return url;
          }
        } catch {
          // ignore
        }
      }

      // Only cache negative results when full search was allowed
      if (allowSearch) {
        photoResolveCacheRef.current.set(key, { url: null, ts: Date.now() });
      }
      return null;
    },
    []
  );

  // Helper: draw image with multi-step upscaling to reduce pixelation of small images
  const drawSmoothedImage = (
    ctx: CanvasRenderingContext2D,
    img: HTMLImageElement,
    dx: number, dy: number, dw: number, dh: number
  ) => {
    const natW = img.naturalWidth || img.width;
    const natH = img.naturalHeight || img.height;
    const scaleRatio = Math.max(dw / natW, dh / natH);

    // If image needs to be upscaled more than 2x, use intermediate canvas steps
    if (scaleRatio > 2) {
      const steps = Math.ceil(Math.log2(scaleRatio));
      let srcCanvas: HTMLCanvasElement | HTMLImageElement = img;
      let curW = natW;
      let curH = natH;

      for (let s = 0; s < steps; s++) {
        const nextW = s === steps - 1 ? Math.round(dw) : Math.round(curW * 2);
        const nextH = s === steps - 1 ? Math.round(dh) : Math.round(curH * 2);
        const tmp = document.createElement("canvas");
        tmp.width = nextW;
        tmp.height = nextH;
        const tmpCtx = tmp.getContext("2d")!;
        tmpCtx.imageSmoothingEnabled = true;
        tmpCtx.imageSmoothingQuality = "high";
        tmpCtx.drawImage(srcCanvas, 0, 0, curW, curH, 0, 0, nextW, nextH);
        srcCanvas = tmp;
        curW = nextW;
        curH = nextH;
      }
      ctx.drawImage(srcCanvas, 0, 0, curW, curH, dx, dy, dw, dh);
    } else {
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(img, dx, dy, dw, dh);
    }
  };

  const generateArtForClient = async (
    art: ClientArt,
    options?: { allowAutoPhotoResolve?: boolean; allowPhotoSearch?: boolean }
  ): Promise<string> => {
    console.log("Generating art for:", art.clientName, "Template elements:", template.elements.length);

    // Note: even without photoImage, we must re-render so shape/text/logo overrides apply.

    const canvas = document.createElement("canvas");
    canvas.width = template.width;
    canvas.height = template.height;
    const ctx = canvas.getContext("2d")!;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";

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

    const allowAutoPhotoResolve = options?.allowAutoPhotoResolve ?? true;
    const allowPhotoSearch = options?.allowPhotoSearch ?? allowAutoPhotoResolve;
    const artKey = getClientArtKey(art);
    const cachedPhotoImage = photoResolveCacheRef.current.get(artKey)?.url ?? null;
    const resolvedPhotoImage =
      art.photoImage ||
      cachedPhotoImage ||
      (allowAutoPhotoResolve
        ? await resolvePhotoImageForArt(art, { allowSearch: allowPhotoSearch })
        : await resolvePhotoImageForArt(art, { allowSearch: false }));

    // Always keep the cache populated so future resize/drag calls find the photo
    if (resolvedPhotoImage && !photoResolveCacheRef.current.get(artKey)?.url) {
      photoResolveCacheRef.current.set(artKey, { url: resolvedPhotoImage, ts: Date.now() });
    }

    ctx.fillStyle = bgColor;
    ctx.fillRect(0, 0, template.width, template.height);

    // Draw background image if set — but only as full-canvas background when
    // no image placeholder exists, otherwise it will be drawn inside the frame.
    const hasImagePlaceholderEl = template.elements.some(e => e.type === "image" && e.placeholder);
    const backgroundSource = !hasImagePlaceholderEl
      ? (art.backgroundImage || resolvedPhotoImage || null)
      : null;

    if (backgroundSource) {
      const bgImg = await loadImage(backgroundSource);
      if (bgImg) {
        const bgOx = art.elementOverrides?.bgOffsetX ?? 0;
        const bgOy = art.elementOverrides?.bgOffsetY ?? 0;
        const bgSc = (art.elementOverrides?.bgScale ?? 100) / 100;
        const bgW = template.width * bgSc;
        const bgH = template.height * bgSc;
        ctx.drawImage(bgImg, bgOx, bgOy, bgW, bgH);
      }
    }

    // Draw elements
    let missingPhotoSource = false;
    const hiddenEls = art.elementOverrides?.hiddenElements || [];
    const isCarousel = art.totalPages && art.totalPages > 1;
    const isLastCarouselPage = isCarousel && art.pageIndex === art.totalPages! - 1;
    for (const el of template.elements) {
      // Skip hidden elements
      const elKey = el.id || el.type;
      if (hiddenEls.includes(elKey)) { continue; }
      // Skip chevron: hide on non-carousel (single page) AND on the last carousel page
      if (el.type === "chevron" && (!isCarousel || isLastCarouselPage)) { continue; }
      ctx.save();
      try {
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
      } else if (drawNewShape(ctx, el.type, 
          (art.elementOverrides?.shapes?.[el.id]?.x ?? el.x),
          (art.elementOverrides?.shapes?.[el.id]?.y ?? el.y),
          (art.elementOverrides?.shapes?.[el.id]?.width ?? el.width),
          (art.elementOverrides?.shapes?.[el.id]?.height ?? el.height),
          getElementColor(el, accessoryColor1) as string)) {
        drawShapeBorder(el);
        // New shape drawn by helper
      } else if (el.type === "text") {
        // Text uses color 2 and client's font
        ctx.fillStyle = textColor;
        const baseFontSize = el.fontSize || 32;
        const fontSizeMultiplier = (art.elementOverrides?.textFontSize || 100) / 100;
        const fontSize = Math.round(baseFontSize * fontSizeMultiplier);
        const fontFamily = art.brandKit?.font || art.brandKit?.fontFamily || "Arial";
        ctx.font = `normal ${fontSize}px ${fontFamily}`;
        
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
      } else if (el.type === "image" && el.placeholder) {
        const frameOv = art.elementOverrides?.photoFrame;

        const rawFrameW = frameOv?.width ?? el.width;
        const rawFrameH = frameOv?.height ?? el.height;
        const frameW = Number.isFinite(rawFrameW)
          ? Math.max(1, rawFrameW)
          : Math.max(1, el.width);
        const frameH = Number.isFinite(rawFrameH)
          ? Math.max(1, rawFrameH)
          : Math.max(1, el.height);

        const rawFrameX = frameOv?.x ?? el.x;
        const rawFrameY = frameOv?.y ?? el.y;
        const frameX = Number.isFinite(rawFrameX) ? rawFrameX : el.x;
        const frameY = Number.isFinite(rawFrameY) ? rawFrameY : el.y;

        const directTemplatePhoto = typeof (el as any).imageUrl === "string" ? (el as any).imageUrl : null;

        // Try multiple sources before falling back to previous preview pixels.
        // This avoids visual artifacts (duplicated logo/text) when one URL expires/fails.
        const photoCandidates = [resolvedPhotoImage, art.backgroundImage, directTemplatePhoto]
          .filter((u): u is string => typeof u === "string" && u.length > 0);

        let img: HTMLImageElement | null = null;
        let usedPhotoUrl: string | null = null;
        for (const candidate of photoCandidates) {
          img = await loadImage(candidate);
          if (img) {
            usedPhotoUrl = candidate;
            break;
          }
        }

        // If all direct candidates failed, force a fresh resolve (ignoring stale candidate order)
        // before using preview pixel-slicing fallback.
        if (!img && allowAutoPhotoResolve) {
          const refreshed = await resolvePhotoImageForArt(
            { ...art, photoImage: undefined },
            { allowSearch: allowPhotoSearch }
          );
          if (refreshed) {
            const refreshedImg = await loadImage(refreshed);
            if (refreshedImg) {
              img = refreshedImg;
              usedPhotoUrl = refreshed;
            }
          }
        }

        if (usedPhotoUrl) {
          photoResolveCacheRef.current.set(artKey, { url: usedPhotoUrl, ts: Date.now() });
        }

        if (img) {
          const offsetRaw = art.photoOffset || { x: 0, y: 0 };
          const offsetX = Number.isFinite(offsetRaw.x) ? offsetRaw.x : 0;
          const offsetY = Number.isFinite(offsetRaw.y) ? offsetRaw.y : 0;
          const zoomRaw = (art.elementOverrides?.photoScale || 100) / 100;
          const zoom = Number.isFinite(zoomRaw) && zoomRaw > 0 ? zoomRaw : 1;

          const imgAspect = img.width > 0 && img.height > 0 ? img.width / img.height : 1;
          const frameAspectRaw = frameW / frameH;
          const frameAspect = Number.isFinite(frameAspectRaw) && frameAspectRaw > 0
            ? frameAspectRaw
            : Math.max(0.0001, el.width / Math.max(1, el.height));

          let sw = img.width;
          let sh = img.height;

          if (imgAspect > frameAspect) {
            sh = img.height;
            sw = sh * frameAspect;
          } else {
            sw = img.width;
            sh = sw / frameAspect;
          }

          sw = sw / zoom;
          sh = sh / zoom;

          if (sw > img.width) {
            sw = img.width;
            sh = sw / frameAspect;
          }
          if (sh > img.height) {
            sh = img.height;
            sw = sh * frameAspect;
          }

          let sx = (img.width - sw) / 2;
          let sy = (img.height - sh) / 2;

          const maxPanX = (img.width - sw) / 2;
          const maxPanY = (img.height - sh) / 2;
          sx += (offsetX / 100) * maxPanX;
          sy += (offsetY / 100) * maxPanY;

          sx = Math.max(0, Math.min(sx, img.width - sw));
          sy = Math.max(0, Math.min(sy, img.height - sh));

          const clipShape = (el as any).clipShape || "rect";
          const radius = el.borderRadius || 0;

          const needsClip = clipShape !== "rect" || radius > 0;
          if (needsClip) {
            ctx.save();
            ctx.beginPath();
            applyClipShape(ctx, clipShape, frameX, frameY, frameW, frameH, radius);
            ctx.clip();
            ctx.drawImage(img, sx, sy, sw, sh, frameX, frameY, frameW, frameH);
            ctx.restore();
          } else {
            ctx.drawImage(img, sx, sy, sw, sh, frameX, frameY, frameW, frameH);
          }

          // Persist successful frame to support stable fallback scaling if source disappears.
          photoRenderedFrameRef.current.set(artKey, {
            x: frameX,
            y: frameY,
            width: frameW,
            height: frameH,
          });
        } else {
          // Fallback: reuse the previous rendered photo area (not the current frame area)
          // so increasing size does not just stretch grid/background pixels.
          let usedPreviewFallback = false;
          if (art.imageUrl) {
            const previousPreview = await loadImage(art.imageUrl);
            if (previousPreview) {
              const clipShape = (el as any).clipShape || "rect";
              const radius = el.borderRadius || 0;

              const fallbackFrame = photoRenderedFrameRef.current.get(artKey) || {
                x: frameX,
                y: frameY,
                width: frameW,
                height: frameH,
              };

              const scaleX = previousPreview.width / Math.max(1, template.width);
              const scaleY = previousPreview.height / Math.max(1, template.height);

              const srcXRaw = fallbackFrame.x * scaleX;
              const srcYRaw = fallbackFrame.y * scaleY;
              const srcWRaw = fallbackFrame.width * scaleX;
              const srcHRaw = fallbackFrame.height * scaleY;

              const srcX = Math.max(0, Math.min(srcXRaw, previousPreview.width - 1));
              const srcY = Math.max(0, Math.min(srcYRaw, previousPreview.height - 1));
              const srcW = Math.max(1, Math.min(srcWRaw, previousPreview.width - srcX));
              const srcH = Math.max(1, Math.min(srcHRaw, previousPreview.height - srcY));

              const needsClip = clipShape !== "rect" || radius > 0;
              if (needsClip) {
                ctx.save();
                ctx.beginPath();
                applyClipShape(ctx, clipShape, frameX, frameY, frameW, frameH, radius);
                ctx.clip();
                ctx.drawImage(previousPreview, srcX, srcY, srcW, srcH, frameX, frameY, frameW, frameH);
                ctx.restore();
              } else {
                ctx.drawImage(previousPreview, srcX, srcY, srcW, srcH, frameX, frameY, frameW, frameH);
              }

              photoRenderedFrameRef.current.set(artKey, {
                x: frameX,
                y: frameY,
                width: frameW,
                height: frameH,
              });
              usedPreviewFallback = true;
            }
          }

          if (!usedPreviewFallback) {
            missingPhotoSource = true;
            // Visible placeholder only when we also fail to reuse previous preview
            ctx.save();
            ctx.setLineDash([10, 8]);
            ctx.lineWidth = Math.max(2, Math.min(frameW, frameH) * 0.015);
            ctx.strokeStyle = "rgba(255,255,255,0.9)";
            ctx.strokeRect(frameX, frameY, frameW, frameH);
            ctx.setLineDash([]);
            ctx.fillStyle = "rgba(0,0,0,0.45)";
            ctx.fillRect(frameX, frameY, frameW, frameH);
            ctx.fillStyle = "rgba(255,255,255,0.95)";
            ctx.textAlign = "center";
            ctx.font = `${Math.max(14, Math.round(Math.min(frameW, frameH) * 0.08))}px Arial`;
            ctx.fillText("IMAGEM", frameX + frameW / 2, frameY + frameH / 2);
            ctx.textAlign = "left";
            ctx.restore();
          }
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
            const boxW = el.width * logoScaleXMult;
            const boxH = el.height * logoScaleYMult;
            const boxX = el.x + logoOffsetX;
            const boxY = el.y + logoOffsetY;
            // Contain: fit entire logo within box, preserving aspect ratio, centered
            ctx.imageSmoothingEnabled = true;
            ctx.imageSmoothingQuality = "high";
            const natW = img.naturalWidth || img.width;
            const natH = img.naturalHeight || img.height;
            const bounds = getOpaqueBounds(img);
            // Moderate trim to normalize logos with different transparent paddings
            const trimInfluence = 0.6;
            const baseSx = bounds.sx * trimInfluence;
            const baseSy = bounds.sy * trimInfluence;
            const baseSw = natW - (natW - bounds.sw) * trimInfluence;
            const baseSh = natH - (natH - bounds.sh) * trimInfluence;
            const srcAspect = baseSw / baseSh;
            const boxAspect = boxW / boxH;
            let drawW = boxW;
            let drawH = boxH;
            if (srcAspect > boxAspect) {
              drawH = boxW / srcAspect;
            } else {
              drawW = boxH * srcAspect;
            }
            const drawX = boxX + (boxW - drawW) / 2;
            const drawY = boxY + (boxH - drawH) / 2;
            ctx.drawImage(img, baseSx, baseSy, baseSw, baseSh, drawX, drawY, drawW, drawH);
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
            const contactScaleXMult = (art.elementOverrides?.contactScaleX || art.elementOverrides?.contactScale || 100) / 100;
            const contactScaleYMult = (art.elementOverrides?.contactScaleY || art.elementOverrides?.contactScale || 100) / 100;
            const boxW = el.width * contactScaleXMult;
            const boxH = el.height * contactScaleYMult;
            const boxX = el.x + contactOffsetX;
            const boxY = el.y + contactOffsetY;
            // Keep proportion (no stretch) and apply a subtle size boost vs full-image cover
            ctx.imageSmoothingEnabled = true;
            ctx.imageSmoothingQuality = "high";
            const natW = img.naturalWidth || img.width;
            const natH = img.naturalHeight || img.height;
            const bounds = getOpaqueBounds(img);
            const trimInfluence = 0.22; // slight boost only
            const baseSx = bounds.sx * trimInfluence;
            const baseSy = bounds.sy * trimInfluence;
            const baseSw = natW - (natW - bounds.sw) * trimInfluence;
            const baseSh = natH - (natH - bounds.sh) * trimInfluence;
            const srcAspect = baseSw / baseSh;
            const boxAspect = boxW / boxH;
            let sx = baseSx;
            let sy = baseSy;
            let sw = baseSw;
            let sh = baseSh;
            if (srcAspect > boxAspect) {
              sw = baseSh * boxAspect;
              sx = baseSx + (baseSw - sw) / 2;
            } else {
              sh = baseSw / boxAspect;
              sy = baseSy + (baseSh - sh) / 2;
            }
            ctx.drawImage(img, sx, sy, sw, sh, boxX, boxY, boxW, boxH);
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
            drawSmoothedImage(ctx, img, el.x + mascotOffsetX, el.y + mascotOffsetY, newWidth, newHeight);
            console.log("[mascot] ✅ Drew mascot at", el.x + mascotOffsetX, el.y + mascotOffsetY, newWidth, newHeight);
          } else {
            console.warn("[mascot] ❌ Image failed to load");
          }
        } else {
          console.warn("[mascot] ⚠️ No mascot URL in brand kit for", art.clientName);
        }
      }
      } finally {
        ctx.restore();
      }
    }


    const renderedDataUrl = canvas.toDataURL("image/png");

    // Keep rendering live changes (logo/text/grid) even when photo source is missing.
    // Photo area already tries pixel-slicing fallback above; if it still fails,
    // we prefer fresh render over freezing the whole card preview.
    if (missingPhotoSource && art.imageUrl) {
      console.warn("[generateArtForClient] Photo source missing; keeping live render for non-photo updates.");
    }

    return renderedDataUrl;
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
            // Build search query from card text + image type
            const rawParts = [art.imageType, art.cardText].filter(Boolean);
            const rawQuery = rawParts.join(" ").substring(0, 150);
            
            // Try AI translation first, fallback to local dictionary
            let searchTerms: string;
            try {
              const { data: fnData } = await supabase.functions.invoke("translate-text", {
                body: { text: rawQuery },
              });
              searchTerms = fnData?.translatedText || translateToEnglishLocal(rawQuery);
            } catch {
              searchTerms = translateToEnglishLocal(rawQuery);
            }
            console.log("Searching images:", rawQuery, "→", searchTerms);
            
            const images = await searchImages(searchTerms, 1);
            if (images.length > 0) {
              updatedArts[i] = { ...art, photoImage: images[0].urls.regular };
            }
          } catch (error) {
            console.error("Error searching image for:", art.cardText);
          }
        }
        
        try {
          const imageUrl = await generateArtForClient(updatedArts[i]);
          updatedArts[i] = { ...updatedArts[i], imageUrl };
        } catch (genErr) {
          console.error("❌ Art generation failed for:", updatedArts[i].clientName, genErr);
        }
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
          // Save ALL arts preserving order (including ones without images)
          const batchItems: BatchItem[] = updatedArts.map((art) => ({
            cardId: art.cardId,
            clientId: art.clientId,
            clientName: art.clientName,
            company: art.company,
            cardTitle: art.cardTitle,
            cardText: art.cardText,
            brandKit: sanitizeBrandKitForStorage(art.brandKit),
            files: art.imageUrl ? [art.imageUrl] : [],
            backgroundImages: art.backgroundImage ? [art.backgroundImage] : undefined,
            photoImage: getEffectivePhotoImage(art),
            photoOffset: art.photoOffset,
            elementOverrides: art.elementOverrides,
            pageIndex: art.pageIndex,
            totalPages: art.totalPages,
            imageType: art.imageType,
            narrationType: art.narrationType,
            briefing: art.briefing,
            note: art.note,
            noteRead: art.noteRead,
          }));
          const hasUnresolvedNotes = batchItems.some(i => i.note && !i.noteRead);
          let effectiveTeam = initialTeamFilter || null;
          if (!effectiveTeam && batchItems.length > 0) {
            const { data: cd } = await supabase.from("client_data").select("team").eq("id", batchItems[0].clientId).single();
            if (cd?.team) effectiveTeam = cd.team;
          }
          const snapshotWithTeam = { ...template, teamFilter: effectiveTeam, hasUnresolvedNotes };
          const savedId = await saveBatchGeneration("art", snapshotWithTeam, batchItems, batchIdRef.current || undefined);
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
    const art = clientArtsRef.current[index] || clientArts[index];
    let artToRender = art;

    if (art && !art.photoImage) {
      const resolved = await resolvePhotoImageForArt(art, { allowSearch: true });
      if (resolved) {
        artToRender = { ...art, photoImage: resolved };
      }
    }

    const imageUrl = await generateArtForClient(artToRender, { allowAutoPhotoResolve: false });
    setClientArts((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], ...artToRender, imageUrl };
      return next;
    });
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
    setSearchPage(1);
    try {
      const searchFn = imageSourceTab === "pixabay" ? searchPixabayImages : searchPexelsImages;
      const images = await searchFn(searchQuery, 12, 1);
      setSearchImagesResults(images);
      
      if (images.length === 0) {
        toast({
          title: "Nenhuma imagem encontrada",
          description: "Tente outro termo de busca.",
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

  const handleLoadMoreImages = async () => {
    if (!searchQuery.trim()) return;
    const nextPage = searchPage + 1;
    setIsLoadingMore(true);
    try {
      const searchFn = imageSourceTab === "pixabay" ? searchPixabayImages : searchPexelsImages;
      const images = await searchFn(searchQuery, 12, nextPage);
      if (images.length > 0) {
        setSearchImagesResults(prev => [...prev, ...images]);
        setSearchPage(nextPage);
      }
    } catch (error) {
      console.error("Error loading more images:", error);
    } finally {
      setIsLoadingMore(false);
    }
  };

  const handleSelectPhotoImage = async (image: SearchImage) => {
    if (!selectedArt || selectedArtIndex < 0) return;
    const index = selectedArtIndex;
    if (index >= clientArts.length) return;

    const currentArt = clientArts[index];
    const updatedArt = {
      ...currentArt,
      photoImage: image.urls.regular,
      backgroundImage: hasImagePlaceholder ? currentArt.backgroundImage : image.urls.regular,
      photoOffset: { x: 0, y: 0 },
      elementOverrides: {
        ...currentArt.elementOverrides,
        ...(hasImagePlaceholder ? {} : { bgOffsetX: 0, bgOffsetY: 0, bgScale: 100 }),
      },
    };

    lockPhotoForArt(updatedArt, image.urls.regular);
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

    const currentArt = clientArts[index];
    const updatedArt = {
      ...currentArt,
      photoImage: imageUrl,
      backgroundImage: hasImagePlaceholder ? currentArt.backgroundImage : imageUrl,
      photoOffset: { x: 0, y: 0 },
      elementOverrides: {
        ...currentArt.elementOverrides,
        ...(hasImagePlaceholder ? {} : { bgOffsetX: 0, bgOffsetY: 0, bgScale: 100 }),
      },
    };

    lockPhotoForArt(updatedArt, imageUrl);
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

  const waitForPendingRegenerations = useCallback(async () => {
    const pending = Array.from(pendingRegenerationsRef.current.values());
    if (pending.length === 0) return;
    await Promise.allSettled(pending);
  }, []);

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
      const newImageUrl = await generateArtForClient(tempArt, { allowAutoPhotoResolve: false });
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
    const imageUrl = await generateArtForClient(updatedArts[index], { allowAutoPhotoResolve: false });
    updatedArts[index] = { ...updatedArts[index], imageUrl };
    setClientArts([...updatedArts]);
  }, [commitOverridesToArt, regenerateFromRefs, generateArtForClient]);

  // Refresh brand kit AND card text from database and regenerate art
  const refreshBrandKitAndRegenerate = async (index: number) => {
    const art = clientArts[index];
    try {
      // Fetch fresh client data and card text in parallel
      const [clientRes, cardRes] = await Promise.all([
        supabase
          .from("client_data")
          .select("brand_kit")
          .eq("id", art.clientId)
          .single(),
        supabase
          .from("project_briefs")
          .select("title, description")
          .eq("id", art.cardId)
          .single(),
      ]);

      if (clientRes.error || !clientRes.data) {
        toast({ title: "Erro ao buscar dados do cliente", variant: "destructive" });
        return;
      }

      // Build updated art with fresh brand kit and card text
      const updatedArts = [...clientArts];
      const freshArt: Partial<typeof art> = {
        brandKit: clientRes.data.brand_kit,
        imageUrl: null,
      };

      if (cardRes.data) {
        freshArt.cardTitle = cardRes.data.title || art.cardTitle;
        const fullText = cardRes.data.description || cardRes.data.title || art.cardText;
        const textParts = fullText.split(';').map((t: string) => t.trim()).filter((t: string) => t.length > 0);
        const newPageCount = textParts.length;
        const isCarousel = art.pageIndex !== undefined && art.totalPages && art.totalPages > 1;
        const wasCarousel = isCarousel;
        const becomesCarousel = newPageCount > 1;

        if (becomesCarousel) {
          // Find all sibling pages of this card (same cardId)
          const siblingIndices = updatedArts
            .map((a, i) => a.cardId === art.cardId ? i : -1)
            .filter(i => i >= 0);
          const oldPageCount = siblingIndices.length;

          if (newPageCount > oldPageCount) {
            // Add new pages after the last sibling
            const lastSiblingIdx = siblingIndices[siblingIndices.length - 1];
            const newPages: ClientArt[] = [];
            for (let pi = oldPageCount; pi < newPageCount; pi++) {
              newPages.push({
                clientId: art.clientId,
                clientName: art.clientName,
                company: art.company,
                cardId: art.cardId,
                cardTitle: cardRes.data.title || art.cardTitle,
                cardText: textParts[pi],
                brandKit: clientRes.data.brand_kit,
                imageType: art.imageType,
                narrationType: art.narrationType,
                briefing: art.briefing,
                imageUrl: null,
                status: "pending",
                pageIndex: pi,
                totalPages: newPageCount,
              });
            }
            updatedArts.splice(lastSiblingIdx + 1, 0, ...newPages);
            // Re-calculate current index (it may have shifted)
            // Update all siblings with new totalPages and correct text
            const freshSiblingIndices = updatedArts
              .map((a, i) => a.cardId === art.cardId ? i : -1)
              .filter(i => i >= 0);
            freshSiblingIndices.forEach((si, pi) => {
              updatedArts[si] = {
                ...updatedArts[si],
                pageIndex: pi,
                totalPages: newPageCount,
                cardText: textParts[pi] || updatedArts[si].cardText,
                cardTitle: cardRes.data!.title || art.cardTitle,
                brandKit: clientRes.data.brand_kit,
              };
            });
          } else if (newPageCount < oldPageCount) {
            // Remove excess pages (from the end)
            const toRemove = siblingIndices.slice(newPageCount);
            // Remove in reverse order to keep indices stable
            for (let ri = toRemove.length - 1; ri >= 0; ri--) {
              updatedArts.splice(toRemove[ri], 1);
            }
            // Update remaining siblings
            const freshSiblingIndices = updatedArts
              .map((a, i) => a.cardId === art.cardId ? i : -1)
              .filter(i => i >= 0);
            freshSiblingIndices.forEach((si, pi) => {
              updatedArts[si] = {
                ...updatedArts[si],
                pageIndex: pi,
                totalPages: newPageCount,
                cardText: textParts[pi] || updatedArts[si].cardText,
                cardTitle: cardRes.data!.title || art.cardTitle,
                brandKit: clientRes.data.brand_kit,
              };
            });
          } else {
            // Same count - just update text for all siblings
            siblingIndices.forEach((si, pi) => {
              updatedArts[si] = {
                ...updatedArts[si],
                pageIndex: pi,
                totalPages: newPageCount,
                cardText: textParts[pi] || updatedArts[si].cardText,
                cardTitle: cardRes.data!.title || art.cardTitle,
                brandKit: clientRes.data.brand_kit,
              };
            });
          }

          // Find current art's new index
          const currentIdx = updatedArts.findIndex(
            a => a.cardId === art.cardId && a.pageIndex === (art.pageIndex ?? 0)
          );
          setClientArts([...updatedArts]);

          // Regenerate all sibling pages that need it
          const finalSiblingIndices = updatedArts
            .map((a, i) => a.cardId === art.cardId ? i : -1)
            .filter(i => i >= 0);
          for (const si of finalSiblingIndices) {
            const imgUrl = await generateArtForClient({ ...updatedArts[si] });
            updatedArts[si] = { ...updatedArts[si], imageUrl: imgUrl };
          }
          setClientArts([...updatedArts]);
        } else {
          // Not a carousel anymore or was never one
          if (wasCarousel) {
            // Remove sibling pages, keep only this one
            const siblingIndices = updatedArts
              .map((a, i) => a.cardId === art.cardId && i !== index ? i : -1)
              .filter(i => i >= 0);
            for (let ri = siblingIndices.length - 1; ri >= 0; ri--) {
              updatedArts.splice(siblingIndices[ri], 1);
            }
            // Find updated index of current card
            const newIdx = updatedArts.findIndex(a => a.cardId === art.cardId);
            if (newIdx >= 0) {
              updatedArts[newIdx] = {
                ...updatedArts[newIdx],
                ...freshArt,
                cardText: fullText,
                pageIndex: undefined,
                totalPages: undefined,
              };
            }
          } else {
            freshArt.cardText = fullText;
            updatedArts[index] = { ...updatedArts[index], ...freshArt };
          }
          setClientArts([...updatedArts]);

          const targetIdx = updatedArts.findIndex(a => a.cardId === art.cardId);
          if (targetIdx >= 0) {
            const newImageUrl = await generateArtForClient({ ...updatedArts[targetIdx] });
            updatedArts[targetIdx] = { ...updatedArts[targetIdx], imageUrl: newImageUrl };
            setClientArts([...updatedArts]);
          }
        }
      } else {
        updatedArts[index] = { ...updatedArts[index], ...freshArt };
        setClientArts(updatedArts);
        const newImageUrl = await generateArtForClient({ ...updatedArts[index] });
        updatedArts[index] = { ...updatedArts[index], imageUrl: newImageUrl };
        setClientArts([...updatedArts]);
      }

      toast({ title: "Dados atualizados!", description: `Kit de marca e texto de ${art.clientName} recarregados.` });
    } catch (error) {
      console.error("Error refreshing:", error);
      toast({ title: "Erro ao atualizar dados", variant: "destructive" });
    }
  };

  // Save current state as draft to history (without finalizing)
  const handleSaveDraft = async () => {
    await waitForPendingRegenerations();
    const currentArts = clientArtsRef.current;
    const artsWithImages = currentArts.filter((a) => a.imageUrl);
    
    if (artsWithImages.length === 0) {
      toast({
        title: "Nenhuma arte gerada",
        description: "Gere as artes antes de salvar o rascunho.",
        variant: "destructive",
      });
      return;
    }

    try {
      // Save ALL clientArts preserving their exact order
      const batchItems: BatchItem[] = currentArts.map((art) => ({
        cardId: art.cardId,
        clientId: art.clientId,
        clientName: art.clientName,
        company: art.company,
        cardTitle: art.cardTitle,
        cardText: art.cardText,
        brandKit: sanitizeBrandKitForStorage(art.brandKit),
        files: art.imageUrl ? [art.imageUrl] : [],
        backgroundImages: art.backgroundImage ? [art.backgroundImage] : undefined,
        photoImage: getEffectivePhotoImage(art),
        photoOffset: art.photoOffset,
        elementOverrides: art.elementOverrides,
        pageIndex: art.pageIndex,
        totalPages: art.totalPages,
        imageType: art.imageType,
        narrationType: art.narrationType,
        briefing: art.briefing,
        note: art.note,
        noteRead: art.noteRead,
      }));

      const hasUnresolvedNotes = batchItems.some(i => i.note && !i.noteRead);
      let effectiveTeam = initialTeamFilter || null;
      if (!effectiveTeam && batchItems.length > 0) {
        const { data: cd } = await supabase.from("client_data").select("team").eq("id", batchItems[0].clientId).single();
        if (cd?.team) effectiveTeam = cd.team;
      }
      const snapshotWithTeam = { ...template, teamFilter: effectiveTeam, hasUnresolvedNotes };
      const savedId = await saveBatchGeneration("art", snapshotWithTeam, batchItems, batchIdRef.current || undefined);
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
    const readyArts = clientArts.filter((a) => a.imageUrl);

    if (readyArts.length === 0) {
      toast({
        title: "Nenhuma arte gerada",
        description: "Gere as artes antes de enviar.",
        variant: "destructive",
      });
      return;
    }

    setIsSendingEmails(true);

    try {
      // Group ready arts by clientId
      const byClient = new Map<string, typeof readyArts>();
      for (const art of readyArts) {
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

      // Process clients in parallel (3 at a time)
      const clientEntries = [...byClient.entries()];
      const CONCURRENCY = 3;

      for (let i = 0; i < clientEntries.length; i += CONCURRENCY) {
        const batch = clientEntries.slice(i, i + CONCURRENCY);
        const batchResults = await Promise.allSettled(
          batch.map(async ([clientId, arts]) => {
            const clientRow = clientsData?.find((c) => c.id === clientId);
            if (!clientRow) return false;

            const emails = [clientRow.email, clientRow.email_2, clientRow.email_3].filter(
              (e): e is string => !!e && e.includes("@")
            );
            if (emails.length === 0) {
              toast({ title: `${arts[0].clientName}: sem e-mail cadastrado`, variant: "destructive" });
              return false;
            }

            // Upload each art image to temp storage and collect URLs
            const mediaUrls: string[] = [];
            const localPaths: string[] = [];
            await Promise.all(
              arts.map(async (art) => {
                const response = await fetch(art.imageUrl!);
                const blob = await response.blob();
                const fileName = `temp_email_${art.cardId}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}.png`;
                const path = `artes/${fileName}`;

                const { error: uploadError } = await supabase.storage
                  .from("card-uploads")
                  .upload(path, blob, { contentType: "image/png" });

                if (uploadError) {
                  console.error("Upload error:", uploadError);
                  return;
                }

                localPaths.push(path);
                const { data: urlData } = supabase.storage.from("card-uploads").getPublicUrl(path);
                mediaUrls.push(urlData.publicUrl);
              })
            );

            uploadedPaths.push(...localPaths);

            if (mediaUrls.length === 0) return false;

            // Send email
            const { error } = await supabase.functions.invoke("send-media-email", {
              body: {
                emails,
                subject: emailSubject.trim() || `Arte - ${arts[0].company || arts[0].clientName}`,
                mediaUrls,
                mediaUrl: mediaUrls[0],
                mediaType: "art",
                clientName: arts[0].company || arts[0].clientName,
                cardText: arts.map(a => a.cardText || a.cardTitle).filter(Boolean).join("\n\n"),
                caption: undefined,
              },
            });

            if (error) {
              console.error("Email error:", error);
              toast({ title: `Erro ao enviar e-mail para ${arts[0].clientName}`, variant: "destructive" });
              return false;
            }
            return true;
          })
        );

        for (const r of batchResults) {
          if (r.status === "fulfilled" && r.value) sentCount++;
        }
      }

      // Clean up temp files from storage
      if (uploadedPaths.length > 0) {
        await supabase.storage.from("card-uploads").remove(uploadedPaths);
      }

      // Clear art generation tags
      await clearArtGenerationTags();

      // Keep batch in history — user will delete manually after reviewing

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

  const readyCount = clientArts.filter((a) => a.imageUrl).length;

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
           <div className="flex gap-2 items-center">
            <Badge variant="outline">{clientArts.filter(a => a.imageUrl).length} geradas</Badge>
          </div>
          
          {/* Email subject input */}
          {clientArts.some((a) => a.imageUrl) && (
            <Input
              placeholder="Título do e-mail (obrigatório)"
              value={emailSubject}
              onChange={(e) => setEmailSubject(e.target.value)}
              className={`w-56 h-9 text-sm ${!emailSubject.trim() ? 'border-destructive' : ''}`}
            />
          )}

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
              disabled={readyCount === 0 || isSendingEmails || !emailSubject.trim()}
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
                  Enviar {readyCount} por E-mail
                </>
              )}
            </Button>
          )}
        </div>
      </div>

      {/* Gallery */}
      <ScrollArea className="flex-1 p-6">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {clientArts.map((art, index) => (
            <ArtCardWithOverlay
              key={`${art.clientId}-${art.cardId}-${art.pageIndex ?? 0}-${index}`}
              art={art}
              index={index}
              template={template}
              onArtUpdate={(idx, updates) => {
                setClientArts((prev) => {
                  const next = [...prev];
                  next[idx] = { ...next[idx], ...updates };
                  return next;
                });
              }}
              onRegenerate={async (updatedArt) => {
                const artKey = getClientArtKey(updatedArt);
                const currentTicket = (onRegenerateTicketRef.current.get(artKey) ?? 0) + 1;
                onRegenerateTicketRef.current.set(artKey, currentTicket);

                const regenerationPromise = (async () => {
                  // Always get the LATEST card state from ref to avoid stale closure issues
                  const latestArt = clientArtsRef.current.find((a) =>
                    a.clientId === updatedArt.clientId &&
                    a.cardId === updatedArt.cardId &&
                    (a.pageIndex ?? 0) === (updatedArt.pageIndex ?? 0)
                  );

                  // Keep both photo source and last valid preview locked to this card.
                  const lockedPhoto = getEffectivePhotoImage(latestArt || updatedArt) || null;
                  const lastValidPreview = latestArt?.imageUrl || updatedArt.imageUrl || null;

                  const artToRender: ClientArt = {
                    ...(latestArt || updatedArt),
                    ...updatedArt,
                    imageUrl: lastValidPreview,
                    photoImage: lockedPhoto || undefined,
                  };

                  // Persist and lock the photo source whenever it exists to prevent future swaps.
                  if (artToRender.photoImage) {
                    lockPhotoForArt(updatedArt, artToRender.photoImage);
                    setClientArts((prev) => {
                      const next = [...prev];
                      const targetIndex = next.findIndex((a) =>
                        a.clientId === updatedArt.clientId &&
                        a.cardId === updatedArt.cardId &&
                        (a.pageIndex ?? 0) === (updatedArt.pageIndex ?? 0)
                      );
                      if (targetIndex !== -1 && next[targetIndex].photoImage !== artToRender.photoImage) {
                        next[targetIndex] = { ...next[targetIndex], photoImage: artToRender.photoImage };
                      }
                      return next;
                    });
                  }

                  const generated = await generateArtForClient(artToRender, {
                    allowAutoPhotoResolve: true,
                    allowPhotoSearch: false,
                  });

                  // Ignore stale generations and keep newest preview
                  if (onRegenerateTicketRef.current.get(artKey) !== currentTicket) {
                    const newest = clientArtsRef.current.find((a) => getClientArtKey(a) === artKey)?.imageUrl;
                    return newest || generated;
                  }

                  // Persist latest rendered preview in parent state immediately
                  setClientArts((prev) => {
                    const next = [...prev];
                    const targetIndex = next.findIndex((a) => getClientArtKey(a) === artKey);
                    if (targetIndex !== -1) {
                      next[targetIndex] = {
                        ...next[targetIndex],
                        imageUrl: generated,
                        photoOffset: updatedArt.photoOffset,
                        elementOverrides: updatedArt.elementOverrides,
                      };
                    }
                    return next;
                  });

                  return generated;
                })();

                pendingRegenerationsRef.current.set(artKey, regenerationPromise);
                try {
                  return await regenerationPromise;
                } finally {
                  if (pendingRegenerationsRef.current.get(artKey) === regenerationPromise) {
                    pendingRegenerationsRef.current.delete(artKey);
                  }
                }
              }}
              onApprove={handleApprove}
              onReject={handleReject}
              onOpenImageDialog={(a, idx) => {
                setSelectedArt(a);
                setSelectedArtIndex(idx);
                setSearchQuery("");
                setIsImageDialogOpen(true);
              }}
              onRefreshBrandKit={refreshBrandKitAndRegenerate}
              onRemoveBackground={async (a, idx) => {
                if (!a.photoImage) return;
                setIsRemovingBg(true);
                setRemoveBgProgress("Iniciando...");
                try {
                  const newPhotoUrl = await removeBackground(a.photoImage, setRemoveBgProgress);
                  const updatedArt = { ...clientArts[idx], photoImage: newPhotoUrl, photoOffset: { x: 0, y: 0 } };
                  const updatedArts = [...clientArts];
                  updatedArts[idx] = updatedArt;
                  setClientArts(updatedArts);
                  const artImageUrl = await generateArtForClient(updatedArt);
                  updatedArts[idx] = { ...updatedArt, imageUrl: artImageUrl };
                  setClientArts([...updatedArts]);
                  toast({ title: "Fundo removido!" });
                } catch (error) {
                  console.error("Error removing background:", error);
                  toast({ title: "Erro ao remover fundo", variant: "destructive" });
                } finally {
                  setIsRemovingBg(false);
                  setRemoveBgProgress("");
                }
              }}
              onOpenEraser={(a, idx) => {
                setSelectedArt(a);
                setSelectedArtIndex(idx);
                setEraserModalOpen(true);
              }}
              onSaveNote={async (idx, note) => {
                if (currentBatchId) {
                  const success = await updateBatchItem(currentBatchId, idx, { note, noteRead: !note });
                  toast({ title: success ? "Anotação salva" : "Erro ao salvar anotação", variant: success ? "default" : "destructive" });
                } else {
                  toast({ title: "Salve o lote primeiro", variant: "destructive" });
                }
              }}
              onResolveNote={async (idx) => {
                const updated = [...clientArts];
                updated[idx] = { ...updated[idx], note: "", noteRead: true };
                setClientArts(updated);
                if (currentBatchId) {
                  await updateBatchItem(currentBatchId, idx, { note: "", noteRead: true });
                }
              }}
              onDropImage={async (idx, file) => {
                const reader = new FileReader();
                reader.onload = async (ev) => {
                  const base64 = ev.target?.result as string;
                  if (!base64) return;
                  const art = clientArts[idx];
                  const updatedArt = { ...art, photoImage: base64, photoOffset: { x: 0, y: 0 } };
                  lockPhotoForArt(updatedArt, base64);
                  const updatedArts = [...clientArts];
                  updatedArts[idx] = updatedArt;
                  setClientArts(updatedArts);
                  const newImageUrl = await generateArtForClient(updatedArt);
                  setClientArts((prev) => {
                    const next = [...prev];
                    next[idx] = { ...next[idx], imageUrl: newImageUrl };
                    return next;
                  });
                  toast({ title: "Imagem aplicada via arraste!" });
                };
                reader.readAsDataURL(file);
              }}
              onMoveToEnd={(idx) => {
                setClientArts((prev) => {
                  const next = [...prev];
                  const [moved] = next.splice(idx, 1);
                  next.push(moved);
                  return next;
                });
              }}
              onDelete={(idx) => {
                setClientArts((prev) => {
                  const next = [...prev];
                  next.splice(idx, 1);
                  return next;
                });
                toast({ title: "Item removido do lote" });
              }}
              onApplyToCarousel={async (idx, overrides) => {
                const sourceArt = clientArts[idx];
                const siblings = clientArts
                  .map((a, i) => ({ a, i }))
                  .filter(({ a, i }) =>
                    i !== idx &&
                    a.clientId === sourceArt.clientId &&
                    a.cardId === sourceArt.cardId
                  );

                if (siblings.length === 0) return;

                // Apply layout overrides to all sibling pages (preserve photo-specific offsets)
                const layoutOverrides: Partial<ElementOverrides> = {
                  logoX: overrides.logoX, logoY: overrides.logoY,
                  logoScaleX: overrides.logoScaleX, logoScaleY: overrides.logoScaleY,
                  contactX: overrides.contactX, contactY: overrides.contactY,
                  contactScaleX: overrides.contactScaleX, contactScaleY: overrides.contactScaleY,
                  mascotX: overrides.mascotX, mascotY: overrides.mascotY,
                  mascotScaleX: overrides.mascotScaleX, mascotScaleY: overrides.mascotScaleY,
                  shapes: overrides.shapes,
                  bgOffsetX: overrides.bgOffsetX, bgOffsetY: overrides.bgOffsetY, bgScale: overrides.bgScale,
                  hiddenElements: overrides.hiddenElements,
                };

                setClientArts((prev) => {
                  const next = [...prev];
                  for (const { i } of siblings) {
                    next[i] = {
                      ...next[i],
                      elementOverrides: {
                        ...next[i].elementOverrides,
                        ...layoutOverrides,
                      },
                    };
                  }
                  return next;
                });

                // Regenerate all sibling pages
                for (const { a, i } of siblings) {
                  const updated = {
                    ...a,
                    elementOverrides: { ...a.elementOverrides, ...layoutOverrides },
                  };
                  try {
                    const newUrl = await generateArtForClient(updated);
                    setClientArts((prev) => {
                      const next = [...prev];
                      next[i] = { ...next[i], imageUrl: newUrl, elementOverrides: updated.elementOverrides };
                      return next;
                    });
                  } catch (e) {
                    console.error("Error regenerating carousel sibling:", e);
                  }
                }

                toast({ title: `Ajustes aplicados a ${siblings.length + 1} páginas do carrossel` });
              }}
              isRemovingBg={isRemovingBg}
              removeBgProgress={removeBgProgress}
            />
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

            <TabsContent value="bank" className="space-y-3">
              {/* Source tabs */}
              <Tabs value={imageSourceTab} onValueChange={(v) => {
                setImageSourceTab(v as "pexels" | "pixabay");
                setSearchImagesResults([]);
                setSearchPage(1);
              }}>
                <TabsList className="grid w-full grid-cols-2 h-8">
                  <TabsTrigger value="pexels" className="text-xs">Pexels</TabsTrigger>
                  <TabsTrigger value="pixabay" className="text-xs">Pixabay</TabsTrigger>
                </TabsList>
              </Tabs>

              <div className="flex gap-2">
                <Input
                  placeholder={`Buscar no ${imageSourceTab === "pexels" ? "Pexels" : "Pixabay"}...`}
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
                    </div>
                  ))}
                </div>
                {searchImages_results.length > 0 && (
                  <div className="flex justify-center py-3">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleLoadMoreImages}
                      disabled={isLoadingMore}
                    >
                      {isLoadingMore ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
                      Carregar Mais
                    </Button>
                  </div>
                )}
                {searchImages_results.length === 0 && (
                  <div className="text-center py-8 text-muted-foreground">
                    <p>Busque por imagens acima</p>
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

    </div>
  );
};
