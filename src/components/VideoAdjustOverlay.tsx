import { useMemo, useRef, useState } from "react";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

export interface VideoCustomOverlay {
  url: string;
  x: number;
  y: number;
  width: number;
  height: number;
  isVideo?: boolean;
}

type ElementType = "rect" | "circle" | "text" | "image" | "logo" | "contact" | "mascot" | "triangle" | "line" | "star" | "diamond" | "hexagon" | "pentagon" | "polkaDots" | "dotsGrid" | "confetti" | "splatter" | "zigzag" | "spiral" | "wave" | "blob" | "arch" | "arrow" | "badge" | "ribbon" | "heart" | "cross" | "cloud" | "speechBubble" | "lightning" | "shield" | "crescent" | "chevron";

interface CanvasElement {
  id?: string;
  type: ElementType;
  x: number;
  y: number;
  width: number;
  height: number;
  fontSize?: number;
  placeholder?: boolean;
}

interface VideoTemplateLike {
  width: number;
  height: number;
  contentElements: CanvasElement[];
  signatureElements: CanvasElement[];
}

type ShapeOverride = { x: number; y: number; width: number; height: number };

type Handle = "nw" | "ne" | "sw" | "se" | "n" | "s" | "e" | "w";
type BasePart = "logo" | "contact" | "mascot" | "text" | "image";
type ShapePart = `shape:${string}`;
type OverlayPart = `overlay:${number}`;
type Part = BasePart | ShapePart | OverlayPart;
type Tone = "primary" | "secondary" | "accent" | "muted" | "warning";

const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));

const handleHasW = (h: Handle) => h === "nw" || h === "sw" || h === "w";
const handleHasE = (h: Handle) => h === "ne" || h === "se" || h === "e";
const handleHasN = (h: Handle) => h === "nw" || h === "ne" || h === "n";
const handleHasS = (h: Handle) => h === "sw" || h === "se" || h === "s";

const handleSignX = (h: Handle) => (handleHasW(h) ? -1 : 1);
const handleSignY = (h: Handle) => (handleHasN(h) ? -1 : 1);

const isShapePart = (p: Part): p is ShapePart => typeof p === "string" && p.startsWith("shape:");
const shapeIdFromPart = (p: ShapePart) => p.slice("shape:".length);
const isOverlayPart = (p: Part): p is OverlayPart => typeof p === "string" && p.startsWith("overlay:");
const overlayIndexFromPart = (p: OverlayPart) => parseInt(p.slice("overlay:".length), 10);


const toneClasses = (tone: Tone) => {
  if (tone === "primary") {
    return {
      border: "border-primary",
      bg: "bg-primary/10",
      handle: "bg-primary",
      badge: "bg-primary text-primary-foreground",
    } as const;
  }

  if (tone === "secondary") {
    return {
      border: "border-secondary",
      bg: "bg-secondary/10",
      handle: "bg-secondary",
      badge: "bg-secondary text-secondary-foreground",
    } as const;
  }

  if (tone === "accent") {
    return {
      border: "border-accent",
      bg: "bg-accent/10",
      handle: "bg-accent",
      badge: "bg-accent text-accent-foreground",
    } as const;
  }

  if (tone === "warning") {
    return {
      border: "border-orange-500",
      bg: "bg-orange-500/10",
      handle: "bg-orange-500",
      badge: "bg-orange-500 text-white",
    } as const;
  }

  return {
    border: "border-muted-foreground",
    bg: "bg-muted-foreground/10",
    handle: "bg-muted-foreground",
    badge: "bg-muted-foreground text-background",
  } as const;
};

export function VideoAdjustOverlay({
  template,
  previewUrl,
  isBusy,
  onCommit,
  isContentPage,

  // Content to render inside boxes
  pageText,
  fontFamily,
  textColor,
  logoUrl,
  contactUrl,
  mascotUrl,

  // Overlay layers (to match preview exactly)
  frameOverlayUrl,
  textOverlayUrl,
  logoOverlayUrl,
  preImageOverlayUrl,
  backgroundImageUrl,
  backgroundVideoUrl,
  backgroundPngUrl,
  backgroundColor,

  logoX,
  logoY,
  logoScaleX,
  logoScaleY,
  setLogoX,
  setLogoY,
  setLogoScaleX,
  setLogoScaleY,

  contactX,
  contactY,
  contactScaleX,
  contactScaleY,
  setContactX,
  setContactY,
  setContactScaleX,
  setContactScaleY,

  mascotX,
  mascotY,
  mascotScaleX,
  mascotScaleY,
  setMascotX,
  setMascotY,
  setMascotScaleX,
  setMascotScaleY,

  textX,
  textY,
  textScale,
  setTextX,
  setTextY,
  setTextScale,

  imageX,
  imageY,
  imageScale,
  setImageX,
  setImageY,
  setImageScale,

  shapeOverrides,
  setShapeOverrides,

  customOverlays,
  setCustomOverlays,
  onAddOverlay,
  onDeleteOverlay,
  photoInteractionMode = "content",
}: {
  template: VideoTemplateLike;
  previewUrl: string | null;
  isBusy?: boolean;
  onCommit?: () => void;
  isContentPage?: boolean;

  pageText?: string;
  fontFamily?: string;
  textColor?: string;
  logoUrl?: string;
  contactUrl?: string;
  mascotUrl?: string;
  frameOverlayUrl?: string;
  textOverlayUrl?: string;
  logoOverlayUrl?: string;
  preImageOverlayUrl?: string;
  backgroundImageUrl?: string;
  backgroundVideoUrl?: string;
  backgroundPngUrl?: string;
  backgroundColor?: string;

  logoX: number;
  logoY: number;
  logoScaleX: number;
  logoScaleY: number;
  setLogoX: (v: number) => void;
  setLogoY: (v: number) => void;
  setLogoScaleX: (v: number) => void;
  setLogoScaleY: (v: number) => void;

  contactX: number;
  contactY: number;
  contactScaleX: number;
  contactScaleY: number;
  setContactX: (v: number) => void;
  setContactY: (v: number) => void;
  setContactScaleX: (v: number) => void;
  setContactScaleY: (v: number) => void;

  mascotX: number;
  mascotY: number;
  mascotScaleX: number;
  mascotScaleY: number;
  setMascotX: (v: number) => void;
  setMascotY: (v: number) => void;
  setMascotScaleX: (v: number) => void;
  setMascotScaleY: (v: number) => void;

  textX: number;
  textY: number;
  textScale: number;
  setTextX: (v: number) => void;
  setTextY: (v: number) => void;
  setTextScale: (v: number) => void;

  imageX?: number;
  imageY?: number;
  imageScale?: number;
  setImageX?: (v: number) => void;
  setImageY?: (v: number) => void;
  setImageScale?: (v: number) => void;

  shapeOverrides?: Record<string, ShapeOverride>;
  setShapeOverrides?: (next: Record<string, ShapeOverride>) => void;

  customOverlays?: VideoCustomOverlay[];
  setCustomOverlays?: (v: VideoCustomOverlay[]) => void;
  onAddOverlay?: (file: File) => void;
  onDeleteOverlay?: (idx: number) => void;
  photoInteractionMode?: "content" | "frame";
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const overlayInputRef = useRef<HTMLInputElement>(null);
  const [active, setActive] = useState<Part>("logo");

  const shapeTypes: ElementType[] = [
    "rect", "circle", "triangle", "line", "star", "diamond", "hexagon", "pentagon",
    "wave", "blob", "arch", "arrow", "badge", "ribbon", "polkaDots", "dotsGrid",
    "confetti", "splatter", "zigzag", "spiral", "heart", "cross", "cloud",
    "speechBubble", "lightning", "shield", "crescent", "chevron",
  ];

  const els = useMemo(() => {
    const currentElements = isContentPage ? template.contentElements : template.signatureElements;
    const logoEl = currentElements.find((e) => e.type === "logo");
    const contactEl = currentElements.find((e) => e.type === "contact");
    const mascotEl = currentElements.find((e) => e.type === "mascot");
    const textEl = currentElements.find((e) => e.type === "text");
    // Image placeholder comes from contentElements always
    const imageEl = template.contentElements.find((e) => e.type === "image");
    const shapes = currentElements
      .filter((e) => !!e.id && shapeTypes.includes(e.type))
      .map((e) => ({ ...e, id: e.id as string }));
    return { logoEl, contactEl, mascotEl, textEl, imageEl, shapes };
  }, [template.contentElements, template.signatureElements, isContentPage]);

  const getRect = (part: Part) => {
    if (part === "logo") {
      if (!els.logoEl) return null;
      return {
        x: els.logoEl.x + logoX,
        y: els.logoEl.y + logoY,
        w: els.logoEl.width * (logoScaleX / 100),
        h: els.logoEl.height * (logoScaleY / 100),
      };
    }

    if (part === "contact") {
      if (!els.contactEl) return null;
      return {
        x: els.contactEl.x + contactX,
        y: els.contactEl.y + contactY,
        w: els.contactEl.width * (contactScaleX / 100),
        h: els.contactEl.height * (contactScaleY / 100),
      };
    }

    if (part === "mascot") {
      if (!els.mascotEl) return null;
      return {
        x: els.mascotEl.x + mascotX,
        y: els.mascotEl.y + mascotY,
        w: els.mascotEl.width * (mascotScaleX / 100),
        h: els.mascotEl.height * (mascotScaleY / 100),
      };
    }

    if (part === "text") {
      if (!els.textEl) return null;
      const scale = textScale / 100;
      // Width stays fixed at original element width so text wraps to more lines
      const w = els.textEl.width;

      // Use canvas to measure actual text width for accurate line wrapping
      const baseFontSize = (els.textEl.fontSize || 48) * scale;
      const lineHeight = baseFontSize * 1.3;
      const maxWidth = els.textEl.width;
      const fontWeight = (els.textEl as any).fontWeight || "normal";
      const fontFamily = (els.textEl as any).fontFamily || "sans-serif";

      let estimatedLines = 1;
      if (pageText) {
        try {
          const measureCanvas = document.createElement("canvas");
          const ctx = measureCanvas.getContext("2d");
          if (ctx) {
            ctx.font = `${fontWeight} ${Math.round(baseFontSize)}px ${fontFamily}`;
            const words = pageText.split(" ");
            let lineWidth = 0;
            for (const word of words) {
              const wordWidth = ctx.measureText(word).width;
              const spaceWidth = ctx.measureText(" ").width;
              if (lineWidth > 0 && lineWidth + spaceWidth + wordWidth > maxWidth) {
                estimatedLines++;
                lineWidth = wordWidth;
              } else {
                lineWidth += (lineWidth > 0 ? spaceWidth : 0) + wordWidth;
              }
            }
          }
        } catch {
          const avgCharWidth = baseFontSize * 0.6;
          const words = pageText.split(" ");
          let lineWidth = 0;
          for (const word of words) {
            const wordWidth = word.length * avgCharWidth;
            if (lineWidth > 0 && lineWidth + avgCharWidth + wordWidth > maxWidth) {
              estimatedLines++;
              lineWidth = wordWidth;
            } else {
              lineWidth += (lineWidth > 0 ? avgCharWidth : 0) + wordWidth;
            }
          }
        }
      }

      const estimatedH = Math.max(estimatedLines * lineHeight, els.textEl.height * scale);

      return {
        x: els.textEl.x + textX,
        y: els.textEl.y + textY,
        w,
        h: estimatedH,
      };
    }

    if (part === "image") {
      if (!els.imageEl) return null;
      // Check for shape override on image element (frame mode)
      const imgId = els.imageEl.id || "__image__";
      const imgOv = shapeOverrides?.[imgId];
      if (imgOv) {
        return { x: imgOv.x, y: imgOv.y, w: imgOv.width, h: imgOv.height };
      }
      return {
        x: els.imageEl.x,
        y: els.imageEl.y,
        w: els.imageEl.width,
        h: els.imageEl.height,
      };
    }

    if (isShapePart(part)) {
      const id = shapeIdFromPart(part);
      const base = els.shapes.find((s) => s.id === id);
      if (!base) return null;
      const ov = shapeOverrides?.[id];
      return {
        x: ov?.x ?? base.x,
        y: ov?.y ?? base.y,
        w: ov?.width ?? base.width,
        h: ov?.height ?? base.height,
      };
    }

    if (isOverlayPart(part)) {
      const idx = overlayIndexFromPart(part);
      const ov = customOverlays?.[idx];
      if (!ov) return null;
      return { x: ov.x, y: ov.y, w: ov.width, h: ov.height };
    }

    return null;
  };

  const startRef = useRef<
    | null
    | {
        mode: "move" | "resize";
        part: Part;
        handle?: Handle;
        startClientX: number;
        startClientY: number;
        start: {
          logoX: number;
          logoY: number;
          logoScaleX: number;
          logoScaleY: number;
          logoW: number;
          logoH: number;
          contactX: number;
          contactY: number;
          contactScaleX: number;
          contactScaleY: number;
          contactW: number;
          contactH: number;
          mascotX: number;
          mascotY: number;
          mascotScaleX: number;
          mascotScaleY: number;
          mascotW: number;
          mascotH: number;
          textX: number;
          textY: number;
          textScale: number;
          textW: number;
          textH: number;
          imageX: number;
          imageY: number;
          imageScale: number;
          imageW: number;
          imageH: number;
          shapeRect?: ShapeOverride;
          overlayRect?: { x: number; y: number; width: number; height: number };
        };
      }
  >(null);

  const begin = (e: React.PointerEvent, part: Part, mode: "move" | "resize", handle?: Handle) => {
    e.preventDefault();
    e.stopPropagation();

    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // ignore
    }

    const r = containerRef.current?.getBoundingClientRect();
    if (!r) return;

    const logoW = els.logoEl ? els.logoEl.width * (logoScaleX / 100) : 0;
    const logoH = els.logoEl ? els.logoEl.height * (logoScaleY / 100) : 0;
    const contactW = els.contactEl ? els.contactEl.width * (contactScaleX / 100) : 0;
    const contactH = els.contactEl ? els.contactEl.height * (contactScaleY / 100) : 0;
    const mascotW = els.mascotEl ? els.mascotEl.width * (mascotScaleX / 100) : 0;
    const mascotH = els.mascotEl ? els.mascotEl.height * (mascotScaleY / 100) : 0;
    const textW = els.textEl ? els.textEl.width : 0;
    const textH = els.textEl ? els.textEl.height * (textScale / 100) : 0;
    const currentImageScale = imageScale ?? 100;
    const imgElW = els.imageEl?.width || template.width;
    const imgElH = els.imageEl?.height || template.height;
    const imageW = imgElW * (currentImageScale / 100);
    const imageH = imgElH * (currentImageScale / 100);

    let shapeRect: ShapeOverride | undefined;
    if (isShapePart(part)) {
      const r = getRect(part);
      if (r) shapeRect = { x: r.x, y: r.y, width: r.w, height: r.h };
    }
    if (part === "image") {
      const r = getRect("image");
      if (r) shapeRect = { x: r.x, y: r.y, width: r.w, height: r.h };
    }

    let overlayRect: { x: number; y: number; width: number; height: number } | undefined;
    if (isOverlayPart(part)) {
      const r = getRect(part);
      if (r) overlayRect = { x: r.x, y: r.y, width: r.w, height: r.h };
    }

    setActive(part);
    startRef.current = {
      mode,
      part,
      handle,
      startClientX: e.clientX,
      startClientY: e.clientY,
      start: {
        logoX,
        logoY,
        logoScaleX,
        logoScaleY,
        logoW,
        logoH,
        contactX,
        contactY,
        contactScaleX,
        contactScaleY,
        contactW,
        contactH,
        mascotX,
        mascotY,
        mascotScaleX,
        mascotScaleY,
        mascotW,
        mascotH,
        textX,
        textY,
        textScale,
        textW,
        textH,
        imageX: imageX ?? 0,
        imageY: imageY ?? 0,
        imageScale: currentImageScale,
        imageW,
        imageH,
        shapeRect,
        overlayRect,
      },
    };

    const onMove = (ev: PointerEvent) => {
      const s = startRef.current;
      const rect = containerRef.current?.getBoundingClientRect();
      if (!s || !rect) return;

      const dxClient = ev.clientX - s.startClientX;
      const dyClient = ev.clientY - s.startClientY;

      const dx = (dxClient / rect.width) * template.width;
      const dy = (dyClient / rect.height) * template.height;

      if (s.part === "logo") {
        if (s.mode === "move") {
          setLogoX(s.start.logoX + dx);
          setLogoY(s.start.logoY + dy);
          return;
        }

        const baseW = els.logoEl?.width || 1;
        const baseH = els.logoEl?.height || 1;
        const h = s.handle as Handle;
        const isVerticalHandle = h === "n" || h === "s";
        const isHorizontalHandle = h === "e" || h === "w";

        if (isHorizontalHandle) {
          const signedDx = handleSignX(h) * dx;
          const newW = clamp(s.start.logoW + signedDx, baseW * 0.25, baseW * 3);
          const newScaleX = clamp((newW / baseW) * 100, 25, 300);
          setLogoScaleX(newScaleX);
          if (handleHasW(h)) setLogoX(s.start.logoX + dx);
        } else if (isVerticalHandle) {
          const signedDy = handleSignY(h) * dy;
          const newH = clamp(s.start.logoH + signedDy, baseH * 0.25, baseH * 3);
          const newScaleY = clamp((newH / baseH) * 100, 25, 300);
          setLogoScaleY(newScaleY);
          if (handleHasN(h)) setLogoY(s.start.logoY + dy);
        } else {
          const signedDx = handleSignX(h) * dx;
          const signedDy = handleSignY(h) * dy;
          const newW = clamp(s.start.logoW + signedDx, baseW * 0.25, baseW * 3);
          const newH = clamp(s.start.logoH + signedDy, baseH * 0.25, baseH * 3);
          const newScaleX = clamp((newW / baseW) * 100, 25, 300);
          const newScaleY = clamp((newH / baseH) * 100, 25, 300);
          setLogoScaleX(newScaleX);
          setLogoScaleY(newScaleY);
          if (handleHasW(h)) setLogoX(s.start.logoX + dx);
          if (handleHasN(h)) setLogoY(s.start.logoY + dy);
        }
        return;
      }

      if (s.part === "contact") {
        if (s.mode === "move") {
          setContactX(s.start.contactX + dx);
          setContactY(s.start.contactY + dy);
          return;
        }

        const baseW = els.contactEl?.width || 1;
        const baseH = els.contactEl?.height || 1;
        const h = s.handle as Handle;
        const isVerticalHandle = h === "n" || h === "s";
        const isHorizontalHandle = h === "e" || h === "w";

        if (isHorizontalHandle) {
          const signedDx = handleSignX(h) * dx;
          const newW = clamp(s.start.contactW + signedDx, baseW * 0.25, baseW * 3);
          const newScaleX = clamp((newW / baseW) * 100, 25, 300);
          setContactScaleX(newScaleX);
          if (handleHasW(h)) setContactX(s.start.contactX + dx);
        } else if (isVerticalHandle) {
          const signedDy = handleSignY(h) * dy;
          const newH = clamp(s.start.contactH + signedDy, baseH * 0.25, baseH * 3);
          const newScaleY = clamp((newH / baseH) * 100, 25, 300);
          setContactScaleY(newScaleY);
          if (handleHasN(h)) setContactY(s.start.contactY + dy);
        } else {
          const signedDx = handleSignX(h) * dx;
          const signedDy = handleSignY(h) * dy;
          const newW = clamp(s.start.contactW + signedDx, baseW * 0.25, baseW * 3);
          const newH = clamp(s.start.contactH + signedDy, baseH * 0.25, baseH * 3);
          const newScaleX = clamp((newW / baseW) * 100, 25, 300);
          const newScaleY = clamp((newH / baseH) * 100, 25, 300);
          setContactScaleX(newScaleX);
          setContactScaleY(newScaleY);
          if (handleHasW(h)) setContactX(s.start.contactX + dx);
          if (handleHasN(h)) setContactY(s.start.contactY + dy);
        }
        return;
      }

      if (s.part === "mascot") {
        if (s.mode === "move") {
          setMascotX(s.start.mascotX + dx);
          setMascotY(s.start.mascotY + dy);
          return;
        }

        const baseW = els.mascotEl?.width || 1;
        const baseH = els.mascotEl?.height || 1;
        const h = s.handle as Handle;
        const isVerticalHandle = h === "n" || h === "s";
        const isHorizontalHandle = h === "e" || h === "w";

        if (isHorizontalHandle) {
          const signedDx = handleSignX(h) * dx;
          const newW = clamp(s.start.mascotW + signedDx, baseW * 0.25, baseW * 3);
          const newScaleX = clamp((newW / baseW) * 100, 25, 300);
          setMascotScaleX(newScaleX);
          if (handleHasW(h)) setMascotX(s.start.mascotX + dx);
        } else if (isVerticalHandle) {
          const signedDy = handleSignY(h) * dy;
          const newH = clamp(s.start.mascotH + signedDy, baseH * 0.25, baseH * 3);
          const newScaleY = clamp((newH / baseH) * 100, 25, 300);
          setMascotScaleY(newScaleY);
          if (handleHasN(h)) setMascotY(s.start.mascotY + dy);
        } else {
          const signedDx = handleSignX(h) * dx;
          const signedDy = handleSignY(h) * dy;
          const newW = clamp(s.start.mascotW + signedDx, baseW * 0.25, baseW * 3);
          const newH = clamp(s.start.mascotH + signedDy, baseH * 0.25, baseH * 3);
          const newScaleX = clamp((newW / baseW) * 100, 25, 300);
          const newScaleY = clamp((newH / baseH) * 100, 25, 300);
          setMascotScaleX(newScaleX);
          setMascotScaleY(newScaleY);
          if (handleHasW(h)) setMascotX(s.start.mascotX + dx);
          if (handleHasN(h)) setMascotY(s.start.mascotY + dy);
        }
        return;
      }

      if (s.part === "text") {
        if (s.mode === "move") {
          setTextX(s.start.textX + dx);
          setTextY(s.start.textY + dy);
          return;
        }

        // Text resize: width stays fixed, font size changes via height
        const baseH = els.textEl?.height || 1;
        const h = s.handle as Handle;

        const signedDy = handleSignY(h) * dy;
        const isHorizontalHandle = h === "e" || h === "w";
        const delta = isHorizontalHandle ? handleSignX(h) * dx : signedDy;
        
        const newH = clamp(s.start.textH + delta, baseH * 0.25, baseH * 3);
        const newScale = clamp((newH / baseH) * 100, 25, 300);
        setTextScale(newScale);
        
        if (handleHasN(h)) setTextY(s.start.textY + dy);
        return;
      }

      if (s.part === "image" && setImageX && setImageY && setImageScale) {
        const isFrameMode = photoInteractionMode === "frame";

        if (s.mode === "move") {
          if (isFrameMode && setShapeOverrides) {
            const imgId = els.imageEl?.id || "__image__";
            const startRect = s.start.shapeRect || {
              x: els.imageEl?.x || 0,
              y: els.imageEl?.y || 0,
              width: els.imageEl?.width || 100,
              height: els.imageEl?.height || 100,
            };
            setShapeOverrides({
              ...(shapeOverrides || {}),
              [imgId]: {
                x: startRect.x + dx,
                y: startRect.y + dy,
                width: startRect.width,
                height: startRect.height,
              },
            });
          } else {
            setImageX(s.start.imageX + dx);
            setImageY(s.start.imageY + dy);
          }
          return;
        }

        if (isFrameMode && setShapeOverrides) {
          const imgId = els.imageEl?.id || "__image__";
          const startRect = s.start.shapeRect || {
            x: els.imageEl?.x || 0,
            y: els.imageEl?.y || 0,
            width: els.imageEl?.width || 100,
            height: els.imageEl?.height || 100,
          };
          const h = s.handle as Handle;
          const minSize = 50;
          let newX = startRect.x;
          let newY = startRect.y;
          let newW = startRect.width;
          let newH = startRect.height;
          if (handleHasE(h)) newW = Math.max(minSize, startRect.width + dx);
          if (handleHasS(h)) newH = Math.max(minSize, startRect.height + dy);
          if (handleHasW(h)) { newW = Math.max(minSize, startRect.width - dx); newX = startRect.x + (startRect.width - newW); }
          if (handleHasN(h)) { newH = Math.max(minSize, startRect.height - dy); newY = startRect.y + (startRect.height - newH); }
          setShapeOverrides({ ...(shapeOverrides || {}), [imgId]: { x: newX, y: newY, width: newW, height: newH } });
        } else {
          const h = s.handle as Handle;
          const signedDx = handleSignX(h) * dx;
          const signedDy = handleSignY(h) * dy;
          const delta = Math.abs(signedDx) > Math.abs(signedDy) ? signedDx : signedDy;
          const imgElW = els.imageEl?.width || template.width;
          const scaleDelta = (delta / imgElW) * 100;
          const newScale = clamp(s.start.imageScale + scaleDelta, 50, 300);
          setImageScale(newScale);
        }
      }

      if (isShapePart(s.part) && setShapeOverrides) {
        const id = shapeIdFromPart(s.part);
        const startRect = s.start.shapeRect;
        if (!startRect) return;

        const minSize = 20;

        if (s.mode === "move") {
          const next: ShapeOverride = {
            x: startRect.x + dx,
            y: startRect.y + dy,
            width: startRect.width,
            height: startRect.height,
          };
          setShapeOverrides({ ...(shapeOverrides || {}), [id]: next });
          return;
        }

        const h = s.handle || "se";
        let newX = startRect.x;
        let newY = startRect.y;
        let newW = startRect.width;
        let newH = startRect.height;

        if (handleHasE(h)) newW = Math.max(minSize, startRect.width + dx);
        if (handleHasS(h)) newH = Math.max(minSize, startRect.height + dy);
        if (handleHasW(h)) {
          newW = Math.max(minSize, startRect.width - dx);
          newX = startRect.x + (startRect.width - newW);
        }
        if (handleHasN(h)) {
          newH = Math.max(minSize, startRect.height - dy);
          newY = startRect.y + (startRect.height - newH);
        }

        setShapeOverrides({ ...(shapeOverrides || {}), [id]: { x: newX, y: newY, width: newW, height: newH } });
      }

      if (isOverlayPart(s.part) && setCustomOverlays && customOverlays) {
        const idx = overlayIndexFromPart(s.part as OverlayPart);
        const startRect = s.start.overlayRect;
        if (!startRect) return;

        const minSize = 30;

        if (s.mode === "move") {
          const updated = [...customOverlays];
          updated[idx] = { ...updated[idx], x: startRect.x + dx, y: startRect.y + dy };
          setCustomOverlays(updated);
          return;
        }

        const h = s.handle || "se";
        let newX = startRect.x;
        let newY = startRect.y;
        let newW = startRect.width;
        let newH = startRect.height;

        if (handleHasE(h)) newW = Math.max(minSize, startRect.width + dx);
        if (handleHasS(h)) newH = Math.max(minSize, startRect.height + dy);
        if (handleHasW(h)) {
          newW = Math.max(minSize, startRect.width - dx);
          newX = startRect.x + (startRect.width - newW);
        }
        if (handleHasN(h)) {
          newH = Math.max(minSize, startRect.height - dy);
          newY = startRect.y + (startRect.height - newH);
        }

        const updated = [...customOverlays];
        updated[idx] = { ...updated[idx], x: newX, y: newY, width: newW, height: newH };
        setCustomOverlays(updated);
      }
    };

    const cleanup = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };

    const onUp = () => {
      cleanup();
      startRef.current = null;
      void onCommit?.();
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
  };

  const Box = ({
    part,
    label,
    tone,
    children,
  }: {
    part: Part;
    label: string;
    tone: Tone;
    children?: React.ReactNode;
  }) => {
    const rect = getRect(part);
    if (!rect) return null;

    const left = (rect.x / template.width) * 100;
    const top = (rect.y / template.height) * 100;
    const width = (rect.w / template.width) * 100;
    const height = (rect.h / template.height) * 100;

    const isActive = active === part;
    const t = toneClasses(tone);

    const HandleDot = ({ h }: { h: Handle }) => {
      const pos =
        h === "nw"
          ? "-left-1.5 -top-1.5"
          : h === "ne"
            ? "-right-1.5 -top-1.5"
            : h === "sw"
              ? "-left-1.5 -bottom-1.5"
              : h === "se"
                ? "-right-1.5 -bottom-1.5"
                : h === "n"
                  ? "left-1/2 -top-1.5 -translate-x-1/2"
                  : h === "s"
                    ? "left-1/2 -bottom-1.5 -translate-x-1/2"
                    : h === "w"
                      ? "-left-1.5 top-1/2 -translate-y-1/2"
                      : "-right-1.5 top-1/2 -translate-y-1/2";

      const cursor =
        h === "n" || h === "s"
          ? "cursor-ns-resize"
          : h === "e" || h === "w"
            ? "cursor-ew-resize"
            : h === "nw" || h === "se"
              ? "cursor-nwse-resize"
              : "cursor-nesw-resize";

      return (
        <button
          type="button"
          aria-label={`Redimensionar ${label}`}
          className={cn(
            "absolute z-20 h-3.5 w-3.5 rounded-sm border-2 border-background",
            pos,
            cursor,
            t.handle
          )}
          onPointerDown={(e) => begin(e, part, "resize", h)}
        />
      );
    };

    return (
      <div
        className={cn(
          "absolute rounded-md border-2 border-dashed touch-none cursor-move overflow-hidden",
          isActive ? cn(t.border, t.bg) : "border-border/70 hover:border-primary/70"
        )}
        style={{
          left: `${left}%`,
          top: `${top}%`,
          width: `${width}%`,
          height: `${height}%`,
        }}
        onPointerDown={(e) => begin(e, part, "move")}
      >
        {/* Content preview inside box */}
        {children && (
          <div className={cn(
            "absolute inset-0 pointer-events-none overflow-hidden",
            part === "text" ? "flex items-start justify-start" : "flex items-center justify-center"
          )}>
            {children}
          </div>
        )}

        <div
          className={cn(
            "absolute -top-6 left-0 rounded border px-1.5 py-0.5 text-[10px] shadow-sm z-10",
            t.badge
          )}
        >
          {label}
        </div>

        {isActive && (
          <>
            <HandleDot h="nw" />
            <HandleDot h="ne" />
            <HandleDot h="sw" />
            <HandleDot h="se" />
            <HandleDot h="n" />
            <HandleDot h="s" />
            <HandleDot h="w" />
            <HandleDot h="e" />
          </>
        )}
      </div>
    );
  };

  const effectiveFrameOverlayUrl =
    (frameOverlayUrl && frameOverlayUrl !== "")
      ? frameOverlayUrl
      : ((textOverlayUrl && textOverlayUrl !== "") ? textOverlayUrl : "");

  return (
    <div
      ref={containerRef}
      className="relative mx-auto w-full aspect-[9/16] overflow-hidden rounded-lg border touch-none"
      style={{ containerType: "size", ...(backgroundPngUrl ? { backgroundImage: `url(${backgroundPngUrl})`, backgroundSize: "cover", backgroundPosition: "center" } : { backgroundColor: backgroundColor || undefined }) }}
    >
      {previewUrl ? (
        <>
          {/* Base page image */}
          <img
            src={previewUrl}
            alt="Prévia do vídeo"
            className={cn(
              "absolute inset-0 h-full w-full object-contain",
              isBusy ? "opacity-80" : "opacity-100"
            )}
            draggable={false}
          />
          {/* Pre-image overlay (shapes before image) */}
          {preImageOverlayUrl && preImageOverlayUrl !== "" && (
            <img src={preImageOverlayUrl} alt="" className="absolute inset-0 h-full w-full object-contain pointer-events-none z-[1]" draggable={false} />
          )}
          {/* Static text/logo overlays hidden — content rendered inside interactive boxes instead */}
        </>
      ) : (
        <div className="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground">
          Sem prévia
        </div>
      )}

      {/* Image/video background content - BEHIND overlays */}
      {isContentPage && setImageX && els.imageEl && (() => {
        const rect = getRect("image");
        if (!rect) return null;
        const left = (rect.x / template.width) * 100;
        const top = (rect.y / template.height) * 100;
        const width = (rect.w / template.width) * 100;
        const height = (rect.h / template.height) * 100;
        const scale = (imageScale ?? 100) / 100;
        const panXPx = imageX ?? 0;
        const panYPx = imageY ?? 0;
        const mediaStyle: React.CSSProperties = {
          transform: `scale(${scale}) translate(${(panXPx / els.imageEl.width) * 100}%, ${(panYPx / els.imageEl.height) * 100}%)`,
          transformOrigin: "center center",
        };
        return (
          <div
            className="absolute overflow-hidden z-[2] pointer-events-none"
            style={{ left: `${left}%`, top: `${top}%`, width: `${width}%`, height: `${height}%` }}
          >
            <div className="absolute inset-0" style={mediaStyle}>
              {/* Always show image as base layer */}
              {backgroundImageUrl && (
                <img src={backgroundImageUrl} alt="Fundo" className="absolute inset-0 w-full h-full object-cover" draggable={false} />
              )}
              {/* Video on top - hides itself on error so image shows through */}
              {backgroundVideoUrl && (
                <video
                  src={backgroundVideoUrl}
                  className="absolute inset-0 w-full h-full object-cover"
                  muted loop autoPlay playsInline crossOrigin="anonymous" draggable={false}
                  onError={(e) => { (e.target as HTMLVideoElement).style.display = 'none'; }}
                />
              )}
            </div>
          </div>
        );
      })()}

      {/* Frame overlay layer (must stay above image/video media) */}
      {previewUrl && effectiveFrameOverlayUrl && (
        <img src={effectiveFrameOverlayUrl} alt="" className="absolute inset-0 h-full w-full object-contain pointer-events-none z-[3]" draggable={false} />
      )}

      <div className="absolute inset-0 z-[5]">
        {/* Render all elements in template order */}
        {(() => {
          const currentElements = isContentPage ? template.contentElements : template.signatureElements;
          const shapeLabels: Record<string, string> = {
            rect: "Retângulo", circle: "Círculo", triangle: "Triângulo", line: "Linha",
            star: "Estrela", diamond: "Losango", hexagon: "Hexágono", pentagon: "Pentágono",
            wave: "Onda", blob: "Blob", arch: "Arco", arrow: "Seta", badge: "Badge",
            ribbon: "Fita", polkaDots: "Bolinhas", dotsGrid: "Pontos", confetti: "Confeti",
            splatter: "Splatter", zigzag: "Zigzag", spiral: "Espiral", heart: "Coração",
            cross: "Cruz", cloud: "Nuvem", speechBubble: "Balão", lightning: "Raio",
            shield: "Escudo", crescent: "Lua", chevron: "Seta",
          };
          let shapeCounter = 0;
          return currentElements.map((el, idx) => {
            if (el.type === "image" && isContentPage && setImageX && els.imageEl) {
              return <Box key={`el-${idx}`} part="image" label="Foto (zoom)" tone="warning" />;
            }
            if (el.type === "text" && isContentPage && els.textEl) {
              return (
                <Box key={`el-${idx}`} part="text" label="Texto" tone="muted">
                  {pageText && (
                    <p
                      className="w-full leading-tight break-words"
                      style={{
                        fontFamily: fontFamily || "sans-serif",
                        color: textColor || "#ffffff",
                        fontSize: `${((els.textEl.fontSize || 48) * (textScale / 100)) / (template.height / 100)}cqh`,
                        fontWeight: (els.textEl as any).fontWeight || "normal",
                        textAlign: (els.textEl as any).textAlign || "left",
                      }}
                    >
                      {pageText}
                    </p>
                  )}
                </Box>
              );
            }
            if (el.type === "logo" && els.logoEl) {
              return (
                <Box key={`el-${idx}`} part="logo" label="Logo" tone="primary">
                  {logoUrl && <img src={logoUrl} alt="Logo" className="w-full h-full object-contain" draggable={false} />}
                </Box>
              );
            }
            if (el.type === "contact" && els.contactEl) {
              return (
                <Box key={`el-${idx}`} part="contact" label="Contato" tone="accent">
                  {contactUrl && <img src={contactUrl} alt="Contato" className="w-full h-full object-contain" draggable={false} />}
                </Box>
              );
            }
            if (el.type === "mascot" && els.mascotEl) {
              return (
                <Box key={`el-${idx}`} part="mascot" label="Mascote" tone="secondary">
                  {mascotUrl && <img src={mascotUrl} alt="Mascote" className="w-full h-full object-contain" draggable={false} />}
                </Box>
              );
            }
            if (el.id && shapeTypes.includes(el.type)) {
              shapeCounter++;
              return (
                <Box
                  key={`el-${idx}`}
                  part={`shape:${el.id}`}
                  label={`${shapeLabels[el.type] || el.type} ${shapeCounter}`}
                  tone="muted"
                />
              );
            }
            return null;
          });
        })()}

        {/* Custom overlay boxes */}
        {customOverlays?.map((ov, idx) => (
          <Box
            key={`overlay-${idx}`}
            part={`overlay:${idx}` as OverlayPart}
            label={`Extra ${idx + 1}${ov.isVideo ? " (MP4)" : ""}`}
            tone="warning"
          >
            {ov.isVideo ? (
              <video src={ov.url} className="w-full h-full object-contain" muted loop autoPlay playsInline draggable={false} />
            ) : (
              <img src={ov.url} alt={`Extra ${idx + 1}`} className="w-full h-full object-contain" draggable={false} />
            )}
          </Box>
        ))}
        {/* Add overlay button inside page */}
        {onAddOverlay && (
          <div className="absolute bottom-3 right-3 flex gap-1.5" style={{ zIndex: 50 }}>
            <input
              ref={overlayInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp,video/mp4"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) {
                  onAddOverlay(file);
                  e.target.value = "";
                }
              }}
            />
            <Button
              size="sm"
              variant="secondary"
              className="h-8 gap-1.5 rounded-full shadow-lg border border-border px-3 text-xs font-medium"
              title="Adicionar PNG/MP4 extra"
              onClick={() => overlayInputRef.current?.click()}
            >
              <Plus className="h-4 w-4" />
              Extra
            </Button>
            {active && isOverlayPart(active) && onDeleteOverlay && (
              <Button
                size="sm"
                variant="destructive"
                className="h-8 rounded-full shadow-lg px-3 text-xs font-medium gap-1"
                title="Remover overlay selecionado"
                onClick={() => onDeleteOverlay(overlayIndexFromPart(active))}
              >
                <Trash2 className="h-3.5 w-3.5" />
                Remover
              </Button>
            )}
          </div>
        )}
      </div>

      {isBusy && (
        <div className="absolute inset-0 flex items-center justify-center bg-background/20 pointer-events-none">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      )}
    </div>
  );
}
