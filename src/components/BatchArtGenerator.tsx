import { useState, useEffect, useRef, useCallback } from "react";
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
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { getTaggedCardsForArtGeneration, createCardUpload, clearArtGenerationTags, updateProjectBrief, autoTagFirstCardsForAllActiveClients } from "@/lib/clientDatabase";
import { searchImages, SearchImage, getConfiguredApis } from "@/lib/imageSearch";
import { supabase } from "@/integrations/supabase/client";
import { saveBatchGeneration, BatchItem } from "@/lib/batchHistory";
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
  type: "rect" | "circle" | "text" | "image" | "logo" | "contact" | "mascot" | "triangle" | "line" | "star" | "diamond" | "hexagon" | "pentagon";
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
}

// Helper to load image - handles both base64 data URLs and HTTP URLs
const loadImage = async (url: string): Promise<HTMLImageElement | null> => {
  if (!url) return null;
  
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      console.log("Image loaded successfully:", url.substring(0, 50));
      resolve(img);
    };
    img.onerror = (e) => {
      console.error("Error loading image:", url.substring(0, 50), e);
      resolve(null);
    };
    img.src = url;
  });
};

interface BatchArtGeneratorProps {
  template: MasterTemplate;
  onBack: () => void;
  onComplete: () => void;
}

export const BatchArtGenerator = ({ template, onBack, onComplete }: BatchArtGeneratorProps) => {
  const [clientArts, setClientArts] = useState<ClientArt[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);
  const [selectedArt, setSelectedArt] = useState<ClientArt | null>(null);
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
    loadTaggedCards();
  }, []);

  // Auto-generate arts when cards are loaded
  useEffect(() => {
    if (clientArts.length > 0 && !isLoading && !isGenerating && !clientArts.some(a => a.imageUrl)) {
      generateAllArts();
    }
  }, [clientArts, isLoading]);

  const loadTaggedCards = async () => {
    try {
      setIsLoading(true);
      
      // Auto-tag first cards of all active clients
      await autoTagFirstCardsForAllActiveClients();
      
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
          const dx = Math.cos(angle) * w;
          const dy = Math.sin(angle) * h;
          gradient = ctx.createLinearGradient(x, y, x + dx, y + dy);
        } else {
          gradient = ctx.createRadialGradient(
            x + w / 2, y + h / 2, 0,
            x + w / 2, y + h / 2, Math.max(w, h) / 2
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
        } else {
          ctx.fillRect(x, y, w, h);
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
      } else if (el.type === "text") {
        // Text uses color 2 and client's font
        ctx.fillStyle = textColor;
        const baseFontSize = el.fontSize || 32;
        const fontSizeMultiplier = (art.elementOverrides?.textFontSize || 100) / 100;
        const fontSize = Math.round(baseFontSize * fontSizeMultiplier);
        const fontFamily = art.brandKit?.fontFamily || "Arial";
        ctx.font = `${fontSize}px ${fontFamily}`;
        
        // Use card text for text elements
        const text = art.cardText || el.text || "";
        
        // Apply text position overrides
        const textOffsetX = art.elementOverrides?.textX || 0;
        const textOffsetY = art.elementOverrides?.textY || 0;
        const baseX = el.x + textOffsetX;
        const baseY = el.y + textOffsetY;
        
        // Word wrap text within element width
        const words = text.split(' ');
        let line = '';
        let y = baseY + fontSize;
        const maxWidth = el.width || 400;
        const lineHeight = fontSize * 1.2;
        
        for (let i = 0; i < words.length; i++) {
          const testLine = line + words[i] + ' ';
          const metrics = ctx.measureText(testLine);
          if (metrics.width > maxWidth && i > 0) {
            ctx.fillText(line.trim(), baseX, y);
            line = words[i] + ' ';
            y += lineHeight;
          } else {
            line = testLine;
          }
        }
        ctx.fillText(line.trim(), baseX, y);
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

          ctx.drawImage(img, sx, sy, sw, sh, frameX, frameY, frameW, frameH);
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
        // Mascot uses PNG[2] from brand kit
        const mascotUrl = art.brandKit?.pngs?.[2] || art.brandKit?.mascot;
        console.log("Loading mascot from:", mascotUrl?.substring(0, 50));
        if (mascotUrl) {
          const img = await loadImage(mascotUrl);
          if (img) {
            ctx.drawImage(img, el.x, el.y, el.width, el.height);
          }
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
      
      // Check if template has image placeholders
      const hasImagePlaceholder = template.elements.some(el => el.type === "image" && el.placeholder);

      for (let i = 0; i < updatedArts.length; i++) {
        const art = updatedArts[i];
        
        // Search for relevant image if template has image placeholder
        if (hasImagePlaceholder && !art.photoImage) {
          try {
            // Translate text to English for better image search results
            let searchTerms = art.cardText.split(" ").slice(0, 5).join(" ");
            
            try {
              const translateResponse = await fetch(
                `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/translate-text`,
                {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
                  },
                  body: JSON.stringify({ text: art.cardText }),
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
    if (!selectedArt) return;
    const index = clientArts.findIndex((a) => 
      a.clientId === selectedArt.clientId && 
      a.cardId === selectedArt.cardId &&
      a.pageIndex === selectedArt.pageIndex
    );
    if (index === -1) return;

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
    if (!selectedArt) return;
    const index = clientArts.findIndex((a) => 
      a.clientId === selectedArt.clientId && 
      a.cardId === selectedArt.cardId &&
      a.pageIndex === selectedArt.pageIndex
    );
    if (index === -1) return;

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
    setSelectedArt(art);
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

  // Debounced live preview regeneration
  const regenerateLivePreview = useCallback(async (
    art: ClientArt,
    overrides: {
      photoOffsetX: number;
      photoOffsetY: number;
      photoScale: number;
      photoFrame: ShapeOverride | null;
      logoX: number;
      logoY: number;
      logoScale: number;
      logoScaleX: number;
      logoScaleY: number;
      textX: number;
      textY: number;
      textFontSize: number;
      contactX: number;
      contactY: number;
      contactScale: number;
      contactScaleX: number;
      contactScaleY: number;
      shapeOverrides: Record<string, ShapeOverride>;
    }
  ) => {
    const tempArt: ClientArt = {
      ...art,
      photoOffset: { x: overrides.photoOffsetX, y: overrides.photoOffsetY },
      elementOverrides: {
        logoX: overrides.logoX,
        logoY: overrides.logoY,
        logoScale: overrides.logoScale,
        logoScaleX: overrides.logoScaleX,
        logoScaleY: overrides.logoScaleY,
        textX: overrides.textX,
        textY: overrides.textY,
        textFontSize: overrides.textFontSize,
        contactX: overrides.contactX,
        contactY: overrides.contactY,
        contactScale: overrides.contactScale,
        contactScaleX: overrides.contactScaleX,
        contactScaleY: overrides.contactScaleY,
        photoScale: overrides.photoScale,
        photoFrame: overrides.photoFrame || undefined,
        shapes: overrides.shapeOverrides,
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
  }, [template]);

  // Auto-trigger live preview when any adjustment value changes while dialog is open
  useEffect(() => {
    if (!isAdjustDialogOpen || !selectedArt) return;
    
    // Clear existing timer
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }
    
    // Set new debounced timer (400ms for smoother experience)
    debounceTimerRef.current = setTimeout(() => {
      regenerateLivePreview(selectedArt, {
        photoOffsetX,
        photoOffsetY,
        photoScale,
        photoFrame,
        logoX,
        logoY,
        logoScale,
        logoScaleX,
        logoScaleY,
        textX,
        textY,
        textFontSize,
        contactX,
        contactY,
        contactScale,
        contactScaleX,
        contactScaleY,
        shapeOverrides,
      });
    }, 400);
    
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, [isAdjustDialogOpen, selectedArt, photoOffsetX, photoOffsetY, photoScale, photoFrame, logoX, logoY, logoScale, logoScaleX, logoScaleY, textX, textY, textFontSize, contactX, contactY, contactScale, contactScaleX, contactScaleY, shapeOverrides, regenerateLivePreview]);

  const handleApplyElementOverrides = async () => {
    if (!selectedArt) return;
    const index = clientArts.findIndex((a) => 
      a.clientId === selectedArt.clientId && 
      a.cardId === selectedArt.cardId &&
      a.pageIndex === selectedArt.pageIndex
    );
    if (index === -1) return;

    const updatedArts = [...clientArts];
    updatedArts[index] = { 
      ...updatedArts[index], 
      photoOffset: { x: photoOffsetX, y: photoOffsetY },
      elementOverrides: {
        logoX,
        logoY,
        logoScale,
        logoScaleX,
        logoScaleY,
        textX,
        textY,
        textFontSize,
        contactX,
        contactY,
        contactScale,
        contactScaleX,
        contactScaleY,
        photoScale,
        photoFrame: photoFrame || undefined,
        shapes: shapeOverrides,
      }
    };
    setClientArts(updatedArts);
    setIsAdjustDialogOpen(false);

    // Regenerate the art with new overrides
    const imageUrl = await generateArtForClient(updatedArts[index]);
    updatedArts[index] = { ...updatedArts[index], imageUrl };
    setClientArts([...updatedArts]);
    
    toast({
      title: "Ajustes aplicados!",
      description: "A arte foi regenerada com as novas configurações.",
    });
  };

  const handleApproveAll = async () => {
    const approvedArts = clientArts.filter((a) => a.status === "approved" && a.imageUrl);

    if (approvedArts.length === 0) {
      toast({
        title: "Nenhuma arte aprovada",
        description: "Aprove as artes antes de salvar.",
        variant: "destructive",
      });
      return;
    }

    try {
      for (const art of approvedArts) {
        // Convert base64 to blob and upload
        const response = await fetch(art.imageUrl!);
        const blob = await response.blob();
        const fileName = `art_${art.cardId}_${Date.now()}.png`;

        const { data: uploadData, error: uploadError } = await supabase.storage
          .from("card-uploads")
          .upload(`artes/${fileName}`, blob, {
            contentType: "image/png",
          });

        if (uploadError) {
          console.error("Upload error:", uploadError);
          continue;
        }

        const { data: urlData } = supabase.storage
          .from("card-uploads")
          .getPublicUrl(`artes/${fileName}`);

        // Create card upload record
        await createCardUpload({
          card_id: art.cardId,
          file_name: fileName,
          file_url: urlData.publicUrl,
          file_type: "image/png",
          upload_type: "final",
        });

        // Update card cover image
        await updateProjectBrief(art.cardId, { cover_image: urlData.publicUrl });
      }

      // Clear the art generation tags
      await clearArtGenerationTags();

      // Save batch to history
      const batchItems: BatchItem[] = approvedArts.map((art) => ({
        cardId: art.cardId,
        clientId: art.clientId,
        clientName: art.clientName,
        company: art.company,
        cardTitle: art.cardTitle,
        cardText: art.cardText,
        brandKit: art.brandKit,
        files: [art.imageUrl!],
        backgroundImages: art.backgroundImage ? [art.backgroundImage] : undefined,
      }));
      await saveBatchGeneration("art", template, batchItems);

      // Dispatch event to notify all ProjectBoard instances to reload
      window.dispatchEvent(new Event("bulkBriefsUpdated"));

      toast({
        title: "Artes salvas!",
        description: `${approvedArts.length} artes foram anexadas aos cards.`,
      });

      onComplete();
    } catch (error) {
      console.error("Error saving arts:", error);
      toast({
        title: "Erro ao salvar artes",
        variant: "destructive",
      });
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
      <div className="border-b bg-card px-4 py-3 flex items-center justify-between">
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
        <div className="flex items-center gap-4">
          <div className="flex gap-2">
            <Badge variant="outline">{pendingCount} pendentes</Badge>
            <Badge className="bg-green-500">{approvedCount} aprovadas</Badge>
          </div>
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
              onClick={handleApproveAll}
              disabled={approvedCount === 0}
              className="bg-gradient-primary"
            >
              <CheckCircle2 className="mr-2 h-4 w-4" />
              Salvar {approvedCount} Aprovadas
            </Button>
          )}
        </div>
      </div>

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
              {/* Art Preview - Double click to adjust photo position */}
              <div 
                className="aspect-[4/5] bg-muted relative cursor-pointer"
                onDoubleClick={() => {
                  if (art.imageUrl && art.status === "pending") {
                    openAdjustDialog(art);
                  }
                }}
                title={art.status === "pending" ? "Duplo clique para ajustar posição" : ""}
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
                
                {art.status === "pending" && art.imageUrl && (
                  <div className="absolute bottom-2 left-2 bg-background/80 text-foreground text-xs px-2 py-1 rounded opacity-0 hover:opacity-100 transition-opacity">
                    Duplo clique para ajustar
                  </div>
                )}
              </div>

              {/* Info */}
              <div className="p-3">
                <h3 className="font-semibold truncate">{art.company}</h3>
                <p className="text-sm text-muted-foreground truncate">{art.cardText}</p>

                {/* Actions */}
                {art.imageUrl && art.status === "pending" && (
                  <div className="flex gap-2 mt-3">
                    <Button
                      size="sm"
                      variant="outline"
                      title="Trocar foto"
                      onClick={() => {
                        setSelectedArt(art);
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
                      onClick={() => regenerateArt(index)}
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

            <TabsContent value="custom" className="space-y-6">
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
                  className="w-full h-24 border-dashed"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <div className="flex flex-col items-center gap-2">
                    <Upload className="h-6 w-6" />
                    <span>Clique para selecionar uma imagem</span>
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
              setPhotoOffsetX={setPhotoOffsetX}
              setPhotoOffsetY={setPhotoOffsetY}
              setPhotoScale={setPhotoScale}
              setPhotoFrame={setPhotoFrame}
              logoX={logoX}
              logoY={logoY}
              logoScaleX={logoScaleX}
              logoScaleY={logoScaleY}
              setLogoX={setLogoX}
              setLogoY={setLogoY}
              setLogoScaleX={setLogoScaleX}
              setLogoScaleY={setLogoScaleY}
              textX={textX}
              textY={textY}
              textFontSize={textFontSize}
              setTextX={setTextX}
              setTextY={setTextY}
              setTextFontSize={setTextFontSize}
              contactX={contactX}
              contactY={contactY}
              contactScaleX={contactScaleX}
              contactScaleY={contactScaleY}
              setContactX={setContactX}
              setContactY={setContactY}
              setContactScaleX={setContactScaleX}
              setContactScaleY={setContactScaleY}
              shapeOverrides={shapeOverrides}
              setShapeOverrides={setShapeOverrides}
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
            <Button variant="outline" onClick={() => setIsAdjustDialogOpen(false)}>
              Cancelar
            </Button>
            <Button 
              onClick={handleApplyElementOverrides} 
              className="bg-gradient-primary"
              disabled={isRegenerating}
            >
              {isRegenerating ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Aplicar Ajustes
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};
