import { useState, useEffect, useCallback, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, Download, Palette, ImageIcon, Search, Upload, Link } from "lucide-react";
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
  onExported,
}: ArtGeneratorModalProps) {
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [artDataUrl, setArtDataUrl] = useState<string | null>(null);
  const [template, setTemplate] = useState<ArtTemplate | null>(null);
  const [photoImage, setPhotoImage] = useState<string | null>(null);

  // Override states
  const [photoOffsetX, setPhotoOffsetX] = useState(0);
  const [photoOffsetY, setPhotoOffsetY] = useState(0);
  const [photoScale, setPhotoScale] = useState(100);
  const [photoFrame, setPhotoFrame] = useState<ShapeOverride | null>(null);
  const [logoX, setLogoX] = useState(0);
  const [logoY, setLogoY] = useState(0);
  const [logoScaleX, setLogoScaleX] = useState(100);
  const [logoScaleY, setLogoScaleY] = useState(100);
  const [textX, setTextX] = useState(0);
  const [textY, setTextY] = useState(0);
  const [textFontSize, setTextFontSize] = useState(100);
  const [contactX, setContactX] = useState(0);
  const [contactY, setContactY] = useState(0);
  const [contactScaleX, setContactScaleX] = useState(100);
  const [contactScaleY, setContactScaleY] = useState(100);
  const [shapeOverrides, setShapeOverrides] = useState<Record<string, ShapeOverride>>({});

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

  // Refs for sync
  const overridesRef = useRef({
    photoOffsetX, photoOffsetY, photoScale, photoFrame,
    logoX, logoY, logoScaleX, logoScaleY,
    textX, textY, textFontSize,
    contactX, contactY, contactScaleX, contactScaleY,
    shapeOverrides,
  });

  const syncRef = useCallback((patch: Partial<typeof overridesRef.current>) => {
    overridesRef.current = { ...overridesRef.current, ...patch };
  }, []);

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

  const photoImageRef = useRef(photoImage);
  useEffect(() => { photoImageRef.current = photoImage; });
  const templateRef = useRef(template);
  useEffect(() => { templateRef.current = template; });

  const regeneratePreview = useCallback(async () => {
    const tmpl = templateRef.current;
    if (!tmpl) return;
    const ov = overridesRef.current;
    const text = cardText || cardTitle || clientName;

    setIsRegenerating(true);
    try {
      const dataUrl = await renderArt(tmpl, brandKit, text, photoImageRef.current, {
        x: ov.photoOffsetX,
        y: ov.photoOffsetY,
      }, {
        logoX: ov.logoX, logoY: ov.logoY,
        logoScaleX: ov.logoScaleX, logoScaleY: ov.logoScaleY,
        textX: ov.textX, textY: ov.textY, textFontSize: ov.textFontSize,
        contactX: ov.contactX, contactY: ov.contactY,
        contactScaleX: ov.contactScaleX, contactScaleY: ov.contactScaleY,
        photoScale: ov.photoScale, photoFrame: ov.photoFrame || undefined,
        shapes: ov.shapeOverrides,
      });
      setArtDataUrl(dataUrl);
    } catch (err) {
      console.error("Regenerate error:", err);
    } finally {
      setIsRegenerating(false);
    }
  }, [cardText, cardTitle, clientName, brandKit]);

  const handleDragEnd = useCallback(() => {
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    debounceTimerRef.current = setTimeout(() => {
      regeneratePreview();
    }, 80);
  }, [regeneratePreview]);

  const generateArt = useCallback(async () => {
    setStatus("loading");
    setArtDataUrl(null);

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
      let matImage: string | null = null;
      try {
        const { data: uploads } = await supabase
          .from("card_uploads")
          .select("file_url, file_type")
          .eq("card_id", cardId)
          .eq("upload_type", "material");
        const imgs = (uploads || [])
          .filter(u => u.file_type.startsWith("image"))
          .map(u => u.file_url);
        if (imgs.length > 0) matImage = imgs[0];
      } catch { /* ignore */ }

      // If no material images, search Pexels
      if (!matImage) {
        try {
          const sq = (cardTitle || cardText || clientName).substring(0, 80);
          const pexelsResults = await searchPexelsImages(sq, 1);
          if (pexelsResults.length > 0) {
            matImage = pexelsResults[0].urls.regular;
          }
        } catch { /* ignore */ }
      }

      setPhotoImage(matImage);
      photoImageRef.current = matImage;

      // Reset overrides
      setPhotoOffsetX(0); setPhotoOffsetY(0); setPhotoScale(100);
      setPhotoFrame(null);
      setLogoX(0); setLogoY(0); setLogoScaleX(100); setLogoScaleY(100);
      setTextX(0); setTextY(0); setTextFontSize(100);
      setContactX(0); setContactY(0); setContactScaleX(100); setContactScaleY(100);
      setShapeOverrides({});
      overridesRef.current = {
        photoOffsetX: 0, photoOffsetY: 0, photoScale: 100, photoFrame: null,
        logoX: 0, logoY: 0, logoScaleX: 100, logoScaleY: 100,
        textX: 0, textY: 0, textFontSize: 100,
        contactX: 0, contactY: 0, contactScaleX: 100, contactScaleY: 100,
        shapeOverrides: {},
      };

      const text = cardText || cardTitle || clientName;
      const dataUrl = await renderArt(tmpl, brandKit, text, matImage, { x: 0, y: 0 }, {});
      setArtDataUrl(dataUrl);
      setStatus("ready");
    } catch (err) {
      console.error("Art generation error:", err);
      toast.error("Erro ao gerar arte");
      setStatus("error");
    }
  }, [cardId, cardTitle, cardText, brandKit, clientName, cardIndex]);

  useEffect(() => {
    if (isOpen) {
      generateArt();
    } else {
      setStatus("loading");
      setArtDataUrl(null);
      setTemplate(null);
      setPhotoImage(null);
    }
  }, [isOpen]);

  const handleDownload = () => {
    if (!artDataUrl) return;
    const link = document.createElement("a");
    link.download = `${clientName}-${cardTitle.slice(0, 20)}.png`;
    link.href = artDataUrl;
    link.click();
    onExported?.();
    onClose();
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
    setPhotoImage(imageUrl);
    photoImageRef.current = imageUrl;
    setIsImageDialogOpen(false);
    setCustomImageUrl("");
    // Regenerate
    if (template) {
      const text = cardText || cardTitle || clientName;
      const ov = overridesRef.current;
      const dataUrl = await renderArt(template, brandKit, text, imageUrl, {
        x: ov.photoOffsetX, y: ov.photoOffsetY,
      }, {
        logoX: ov.logoX, logoY: ov.logoY,
        logoScaleX: ov.logoScaleX, logoScaleY: ov.logoScaleY,
        textX: ov.textX, textY: ov.textY, textFontSize: ov.textFontSize,
        contactX: ov.contactX, contactY: ov.contactY,
        contactScaleX: ov.contactScaleX, contactScaleY: ov.contactScaleY,
        photoScale: ov.photoScale, photoFrame: ov.photoFrame || undefined,
        shapes: ov.shapeOverrides,
      });
      setArtDataUrl(dataUrl);
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

              {/* Action buttons */}
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => {
                    setSearchQuery((cardTitle || cardText).split(" ").slice(0, 3).join(" "));
                    setIsImageDialogOpen(true);
                  }}
                >
                  <ImageIcon className="mr-2 h-4 w-4" />
                  Trocar Foto
                </Button>
                <Button onClick={handleDownload} className="flex-1">
                  <Download className="mr-2 h-4 w-4" />
                  Baixar Arte
                </Button>
              </div>
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
