import { useState, useEffect, useCallback, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, Download, Palette, ImageIcon, Search, Upload, Link, Mail, ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { drawNewShape, getPolygonVertices, buildRoundedPolygonPath } from "@/lib/canvasShapes";
import { searchPexelsImages, searchImages, SearchImage } from "@/lib/imageSearch";
import { ArtAdjustOverlay } from "@/components/ArtAdjustOverlay";

// ── Types ──────────────────────────────────────────────────────────────────────

type ElementType = "rect" | "circle" | "text" | "image" | "logo" | "contact" | "mascot" | "triangle" | "line" | "star" | "diamond" | "hexagon" | "pentagon" | "wave" | "blob" | "arch" | "arrow" | "badge" | "ribbon" | "polkaDots" | "dotsGrid" | "confetti" | "splatter" | "zigzag" | "spiral" | "heart" | "cross" | "cloud" | "speechBubble" | "lightning" | "shield" | "crescent" | "chevron";

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
  colorRole?: "background" | "element1" | "text" | "accessory1" | "accessory2";
  opacity?: number;
  borderRadius?: number;
  borderWidth?: number;
  borderColor?: string;
  borderColorRole?: "background" | "element1" | "text" | "accessory1" | "accessory2";
  clipShape?: "rect" | "circle" | "triangle" | "diamond" | "hexagon" | "pentagon" | "star";
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
  mascotX?: number;
  mascotY?: number;
  mascotScaleX?: number;
  mascotScaleY?: number;
  photoScale?: number;
  photoFrame?: ShapeOverride;
  shapes?: Record<string, ShapeOverride>;
  bgOffsetX?: number;
  bgOffsetY?: number;
  bgScale?: number;
  hiddenElements?: string[];
}

interface CustomOverlay {
  url: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

interface RenderOptions {
  isCarousel?: boolean;
  isLastCarouselPage?: boolean;
  customOverlays?: CustomOverlay[];
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
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    const resp = await fetch(url, { signal: controller.signal });
    clearTimeout(timeout);
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
  link.href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(fontFamily)}:wght@400;700;800;900&display=swap`;
  document.head.appendChild(link);
  try { await document.fonts.load(`16px "${fontFamily}"`); } catch { /* ok */ }
};

const normalizeBrandKit = (raw: any) => {
  const kit = raw && typeof raw === "object" ? { ...raw } : {};
  const source = Array.isArray(kit.colors)
    ? kit.colors.filter((c: unknown) => typeof c === "string" && c.trim().length > 0)
    : [];

  const bg = source[0] || "#ffffff";
  const text = source[1] || "#000000";
  const accessory1 = source[2] || bg;
  const accessory2 = source[3] || text;

  return {
    ...kit,
    colors: [bg, text, accessory1, accessory2],
  };
};

function applyClipShape(
  ctx: CanvasRenderingContext2D,
  shape: CanvasElement["clipShape"] | undefined,
  x: number,
  y: number,
  w: number,
  h: number,
  radius = 0,
) {
  if (shape === "circle") {
    ctx.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, 0, 0, Math.PI * 2);
    return;
  }

  if (shape === "triangle") {
    ctx.moveTo(x + w / 2, y);
    ctx.lineTo(x + w, y + h);
    ctx.lineTo(x, y + h);
    ctx.closePath();
    return;
  }

  if (shape === "diamond") {
    ctx.moveTo(x + w / 2, y);
    ctx.lineTo(x + w, y + h / 2);
    ctx.lineTo(x + w / 2, y + h);
    ctx.lineTo(x, y + h / 2);
    ctx.closePath();
    return;
  }

  if (shape === "hexagon") {
    const cx = x + w / 2;
    const cy = y + h / 2;
    const r = Math.min(w, h) / 2;
    for (let i = 0; i < 6; i++) {
      const a = (Math.PI / 3) * i - Math.PI / 2;
      if (i === 0) ctx.moveTo(cx + r * Math.cos(a), cy + r * Math.sin(a));
      else ctx.lineTo(cx + r * Math.cos(a), cy + r * Math.sin(a));
    }
    ctx.closePath();
    return;
  }

  if (shape === "pentagon") {
    const cx = x + w / 2;
    const cy = y + h / 2;
    const r = Math.min(w, h) / 2;
    for (let i = 0; i < 5; i++) {
      const a = (Math.PI * 2 / 5) * i - Math.PI / 2;
      if (i === 0) ctx.moveTo(cx + r * Math.cos(a), cy + r * Math.sin(a));
      else ctx.lineTo(cx + r * Math.cos(a), cy + r * Math.sin(a));
    }
    ctx.closePath();
    return;
  }

  if (shape === "star") {
    const cx = x + w / 2;
    const cy = y + h / 2;
    const outerR = Math.min(w, h) / 2;
    const innerR = outerR * 0.4;
    for (let i = 0; i < 10; i++) {
      const a = (Math.PI / 5) * i - Math.PI / 2;
      const r = i % 2 === 0 ? outerR : innerR;
      if (i === 0) ctx.moveTo(cx + r * Math.cos(a), cy + r * Math.sin(a));
      else ctx.lineTo(cx + r * Math.cos(a), cy + r * Math.sin(a));
    }
    ctx.closePath();
    return;
  }

  if (radius > 0) {
    ctx.roundRect(x, y, w, h, radius);
    return;
  }

  ctx.rect(x, y, w, h);
}

// ── Render art with overrides ─────────────────────────────────────────────────

async function renderArt(
  template: ArtTemplate,
  brandKit: any,
  cardText: string,
  photoImage: string | null,
  photoOffset: { x: number; y: number },
  overrides: ElementOverrides,
  options: RenderOptions = {},
): Promise<string> {
  const canvas = document.createElement("canvas");
  canvas.width = template.width;
  canvas.height = template.height;
  const ctx = canvas.getContext("2d")!;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";

  const bgColor = brandKit?.colors?.[0] || template.backgroundColor;
  const textColor = brandKit?.colors?.[1] || "#000000";
  const acc1 = brandKit?.colors?.[2] || "#cccccc";
  const acc2 = brandKit?.colors?.[3] || "#aaaaaa";

  const getColor = (el: CanvasElement, def: string) => {
    if (el.colorRole === "background" || el.colorRole === "element1") return bgColor;
    if (el.colorRole === "text") return textColor;
    if (el.colorRole === "accessory1") return acc1;
    if (el.colorRole === "accessory2") return acc2;
    return el.color || def;
  };

  const getBorderColor = (el: CanvasElement) => {
    if (el.borderColorRole === "background" || el.borderColorRole === "element1") return bgColor;
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

  // Background — check for brand kit background PNG
  const templateBgColor = template.backgroundColor;
  const brandBgPng = brandKit?.backgroundPng || brandKit?.background_png || "";
  // Check if any element is explicitly marked as background
  const hasExplicitBgRole = template.elements.some(el => el.colorRole === "background");
  const hasLargeBgShape = (() => {
    if (!brandBgPng) return false;
    for (const el of template.elements) {
      // If explicit roles exist, ONLY consider those; otherwise fallback to color match
      if (hasExplicitBgRole) {
        if (el.colorRole !== "background") continue;
      } else {
        if (el.color !== templateBgColor) continue;
      }
      const ov = overrides.shapes?.[el.id];
      const ex = ov?.x ?? el.x ?? 0;
      const ey = ov?.y ?? el.y ?? 0;
      const ew = ov?.width ?? el.width ?? 0;
      const eh = ov?.height ?? el.height ?? 0;
      if (
        ew * eh >= template.width * template.height * 0.65 &&
        ex <= template.width * 0.2 &&
        ey <= template.height * 0.2 &&
        ex + ew >= template.width * 0.8 &&
        ey + eh >= template.height * 0.8
      ) return true;
    }
    return false;
  })();

  if (brandBgPng && hasLargeBgShape) {
    const bgPngImg = await loadImage(brandBgPng);
    if (bgPngImg) {
      ctx.drawImage(bgPngImg, 0, 0, template.width, template.height);
    } else {
      ctx.fillStyle = templateBgColor;
      ctx.fillRect(0, 0, template.width, template.height);
    }
  } else {
    ctx.fillStyle = templateBgColor;
    ctx.fillRect(0, 0, template.width, template.height);
  }

  const hiddenSet = new Set(overrides.hiddenElements || []);
  const isCarousel = options.isCarousel === true;
  const isLastCarouselPage = options.isLastCarouselPage === true;

  const imageElements = template.elements.filter((element): element is CanvasElement => element.type === "image");
  const placeholderElement = imageElements.find((element) => element.placeholder);
  const largestImageElement = imageElements.reduce<CanvasElement | null>((largest, current) => {
    if (!largest) return current;
    return current.width * current.height > largest.width * largest.height ? current : largest;
  }, null);
  const photoTargetElement = placeholderElement || largestImageElement;

  // Helper to skip large background shapes when PNG background is active
  const shouldSkipBackgroundShape = (el: CanvasElement) => {
    if (!brandBgPng || !hasLargeBgShape) return false;
    // Only skip elements that match the background criteria used above
    if (hasExplicitBgRole) {
      if (el.colorRole !== "background") return false;
    } else {
      if (el.color !== templateBgColor) return false;
    }
    const ov = overrides.shapes?.[el.id];
    const ex = ov?.x ?? el.x ?? 0;
    const ey = ov?.y ?? el.y ?? 0;
    const ew = ov?.width ?? el.width ?? 0;
    const eh = ov?.height ?? el.height ?? 0;
    return (
      ew * eh >= template.width * template.height * 0.65 &&
      ex <= template.width * 0.2 &&
      ey <= template.height * 0.2 &&
      ex + ew >= template.width * 0.8 &&
      ey + eh >= template.height * 0.8
    );
  };

  for (const el of template.elements) {
    try {
      // Skip hidden elements
      const elKey = el.type === "logo" ? "logo" : el.type === "contact" ? "contact" : el.type === "mascot" ? "mascot" : el.type === "text" ? "text" : el.id || "";
      if (hiddenSet.has(elKey)) { continue; }
      // Skip large background shapes replaced by PNG
      if (shouldSkipBackgroundShape(el)) { continue; }
      // Chevron only appears in carousel and is hidden on the last page.
      if (el.type === "chevron" && (!isCarousel || isLastCarouselPage)) { continue; }

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
        ctx.font = `normal ${fontSize}px ${fontFamily}`;
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
      } else if (el.type === "image") {
        const isPhotoTarget = !!photoTargetElement && (
          el === photoTargetElement ||
          (!!photoTargetElement.id && !!el.id && photoTargetElement.id === el.id)
        );

        const frameOv = isPhotoTarget ? overrides.photoFrame : undefined;
        const frameW = Number.isFinite(frameOv?.width)
          ? Math.max(1, frameOv!.width)
          : Math.max(1, w);
        const frameH = Number.isFinite(frameOv?.height)
          ? Math.max(1, frameOv!.height)
          : Math.max(1, h);
        const frameX = Number.isFinite(frameOv?.x) ? frameOv!.x : x;
        const frameY = Number.isFinite(frameOv?.y) ? frameOv!.y : y;

        let sourceUrl: string | null = el.imageUrl || null;
        if (isPhotoTarget && photoImage) {
          sourceUrl = photoImage;
        }

        let img = sourceUrl ? await loadImage(sourceUrl) : null;
        if (!img && isPhotoTarget && photoImage && el.imageUrl) {
          img = await loadImage(el.imageUrl);
        }

        if (!img) {
          ctx.fillStyle = "#e5e7eb";
          ctx.fillRect(frameX, frameY, frameW, frameH);
        } else {
          const clipShape = el.clipShape || "rect";
          const radius = el.borderRadius || 0;
          const needsClip = clipShape !== "rect" || radius > 0;

          let sx = 0;
          let sy = 0;
          let sw = img.width;
          let sh = img.height;

          const frameAspect = frameW / frameH;
          const imgAspect = img.width / img.height;

          if (isPhotoTarget && photoImage) {
            const zoomRaw = (overrides.photoScale || 100) / 100;
            const zoom = Number.isFinite(zoomRaw) && zoomRaw > 0 ? zoomRaw : 1;

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

            sx = (img.width - sw) / 2;
            sy = (img.height - sh) / 2;

            const panOffsetX = Number.isFinite(photoOffset.x) ? photoOffset.x : 0;
            const panOffsetY = Number.isFinite(photoOffset.y) ? photoOffset.y : 0;
            const maxPanX = (img.width - sw) / 2;
            const maxPanY = (img.height - sh) / 2;

            sx += (panOffsetX / 100) * maxPanX;
            sy += (panOffsetY / 100) * maxPanY;
          } else {
            if (imgAspect > frameAspect) {
              sh = img.height;
              sw = sh * frameAspect;
            } else {
              sw = img.width;
              sh = sw / frameAspect;
            }

            sx = (img.width - sw) / 2;
            sy = (img.height - sh) / 2;
          }

          sx = Math.max(0, Math.min(sx, img.width - sw));
          sy = Math.max(0, Math.min(sy, img.height - sh));

          if (needsClip) {
            ctx.save();
            ctx.beginPath();
            applyClipShape(ctx, clipShape, frameX, frameY, frameW, frameH, radius);
            ctx.clip();
          }

          ctx.drawImage(img, sx, sy, sw, sh, frameX, frameY, frameW, frameH);

          if (needsClip) {
            ctx.restore();
          }
        }
      } else if (el.type === "logo") {
        const logoUrl = brandKit?.pngs?.[0] || brandKit?.logo;
        if (logoUrl) {
          const img = await loadImage(logoUrl);
          if (img) {
            const lx = el.x + (overrides.logoX || 0);
            const ly = el.y + (overrides.logoY || 0);
            const boxW = el.width * ((overrides.logoScaleX || 100) / 100);
            const boxH = el.height * ((overrides.logoScaleY || 100) / 100);
            // Contain: fit entire logo within box, preserving aspect ratio, centered
            ctx.imageSmoothingEnabled = true;
            ctx.imageSmoothingQuality = "high";
            const natW = img.naturalWidth || img.width;
            const natH = img.naturalHeight || img.height;
            const bounds = getOpaqueBounds(img);
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
            const drawX = lx + (boxW - drawW) / 2;
            const drawY = ly + (boxH - drawH) / 2;
            ctx.drawImage(img, baseSx, baseSy, baseSw, baseSh, drawX, drawY, drawW, drawH);
          }
        }
      } else if (el.type === "contact") {
        const contactUrl = brandKit?.pngs?.[1] || brandKit?.contactInfo;
        if (contactUrl) {
          const img = await loadImage(contactUrl);
          if (img) {
            const cx = el.x + (overrides.contactX || 0);
            const cy = el.y + (overrides.contactY || 0);
            const boxW = el.width * ((overrides.contactScaleX || 100) / 100);
            const boxH = el.height * ((overrides.contactScaleY || 100) / 100);
            ctx.imageSmoothingEnabled = true;
            ctx.imageSmoothingQuality = "high";
            const natW = img.naturalWidth || img.width;
            const natH = img.naturalHeight || img.height;
            const bounds = getOpaqueBounds(img);
            const trimInfluence = 1;
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
            const contactFitScale = 0.88;
            drawW *= contactFitScale;
            drawH *= contactFitScale;
            const drawX = cx + (boxW - drawW) / 2;
            const drawY = cy + (boxH - drawH) / 2;
            ctx.drawImage(img, baseSx, baseSy, baseSw, baseSh, drawX, drawY, drawW, drawH);
          }
        }
      } else if (el.type === "mascot") {
        const mascotUrl = brandKit?.pngs?.[2] || brandKit?.mascot;
        if (mascotUrl) {
          const img = await loadImage(mascotUrl);
          if (img) {
            const mx = el.x + (overrides.mascotX || 0);
            const my = el.y + (overrides.mascotY || 0);
            const mw = el.width * ((overrides.mascotScaleX || 100) / 100);
            const mh = el.height * ((overrides.mascotScaleY || 100) / 100);
            ctx.imageSmoothingEnabled = true;
            ctx.imageSmoothingQuality = "high";
            ctx.drawImage(img, mx, my, mw, mh);
          }
        }
      } else if (el.type === "diamond" || el.type === "hexagon" || el.type === "pentagon" || el.type === "star") {
        const colorMap: Record<string, string> = { diamond: acc2, hexagon: acc1, pentagon: acc2, star: acc1 };
        ctx.fillStyle = getFill(el, x, y, w, h, colorMap[el.type] || acc1) as string;
        const verts = getPolygonVertices(el.type, x, y, w, h);
        const bRadius = el.borderRadius || 0;
        if (bRadius > 0) {
          buildRoundedPolygonPath(ctx, verts, bRadius);
        } else {
          ctx.beginPath();
          verts.forEach((v, i) => i === 0 ? ctx.moveTo(v.x, v.y) : ctx.lineTo(v.x, v.y));
          ctx.closePath();
        }
        ctx.fill(); drawBorder(el);
      } else if (el.type === "polkaDots") {
        const color = getColor(el, acc1);
        const dotRadius = Math.min(w, h) * 0.08;
        const spacing = dotRadius * 3;
        const cols = Math.max(1, Math.floor(w / spacing));
        const rows = Math.max(1, Math.floor(h / spacing));
        const offX = (w - (cols - 1) * spacing) / 2;
        const offY = (h - (rows - 1) * spacing) / 2;
        ctx.fillStyle = color;
        for (let row = 0; row < rows; row++) {
          for (let col = 0; col < cols; col++) {
            ctx.beginPath();
            ctx.arc(x + offX + col * spacing, y + offY + row * spacing, dotRadius, 0, Math.PI * 2);
            ctx.fill();
          }
        }
      } else if (el.type === "dotsGrid") {
        const color = getColor(el, acc2);
        ctx.fillStyle = color;
        const seed = x + y + w + h;
        const random = (i: number) => { const n = Math.sin(seed + i * 9.999) * 10000; return n - Math.floor(n); };
        for (let i = 0; i < 25; i++) {
          ctx.beginPath();
          ctx.arc(x + random(i * 2) * w, y + random(i * 2 + 1) * h, 3 + random(i * 3) * 12, 0, Math.PI * 2);
          ctx.fill();
        }
      } else if (el.type === "confetti") {
        const base = getColor(el, acc1);
        const palette = [base, acc1, acc2, textColor];
        const seed = x + y + w + h;
        const random = (i: number) => { const n = Math.sin(seed + i * 9.999) * 10000; return n - Math.floor(n); };
        for (let i = 0; i < 30; i++) {
          const cx2 = x + random(i * 2) * w, cy2 = y + random(i * 2 + 1) * h;
          const size = 5 + random(i * 3) * 15;
          const rot = random(i * 4) * Math.PI * 2;
          ctx.fillStyle = palette[Math.floor(random(i * 5) * palette.length)];
          ctx.save(); ctx.translate(cx2, cy2); ctx.rotate(rot);
          const st = Math.floor(random(i * 6) * 3);
          if (st === 0) ctx.fillRect(-size / 2, -size / 4, size, size / 2);
          else if (st === 1) { ctx.beginPath(); ctx.arc(0, 0, size / 3, 0, Math.PI * 2); ctx.fill(); }
          else { ctx.beginPath(); ctx.moveTo(0, -size / 2); ctx.lineTo(size / 2, size / 2); ctx.lineTo(-size / 2, size / 2); ctx.closePath(); ctx.fill(); }
          ctx.restore();
        }
      } else if (el.type === "splatter") {
        const color = getColor(el, acc2);
        ctx.fillStyle = color;
        const seed = x + y + w + h;
        const random = (i: number) => { const n = Math.sin(seed + i * 9.999) * 10000; return n - Math.floor(n); };
        const cx2 = x + w / 2, cy2 = y + h / 2, mainR = Math.min(w, h) * 0.28;
        ctx.beginPath(); ctx.arc(cx2, cy2, mainR, 0, Math.PI * 2); ctx.fill();
        for (let i = 0; i < 20; i++) {
          const angle = random(i) * Math.PI * 2;
          const dist = mainR * (0.8 + random(i + 10) * 1.5);
          const r2 = 2 + random(i + 20) * 10;
          ctx.beginPath(); ctx.arc(cx2 + Math.cos(angle) * dist, cy2 + Math.sin(angle) * dist, r2, 0, Math.PI * 2); ctx.fill();
        }
      } else if (el.type === "zigzag") {
        ctx.strokeStyle = getColor(el, acc1);
        ctx.lineWidth = Math.max(2, h * 0.08);
        ctx.lineCap = "round";
        const zigzags = 8, stepX = w / zigzags;
        ctx.beginPath(); ctx.moveTo(x, y + h / 2);
        for (let i = 1; i <= zigzags; i++) ctx.lineTo(x + i * stepX, y + (i % 2 === 0 ? h * 0.2 : h * 0.8));
        ctx.stroke();
      } else if (el.type === "spiral") {
        ctx.strokeStyle = getColor(el, acc2);
        ctx.lineWidth = Math.max(2, Math.min(w, h) * 0.03);
        ctx.lineCap = "round";
        const cx2 = x + w / 2, cy2 = y + h / 2, maxR = Math.min(w, h) * 0.45;
        ctx.beginPath();
        for (let t = 0; t <= 1; t += 0.02) {
          const angle = t * 3 * Math.PI * 2, r2 = t * maxR;
          const px = cx2 + Math.cos(angle) * r2, py = cy2 + Math.sin(angle) * r2;
          t === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
        }
        ctx.stroke();
      } else if (el.type === "wave" || el.type === "blob" || el.type === "arch" || el.type === "arrow" || el.type === "badge" || el.type === "ribbon") {
        // These shapes have dedicated rendering in BatchArtGenerator but use simple rect fallback in quick create
        ctx.fillStyle = getFill(el, x, y, w, h, acc1) as string;
        ctx.fillRect(x, y, w, h);
        drawBorder(el);
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

  // Draw custom overlays on top
  if (options.customOverlays && options.customOverlays.length > 0) {
    for (const overlay of options.customOverlays) {
      try {
        const overlayImg = await loadImage(overlay.url);
        if (overlayImg) {
          ctx.drawImage(overlayImg, overlay.x, overlay.y, overlay.width, overlay.height);
        }
      } catch (e) {
        console.warn("[customOverlay] Failed to draw overlay:", e);
      }
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
  const rawText = (cardText || cardTitle || clientName || "").trim();
  const textParts = rawText
    .split(";")
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
  const pages = textParts.length > 1 ? textParts : [rawText || cardTitle || clientName];
  const isCarousel = pages.length > 1;

  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [template, setTemplate] = useState<ArtTemplate | null>(null);
  const [currentPage, setCurrentPage] = useState(0);
  const [photoInteractionMode, setPhotoInteractionMode] = useState<"content" | "frame">("content");

  // Per-page state
  const [pageArts, setPageArts] = useState<(string | null)[]>([]);
  const [pagePhotos, setPagePhotos] = useState<(string | null)[]>([]);
  const [pageOverrides, setPageOverrides] = useState<ElementOverrides[]>([]);
  const [pagePhotoOffsets, setPagePhotoOffsets] = useState<{ x: number; y: number }[]>([]);
  const [pageCustomOverlays, setPageCustomOverlays] = useState<CustomOverlay[][]>([]);
  const overlayInputRef = useRef<HTMLInputElement>(null);

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
  const hiddenElements = currentOv.hiddenElements || [];

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
  const syncSetHiddenElements = useCallback((v: string[]) => updateOverride("hiddenElements", v), [updateOverride]);

  const currentOverlays = pageCustomOverlays[currentPage] || [];
  const syncSetCustomOverlays = useCallback((v: CustomOverlay[]) => {
    setPageCustomOverlays(prev => {
      const copy = [...prev];
      copy[currentPage] = v;
      return copy;
    });
  }, [currentPage]);

  const overlayVersionRef = useRef(0);

  const handleOverlayUpload = useCallback(async (file: File) => {
    const reader = new FileReader();
    reader.onload = (ev) => {
      const base64 = ev.target?.result as string;
      if (!base64) return;
      
      // Use base64 immediately for instant display
      const newOverlay: CustomOverlay = {
        url: base64,
        x: 100,
        y: 100,
        width: 200,
        height: 200,
      };
      setPageCustomOverlays(prev => {
        const copy = [...prev];
        copy[currentPage] = [...(copy[currentPage] || []), newOverlay];
        return copy;
      });
      overlayVersionRef.current += 1;

      // Upload to storage in background for persistence (replace base64 with URL)
      const ext = file.name.split(".").pop() || "png";
      const path = `overlay-extras/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
      supabase.storage.from("card-uploads").upload(path, file).then(({ error }) => {
        if (!error) {
          const url = supabase.storage.from("card-uploads").getPublicUrl(path).data.publicUrl;
          setPageCustomOverlays(prev => {
            const copy = [...prev];
            const arr = copy[currentPage] || [];
            // Find the overlay with this base64 and replace URL
            const updated = arr.map(o => o.url === base64 ? { ...o, url } : o);
            copy[currentPage] = updated;
            return copy;
          });
        }
      });
    };
    reader.readAsDataURL(file);
  }, [currentPage]);


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
  const [emailSubject, setEmailSubject] = useState("");

  const handleSendEmail = async () => {
    if (!clientId) return;
    setIsSendingEmail(true);
    try {
      // Upload all pages to storage
      const uploadedUrls: string[] = [];
      const artsToUpload = isCarousel ? pageArts.filter(Boolean) as string[] : [artDataUrl].filter(Boolean) as string[];
      
      for (let i = 0; i < artsToUpload.length; i++) {
        const blob = await (await fetch(artsToUpload[i])).blob();
        const path = `email-arts/${clientId}/${Date.now()}-p${i + 1}.png`;
        const { error: uploadErr } = await supabase.storage.from("card-uploads").upload(path, blob, { contentType: "image/png" });
        if (uploadErr) throw uploadErr;
        const { data: urlData } = supabase.storage.from("card-uploads").getPublicUrl(path);
        uploadedUrls.push(urlData.publicUrl);
      }

      const { data: clientData } = await supabase.from("client_data").select("email, email_2, email_3").eq("id", clientId).single();
      if (!clientData) throw new Error("Cliente não encontrado");
      const emails = [clientData.email, (clientData as any).email_2, (clientData as any).email_3].filter(Boolean);
      if (emails.length === 0) { toast.error("Nenhum e-mail cadastrado"); return; }

      const { data, error } = await supabase.functions.invoke("send-media-email", {
        body: { emails, subject: emailSubject.trim() || `Arte - ${clientName}`, mediaUrls: uploadedUrls, mediaUrl: uploadedUrls[0], mediaType: "art", clientName, cardText: cardText || cardTitle, caption: undefined },
      });
      if (error) throw error;
      toast.success(data?.message || "E-mail(s) enviado(s)!");
      // Close modal after successful send
      setTimeout(() => onClose(), 600);
    } catch (err: any) {
      console.error("Email error:", err);
      toast.error("Erro ao enviar e-mail: " + (err.message || ""));
    } finally {
      setIsSendingEmail(false);
    }
  };

  // Refs for current page regeneration (always up-to-date)
  const templateRef = useRef(template);
  useEffect(() => { templateRef.current = template; });
  const pageCustomOverlaysRef = useRef(pageCustomOverlays);
  useEffect(() => { pageCustomOverlaysRef.current = pageCustomOverlays; });
  const pageOverridesRef = useRef(pageOverrides);
  useEffect(() => { pageOverridesRef.current = pageOverrides; });
  const pagePhotoOffsetsRef = useRef(pagePhotoOffsets);
  useEffect(() => { pagePhotoOffsetsRef.current = pagePhotoOffsets; });
  const pagePhotosRef = useRef(pagePhotos);
  useEffect(() => { pagePhotosRef.current = pagePhotos; });

  const regenerateCurrentPage = useCallback(async () => {
    const tmpl = templateRef.current;
    if (!tmpl) return;
    setIsRegenerating(true);
    try {
      const ov = pageOverridesRef.current[currentPage] || {};
      const offset = pagePhotoOffsetsRef.current[currentPage] || { x: 0, y: 0 };
      const photo = pagePhotosRef.current[currentPage] || null;
      const text = pages[currentPage] || "";
      const dataUrl = await renderArt(tmpl, brandKit, text, photo, offset, ov, {
        isCarousel,
        isLastCarouselPage: isCarousel && currentPage === pages.length - 1,
        customOverlays: pageCustomOverlaysRef.current[currentPage] || [],
      });
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
  }, [currentPage, pages, brandKit, isCarousel]);

  // Re-render canvas when custom overlays change (any addition)
  const overlayJsonRef = useRef("");
  useEffect(() => {
    const json = JSON.stringify(pageCustomOverlays);
    if (json !== overlayJsonRef.current && overlayJsonRef.current !== "") {
      overlayJsonRef.current = json;
      regenerateCurrentPage();
    } else {
      overlayJsonRef.current = json;
    }
  }, [pageCustomOverlays, regenerateCurrentPage]);

  const handleDragEnd = useCallback(() => {
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    debounceTimerRef.current = setTimeout(async () => {
      const currentOverrides = pageOverridesRef.current;
      const currentOffsets = pagePhotoOffsetsRef.current;
      const currentPhotos = pagePhotosRef.current;
      const currentCustomOverlays = pageCustomOverlaysRef.current;

      // Propagate layout overrides (except text) to all carousel sibling pages
      if (isCarousel && pages.length > 1) {
        const currentOvNow = currentOverrides[currentPage] || {};
        const layoutKeys: (keyof ElementOverrides)[] = [
          "logoX", "logoY", "logoScaleX", "logoScaleY",
          "contactX", "contactY", "contactScaleX", "contactScaleY",
          "mascotX", "mascotY", "mascotScaleX", "mascotScaleY",
          "shapes", "bgOffsetX", "bgOffsetY", "bgScale", "hiddenElements",
          "photoScale", "photoFrame",
        ];
        setPageOverrides(prev => {
          const copy = [...prev];
          for (let i = 0; i < pages.length; i++) {
            if (i === currentPage) continue;
            const existing = copy[i] || {};
            const merged = { ...existing };
            for (const key of layoutKeys) {
              if (currentOvNow[key] !== undefined) {
                (merged as any)[key] = currentOvNow[key];
              }
            }
            copy[i] = merged;
          }
          return copy;
        });
      }

      // Only regenerate current page for instant feedback
      await regenerateCurrentPage();

      // Regenerate siblings in background (parallel, non-blocking)
      if (isCarousel && pages.length > 1) {
        const tmpl = templateRef.current;
        if (!tmpl) return;
        const currentOvNow = currentOverrides[currentPage] || {};
        const layoutKeys: (keyof ElementOverrides)[] = [
          "logoX", "logoY", "logoScaleX", "logoScaleY",
          "contactX", "contactY", "contactScaleX", "contactScaleY",
          "mascotX", "mascotY", "mascotScaleX", "mascotScaleY",
          "shapes", "bgOffsetX", "bgOffsetY", "bgScale", "hiddenElements",
          "photoScale", "photoFrame",
        ];
        const siblingPromises = pages.map(async (_, i) => {
          if (i === currentPage) return;
          try {
            const ov = currentOverrides[i] || {};
            const mergedOv = { ...ov };
            for (const key of layoutKeys) {
              if (currentOvNow[key] !== undefined) {
                (mergedOv as any)[key] = currentOvNow[key];
              }
            }
            const offset = currentOffsets[i] || { x: 0, y: 0 };
            const photo = currentPhotos[i] || null;
            const text = pages[i] || "";
            const dataUrl = await renderArt(tmpl, brandKit, text, photo, offset, mergedOv, {
              isCarousel,
              isLastCarouselPage: isCarousel && i === pages.length - 1,
              customOverlays: currentCustomOverlays[i] || [],
            });
            setPageArts(prev => {
              const copy = [...prev];
              copy[i] = dataUrl;
              return copy;
            });
          } catch (err) {
            console.error("Regenerate sibling error:", err);
          }
        });
        Promise.all(siblingPromises);
      }
    }, 80);
  }, [regenerateCurrentPage, isCarousel, pages, currentPage, brandKit]);

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

      // Parallel: load font + fetch uploads
      const [, uploadsResult] = await Promise.all([
        loadGoogleFont(fontFamily),
        supabase
          .from("card_uploads")
          .select("file_url, file_type")
          .eq("card_id", cardId)
          .eq("upload_type", "material"),
      ]);

      const matImages = (uploadsResult.data || [])
        .filter((u: any) => u.file_type.startsWith("image"))
        .map((u: any) => u.file_url);

      // Parallel: search photos for all pages that need them
      const photoPromises = pages.map(async (pageText, i) => {
        if (matImages[i]) return matImages[i];
        try {
          const sq = pageText.substring(0, 80);
          const pexelsResults = await Promise.race([
            searchPexelsImages(sq, 1),
            new Promise<SearchImage[]>((resolve) => setTimeout(() => resolve([]), 10000)),
          ]);
          return pexelsResults.length > 0 ? pexelsResults[0].urls.regular : null;
        } catch { return null; }
      });
      const photos = await Promise.all(photoPromises);

      // Parallel: render all pages
      const overrides: ElementOverrides[] = pages.map(() => ({}));
      const offsets = pages.map(() => ({ x: 0, y: 0 }));
      const artPromises = pages.map(async (pageText, i) => {
        try {
          return await Promise.race([
            renderArt(tmpl, brandKit, pageText, photos[i], { x: 0, y: 0 }, {}, {
              isCarousel,
              isLastCarouselPage: isCarousel && i === pages.length - 1,
            }),
            new Promise<string>((_, reject) => setTimeout(() => reject(new Error("render timeout")), 30000)),
          ]);
        } catch (err) {
          console.error(`renderArt page ${i} failed:`, err);
          return "";
        }
      }
      );
      const arts = await Promise.all(artPromises);

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
      setPageCustomOverlays([]);
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
      const dataUrl = await renderArt(template, brandKit, text, imageUrl, offset, ov, {
        isCarousel,
        isLastCarouselPage: isCarousel && currentPage === pages.length - 1,
        customOverlays: pageCustomOverlays[currentPage] || [],
      });
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
                  hiddenElements={hiddenElements}
                  setHiddenElements={syncSetHiddenElements}
                  customOverlays={currentOverlays}
                  setCustomOverlays={syncSetCustomOverlays}
                  photoInteractionMode={photoInteractionMode}
                />
              </div>

              {/* Interaction mode + add overlay */}
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  variant={photoInteractionMode === "content" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setPhotoInteractionMode((prev) => (prev === "content" ? "frame" : "content"))}
                  className="gap-1.5"
                >
                  {photoInteractionMode === "content" ? "Zoom da foto: ativo" : "Mover moldura: ativo"}
                </Button>

                <input
                  ref={overlayInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/jpg"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      handleOverlayUpload(file);
                      e.target.value = "";
                    }
                  }}
                />
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => overlayInputRef.current?.click()}
                  className="gap-1.5"
                >
                  <Plus className="h-4 w-4" />
                  Adicionar PNG/JPG
                </Button>
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
                <div className="space-y-2">
                  <Input
                    placeholder="Título do e-mail (obrigatório)"
                    value={emailSubject}
                    onChange={(e) => setEmailSubject(e.target.value)}
                    className={`h-9 text-sm ${!emailSubject.trim() ? 'border-destructive' : ''}`}
                  />
                  <Button
                    variant="outline"
                    className="w-full"
                    onClick={handleSendEmail}
                    disabled={isSendingEmail || !emailSubject.trim()}
                  >
                    {isSendingEmail ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Mail className="mr-2 h-4 w-4" />}
                    {isSendingEmail ? "Enviando..." : "Enviar por E-mail"}
                  </Button>
                </div>
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
