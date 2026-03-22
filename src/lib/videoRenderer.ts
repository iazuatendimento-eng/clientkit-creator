import { drawNewShape } from "@/lib/canvasShapes";

// ─── Trim + Contain helper ──────────────────────────────────────
const opaqueBoundsCache = new WeakMap<HTMLImageElement, { sx: number; sy: number; sw: number; sh: number }>();

function getOpaqueBounds(img: HTMLImageElement) {
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
  try { data = scanCtx.getImageData(0, 0, scanW, scanH).data; } catch { opaqueBoundsCache.set(img, fallback); return fallback; }
  let minX = scanW, minY = scanH, maxX = -1, maxY = -1;
  for (let y = 0; y < scanH; y++) {
    for (let x = 0; x < scanW; x++) {
      if (data[(y * scanW + x) * 4 + 3] > 8) {
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0 || maxY < 0) { opaqueBoundsCache.set(img, fallback); return fallback; }
  const invScale = 1 / scale;
  const sx = Math.max(0, Math.floor(minX * invScale));
  const sy = Math.max(0, Math.floor(minY * invScale));
  const ex = Math.min(natW, Math.ceil((maxX + 1) * invScale));
  const ey = Math.min(natH, Math.ceil((maxY + 1) * invScale));
  const result = { sx, sy, sw: ex - sx, sh: ey - sy };
  opaqueBoundsCache.set(img, result);
  return result;
}

function drawTrimContain(
  ctx: CanvasRenderingContext2D, img: HTMLImageElement,
  boxX: number, boxY: number, boxW: number, boxH: number,
  trimInfluence: number, fitScale = 1
) {
  const natW = img.naturalWidth || img.width;
  const natH = img.naturalHeight || img.height;
  const bounds = getOpaqueBounds(img);
  const baseSx = bounds.sx * trimInfluence;
  const baseSy = bounds.sy * trimInfluence;
  const baseSw = natW - (natW - bounds.sw) * trimInfluence;
  const baseSh = natH - (natH - bounds.sh) * trimInfluence;
  const srcAspect = baseSw / baseSh;
  const boxAspect = boxW / boxH;
  let drawW = boxW, drawH = boxH;
  if (srcAspect > boxAspect) { drawH = boxW / srcAspect; } else { drawW = boxH * srcAspect; }
  drawW *= fitScale;
  drawH *= fitScale;
  const drawX = boxX + (boxW - drawW) / 2;
  const drawY = boxY + (boxH - drawH) / 2;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(img, baseSx, baseSy, baseSw, baseSh, drawX, drawY, drawW, drawH);
}

// ─── Types ───────────────────────────────────────────────────────

export interface CanvasElement {
  id: string;
  type: string;
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
  colorRole?: "background" | "element1" | "text" | "accessory1" | "accessory2";
  opacity?: number;
  borderRadius?: number;
  borderWidth?: number;
  borderColor?: string;
  borderColorRole?: "background" | "element1" | "text" | "accessory1" | "accessory2";
  shadowBlur?: number;
  shadowColor?: string;
  shadowOffsetX?: number;
  shadowOffsetY?: number;
  clipShape?: string;
  gradient?: {
    type: "linear" | "radial";
    color1: string;
    color2: string;
    opacity1?: number;
    opacity2?: number;
    angle?: number;
    fadeMode?: boolean;
    color1Role?: "background" | "element1" | "text" | "accessory1" | "accessory2";
    color2Role?: "background" | "element1" | "text" | "accessory1" | "accessory2";
  };
  animated?: boolean;
  animationType?: string;
  animDuration?: number;
  animLoop?: boolean;
}

export type ShapeOverride = { x: number; y: number; width: number; height: number };

export interface ElementAdjustments {
  logoScaleX: number; logoScaleY: number; logoX: number; logoY: number;
  contactScaleX: number; contactScaleY: number; contactX: number; contactY: number;
  mascotScaleX: number; mascotScaleY: number; mascotX: number; mascotY: number;
  sigLogoScaleX: number; sigLogoScaleY: number; sigLogoX: number; sigLogoY: number;
  sigContactScaleX: number; sigContactScaleY: number; sigContactX: number; sigContactY: number;
  sigMascotScaleX: number; sigMascotScaleY: number; sigMascotX: number; sigMascotY: number;
  textScale: number; textX: number; textY: number;
  shapeOverrides?: Record<string, ShapeOverride>;
}

export const defaultAdjustments: ElementAdjustments = {
  logoScaleX: 100, logoScaleY: 100, logoX: 0, logoY: 0,
  contactScaleX: 100, contactScaleY: 100, contactX: 0, contactY: 0,
  mascotScaleX: 100, mascotScaleY: 100, mascotX: 0, mascotY: 0,
  sigLogoScaleX: 100, sigLogoScaleY: 100, sigLogoX: 0, sigLogoY: 0,
  sigContactScaleX: 100, sigContactScaleY: 100, sigContactX: 0, sigContactY: 0,
  sigMascotScaleX: 100, sigMascotScaleY: 100, sigMascotX: 0, sigMascotY: 0,
  textScale: 100, textX: 0, textY: 0,
};

export interface PageTextAdjustment { textScale: number; textX: number; textY: number; }
export interface PageImageAdjustment { imageX: number; imageY: number; imageScale: number; }
export const defaultPageTextAdjustment: PageTextAdjustment = { textScale: 100, textX: 0, textY: 0 };
export const defaultPageImageAdjustment: PageImageAdjustment = { imageX: 0, imageY: 0, imageScale: 100 };

export interface VideoTemplateData {
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

// ─── Image Loading ───────────────────────────────────────────────

const imageCache = new Map<string, HTMLImageElement>();

export async function loadImage(url: string, retries = 2): Promise<HTMLImageElement | null> {
  if (!url) return null;
  const cacheKey = url.length > 200 ? url.substring(0, 100) + url.length : url;
  const cached = imageCache.get(cacheKey);
  if (cached) return cached;

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

  // Strategy 1: fetch → blob → objectURL
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
        if (img) { imageCache.set(cacheKey, img); return img; }
      }
    } catch { /* retry */ }
  }

  // Strategy 2: Image with crossOrigin
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const img = await new Promise<HTMLImageElement | null>((resolve) => {
        const el = new Image();
        el.crossOrigin = "anonymous";
        el.onload = () => resolve(el);
        el.onerror = () => resolve(null);
        el.src = url;
      });
      if (img) { imageCache.set(cacheKey, img); return img; }
    } catch { /* retry */ }
  }

  // Strategy 3 intentionally disabled: no-CORS load taints canvas and can drop overlays.
  return null;
}

// ─── Font Loading ────────────────────────────────────────────────

const SYSTEM_FONTS = new Set([
  "Arial", "Verdana", "Helvetica", "Tahoma", "Trebuchet MS",
  "Times New Roman", "Georgia", "Garamond", "Courier New",
  "Impact", "Comic Sans MS", "Segoe UI", "Lucida Sans",
]);

export async function loadGoogleFont(fontFamily: string): Promise<void> {
  if (!fontFamily || SYSTEM_FONTS.has(fontFamily)) return;
  const id = `google-font-${fontFamily.replace(/\s+/g, "-")}`;
  if (document.getElementById(id)) return;
  const link = document.createElement("link");
  link.id = id;
  link.rel = "stylesheet";
  link.href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(fontFamily)}:wght@400;700;800;900&display=swap`;
  document.head.appendChild(link);
  try { await document.fonts.load(`16px "${fontFamily}"`); } catch { /* may still work */ }
}

// ─── Helpers ─────────────────────────────────────────────────────

export function getImagePlaceholderRect(elements: CanvasElement[], tw: number, th: number) {
  const el = elements.find(e => e.type === "image");
  if (!el) return null;
  return { left: (el.x / tw) * 100, top: (el.y / th) * 100, width: (el.width / tw) * 100, height: (el.height / th) * 100 };
}
export function getImagePlaceholderRectWithOverrides(elements: CanvasElement[], tw: number, th: number, shapeOverrides?: Record<string, ShapeOverride>) {
  const el = elements.find(e => e.type === "image");
  if (!el) return null;
  const ov = shapeOverrides?.[el.id];
  const x = ov?.x ?? el.x;
  const y = ov?.y ?? el.y;
  const w = ov?.width ?? el.width;
  const h = ov?.height ?? el.height;
  return { left: (x / tw) * 100, top: (y / th) * 100, width: (w / tw) * 100, height: (h / th) * 100 };
}

export function getImageElSizeWithOverrides(elements: CanvasElement[], shapeOverrides?: Record<string, ShapeOverride>) {
  const el = elements.find(e => e.type === "image");
  if (!el) return null;
  const ov = shapeOverrides?.[el.id];
  return { width: ov?.width ?? el.width, height: ov?.height ?? el.height };
}

export function getImageElSize(elements: CanvasElement[]) {
  const el = elements.find(e => e.type === "image");
  return el ? { width: el.width, height: el.height } : null;
}
export function getImageClipShape(elements: CanvasElement[]): string {
  const el = elements.find(e => e.type === "image");
  return el?.clipShape || "rect";
}
export function getCSSClipPath(shape: string): string | undefined {
  switch (shape) {
    case "circle": return "ellipse(50% 50% at 50% 50%)";
    case "triangle": return "polygon(50% 0%, 100% 100%, 0% 100%)";
    case "diamond": return "polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%)";
    case "hexagon": return "polygon(50% 0%, 93.3% 25%, 93.3% 75%, 50% 100%, 6.7% 75%, 6.7% 25%)";
    case "pentagon": return "polygon(50% 0%, 97.6% 34.5%, 79.4% 90.5%, 20.6% 90.5%, 2.4% 34.5%)";
    case "star": return "polygon(50% 0%, 61.8% 34.5%, 97.6% 34.5%, 69% 55.9%, 79.4% 90.5%, 50% 69%, 20.6% 90.5%, 31% 55.9%, 2.4% 34.5%, 38.2% 34.5%)";
    default: return undefined;
  }
}

// ─── Core Rendering ──────────────────────────────────────────────

function hexToRgba(hex: string, opacity: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${opacity / 100})`;
}

function ensureColor(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim().length > 0 ? value : fallback;
}

export async function generatePageImage(
  templateWidth: number,
  templateHeight: number,
  templateBgColor: string,
  elements: CanvasElement[],
  text: string,
  brandKit: any,
  isSignature: boolean,
  backgroundImage?: string,
  adjustments: ElementAdjustments = defaultAdjustments,
  textAdjustment: PageTextAdjustment = defaultPageTextAdjustment,
  imageAdjustment: PageImageAdjustment = defaultPageImageAdjustment,
  transparentBackground = false,
  excludeLogo = false,
  excludeText = false,
  shapeFilter: "all" | "before-image" | "after-image" = "all",
  renderAllNonImage = false
): Promise<string> {
  const canvas = document.createElement("canvas");
  canvas.width = templateWidth;
  canvas.height = templateHeight;
  const ctx = canvas.getContext("2d")!;
  const w = canvas.width;
  const h = canvas.height;

  const colors = Array.isArray(brandKit?.colors) ? brandKit.colors : [];
  const brandBgColor = ensureColor(colors[0], templateBgColor || "#1a1a2e");
  const bgColor = templateBgColor || "#1a1a2e"; // Canvas fill always uses template's original color
  const textColor = ensureColor(colors[1], "#ffffff");
  const accessoryColor1 = ensureColor(colors[2], "#cccccc");
  const accessoryColor2 = ensureColor(colors[3], "#aaaaaa");

  const getElementColor = (el: CanvasElement, defaultColor: string): string => {
    if (el.colorRole === "background" || el.colorRole === "element1") return brandBgColor;
    if (el.colorRole === "text") return textColor;
    if (el.colorRole === "accessory1") return accessoryColor1;
    if (el.colorRole === "accessory2") return accessoryColor2;
    return el.color || defaultColor;
  };

  const getBorderColor = (el: CanvasElement): string => {
    if (el.borderColorRole === "background" || el.borderColorRole === "element1") return brandBgColor;
    if (el.borderColorRole === "text") return textColor;
    if (el.borderColorRole === "accessory1") return accessoryColor1;
    if (el.borderColorRole === "accessory2") return accessoryColor2;
    return el.borderColor || "#000000";
  };

  const getElementFillStyle = (el: CanvasElement, x: number, y: number, elW: number, elH: number, defaultColor: string): string | CanvasGradient => {
    if (el.gradient) {
      let gradient;
      if (el.gradient.type === "linear") {
        const angle = (el.gradient.angle || 0) * Math.PI / 180;
        const cx = x + elW / 2; const cy = y + elH / 2;
        const dx = Math.cos(angle) * elW / 2; const dy = Math.sin(angle) * elH / 2;
        gradient = ctx.createLinearGradient(cx - dx, cy - dy, cx + dx, cy + dy);
      } else {
        gradient = ctx.createRadialGradient(x + elW / 2, y + elH / 2, 0, x + elW / 2, y + elH / 2, Math.max(elW, elH) / 2);
      }
      const color1 = (el.gradient.color1Role === "background" || el.gradient.color1Role === "element1") ? brandBgColor : el.gradient.color1Role === "text" ? textColor : el.gradient.color1Role === "accessory1" ? accessoryColor1 : el.gradient.color1Role === "accessory2" ? accessoryColor2 : el.gradient.color1;
      const color2Raw = (el.gradient.color2Role === "background" || el.gradient.color2Role === "element1") ? brandBgColor : el.gradient.color2Role === "text" ? textColor : el.gradient.color2Role === "accessory1" ? accessoryColor1 : el.gradient.color2Role === "accessory2" ? accessoryColor2 : el.gradient.color2;
      const color2 = el.gradient.fadeMode ? color1 : color2Raw;
      const op1 = el.gradient.opacity1 ?? 100;
      const op2 = el.gradient.opacity2 ?? (el.gradient.fadeMode ? 0 : 100);
      gradient.addColorStop(0, hexToRgba(color1, op1));
      gradient.addColorStop(1, hexToRgba(color2, op2));
      return gradient;
    }
    return getElementColor(el, defaultColor);
  };

  const applyElementStyles = (el: CanvasElement) => {
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

  // Helper: check if template has a large background-role shape that warrants PNG replacement
  const hasLargeBackgroundShape = () => {
    const shapeOvr = adjustments.shapeOverrides || {};
    for (const el of elements) {
      const isBackgroundRole = el.colorRole === "background";
      const matchesTemplateBg = !el.colorRole && el.color === templateBgColor;
      if (!isBackgroundRole && !matchesTemplateBg) continue;
      const ov = shapeOvr[el.id || ""];
      const ex = ov?.x ?? el.x ?? 0;
      const ey = ov?.y ?? el.y ?? 0;
      const ew = ov?.width ?? el.width ?? 0;
      const eh = ov?.height ?? el.height ?? 0;
      if (
        ew * eh >= templateWidth * templateHeight * 0.65 &&
        ex <= templateWidth * 0.2 &&
        ey <= templateHeight * 0.2 &&
        ex + ew >= templateWidth * 0.8 &&
        ey + eh >= templateHeight * 0.8
      ) return true;
    }
    return false;
  };

  // Draw background
  if (!transparentBackground) {
    const brandBgPng = brandKit?.backgroundPng || brandKit?.background_png;
    let bgPngLoaded = false;
    const hasLargeBg = hasLargeBackgroundShape();
    // Use PNG background if there's a large background-role shape OR if it's a signature page
    if (brandBgPng && (hasLargeBg || isSignature)) {
      const bgPngImg = await loadImage(brandBgPng);
      if (bgPngImg) {
        ctx.drawImage(bgPngImg, 0, 0, w, h);
        bgPngLoaded = true;
      }
    }
    if (!bgPngLoaded) {
      ctx.fillStyle = brandBgColor;
      ctx.fillRect(0, 0, w, h);
    }
  }

  const imageElIndex = elements.findIndex(e => e.type === "image");

  // Draw clip path helper
  const drawClipPath = (shape: string, x: number, y: number, w: number, h: number) => {
    if (shape === "circle") {
      ctx.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, 0, 0, Math.PI * 2);
    } else if (shape === "triangle") {
      ctx.moveTo(x + w / 2, y); ctx.lineTo(x + w, y + h); ctx.lineTo(x, y + h); ctx.closePath();
    } else if (shape === "diamond") {
      ctx.moveTo(x + w / 2, y); ctx.lineTo(x + w, y + h / 2); ctx.lineTo(x + w / 2, y + h); ctx.lineTo(x, y + h / 2); ctx.closePath();
    } else if (shape === "hexagon") {
      const cx = x + w / 2, cy = y + h / 2, r = Math.min(w, h) / 2;
      for (let i = 0; i < 6; i++) { const a = (Math.PI / 3) * i - Math.PI / 2; if (i === 0) ctx.moveTo(cx + r * Math.cos(a), cy + r * Math.sin(a)); else ctx.lineTo(cx + r * Math.cos(a), cy + r * Math.sin(a)); }
      ctx.closePath();
    } else if (shape === "pentagon") {
      const cx = x + w / 2, cy = y + h / 2, r = Math.min(w, h) / 2;
      for (let i = 0; i < 5; i++) { const a = (Math.PI * 2 / 5) * i - Math.PI / 2; if (i === 0) ctx.moveTo(cx + r * Math.cos(a), cy + r * Math.sin(a)); else ctx.lineTo(cx + r * Math.cos(a), cy + r * Math.sin(a)); }
      ctx.closePath();
    } else if (shape === "star") {
      const cx = x + w / 2, cy = y + h / 2;
      const outerR = Math.min(w, h) / 2, innerR = outerR * 0.4;
      for (let i = 0; i < 10; i++) { const a = (Math.PI / 5) * i - Math.PI / 2; const r = i % 2 === 0 ? outerR : innerR; if (i === 0) ctx.moveTo(cx + r * Math.cos(a), cy + r * Math.sin(a)); else ctx.lineTo(cx + r * Math.cos(a), cy + r * Math.sin(a)); }
      ctx.closePath();
    } else {
      ctx.rect(x, y, w, h);
    }
  };

  // Apply shape overrides from adjustments
  const shapeOverrides = adjustments.shapeOverrides || {};

  // Smart Layering: skip large background-colored shapes when client has PNG background
  // ONLY skip shapes that are truly background: colorRole === "background" OR
  // the shape's raw color matches the TEMPLATE's original background color
  const brandBgPngForSkip = brandKit?.backgroundPng || brandKit?.background_png;
  const shouldSkipBackgroundShape = (el: CanvasElement) => {
    if (!brandBgPngForSkip) return false;
    const isBackgroundRole = el.colorRole === "background";
    const isElement1Role = el.colorRole === "element1";
    // Raw color match against template/fallback brand color for older templates without explicit role
    const matchesTemplateBg = !el.colorRole && el.color === templateBgColor;
    const matchesBrandBg = !el.colorRole && el.color === brandBgColor;
    // On signature pages, also allow large Elemento (Cor 1) blocks to be replaced by PNG
    const isSignatureBgCandidate = isSignature && (isElement1Role || matchesBrandBg);
    if (!isBackgroundRole && !matchesTemplateBg && !isSignatureBgCandidate) return false;
    const ov = shapeOverrides[el.id || ""];
    const ex = ov?.x ?? el.x ?? 0;
    const ey = ov?.y ?? el.y ?? 0;
    const ew = ov?.width ?? el.width ?? 0;
    const eh = ov?.height ?? el.height ?? 0;
    const coversMostCanvas =
      ew * eh >= templateWidth * templateHeight * 0.65 &&
      ex <= templateWidth * 0.2 &&
      ey <= templateHeight * 0.2 &&
      ex + ew >= templateWidth * 0.8 &&
      ey + eh >= templateHeight * 0.8;
    return coversMostCanvas;
  };

  for (let elIdx = 0; elIdx < elements.length; elIdx++) {
    let el = elements[elIdx];

    // Apply shape override if available
    if (el.id && shapeOverrides[el.id] && !["text", "contact", "logo", "mascot"].includes(el.type)) {
      const ov = shapeOverrides[el.id];
      el = { ...el, x: ov.x, y: ov.y, width: ov.width, height: ov.height };
    }

    // Shape filter
    if (shapeFilter === "before-image" && imageElIndex >= 0 && elIdx >= imageElIndex) continue;
    if (shapeFilter === "after-image" && imageElIndex >= 0 && elIdx <= imageElIndex) continue;
    if (!transparentBackground && el.gradient?.fadeMode) continue;
    // Skip large background shapes when PNG background is active
    if (!transparentBackground && shouldSkipBackgroundShape(el)) continue;

    if (transparentBackground && renderAllNonImage) {
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
          ctx.beginPath();
          drawClipPath(el.clipShape || "rect", el.x, el.y, el.width, el.height);
          ctx.stroke();
          ctx.restore();
        }
        continue;
      }
    } else {
      if (excludeLogo && (el.type === "logo" || el.type === "mascot")) continue;
      if (excludeText && ["text", "contact"].includes(el.type)) continue;

      // Text-only overlay
      if (transparentBackground && !excludeText) {
        if (!["text", "contact"].includes(el.type)) continue;
      }

      // Frame-only overlay
      if (transparentBackground && excludeText) {
        if (["text", "contact", "logo", "mascot"].includes(el.type)) continue;
        if (shapeFilter === "before-image") {
          const hasTrueAnimation = el.animationType && el.animationType !== "none";
          if (!hasTrueAnimation && !el.gradient?.fadeMode) continue;
        }
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
            ctx.beginPath();
            drawClipPath(el.clipShape || "rect", el.x, el.y, el.width, el.height);
            ctx.stroke();
            ctx.restore();
          }
          continue;
        }
      }

      if (transparentBackground && !excludeText && !["text", "contact"].includes(el.type)) continue;

      // Base page (logo/text excluded) should not paint decorative shapes,
      // otherwise they are duplicated with frame/pre-image overlays.
      const isDecorativeShape = !["image", "text", "contact", "logo", "mascot"].includes(el.type);
      if (!transparentBackground && excludeLogo && excludeText && isDecorativeShape) continue;
    }

    // Draw background image at the image element's z-position
    if (el.type === "image" && !transparentBackground && backgroundImage) {
      const bgImg = await loadImage(backgroundImage);
      if (bgImg) {
        const destX = el.x, destY = el.y, destW = el.width, destH = el.height;
        const scale = imageAdjustment.imageScale / 100;
        const imgAspect = bgImg.width / bgImg.height;
        const destAspect = destW / destH;
        let drawWidth: number, drawHeight: number, drawX: number, drawY: number;
        if (imgAspect > destAspect) {
          drawHeight = destH * scale; drawWidth = drawHeight * imgAspect;
          drawX = destX + (destW - drawWidth) / 2 + imageAdjustment.imageX;
          drawY = destY + (destH - drawHeight) / 2 + imageAdjustment.imageY;
        } else {
          drawWidth = destW * scale; drawHeight = drawWidth / imgAspect;
          drawX = destX + (destW - drawWidth) / 2 + imageAdjustment.imageX;
          drawY = destY + (destH - drawHeight) / 2 + imageAdjustment.imageY;
        }
        ctx.save();
        ctx.beginPath();
        drawClipPath(el.clipShape || "rect", destX, destY, destW, destH);
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

    if (el.rotation) {
      const cx = el.x + el.width / 2; const cy = el.y + el.height / 2;
      ctx.translate(cx, cy); ctx.rotate((el.rotation * Math.PI) / 180); ctx.translate(-cx, -cy);
    }

    // ── Shape rendering ──
    if (el.type === "rect") {
      ctx.fillStyle = getElementFillStyle(el, el.x, el.y, el.width, el.height, accessoryColor1);
      ctx.beginPath();
      if (el.borderRadius && el.borderRadius > 0) ctx.roundRect(el.x, el.y, el.width, el.height, el.borderRadius);
      else ctx.rect(el.x, el.y, el.width, el.height);
      ctx.fill();
      if (el.borderWidth && el.borderWidth > 0) {
        const prevAlpha = ctx.globalAlpha;
        ctx.globalAlpha = 1;
        ctx.strokeStyle = getBorderColor(el);
        ctx.lineWidth = el.borderWidth;
        ctx.stroke();
        ctx.globalAlpha = prevAlpha;
      }
    } else if (el.type === "circle") {
      ctx.fillStyle = getElementFillStyle(el, el.x, el.y, el.width, el.height, accessoryColor2);
      ctx.beginPath(); ctx.ellipse(el.x + el.width / 2, el.y + el.height / 2, el.width / 2, el.height / 2, 0, 0, Math.PI * 2); ctx.fill();
      if (el.borderWidth && el.borderWidth > 0) { ctx.globalAlpha = 1; ctx.strokeStyle = getBorderColor(el); ctx.lineWidth = el.borderWidth; ctx.stroke(); }
    } else if (el.type === "triangle") {
      ctx.fillStyle = getElementFillStyle(el, el.x, el.y, el.width, el.height, accessoryColor1);
      ctx.beginPath(); ctx.moveTo(el.x + el.width / 2, el.y); ctx.lineTo(el.x + el.width, el.y + el.height); ctx.lineTo(el.x, el.y + el.height); ctx.closePath(); ctx.fill();
      if (el.borderWidth && el.borderWidth > 0) { ctx.globalAlpha = 1; ctx.strokeStyle = getBorderColor(el); ctx.lineWidth = el.borderWidth; ctx.stroke(); }
    } else if (el.type === "diamond") {
      ctx.fillStyle = getElementFillStyle(el, el.x, el.y, el.width, el.height, accessoryColor1);
      ctx.beginPath(); ctx.moveTo(el.x + el.width / 2, el.y); ctx.lineTo(el.x + el.width, el.y + el.height / 2); ctx.lineTo(el.x + el.width / 2, el.y + el.height); ctx.lineTo(el.x, el.y + el.height / 2); ctx.closePath(); ctx.fill();
      if (el.borderWidth && el.borderWidth > 0) { ctx.globalAlpha = 1; ctx.strokeStyle = getBorderColor(el); ctx.lineWidth = el.borderWidth; ctx.stroke(); }
    } else if (el.type === "hexagon") {
      ctx.fillStyle = getElementFillStyle(el, el.x, el.y, el.width, el.height, accessoryColor1);
      const hcx = el.x + el.width / 2, hcy = el.y + el.height / 2, hr = Math.min(el.width, el.height) / 2;
      ctx.beginPath(); for (let i = 0; i < 6; i++) { const a = (Math.PI / 3) * i - Math.PI / 2; if (i === 0) ctx.moveTo(hcx + hr * Math.cos(a), hcy + hr * Math.sin(a)); else ctx.lineTo(hcx + hr * Math.cos(a), hcy + hr * Math.sin(a)); } ctx.closePath(); ctx.fill();
      if (el.borderWidth && el.borderWidth > 0) { ctx.globalAlpha = 1; ctx.strokeStyle = getBorderColor(el); ctx.lineWidth = el.borderWidth; ctx.stroke(); }
    } else if (el.type === "pentagon") {
      ctx.fillStyle = getElementFillStyle(el, el.x, el.y, el.width, el.height, accessoryColor1);
      const pcx = el.x + el.width / 2, pcy = el.y + el.height / 2, pr = Math.min(el.width, el.height) / 2;
      ctx.beginPath(); for (let i = 0; i < 5; i++) { const a = (Math.PI * 2 / 5) * i - Math.PI / 2; if (i === 0) ctx.moveTo(pcx + pr * Math.cos(a), pcy + pr * Math.sin(a)); else ctx.lineTo(pcx + pr * Math.cos(a), pcy + pr * Math.sin(a)); } ctx.closePath(); ctx.fill();
      if (el.borderWidth && el.borderWidth > 0) { ctx.globalAlpha = 1; ctx.strokeStyle = getBorderColor(el); ctx.lineWidth = el.borderWidth; ctx.stroke(); }
    } else if (el.type === "star") {
      ctx.fillStyle = getElementFillStyle(el, el.x, el.y, el.width, el.height, accessoryColor2);
      const scx = el.x + el.width / 2, scy = el.y + el.height / 2;
      const outerR = Math.min(el.width, el.height) / 2, innerR = outerR * 0.4;
      ctx.beginPath(); for (let i = 0; i < 10; i++) { const a = (Math.PI / 5) * i - Math.PI / 2; const r = i % 2 === 0 ? outerR : innerR; if (i === 0) ctx.moveTo(scx + r * Math.cos(a), scy + r * Math.sin(a)); else ctx.lineTo(scx + r * Math.cos(a), scy + r * Math.sin(a)); } ctx.closePath(); ctx.fill();
      if (el.borderWidth && el.borderWidth > 0) { ctx.globalAlpha = 1; ctx.strokeStyle = getBorderColor(el); ctx.lineWidth = el.borderWidth; ctx.stroke(); }
    } else if (el.type === "line") {
      ctx.strokeStyle = getElementColor(el, accessoryColor1);
      ctx.lineWidth = el.height || 4; ctx.lineCap = "round";
      ctx.beginPath(); ctx.moveTo(el.x, el.y + el.height / 2); ctx.lineTo(el.x + el.width, el.y + el.height / 2); ctx.stroke();
    } else if (el.type === "polkaDots") {
      const color = getElementColor(el, accessoryColor1);
      const dotRadius = Math.min(el.width, el.height) * 0.08;
      const spacing = dotRadius * 3;
      const cols = Math.max(1, Math.floor(el.width / spacing));
      const rows = Math.max(1, Math.floor(el.height / spacing));
      const offsetX = (el.width - (cols - 1) * spacing) / 2;
      const offsetY = (el.height - (rows - 1) * spacing) / 2;
      ctx.fillStyle = color;
      for (let row = 0; row < rows; row++) for (let col = 0; col < cols; col++) {
        ctx.beginPath(); ctx.arc(el.x + offsetX + col * spacing, el.y + offsetY + row * spacing, dotRadius, 0, Math.PI * 2); ctx.fill();
      }
    } else if (el.type === "dotsGrid") {
      const color = getElementColor(el, accessoryColor2);
      ctx.fillStyle = color;
      const seed = el.x + el.y + el.width + el.height;
      const random = (i: number) => { const n = Math.sin(seed + i * 9.999) * 10000; return n - Math.floor(n); };
      for (let i = 0; i < 25; i++) { ctx.beginPath(); ctx.arc(el.x + random(i * 2) * el.width, el.y + random(i * 2 + 1) * el.height, 3 + random(i * 3) * 12, 0, Math.PI * 2); ctx.fill(); }
    } else if (el.type === "confetti") {
      const base = getElementColor(el, accessoryColor1);
      const palette = [base, accessoryColor1, accessoryColor2, textColor];
      const seed = el.x + el.y + el.width + el.height;
      const random = (i: number) => { const n = Math.sin(seed + i * 9.999) * 10000; return n - Math.floor(n); };
      for (let i = 0; i < 30; i++) {
        const cx = el.x + random(i * 2) * el.width; const cy = el.y + random(i * 2 + 1) * el.height;
        const size = 5 + random(i * 3) * 15; const rot = random(i * 4) * Math.PI * 2;
        ctx.fillStyle = palette[Math.floor(random(i * 5) * palette.length)];
        ctx.save(); ctx.translate(cx, cy); ctx.rotate(rot);
        const shapeType = Math.floor(random(i * 6) * 3);
        if (shapeType === 0) ctx.fillRect(-size / 2, -size / 4, size, size / 2);
        else if (shapeType === 1) { ctx.beginPath(); ctx.arc(0, 0, size / 3, 0, Math.PI * 2); ctx.fill(); }
        else { ctx.beginPath(); ctx.moveTo(0, -size / 2); ctx.lineTo(size / 2, size / 2); ctx.lineTo(-size / 2, size / 2); ctx.closePath(); ctx.fill(); }
        ctx.restore();
      }
    } else if (el.type === "splatter") {
      const color = getElementColor(el, accessoryColor2);
      ctx.fillStyle = color;
      const seed = el.x + el.y + el.width + el.height;
      const random = (i: number) => { const n = Math.sin(seed + i * 9.999) * 10000; return n - Math.floor(n); };
      const cx = el.x + el.width / 2; const cy = el.y + el.height / 2;
      const mainRadius = Math.min(el.width, el.height) * 0.28;
      ctx.beginPath(); ctx.arc(cx, cy, mainRadius, 0, Math.PI * 2); ctx.fill();
      for (let i = 0; i < 20; i++) {
        const angle = random(i) * Math.PI * 2; const dist = mainRadius * (0.8 + random(i + 10) * 1.5); const r = 2 + random(i + 20) * 10;
        ctx.beginPath(); ctx.arc(cx + Math.cos(angle) * dist, cy + Math.sin(angle) * dist, r, 0, Math.PI * 2); ctx.fill();
      }
    } else if (el.type === "zigzag") {
      const color = getElementColor(el, accessoryColor1);
      ctx.strokeStyle = color; ctx.lineWidth = Math.max(2, el.height * 0.08); ctx.lineCap = "round";
      ctx.beginPath(); ctx.moveTo(el.x, el.y + el.height / 2);
      for (let i = 1; i <= 8; i++) ctx.lineTo(el.x + i * (el.width / 8), el.y + (i % 2 === 0 ? el.height * 0.2 : el.height * 0.8));
      ctx.stroke();
    } else if (el.type === "spiral") {
      const color = getElementColor(el, accessoryColor2);
      ctx.strokeStyle = color; ctx.lineWidth = Math.max(2, Math.min(el.width, el.height) * 0.03); ctx.lineCap = "round";
      const cx = el.x + el.width / 2; const cy = el.y + el.height / 2; const maxR = Math.min(el.width, el.height) * 0.45;
      ctx.beginPath();
      for (let t = 0; t <= 1; t += 0.02) {
        const angle = t * 3 * Math.PI * 2; const r = t * maxR;
        if (t === 0) ctx.moveTo(cx + Math.cos(angle) * r, cy + Math.sin(angle) * r);
        else ctx.lineTo(cx + Math.cos(angle) * r, cy + Math.sin(angle) * r);
      }
      ctx.stroke();
    } else if (drawNewShape(ctx, el.type, el.x, el.y, el.width, el.height, getElementColor(el, accessoryColor1) as string)) {
      if (el.borderWidth && el.borderWidth > 0) { ctx.globalAlpha = 1; ctx.strokeStyle = getBorderColor(el); ctx.lineWidth = el.borderWidth; ctx.stroke(); }
      // New shape drawn by helper
    } else if (el.type === "text") {
      ctx.fillStyle = textColor;
      const baseFontSize = el.fontSize || 48;
      const fontSize = Math.round(baseFontSize * (textAdjustment.textScale / 100));
      const fontFamily = brandKit?.font || brandKit?.fontFamily || "Arial";
      ctx.font = `normal ${fontSize}px ${fontFamily}`;
      const displayText = isSignature ? (el.text || "") : text;
      const align = el.textAlign || "left";
      ctx.textAlign = align;
      const adjustedX = el.x + textAdjustment.textX;
      const adjustedY = el.y + textAdjustment.textY;
      const drawX = align === "center" ? adjustedX + (el.width || 800) / 2 : align === "right" ? adjustedX + (el.width || 800) : adjustedX;
      const words = displayText.split(" ");
      let line = ""; let y = adjustedY + fontSize;
      const maxWidth = el.width || 800;
      const lineHeight = (el.lineHeight || 1.3) * fontSize;
      for (let i = 0; i < words.length; i++) {
        const testLine = line + words[i] + " ";
        const metrics = ctx.measureText(testLine);
        if (metrics.width > maxWidth && i > 0) { ctx.fillText(line.trim(), drawX, y); line = words[i] + " "; y += lineHeight; }
        else line = testLine;
      }
      ctx.fillText(line.trim(), drawX, y);
      ctx.textAlign = "left";
    } else if (el.type === "logo") {
      const logoUrl = brandKit?.pngs?.[0] || brandKit?.logo;
      if (logoUrl) {
        const img = await loadImage(logoUrl);
        if (img) {
          const lx = isSignature ? (adjustments.sigLogoX ?? adjustments.logoX) : adjustments.logoX;
          const ly = isSignature ? (adjustments.sigLogoY ?? adjustments.logoY) : adjustments.logoY;
          const lsx = isSignature ? (adjustments.sigLogoScaleX ?? adjustments.logoScaleX) : adjustments.logoScaleX;
          const lsy = isSignature ? (adjustments.sigLogoScaleY ?? adjustments.logoScaleY) : adjustments.logoScaleY;
          drawTrimContain(ctx, img, el.x + lx, el.y + ly, el.width * (lsx / 100), el.height * (lsy / 100), 0.6);
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
          const cx2 = isSignature ? (adjustments.sigContactX ?? adjustments.contactX) : adjustments.contactX;
          const cy2 = isSignature ? (adjustments.sigContactY ?? adjustments.contactY) : adjustments.contactY;
          const csx = isSignature ? (adjustments.sigContactScaleX ?? adjustments.contactScaleX) : adjustments.contactScaleX;
          const csy = isSignature ? (adjustments.sigContactScaleY ?? adjustments.contactScaleY) : adjustments.contactScaleY;
          drawTrimContain(ctx, img, el.x + cx2, el.y + cy2, el.width * (csx / 100), el.height * (csy / 100), 1.0, 0.88);
        }
      }
    } else if (el.type === "mascot") {
      const mascotUrl = brandKit?.pngs?.[2] || brandKit?.mascot;
      if (mascotUrl) {
        const img = await loadImage(mascotUrl);
        if (img) {
          const mx = isSignature ? (adjustments.sigMascotX ?? adjustments.mascotX) : adjustments.mascotX;
          const my = isSignature ? (adjustments.sigMascotY ?? adjustments.mascotY) : adjustments.mascotY;
          const msx = isSignature ? (adjustments.sigMascotScaleX ?? adjustments.mascotScaleX) : adjustments.mascotScaleX;
          const msy = isSignature ? (adjustments.sigMascotScaleY ?? adjustments.mascotScaleY) : adjustments.mascotScaleY;
          drawTrimContain(ctx, img, el.x + mx, el.y + my, el.width * (msx / 100), el.height * (msy / 100), 0.6);
        }
      }
    }
    ctx.restore();
  }

  try {
    if (transparentBackground) {
      const px = ctx.getImageData(0, 0, w, h).data;
      let hasVisiblePixel = false;
      for (let i = 3; i < px.length; i += 4) {
        if (px[i] !== 0) {
          hasVisiblePixel = true;
          break;
        }
      }
      if (!hasVisiblePixel) return "";
    }
    return canvas.toDataURL("image/png");
  } catch {
    return "";
  }
}

// ─── Logo Overlay ────────────────────────────────────────────────

export async function generateLogoOverlay(
  templateWidth: number,
  templateHeight: number,
  elements: CanvasElement[],
  brandKit: any,
  isSignature: boolean,
  adjustments: ElementAdjustments = defaultAdjustments
): Promise<string> {
  const logoEl = elements.find(e => e.type === "logo");
  const mascotEl = elements.find(e => e.type === "mascot");
  if (!logoEl && !mascotEl) return "";
  const canvas = document.createElement("canvas");
  canvas.width = templateWidth;
  canvas.height = templateHeight;
  const ctx = canvas.getContext("2d")!;

  // Always render logo/mascot overlay when element exists.
  if (logoEl) {
    const logoUrl = brandKit?.pngs?.[0] || brandKit?.logo;
    if (logoUrl) {
      const img = await loadImage(logoUrl);
      if (img) {
        const lx = isSignature ? (adjustments.sigLogoX ?? adjustments.logoX) : adjustments.logoX;
        const ly = isSignature ? (adjustments.sigLogoY ?? adjustments.logoY) : adjustments.logoY;
        const lsx = isSignature ? (adjustments.sigLogoScaleX ?? adjustments.logoScaleX) : adjustments.logoScaleX;
        const lsy = isSignature ? (adjustments.sigLogoScaleY ?? adjustments.logoScaleY) : adjustments.logoScaleY;
        const boxW = logoEl.width * (lsx / 100);
        const boxH = logoEl.height * (lsy / 100);
        const boxX = logoEl.x + lx;
        const boxY = logoEl.y + ly;
        drawTrimContain(ctx, img, boxX, boxY, boxW, boxH, 0.6);
      }
    }
  }

  if (mascotEl) {
    const mascotUrl = brandKit?.pngs?.[2] || brandKit?.mascot;
    if (mascotUrl) {
      const img = await loadImage(mascotUrl);
      if (img) {
        const mx = isSignature ? (adjustments.sigMascotX ?? adjustments.mascotX) : adjustments.mascotX;
        const my = isSignature ? (adjustments.sigMascotY ?? adjustments.mascotY) : adjustments.mascotY;
        const msx = isSignature ? (adjustments.sigMascotScaleX ?? adjustments.mascotScaleX) : adjustments.mascotScaleX;
        const msy = isSignature ? (adjustments.sigMascotScaleY ?? adjustments.mascotScaleY) : adjustments.mascotScaleY;
        drawTrimContain(ctx, img, mascotEl.x + mx, mascotEl.y + my, mascotEl.width * (msx / 100), mascotEl.height * (msy / 100), 0.6);
      }
    }
  }

  return canvas.toDataURL("image/png");
}

// ─── Generate All Pages ──────────────────────────────────────────

export interface VideoPages {
  pages: string[];
  overlayPages: string[];
  frameOverlayPages: string[];
  preImageOverlayPages: string[];
  logoOverlayPages: string[];
  fullPages: string[];
}

export async function generateAllVideoPages(
  template: VideoTemplateData,
  pageTexts: string[],
  brandKit: any,
  searchedImages: string[],
  adjustments: ElementAdjustments = defaultAdjustments,
  pageTextAdjustments?: PageTextAdjustment[],
  pageImageAdjustments?: PageImageAdjustment[],
): Promise<VideoPages> {
  const tw = template.width || 1080;
  const th = template.height || 1920;
  const bgColor = template.backgroundColor || "#1a1a2e";

  // Load font
  const fontFamily = brandKit?.font || brandKit?.fontFamily || "Arial";
  await loadGoogleFont(fontFamily);

  const pages: string[] = [];
  const overlayPages: string[] = [];
  const frameOverlayPages: string[] = [];
  const preImageOverlayPages: string[] = [];
  const logoOverlayPages: string[] = [];
  const fullPages: string[] = [];

  const buildPageSet = async (
    elements: CanvasElement[],
    text: string,
    isSignature: boolean,
    bgImage: string | undefined,
    textAdj: PageTextAdjustment,
    imageAdj: PageImageAdjustment
  ) => {
    const hasTextLayer = elements.some((el) => el.type === "text" || el.type === "contact");
    const hasLogoLayer = elements.some((el) => el.type === "logo" || el.type === "mascot");
    const hasFrameLayer = elements.some(
      (el) =>
        (!["image", "text", "contact", "logo", "mascot"].includes(el.type)) ||
        (el.type === "image" && (el.borderWidth ?? 0) > 0)
    );

    let basePage = await generatePageImage(
      tw,
      th,
      bgColor,
      elements,
      text,
      brandKit,
      isSignature,
      bgImage,
      adjustments,
      textAdj,
      imageAdj,
      false,
      true,
      true
    );

    let textOverlay = await generatePageImage(
      tw,
      th,
      bgColor,
      elements,
      text,
      brandKit,
      isSignature,
      undefined,
      adjustments,
      textAdj,
      imageAdj,
      true,
      true,
      false
    );

    const preImageOverlay = await generatePageImage(
      tw,
      th,
      bgColor,
      elements,
      "",
      brandKit,
      isSignature,
      undefined,
      adjustments,
      textAdj,
      imageAdj,
      true,
      true,
      true,
      "before-image"
    );

    let frameOverlay = await generatePageImage(
      tw,
      th,
      bgColor,
      elements,
      "",
      brandKit,
      isSignature,
      undefined,
      adjustments,
      textAdj,
      imageAdj,
      true,
      true,
      true,
      "after-image"
    );

    let logoOverlay = await generateLogoOverlay(tw, th, elements, brandKit, isSignature, adjustments);

    const needsTextFallback = hasTextLayer && !textOverlay;
    const needsLogoFallback = hasLogoLayer && !logoOverlay;

    if (needsTextFallback || needsLogoFallback) {
      basePage = await generatePageImage(
        tw,
        th,
        bgColor,
        elements,
        text,
        brandKit,
        isSignature,
        bgImage,
        adjustments,
        textAdj,
        imageAdj,
        false,
        !needsLogoFallback,
        !needsTextFallback
      );
    }

    const missingText = hasTextLayer && !textOverlay;
    const missingFrame = hasFrameLayer && !frameOverlay;
    const missingLogo = hasLogoLayer && !logoOverlay;
    const missingAnyTopLayer = missingText || missingFrame || missingLogo;

    if (missingAnyTopLayer) {
      // Only generate combined fallback for layers that actually failed
      const combinedTopOverlay = await generatePageImage(
        tw,
        th,
        bgColor,
        elements,
        text,
        brandKit,
        isSignature,
        undefined,
        adjustments,
        textAdj,
        imageAdj,
        true,
        false,
        false,
        "all",
        true
      );

      if (combinedTopOverlay) {
        // Use combined overlay for text (which includes all layers)
        // but preserve individually-generated overlays that succeeded
        textOverlay = combinedTopOverlay;
        // Only clear frame/logo if they were already missing
        if (missingFrame) frameOverlay = "";
        if (missingLogo) logoOverlay = "";
      }
    }

    // Generate full composite for thumbnail display
    const fullPage = await generatePageImage(
      tw, th, bgColor, elements, text, brandKit, isSignature,
      bgImage, adjustments, textAdj, imageAdj,
      false, false, false
    );

    return { basePage, textOverlay, preImageOverlay, frameOverlay, logoOverlay, fullPage };
  };

  for (let i = 0; i < pageTexts.length; i++) {
    const text = pageTexts[i];
    const bgImage = searchedImages[i] || undefined;
    const textAdj = pageTextAdjustments?.[i] || defaultPageTextAdjustment;
    const imageAdj = pageImageAdjustments?.[i] || defaultPageImageAdjustment;

    const result = await buildPageSet(template.contentElements, text, false, bgImage, textAdj, imageAdj);

    pages.push(result.basePage);
    overlayPages.push(result.textOverlay);
    preImageOverlayPages.push(result.preImageOverlay);
    frameOverlayPages.push(result.frameOverlay);
    logoOverlayPages.push(result.logoOverlay);
    fullPages.push(result.fullPage);
  }

  const signatureResult = await buildPageSet(
    template.signatureElements,
    "",
    true,
    undefined,
    defaultPageTextAdjustment,
    defaultPageImageAdjustment
  );

  pages.push(signatureResult.basePage);
  overlayPages.push(signatureResult.textOverlay);
  preImageOverlayPages.push(signatureResult.preImageOverlay);
  frameOverlayPages.push(signatureResult.frameOverlay);
  logoOverlayPages.push(signatureResult.logoOverlay);
  fullPages.push(signatureResult.fullPage);

  return { pages, overlayPages, frameOverlayPages, preImageOverlayPages, logoOverlayPages, fullPages };
}
