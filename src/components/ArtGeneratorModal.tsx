import { useState, useEffect, useCallback, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, Download, Palette, ImageIcon, Search, Upload, Link, Mail, ChevronLeft, ChevronRight } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { drawNewShape } from "@/lib/canvasShapes";
import { searchPexelsImages, searchImages, SearchImage } from "@/lib/imageSearch";
import { ArtAdjustOverlay } from "@/components/ArtAdjustOverlay";

// ── Types ──────────────────────────────────────────────────────────────────────

type ElementType = "rect" | "circle" | "text" | "image" | "logo" | "contact" | "mascot" | "triangle" | "line" | "star" | "diamond" | "hexagon" | "pentagon" | "wave" | "blob" | "arch" | "arrow" | "badge" | "ribbon" | "polkaDots" | "dotsGrid" | "confetti" | "splatter" | "zigzag" | "spiral" | "heart" | "cross" | "cloud" | "speechBubble" | "lightning" | "shield" | "crescent";

interface CanvasElement {
  id: string;
  type: ElementType;
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
    color1Role?: string;
    color2Role?: string;
    opacity1?: number;
    opacity2?: number;
    angle?: number;
    fadeMode?: boolean;
  };
  rotation?: number;
}

interface ArtTemplate {
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
  logoScaleX?: number;
  logoScaleY?: number;
  textX?: number;
  textY?: number;
  textFontSize?: number;
  contactX?: number;
  contactY?: number;
  contactScaleX?: number;
  contactScaleY?: number;
  photoScale?: number;
  photoFrame?: ShapeOverride;
  shapes?: Record<string, ShapeOverride>;
}

interface ArtGeneratorModalProps {
  isOpen: boolean;
  onClose: () => void;
  cardId: string;
  cardTitle: string;
  cardText: string;
  brandKit: any;
  clientName: string;
  cardIndex: number;
  clientId?: string;
  onExported?: () => void;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

const imageCache = new Map<string, HTMLImageElement>();

const loadImage = async (url: string): Promise<HTMLImageElement | null> => {
  if (!url) return null;
  const cacheKey = url.length > 200 ? url.substring(0, 100) + url.length : url;
  const cached = imageCache.get(cacheKey);
  if (cached) return cached;

  if (url.startsWith("data:")) {
    return new Promise((resolve) => {
      const el = new Image();
      el.onload = () => { imageCache.set(cacheKey, el); resolve(el); };
      el.onerror = () => resolve(null);
      el.src = url;
    });
  }

  try {
    const resp = await fetch(url);
    if (resp.ok) {
      const blob = await resp.blob();
      const objUrl = URL.createObjectURL(blob);
      return new Promise((resolve) => {
        const el = new Image();
        el.onload = () => { imageCache.set(cacheKey, el); resolve(el); };
        el.onerror = () => resolve(null);
        el.src = objUrl;
      });
    }
  } catch { /* fallback */ }

  return new Promise((resolve) => {
    const el = new Image();
    el.crossOrigin = "anonymous";
    el.onload = () => { imageCache.set(cacheKey, el); resolve(el); };
    el.onerror = () => resolve(null);
    el.src = url;
  });
};

const SYSTEM_FONTS = new Set([
  "Arial", "Verdana", "Helvetica", "Tahoma", "Trebuchet MS",
  "Times New Roman", "Georgia", "Garamond", "Courier New",
  "Impact", "Comic Sans MS", "Segoe UI", "Lucida Sans",
]);

const loadGoogleFont = async (fontFamily: string): Promise<void> => {
  if (!fontFamily || SYSTEM_FONTS.has(fontFamily)) return;
  const id = `google-font-${fontFamily.replace(/\s+/g, "-")}`;
  if (document.getElementById(id)) return;
  const link = document.createElement("link");
  link.id = id;
  link.rel = "stylesheet";
  link.href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(fontFamily)}:wght@400;700&display=swap`;
  document.head.appendChild(link);
  try { await document.fonts.load(`16px "${fontFamily}"`); } catch { /* ok */ }
};

// ── Render art with overrides ─────────────────────────────────────────────────

async function renderArt(
  template: ArtTemplate,
  brandKit: any,
  cardText: string,
  photoImage: string | null,
  photoOffset: { x: number; y: number },
  overrides: ElementOverrides,
): Promise<string> {
  const canvas = document.createElement("canvas");
  canvas.width = template.width;
  canvas.height = template.height;
  const ctx = canvas.getContext("2d")!;

  const bgColor = brandKit?.colors?.[0] || template.backgroundColor;
  const textColor = brandKit?.colors?.[1] || "#000000";
  const acc1 = brandKit?.colors?.[2] || "#cccccc";
  const acc2 = brandKit?.colors?.[3] || "#aaaaaa";

  const getColor = (el: CanvasElement, def: string) => {
    if (el.colorRole === "background") return bgColor;
    if (el.colorRole === "text") return textColor;
    if (el.colorRole === "accessory1") return acc1;
    if (el.colorRole === "accessory2") return acc2;
    return el.color || def;
  };

  const getBorderColor = (el: CanvasElement) => {
    if (el.borderColorRole === "background") return bgColor;
    if (el.borderColorRole === "text") return textColor;
    if (el.borderColorRole === "accessory1") return acc1;
    if (el.borderColorRole === "accessory2") return acc2;
    return el.borderColor || "#000000";
  };

  const drawBorder = (el: CanvasElement) => {
    if (el.borderWidth && el.borderWidth > 0) {
      ctx.globalAlpha = 1;
      ctx.strokeStyle = getBorderColor(el);
      ctx.lineWidth = el.borderWidth;
      ctx.stroke();
      ctx.globalAlpha = (el.opacity ?? 100) / 100;
    }
  };

  const hexToRgba = (hex: string, op: number) => {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r},${g},${b},${op / 100})`;
  };

  const getFill = (el: CanvasElement, x: number, y: number, w: number, h: number, def: string): string | CanvasGradient => {
    if (el.gradient) {
      let gradient: CanvasGradient;
      if (el.gradient.type === "linear") {
        const angle = (el.gradient.angle || 0) * Math.PI / 180;
        const cx2 = x + w / 2, cy2 = y + h / 2;
        const dx = Math.cos(angle) * w / 2, dy = Math.sin(angle) * h / 2;
        gradient = ctx.createLinearGradient(cx2 - dx, cy2 - dy, cx2 + dx, cy2 + dy);
      } else {
        gradient = ctx.createRadialGradient(x + w / 2, y + h / 2, 0, x + w / 2, y + h / 2, Math.max(w, h) / 2);
      }
      const c1 = el.gradient.color1Role === "background" ? bgColor : el.gradient.color1Role === "text" ? textColor : el.gradient.color1Role === "accessory1" ? acc1 : el.gradient.color1Role === "accessory2" ? acc2 : el.gradient.color1;
      const c2Raw = el.gradient.color2Role === "background" ? bgColor : el.gradient.color2Role === "text" ? textColor : el.gradient.color2Role === "accessory1" ? acc1 : el.gradient.color2Role === "accessory2" ? acc2 : el.gradient.color2;
      const c2 = el.gradient.fadeMode ? c1 : c2Raw;
      gradient.addColorStop(0, hexToRgba(c1, el.gradient.opacity1 ?? 100));
      gradient.addColorStop(1, hexToRgba(c2, el.gradient.opacity2 ?? (el.gradient.fadeMode ? 0 : 100)));
      return gradient;
    }
    return getColor(el, def);
  };

  const applyStyles = (el: CanvasElement) => {
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

  // Background
  ctx.fillStyle = bgColor;
  ctx.fillRect(0, 0, template.width, template.height);

  for (const el of template.elements) {
    try {
      ctx.save();
      applyStyles(el);

      if (el.rotation) {
        const cx2 = el.x + el.width / 2;
        const cy2 = el.y + el.height / 2;
        ctx.translate(cx2, cy2);
        ctx.rotate((el.rotation * Math.PI) / 180);
        ctx.translate(-cx2, -cy2);
      }

      // Use shape overrides if available
      let { x, y, width: w, height: h } = el;
      if (el.id && overrides.shapes?.[el.id]) {
        const ov = overrides.shapes[el.id];
        x = ov.x; y = ov.y; w = ov.width; h = ov.height;
      }

      if (el.type === "rect") {
        ctx.fillStyle = getFill(el, x, y, w, h, acc1) as string;
        if (el.borderRadius && el.borderRadius > 0) {
          ctx.beginPath();
          ctx.roundRect(x, y, w, h, el.borderRadius);
          ctx.fill();
          drawBorder(el);
        } else {
          ctx.fillRect(x, y, w, h);
          if (el.borderWidth) { ctx.beginPath(); ctx.rect(x, y, w, h); drawBorder(el); }
        }
      } else if (el.type === "circle") {
        ctx.fillStyle = getFill(el, x, y, w, h, acc2) as string;
        ctx.beginPath();
        ctx.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, 0, 0, Math.PI * 2);
        ctx.fill();
        drawBorder(el);
      } else if (el.type === "triangle") {
        ctx.fillStyle = getFill(el, x, y, w, h, acc1) as string;
        ctx.beginPath();
        ctx.moveTo(x + w / 2, y); ctx.lineTo(x + w, y + h); ctx.lineTo(x, y + h);
        ctx.closePath(); ctx.fill(); drawBorder(el);
      } else if (el.type === "line") {
        ctx.strokeStyle = getColor(el, acc1);
        ctx.lineWidth = h || 4;
        ctx.lineCap = "round";
        ctx.beginPath(); ctx.moveTo(x, y + h / 2); ctx.lineTo(x + w, y + h / 2); ctx.stroke();
      } else if (el.type === "text") {
        ctx.fillStyle = textColor;
        const baseFontSize = el.fontSize || 32;
        const fontSizeMultiplier = (overrides.textFontSize || 100) / 100;
        const fontSize = Math.round(baseFontSize * fontSizeMultiplier);
        const fontFamily = brandKit?.font || brandKit?.fontFamily || "Arial";
        ctx.font = `${fontSize}px ${fontFamily}`;
        const text = cardText || el.text || "";
        const textOffsetX = overrides.textX || 0;
        const textOffsetY = overrides.textY || 0;
        const baseX = el.x + textOffsetX;
        const baseY = el.y + textOffsetY;
        const align = el.textAlign || "left";
        ctx.textAlign = align;
        const drawX = align === "center" ? baseX + el.width / 2 : align === "right" ? baseX + el.width : baseX;
        const words = text.split(" ");
        let line = "";
        let ly = baseY + fontSize;
        const lineH = (el.lineHeight || 1.2) * fontSize;
        for (let i = 0; i < words.length; i++) {
          const testLine = line + words[i] + " ";
          if (ctx.measureText(testLine).width > el.width && i > 0) {
            ctx.fillText(line.trim(), drawX, ly);
            line = words[i] + " ";
            ly += lineH;
          } else {
            line = testLine;
          }
        }
        ctx.fillText(line.trim(), drawX, ly);
        ctx.textAlign = "left";
      } else if (el.type === "image" && el.placeholder) {
        // Photo with pan + zoom via overrides
        const frameOv = overrides.photoFrame;
        const frameW = frameOv?.width ?? el.width;
        const frameH = frameOv?.height ?? el.height;
        const frameX = frameOv?.x ?? el.x;
        const frameY = frameOv?.y ?? el.y;

        if (photoImage) {
          const img = await loadImage(photoImage);
          if (img) {
            const zoom = (overrides.photoScale || 100) / 100;
            const imgAspect = img.width / img.height;
            const frameAspect = frameW / frameH;
            let sw = img.width, sh = img.height;
            if (imgAspect > frameAspect) { sh = img.height; sw = sh * frameAspect; }
            else { sw = img.width; sh = sw / frameAspect; }
            sw = sw / zoom; sh = sh / zoom;
            if (sw > img.width) { sw = img.width; sh = sw / frameAspect; }
            if (sh > img.height) { sh = img.height; sw = sh * frameAspect; }
            let sx = (img.width - sw) / 2;
            let sy = (img.height - sh) / 2;
            const maxPanX = (img.width - sw) / 2;
            const maxPanY = (img.height - sh) / 2;
            sx += (photoOffset.x / 100) * maxPanX;
            sy += (photoOffset.y / 100) * maxPanY;
            sx = Math.max(0, Math.min(sx, img.width - sw));
            sy = Math.max(0, Math.min(sy, img.height - sh));

            const clipShape = el.clipShape || "rect";
            const radius = el.borderRadius || 0;
            if (clipShape === "circle") {
              ctx.beginPath();
              ctx.ellipse(frameX + frameW / 2, frameY + frameH / 2, frameW / 2, frameH / 2, 0, 0, Math.PI * 2);
              ctx.clip();
            } else if (radius > 0) {
              ctx.beginPath();
              ctx.roundRect(frameX, frameY, frameW, frameH, radius);
              ctx.clip();
            }
            ctx.drawImage(img, sx, sy, sw, sh, frameX, frameY, frameW, frameH);
          } else {
            ctx.fillStyle = "#e5e7eb";
            ctx.fillRect(frameX, frameY, frameW, frameH);
          }
        } else if (el.imageUrl) {
          const img = await loadImage(el.imageUrl);
          if (img) {
            const clipShape = el.clipShape || "rect";
            const radius = el.borderRadius || 0;
            if (clipShape === "circle") {
              ctx.beginPath();
              ctx.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, 0, 0, Math.PI * 2);
              ctx.clip();
            } else if (radius > 0) {
              ctx.beginPath();
              ctx.roundRect(x, y, w, h, radius);
              ctx.clip();
            }
            const imgA = img.width / img.height;
            const frameA = w / h;
            let sw2 = img.width, sh2 = img.height;
            if (imgA > frameA) { sh2 = img.height; sw2 = sh2 * frameA; }
            else { sw2 = img.width; sh2 = sw2 / frameA; }
            const sx2 = (img.width - sw2) / 2;
            const sy2 = (img.height - sh2) / 2;
            ctx.drawImage(img, sx2, sy2, sw2, sh2, x, y, w, h);
          } else {
            ctx.fillStyle = "#e5e7eb";
            ctx.fillRect(x, y, w, h);
          }
        } else {
          ctx.fillStyle = "#e5e7eb";
          ctx.fillRect(frameX, frameY, frameW, frameH);
        }
      } else if (el.type === "image" && !el.placeholder) {
        if (el.imageUrl) {
          const img = await loadImage(el.imageUrl);
          if (img) {
            const clipShape = el.clipShape || "rect";
            const radius = el.borderRadius || 0;
            if (clipShape === "circle") {
              ctx.beginPath();
              ctx.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, 0, 0, Math.PI * 2);
              ctx.clip();
            } else if (radius > 0) {
              ctx.beginPath();
              ctx.roundRect(x, y, w, h, radius);
              ctx.clip();
            }
            const imgA = img.width / img.height;
            const frameA = w / h;
            let sw2 = img.width, sh2 = img.height;
            if (imgA > frameA) { sh2 = img.height; sw2 = sh2 * frameA; }
            else { sw2 = img.width; sh2 = sw2 / frameA; }
            const sx2 = (img.width - sw2) / 2;
            const sy2 = (img.height - sh2) / 2;
            ctx.drawImage(img, sx2, sy2, sw2, sh2, x, y, w, h);
          }
        }
      } else if (el.type === "logo") {
        const logoUrl = brandKit?.pngs?.[0] || brandKit?.logo;
        if (logoUrl) {
          const img = await loadImage(logoUrl);
          if (img) {
            const lx = el.x + (overrides.logoX || 0);
            const ly = el.y + (overrides.logoY || 0);
            const lw = el.width * ((overrides.logoScaleX || 100) / 100);
            const lh = el.height * ((overrides.logoScaleY || 100) / 100);
            ctx.drawImage(img, lx, ly, lw, lh);
          }
        }
      } else if (el.type === "contact") {
        const contactUrl = brandKit?.pngs?.[1] || brandKit?.contactInfo;
        if (contactUrl) {
          const img = await loadImage(contactUrl);
          if (img) {
            const cx = el.x + (overrides.contactX || 0);
            const cy = el.y + (overrides.contactY || 0);
            const cw = el.width * ((overrides.contactScaleX || 100) / 100);
            const ch = el.height * ((overrides.contactScaleY || 100) / 100);
            ctx.drawImage(img, cx, cy, cw, ch);
          }
        }
      } else if (el.type === "mascot") {
        const mascotUrl = brandKit?.pngs?.[2] || brandKit?.mascot;
        if (mascotUrl) {
          const img = await loadImage(mascotUrl);
          if (img) ctx.drawImage(img, x, y, w, h);
        }
      } else {
        ctx.fillStyle = getFill(el, x, y, w, h, acc1) as string;
        drawNewShape(ctx, el.type as any, x, y, w, h, ctx.fillStyle as string);
      }

      ctx.restore();
    } catch (elErr) {
      console.warn("[ArtGen] Error rendering element:", el.type, elErr);
      ctx.restore();
    }
  }

  return canvas.toDataURL("image/png");
}

// ── Component ──────────────────────────────────────────────────────────────────

export function ArtGeneratorModal({
  isOpen,
  onClose,
  cardId,
  cardTitle,
  cardText,
  brandKit,
  clientName,
  cardIndex,
  clientId,
  onExported,
}: ArtGeneratorModalProps) {
  // Split text by ";" for carousel pages
  const pages = (cardText || cardTitle || clientName).split(";").map(p => p.trim()).filter(Boolean);
  const isCarousel = pages.length > 1;

  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [template, setTemplate] = useState<ArtTemplate | null>(null);
  const [currentPage, setCurrentPage] = useState(0);

  // Per-page state
  const [pageArts, setPageArts] = useState<(string | null)[]>([]);
  const [pagePhotos, setPagePhotos] = useState<(string | null)[]>([]);
  const [pageOverrides, setPageOverrides] = useState<ElementOverrides[]>([]);
  const [pagePhotoOffsets, setPagePhotoOffsets] = useState<{ x: number; y: number }[]>([]);

  // Current page shortcuts
  const artDataUrl = pageArts[currentPage] || null;
  const photoImage = pagePhotos[currentPage] || null;

  const currentOv = pageOverrides[currentPage] || {};
  const photoOffsetX = pagePhotoOffsets[currentPage]?.x || 0;
  const photoOffsetY = pagePhotoOffsets[currentPage]?.y || 0;
  const photoScale = currentOv.photoScale || 100;
  const photoFrame = currentOv.photoFrame || null;
  const logoX = currentOv.logoX || 0;
  const logoY = currentOv.logoY || 0;
  const logoScaleX = currentOv.logoScaleX || 100;
  const logoScaleY = currentOv.logoScaleY || 100;
  const textX = currentOv.textX || 0;
  const textY = currentOv.textY || 0;
  const textFontSize = currentOv.textFontSize || 100;
  const contactX = currentOv.contactX || 0;
  const contactY = currentOv.contactY || 0;
  const contactScaleX = currentOv.contactScaleX || 100;
  const contactScaleY = currentOv.contactScaleY || 100;
  const shapeOverrides = currentOv.shapes || {};

  // Updater helpers
  const updateOverride = useCallback((key: keyof ElementOverrides, value: any) => {
    setPageOverrides(prev => {
      const copy = [...prev];
      copy[currentPage] = { ...copy[currentPage], [key]: value };
      return copy;
    });
  }, [currentPage]);

  const updatePhotoOffset = useCallback((axis: "x" | "y", value: number) => {
    setPagePhotoOffsets(prev => {
      const copy = [...prev];
      copy[currentPage] = { ...copy[currentPage], [axis]: value };
      return copy;
    });
  }, [currentPage]);

  // Sync setters for ArtAdjustOverlay compatibility
  const syncSetPhotoOffsetX = useCallback((v: number) => updatePhotoOffset("x", v), [updatePhotoOffset]);
  const syncSetPhotoOffsetY = useCallback((v: number) => updatePhotoOffset("y", v), [updatePhotoOffset]);
  const syncSetPhotoScale = useCallback((v: number) => updateOverride("photoScale", v), [updateOverride]);
  const syncSetPhotoFrame = useCallback((v: ShapeOverride | null) => updateOverride("photoFrame", v), [updateOverride]);
  const syncSetLogoX = useCallback((v: number) => updateOverride("logoX", v), [updateOverride]);
  const syncSetLogoY = useCallback((v: number) => updateOverride("logoY", v), [updateOverride]);
  const syncSetLogoScaleX = useCallback((v: number) => updateOverride("logoScaleX", v), [updateOverride]);
  const syncSetLogoScaleY = useCallback((v: number) => updateOverride("logoScaleY", v), [updateOverride]);
  const syncSetTextX = useCallback((v: number) => updateOverride("textX", v), [updateOverride]);
  const syncSetTextY = useCallback((v: number) => updateOverride("textY", v), [updateOverride]);
  const syncSetTextFontSize = useCallback((v: number) => updateOverride("textFontSize", v), [updateOverride]);
  const syncSetContactX = useCallback((v: number) => updateOverride("contactX", v), [updateOverride]);
  const syncSetContactY = useCallback((v: number) => updateOverride("contactY", v), [updateOverride]);
  const syncSetContactScaleX = useCallback((v: number) => updateOverride("contactScaleX", v), [updateOverride]);
  const syncSetContactScaleY = useCallback((v: number) => updateOverride("contactScaleY", v), [updateOverride]);
  const syncSetShapeOverrides = useCallback((v: Record<string, ShapeOverride>) => updateOverride("shapes", v), [updateOverride]);

  // Photo search
  const [isImageDialogOpen, setIsImageDialogOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchImage[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [customImageUrl, setCustomImageUrl] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isRegenerating, setIsRegenerating] = useState(false);
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const [searchPage, setSearchPage] = useState(1);
  const [hasMoreResults, setHasMoreResults] = useState(false);
  const [isSendingEmail, setIsSendingEmail] = useState(false);

  const handleSendEmail = async () => {
    if (!clientId || !artDataUrl) return;
    setIsSendingEmail(true);
    try {
      const blob = await (await fetch(artDataUrl)).blob();
      const path = `email-arts/${clientId}/${Date.now()}.png`;
      const { error: uploadErr } = await supabase.storage.from("card-uploads").upload(path, blob, { contentType: "image/png" });
      if (uploadErr) throw uploadErr;
      const { data: urlData } = supabase.storage.from("card-uploads").getPublicUrl(path);

      const { data: clientData } = await supabase.from("client_data").select("email, email_2, email_3").eq("id", clientId).single();
      if (!clientData) throw new Error("Cliente não encontrado");
      const emails = [clientData.email, (clientData as any).email_2, (clientData as any).email_3].filter(Boolean);
      if (emails.length === 0) { toast.error("Nenhum e-mail cadastrado"); return; }

      const { data, error } = await supabase.functions.invoke("send-media-email", {
        body: { emails, subject: `Arte - ${clientName}`, mediaUrl: urlData.publicUrl, mediaType: "art", clientName, cardText: cardText || cardTitle, caption: undefined },
      });
      if (error) throw error;
      toast.success(data?.message || "E-mail(s) enviado(s)!");
    } catch (err: any) {
      console.error("Email error:", err);
      toast.error("Erro ao enviar e-mail: " + (err.message || ""));
    } finally {
      setIsSendingEmail(false);
    }
  };

  // Refs for current page regeneration
  const templateRef = useRef(template);
  useEffect(() => { templateRef.current = template; });

  const regenerateCurrentPage = useCallback(async () => {
    const tmpl = templateRef.current;
    if (!tmpl) return;
    setIsRegenerating(true);
    try {
      const ov = pageOverrides[currentPage] || {};
      const offset = pagePhotoOffsets[currentPage] || { x: 0, y: 0 };
      const photo = pagePhotos[currentPage] || null;
      const text = pages[currentPage] || "";
      const dataUrl = await renderArt(tmpl, brandKit, text, photo, offset, ov);
      setPageArts(prev => {
        const copy = [...prev];
        copy[currentPage] = dataUrl;
        return copy;
      });
    } catch (err) {
      console.error("Regenerate error:", err);
    } finally {
      setIsRegenerating(false);
    }
  }, [currentPage, pageOverrides, pagePhotoOffsets, pagePhotos, pages, brandKit]);

  const handleDragEnd = useCallback(() => {
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    debounceTimerRef.current = setTimeout(() => {
      regenerateCurrentPage();
    }, 80);
  }, [regenerateCurrentPage]);

  const generateArt = useCallback(async () => {
    setStatus("loading");
    setPageArts([]);
    setCurrentPage(0);

    try {
      const { data: templates, error } = await supabase
        .from("master_templates")
        .select("*")
        .eq("deleted", false)
        .order("created_at", { ascending: true });

      if (error || !templates || templates.length === 0) {
        toast.error("Nenhum template de arte encontrado");
        setStatus("error");
        return;
      }

      const selectedIdx = cardIndex % templates.length;
      const raw = templates[selectedIdx];
      const tmpl: ArtTemplate = {
        id: raw.id,
        name: raw.name,
        elements: (raw.elements || []) as unknown as CanvasElement[],
        width: raw.width,
        height: raw.height,
        backgroundColor: raw.background_color,
      };
      setTemplate(tmpl);

      const fontFamily = brandKit?.font || brandKit?.fontFamily || "Arial";
      await loadGoogleFont(fontFamily);

      // Load material images from card uploads
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
      } catch { /* ignore */ }

      // Generate all pages
      const arts: (string | null)[] = [];
      const photos: (string | null)[] = [];
      const overrides: ElementOverrides[] = [];
      const offsets: { x: number; y: number }[] = [];

      for (let i = 0; i < pages.length; i++) {
        let photo: string | null = matImages[i] || null;

        // If no material, search Pexels
        if (!photo) {
          try {
            const sq = pages[i].substring(0, 80);
            const pexelsResults = await searchPexelsImages(sq, 1);
            if (pexelsResults.length > 0) {
              photo = pexelsResults[0].urls.regular;
            }
          } catch { /* ignore */ }
        }

        photos.push(photo);
        overrides.push({});
        offsets.push({ x: 0, y: 0 });

        const dataUrl = await renderArt(tmpl, brandKit, pages[i], photo, { x: 0, y: 0 }, {});
        arts.push(dataUrl);
      }

      setPageArts(arts);
      setPagePhotos(photos);
      setPageOverrides(overrides);
      setPagePhotoOffsets(offsets);
      setStatus("ready");
    } catch (err) {
      console.error("Art generation error:", err);
      toast.error("Erro ao gerar arte");
      setStatus("error");
    }
  }, [cardId, cardTitle, cardText, brandKit, clientName, cardIndex, pages]);

  useEffect(() => {
    if (isOpen) {
      generateArt();
    } else {
      setStatus("loading");
      setPageArts([]);
      setPagePhotos([]);
      setPageOverrides([]);
      setPagePhotoOffsets([]);
      setTemplate(null);
      setCurrentPage(0);
    }
  }, [isOpen]);

  const handleDownload = async () => {
    if (!artDataUrl) return;
    
    if (isCarousel) {
      // Download all pages
      for (let i = 0; i < pageArts.length; i++) {
        const art = pageArts[i];
        if (!art) continue;
        const link = document.createElement("a");
        link.download = `${clientName}-${cardTitle.slice(0, 15)}-p${i + 1}.png`;
        link.href = art;
        link.click();
        await new Promise(r => setTimeout(r, 300));
      }
    } else {
      const link = document.createElement("a");
      link.download = `${clientName}-${cardTitle.slice(0, 20)}.png`;
      link.href = artDataUrl;
      link.click();
    }

    // Upload to storage with 24h expiry
    try {
      const response = await fetch(artDataUrl);
      const blob = await response.blob();
      const fileName = `generated-arts/${cardId}-${Date.now()}.png`;
      
      await supabase.storage.from("card-uploads").upload(fileName, blob, {
        contentType: "image/png",
        upsert: true,
      });
      
      const { data: urlData } = supabase.storage.from("card-uploads").getPublicUrl(fileName);
      
      if (urlData?.publicUrl) {
        const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
        await supabase
          .from("project_briefs")
          .update({ generated_art_url: urlData.publicUrl, generated_art_expires_at: expiresAt })
          .eq("id", cardId);
      }
    } catch (err) {
      console.error("Error saving generated art:", err);
    }

    onExported?.();
    toast.success("Arte baixada!");
  };

  // Photo search
  const handleSearchImages = async (page: number = 1) => {
    if (!searchQuery.trim()) return;
    setIsSearching(true);
    try {
      const images = await searchImages(searchQuery, 15, page);
      if (page === 1) {
        setSearchResults(images);
      } else {
        setSearchResults(prev => [...prev, ...images]);
      }
      setSearchPage(page);
      setHasMoreResults(images.length >= 15);
    } catch {
      toast.error("Erro ao buscar imagens");
    } finally {
      setIsSearching(false);
    }
  };

  const handleSelectPhoto = async (imageUrl: string) => {
    // Update photo for current page
    setPagePhotos(prev => {
      const copy = [...prev];
      copy[currentPage] = imageUrl;
      return copy;
    });
    setIsImageDialogOpen(false);
    setCustomImageUrl("");
    // Regenerate current page
    if (template) {
      const text = pages[currentPage] || "";
      const ov = pageOverrides[currentPage] || {};
      const offset = pagePhotoOffsets[currentPage] || { x: 0, y: 0 };
      const dataUrl = await renderArt(template, brandKit, text, imageUrl, offset, ov);
      setPageArts(prev => {
        const copy = [...prev];
        copy[currentPage] = dataUrl;
        return copy;
      });
    }
  };

  const handleCustomImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const base64 = event.target?.result as string;
      handleSelectPhoto(base64);
    };
    reader.readAsDataURL(file);
  };

  return (
    <>
      <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
        <DialogContent className="max-w-2xl max-h-[95vh] overflow-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Palette className="h-5 w-5" />
              Arte Gerada
            </DialogTitle>
          </DialogHeader>

          {status === "loading" && (
            <div className="flex flex-col items-center justify-center py-12 gap-3">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <p className="text-sm text-muted-foreground">Gerando arte...</p>
            </div>
          )}

          {status === "error" && (
            <div className="text-center py-8">
              <p className="text-destructive mb-4">Erro ao gerar arte</p>
              <Button variant="outline" onClick={generateArt}>Tentar novamente</Button>
            </div>
          )}

          {status === "ready" && artDataUrl && template && (
            <div className="space-y-4">
              {/* Adjust overlay */}
              <div className="border rounded-lg overflow-hidden bg-muted/30">
                <ArtAdjustOverlay
                  template={template}
                  previewUrl={artDataUrl}
                  isBusy={isRegenerating}
                  onDragEnd={handleDragEnd}
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
                />
              </div>

              {/* Page navigation for carousel */}
              {isCarousel && (
                <div className="flex items-center justify-center gap-3">
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => setCurrentPage(p => Math.max(0, p - 1))}
                    disabled={currentPage === 0}
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <span className="text-sm font-medium">
                    {currentPage + 1} / {pages.length}
                  </span>
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => setCurrentPage(p => Math.min(pages.length - 1, p + 1))}
                    disabled={currentPage === pages.length - 1}
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              )}

              {/* Action buttons */}
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => {
                    setSearchQuery(pages[currentPage]?.split(" ").slice(0, 3).join(" ") || "");
                    setIsImageDialogOpen(true);
                  }}
                >
                  <ImageIcon className="mr-2 h-4 w-4" />
                  Trocar Foto
                </Button>
                <Button onClick={handleDownload} className="flex-1">
                  <Download className="mr-2 h-4 w-4" />
                  {isCarousel ? `Baixar Todas (${pages.length})` : "Baixar Arte"}
                </Button>
              </div>
              {/* Send email button */}
              {clientId && (
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={handleSendEmail}
                  disabled={isSendingEmail}
                >
                  {isSendingEmail ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Mail className="mr-2 h-4 w-4" />}
                  {isSendingEmail ? "Enviando..." : "Enviar por E-mail"}
                </Button>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Image search dialog */}
      <Dialog open={isImageDialogOpen} onOpenChange={setIsImageDialogOpen}>
        <DialogContent className="max-w-lg max-h-[80vh] overflow-auto">
          <DialogHeader>
            <DialogTitle>Trocar Foto</DialogTitle>
          </DialogHeader>

          <Tabs defaultValue="search">
            <TabsList className="w-full">
              <TabsTrigger value="search" className="flex-1">
                <Search className="mr-1 h-3 w-3" />
                Buscar
              </TabsTrigger>
              <TabsTrigger value="upload" className="flex-1">
                <Upload className="mr-1 h-3 w-3" />
                Upload
              </TabsTrigger>
              <TabsTrigger value="url" className="flex-1">
                <Link className="mr-1 h-3 w-3" />
                URL
              </TabsTrigger>
            </TabsList>

            <TabsContent value="search" className="space-y-3">
              <div className="flex gap-2">
                <Input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Buscar imagens..."
                  onKeyDown={(e) => { if (e.key === "Enter") { setSearchPage(1); handleSearchImages(1); } }}
                />
                <Button onClick={() => handleSearchImages(1)} disabled={isSearching} size="sm">
                  {isSearching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                </Button>
              </div>
               <div className="grid grid-cols-3 gap-2 max-h-[50vh] overflow-auto">
                 {searchResults.map((img, i) => (
                   <img
                     key={i}
                     src={img.urls.small}
                     alt=""
                     className="w-full aspect-square object-cover rounded cursor-pointer hover:ring-2 ring-primary transition-all"
                     onClick={() => handleSelectPhoto(img.urls.regular)}
                   />
                 ))}
               </div>
               {hasMoreResults && searchResults.length > 0 && (
                 <Button
                   variant="outline"
                   className="w-full"
                   onClick={() => handleSearchImages(searchPage + 1)}
                   disabled={isSearching}
                 >
                   {isSearching ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                   Carregar Mais
                 </Button>
               )}
            </TabsContent>

            <TabsContent value="upload" className="space-y-3">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleCustomImageUpload}
              />
              <Button
                variant="outline"
                className="w-full h-32 border-dashed"
                onClick={() => fileInputRef.current?.click()}
              >
                <Upload className="mr-2 h-6 w-6" />
                Selecionar imagem
              </Button>
            </TabsContent>

            <TabsContent value="url" className="space-y-3">
              <div className="flex gap-2">
                <Input
                  value={customImageUrl}
                  onChange={(e) => setCustomImageUrl(e.target.value)}
                  placeholder="https://..."
                />
                <Button
                  onClick={() => {
                    if (customImageUrl.trim()) handleSelectPhoto(customImageUrl.trim());
                  }}
                  size="sm"
                >
                  Aplicar
                </Button>
              </div>
            </TabsContent>
          </Tabs>
        </DialogContent>
      </Dialog>
    </>
  );
}
