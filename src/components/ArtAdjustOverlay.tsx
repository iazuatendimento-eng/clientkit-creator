import { useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";

type ElementType = "rect" | "circle" | "text" | "image" | "logo" | "contact" | "mascot" | "triangle" | "line" | "star" | "diamond" | "hexagon" | "pentagon" | "wave" | "blob" | "arch" | "arrow" | "badge" | "ribbon" | "polkaDots" | "dotsGrid" | "confetti" | "splatter" | "zigzag" | "spiral" | "heart" | "cross" | "cloud" | "speechBubble" | "lightning" | "shield" | "crescent";

interface CanvasElement {
  id?: string;
  type: ElementType;
  x: number;
  y: number;
  width: number;
  height: number;
  placeholder?: boolean;
}

interface MasterTemplateLike {
  width: number;
  height: number;
  elements: CanvasElement[];
}

type ShapeOverride = { x: number; y: number; width: number; height: number };

type Handle = "nw" | "ne" | "sw" | "se" | "n" | "s" | "e" | "w";

type BasePart = "photo" | "logo" | "text" | "contact" | "mascot" | "bg";

type ShapePart = `shape:${string}`;

type Part = BasePart | ShapePart;

const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));

// Position offsets are unclamped — elements can move freely beyond canvas bounds

const handleHasW = (h: Handle) => h === "nw" || h === "sw" || h === "w";
const handleHasE = (h: Handle) => h === "ne" || h === "se" || h === "e";
const handleHasN = (h: Handle) => h === "nw" || h === "ne" || h === "n";
const handleHasS = (h: Handle) => h === "sw" || h === "se" || h === "s";

const handleSignX = (h: Handle) => (handleHasW(h) ? -1 : 1);
const handleSignY = (h: Handle) => (handleHasN(h) ? -1 : 1);

const isShapePart = (p: Part): p is ShapePart => typeof p === "string" && p.startsWith("shape:");
const shapeIdFromPart = (p: ShapePart) => p.slice("shape:".length);

export function ArtAdjustOverlay({
  template,
  onDragEnd,
  previewUrl,
  isBusy,
  photoOffsetX,
  photoOffsetY,
  photoScale,
  photoFrame,
  setPhotoOffsetX,
  setPhotoOffsetY,
  setPhotoScale,
  setPhotoFrame,
  logoX,
  logoY,
  logoScaleX,
  logoScaleY,
  setLogoX,
  setLogoY,
  setLogoScaleX,
  setLogoScaleY,
  textX,
  textY,
  textFontSize,
  setTextX,
  setTextY,
  setTextFontSize,
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
  shapeOverrides,
  setShapeOverrides,
  bgOffsetX,
  bgOffsetY,
  bgScale,
  setBgOffsetX,
  setBgOffsetY,
  setBgScale,
  hasBackgroundImage,
}: {
  template: MasterTemplateLike;
  previewUrl: string | null;
  isBusy?: boolean;
  onDragEnd?: () => void;

  photoOffsetX: number;
  photoOffsetY: number;
  photoScale: number;
  photoFrame?: ShapeOverride | null;
  setPhotoOffsetX: (v: number) => void;
  setPhotoOffsetY: (v: number) => void;
  setPhotoScale: (v: number) => void;
  setPhotoFrame?: (v: ShapeOverride | null) => void;

  logoX: number;
  logoY: number;
  logoScaleX: number;
  logoScaleY: number;
  setLogoX: (v: number) => void;
  setLogoY: (v: number) => void;
  setLogoScaleX: (v: number) => void;
  setLogoScaleY: (v: number) => void;

  textX: number;
  textY: number;
  textFontSize: number;
  setTextX: (v: number) => void;
  setTextY: (v: number) => void;
  setTextFontSize: (v: number) => void;

  contactX: number;
  contactY: number;
  contactScaleX: number;
  contactScaleY: number;
  setContactX: (v: number) => void;
  setContactY: (v: number) => void;
  setContactScaleX: (v: number) => void;
  setContactScaleY: (v: number) => void;

  mascotX?: number;
  mascotY?: number;
  mascotScaleX?: number;
  mascotScaleY?: number;
  setMascotX?: (v: number) => void;
  setMascotY?: (v: number) => void;
  setMascotScaleX?: (v: number) => void;
  setMascotScaleY?: (v: number) => void;

  shapeOverrides?: Record<string, ShapeOverride>;
  setShapeOverrides?: (next: Record<string, ShapeOverride>) => void;

  bgOffsetX?: number;
  bgOffsetY?: number;
  bgScale?: number;
  setBgOffsetX?: (v: number) => void;
  setBgOffsetY?: (v: number) => void;
  setBgScale?: (v: number) => void;
  hasBackgroundImage?: boolean;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState<Part | null>(null);

  // Use a ref for onDragEnd to avoid stale closures in pointer event listeners
  const onDragEndRef = useRef(onDragEnd);
  useEffect(() => { onDragEndRef.current = onDragEnd; });

  const els = useMemo(() => {
    const photoFrame = template.elements.find((e) => e.type === "image" && e.placeholder);
    const logoEl = template.elements.find((e) => e.type === "logo");
    const contactEl = template.elements.find((e) => e.type === "contact");
    const textEl = template.elements.find((e) => e.type === "text");
    const mascotEl = template.elements.find((e) => e.type === "mascot");
    const shapes = template.elements
      .filter((e) => (e.type === "rect" || e.type === "circle") && !!e.id)
      .map((e) => ({ ...e, id: e.id as string }));
    return { photoFrame, logoEl, contactEl, textEl, mascotEl, shapes };
  }, [template.elements]);


  const getRect = (part: Part) => {
    if (part === "bg") {
      if (!hasBackgroundImage) return null;
      const scale = (bgScale ?? 100) / 100;
      const w = template.width * scale;
      const h = template.height * scale;
      const x = bgOffsetX ?? 0;
      const y = bgOffsetY ?? 0;
      return { x, y, w, h };
    }

    if (part === "photo") {
      if (!els.photoFrame) return null;

      // If caller provides a resized frame, sanitize and use it.
      if (photoFrame) {
        const safeW = Number.isFinite(photoFrame.width) ? photoFrame.width : els.photoFrame.width;
        const safeH = Number.isFinite(photoFrame.height) ? photoFrame.height : els.photoFrame.height;
        const safeX = Number.isFinite(photoFrame.x) ? photoFrame.x : els.photoFrame.x;
        const safeY = Number.isFinite(photoFrame.y) ? photoFrame.y : els.photoFrame.y;

        return { x: safeX, y: safeY, w: Math.max(20, safeW), h: Math.max(20, safeH) };
      }

      // Default: use template element dimensions directly
      return {
        x: els.photoFrame.x,
        y: els.photoFrame.y,
        w: els.photoFrame.width,
        h: els.photoFrame.height,
      };
    }

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
        x: els.mascotEl.x + (mascotX ?? 0),
        y: els.mascotEl.y + (mascotY ?? 0),
        w: els.mascotEl.width * ((mascotScaleX ?? 100) / 100),
        h: els.mascotEl.height * ((mascotScaleY ?? 100) / 100),
      };
    }

    if (part === "text") {
      if (!els.textEl) return null;
      const scale = textFontSize / 100;
      const w = els.textEl.width * scale;
      const h = els.textEl.height * scale;
      const rawX = els.textEl.x + textX;
      const rawY = els.textEl.y + textY;
      const x = rawX;
      const y = rawY;
      return { x, y, w, h };
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
          photoOffsetX: number;
          photoOffsetY: number;
          photoScale: number;
          photoW: number;
          photoH: number;
          photoRect?: ShapeOverride;
          logoX: number;
          logoY: number;
          logoScaleX: number;
          logoScaleY: number;
          textX: number;
          textY: number;
          textFontSize: number;
          contactX: number;
          contactY: number;
          contactScaleX: number;
          contactScaleY: number;
          logoW: number;
          logoH: number;
          contactW: number;
          contactH: number;
          mascotX: number;
          mascotY: number;
          mascotScaleX: number;
          mascotScaleY: number;
          mascotW: number;
          mascotH: number;
          textW: number;
          textH: number;
          shapeRect?: ShapeOverride;
          bgOffsetX: number;
          bgOffsetY: number;
          bgScale: number;
        };
      }
  >(null);

  const begin = (e: React.PointerEvent, part: Part, mode: "move" | "resize", handle?: Handle) => {
    e.preventDefault();
    e.stopPropagation();

    const pointerTarget = e.currentTarget as HTMLElement;

    // Important for touch devices: ensure we can prevent scrolling/zooming during drag/resize
    try {
      pointerTarget.setPointerCapture?.(e.pointerId);
    } catch {
      // ignore
    }

    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;

    const logoW = els.logoEl ? els.logoEl.width * (logoScaleX / 100) : 0;
    const logoH = els.logoEl ? els.logoEl.height * (logoScaleY / 100) : 0;
    const contactW = els.contactEl ? els.contactEl.width * (contactScaleX / 100) : 0;
    const contactH = els.contactEl ? els.contactEl.height * (contactScaleY / 100) : 0;
    const _mascotScaleX = mascotScaleX ?? 100;
    const _mascotScaleY = mascotScaleY ?? 100;
    const _mascotX = mascotX ?? 0;
    const _mascotY = mascotY ?? 0;
    const mascotW = els.mascotEl ? els.mascotEl.width * (_mascotScaleX / 100) : 0;
    const mascotH = els.mascotEl ? els.mascotEl.height * (_mascotScaleY / 100) : 0;
    const textW = els.textEl ? els.textEl.width : 0;
    const textH = els.textEl ? els.textEl.height * (textFontSize / 100) : 0;

    const photoR = getRect("photo");
    const photoW = photoR ? photoR.w : 0;
    const photoH = photoR ? photoR.h : 0;
    const photoRect = photoR ? { x: photoR.x, y: photoR.y, width: photoR.w, height: photoR.h } : undefined;

    let shapeRect: ShapeOverride | undefined;
    if (isShapePart(part)) {
      const r = getRect(part);
      if (r) shapeRect = { x: r.x, y: r.y, width: r.w, height: r.h };
    }

    setActive(part);
    startRef.current = {
      mode,
      part,
      handle,
      startClientX: e.clientX,
      startClientY: e.clientY,
      start: {
        photoOffsetX,
        photoOffsetY,
        photoScale,
        photoW,
        photoH,
        photoRect,
        logoX,
        logoY,
        logoScaleX,
        logoScaleY,
        textX,
        textY,
        textFontSize,
        contactX,
        contactY,
        contactScaleX,
        contactScaleY,
        logoW,
        logoH,
        contactW,
        contactH,
        mascotX: _mascotX,
        mascotY: _mascotY,
        mascotScaleX: _mascotScaleX,
        mascotScaleY: _mascotScaleY,
        mascotW,
        mascotH,
        textW,
        textH,
        shapeRect,
        bgOffsetX: bgOffsetX ?? 0,
        bgOffsetY: bgOffsetY ?? 0,
        bgScale: bgScale ?? 100,
      },
    };

    let hasMoved = false;
    const moveThresholdPx = 1;

    const onMove = (ev: PointerEvent) => {
      const s = startRef.current;
      const r = containerRef.current?.getBoundingClientRect();
      if (!s || !r) return;

      const dxClient = ev.clientX - s.startClientX;
      const dyClient = ev.clientY - s.startClientY;

      // Avoid triggering regeneration on simple click/tap without actual movement.
      if (Math.abs(dxClient) < moveThresholdPx && Math.abs(dyClient) < moveThresholdPx) return;
      hasMoved = true;

      const resizeBoost = s.mode === "resize" ? 2 : 1;
      const dx = (dxClient / r.width) * template.width * resizeBoost;
      const dy = (dyClient / r.height) * template.height * resizeBoost;

      if (s.part === "bg" && setBgOffsetX && setBgOffsetY && setBgScale) {
        if (s.mode === "move") {
          setBgOffsetX(s.start.bgOffsetX + dx);
          setBgOffsetY(s.start.bgOffsetY + dy);
          return;
        }
        // Resize = scale uniformly
        const h = s.handle as Handle;
        const signedDx = handleSignX(h) * dx;
        const signedDy = handleSignY(h) * dy;
        const dominant = Math.abs(signedDx) > Math.abs(signedDy) ? signedDx : signedDy;
        const scaleChange = (dominant / template.width) * 100;
        const newScale = clamp(s.start.bgScale + scaleChange, 50, 400);
        setBgScale(newScale);
        // Adjust offset so it scales from center
        const oldW = template.width * (s.start.bgScale / 100);
        const oldH = template.height * (s.start.bgScale / 100);
        const newW = template.width * (newScale / 100);
        const newH = template.height * (newScale / 100);
        setBgOffsetX(s.start.bgOffsetX - (newW - oldW) / 2);
        setBgOffsetY(s.start.bgOffsetY - (newH - oldH) / 2);
        return;
      }

      if (s.part === "photo") {
        const base = els.photoFrame;
        if (!base) return;

        // Move = pan the photo inside the frame
        if (s.mode === "move") {
          setPhotoOffsetX(s.start.photoOffsetX + dx);
          setPhotoOffsetY(s.start.photoOffsetY + dy);
          return;
        }

        // Resize = resize the frame/grid
        if (setPhotoFrame && s.start.photoRect) {
          const h = s.handle as Handle;
          const startRect = s.start.photoRect;
          const minSize = 20;

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

          newW = Math.max(minSize, newW);
          newH = Math.max(minSize, newH);

          setPhotoFrame({ x: newX, y: newY, width: newW, height: newH });
        }
        return;
      }

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

        const isCorner = !isVerticalHandle && !isHorizontalHandle;

        if (isHorizontalHandle) {
          // Side handles: stretch X only
          const signedDx = handleSignX(h) * dx;
          const newW = clamp(s.start.logoW + signedDx, baseW * 0.25, baseW * 3);
          const newScaleX = clamp((newW / baseW) * 100, 25, 300);
          setLogoScaleX(newScaleX);
          if (handleHasW(h)) setLogoX(s.start.logoX + dx);
        } else if (isVerticalHandle) {
          // Side handles: stretch Y only
          const signedDy = handleSignY(h) * dy;
          const newH = clamp(s.start.logoH + signedDy, baseH * 0.25, baseH * 3);
          const newScaleY = clamp((newH / baseH) * 100, 25, 300);
          setLogoScaleY(newScaleY);
          if (handleHasN(h)) setLogoY(s.start.logoY + dy);
        } else {
          // Corner handles: proportional resize
          const signedDx = handleSignX(h) * dx;
          const signedDy = handleSignY(h) * dy;
          const dominant = Math.abs(signedDx / baseW) > Math.abs(signedDy / baseH) ? signedDx / baseW : signedDy / baseH;
          const newW = clamp(s.start.logoW + dominant * baseW, baseW * 0.25, baseW * 3);
          const newH = clamp(s.start.logoH + dominant * baseH, baseH * 0.25, baseH * 3);
          const newScaleX = clamp((newW / baseW) * 100, 25, 300);
          const newScaleY = clamp((newH / baseH) * 100, 25, 300);
          setLogoScaleX(newScaleX);
          setLogoScaleY(newScaleY);
          if (handleHasW(h)) setLogoX(s.start.logoX + (s.start.logoW - newW));
          if (handleHasN(h)) setLogoY(s.start.logoY + (s.start.logoH - newH));
        }
        return;
      }

      if (s.part === "contact") {
        const baseContactX = els.contactEl?.x || 0;
        const baseContactY = els.contactEl?.y || 0;

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
          if (handleHasW(h)) {
            setContactX(s.start.contactX + (s.start.contactW - newW));
          }
        } else if (isVerticalHandle) {
          const signedDy = handleSignY(h) * dy;
          const newH = clamp(s.start.contactH + signedDy, baseH * 0.25, baseH * 3);
          const newScaleY = clamp((newH / baseH) * 100, 25, 300);
          setContactScaleY(newScaleY);
          if (handleHasN(h)) {
            setContactY(s.start.contactY + (s.start.contactH - newH));
          }
        } else {
          // Corner: proportional
          const signedDx = handleSignX(h) * dx;
          const signedDy = handleSignY(h) * dy;
          const dominant = Math.abs(signedDx / baseW) > Math.abs(signedDy / baseH) ? signedDx / baseW : signedDy / baseH;
          const newW = clamp(s.start.contactW + dominant * baseW, baseW * 0.25, baseW * 3);
          const newH = clamp(s.start.contactH + dominant * baseH, baseH * 0.25, baseH * 3);
          const newScaleX = clamp((newW / baseW) * 100, 25, 300);
          const newScaleY = clamp((newH / baseH) * 100, 25, 300);
          setContactScaleX(newScaleX);
          setContactScaleY(newScaleY);
          if (handleHasW(h)) {
            setContactX(s.start.contactX + (s.start.contactW - newW));
          }
          if (handleHasN(h)) {
            setContactY(s.start.contactY + (s.start.contactH - newH));
          }
        }
        return;
      }

      if (s.part === "mascot" && setMascotX && setMascotY && setMascotScaleX && setMascotScaleY) {
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
          const dominant = Math.abs(signedDx / baseW) > Math.abs(signedDy / baseH) ? signedDx / baseW : signedDy / baseH;
          const newW = clamp(s.start.mascotW + dominant * baseW, baseW * 0.25, baseW * 3);
          const newH = clamp(s.start.mascotH + dominant * baseH, baseH * 0.25, baseH * 3);
          const newScaleX = clamp((newW / baseW) * 100, 25, 300);
          const newScaleY = clamp((newH / baseH) * 100, 25, 300);
          setMascotScaleX(newScaleX);
          setMascotScaleY(newScaleY);
          if (handleHasW(h)) setMascotX(s.start.mascotX + (s.start.mascotW - newW));
          if (handleHasN(h)) setMascotY(s.start.mascotY + (s.start.mascotH - newH));
        }
        return;
      }

      if (s.part === "text") {
        if (s.mode === "move") {
          setTextX(s.start.textX + dx);
          setTextY(s.start.textY + dy);
          return;
        }

        const baseW = els.textEl?.width || 1;
        const baseH = els.textEl?.height || 1;
        const h = s.handle as Handle;
        const isVerticalHandle = h === "n" || h === "s";
        const isHorizontalHandle = h === "e" || h === "w";

        let delta = 0;
        if (isHorizontalHandle) {
          // Side handles: horizontal drag controls font size change
          delta = handleSignX(h) * dx;
        } else if (isVerticalHandle) {
          // Side handles: vertical drag controls font size change
          delta = handleSignY(h) * dy;
        } else {
          // Corner handles: use dominant axis so resizing works even when dragging mostly sideways
          const signedDx = handleSignX(h) * dx;
          const signedDy = handleSignY(h) * dy;
          delta = Math.abs(signedDx / baseW) > Math.abs(signedDy / baseH)
            ? signedDx * (baseH / baseW)
            : signedDy;
        }

        const newH = clamp(s.start.textH + delta, baseH * 0.5, baseH * 3);
        const newScale = clamp((newH / baseH) * 100, 50, 300);
        setTextFontSize(newScale);

        if (handleHasN(h)) {
          setTextY(s.start.textY + (s.start.textH - newH));
        }

        return;
      }

      if (isShapePart(s.part)) {
        const id = shapeIdFromPart(s.part);
        const base = els.shapes.find((sh) => sh.id === id);
        if (!base || !setShapeOverrides) return;

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

        // Clamp to canvas bounds (soft)
        newX = clamp(newX, 0, template.width - minSize);
        newY = clamp(newY, 0, template.height - minSize);
        newW = clamp(newW, minSize, template.width);
        newH = clamp(newH, minSize, template.height);

        setShapeOverrides({ ...(shapeOverrides || {}), [id]: { x: newX, y: newY, width: newW, height: newH } });
        return;
      }
    };

    const finishDrag = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onCancel);
      window.removeEventListener("mouseup", onUp);
      window.removeEventListener("blur", onWindowBlur);
      pointerTarget.removeEventListener("lostpointercapture", onCancel);
      startRef.current = null;
      if (hasMoved) onDragEndRef.current?.();
    };

    const onUp = () => {
      finishDrag();
    };

    const onCancel = () => {
      finishDrag();
    };

    const onWindowBlur = () => {
      finishDrag();
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onCancel);
    window.addEventListener("mouseup", onUp);
    window.addEventListener("blur", onWindowBlur);
    pointerTarget.addEventListener("lostpointercapture", onCancel);
  };

  const Box = ({
    part,
    label,
    resizable,
  }: {
    part: Part;
    label: string;
    resizable?: boolean;
  }) => {
    const rect = getRect(part);
    if (!rect) return null;

    // Allow elements to extend beyond canvas (e.g. enlarged photos)
    const left = (rect.x / template.width) * 100;
    const top = (rect.y / template.height) * 100;
    const width = Math.max(1, (rect.w / template.width) * 100);
    const height = Math.max(1, (rect.h / template.height) * 100);

    const isActive = active === part;

    const HandleDot = ({ h }: { h: Handle }) => {
      // Position handles centered on the border edges/corners
      const style: React.CSSProperties = {};
      const size = 12;
      const half = -size / 2;
      const hitSize = 24; // larger hit area for easier grabbing
      const hitHalf = -hitSize / 2;

      if (h === "nw") { style.left = hitHalf; style.top = hitHalf; }
      else if (h === "ne") { style.right = hitHalf; style.top = hitHalf; }
      else if (h === "sw") { style.left = hitHalf; style.bottom = hitHalf; }
      else if (h === "se") { style.right = hitHalf; style.bottom = hitHalf; }
      else if (h === "n") { style.left = "50%"; style.top = hitHalf; style.transform = "translateX(-50%)"; }
      else if (h === "s") { style.left = "50%"; style.bottom = hitHalf; style.transform = "translateX(-50%)"; }
      else if (h === "w") { style.left = hitHalf; style.top = "50%"; style.transform = "translateY(-50%)"; }
      else if (h === "e") { style.right = hitHalf; style.top = "50%"; style.transform = "translateY(-50%)"; }

      const cursor =
        h === "n" || h === "s"
          ? "cursor-ns-resize"
          : h === "e" || h === "w"
            ? "cursor-ew-resize"
            : h === "nw" || h === "se"
              ? "cursor-nwse-resize"
              : "cursor-nesw-resize";

      return (
        <div
          className={cn("absolute z-30 touch-none flex items-center justify-center", cursor)}
          style={{ ...style, width: hitSize, height: hitSize }}
          onPointerDown={(e) => {
            e.preventDefault();
            e.stopPropagation();
            begin(e, part, "resize", h);
          }}
        >
          <div style={{ width: size, height: size }} className="rounded-[2px] bg-white border border-primary shadow-sm" />
        </div>
      );
    };

    const baseLayerClass = part === "bg"
      ? "-z-[1]"
      : part === "photo"
        ? "z-0"
        : isShapePart(part)
          ? "z-10"
          : part === "logo"
            ? "z-20"
            : part === "mascot"
              ? "z-25"
              : part === "contact"
                ? "z-30"
                : "z-40";

    const zClass = baseLayerClass;

    return (
      <div
        className={cn(
          "absolute touch-none cursor-move",
          zClass
        )}
        style={{ left: `${left}%`, top: `${top}%`, width: `${width}%`, height: `${height}%` }}
        onPointerDown={(e) => {
          setActive(part);
          begin(e, part, "move");
        }}
      >
        {/* Border lines - Canva style solid */}
        <div className={cn(
          "absolute inset-0 border-[1.5px]",
          isActive ? "border-primary" : "border-primary/40 hover:border-primary/70"
        )} />

        {isActive && resizable && (
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

  // Build grid lines (Canva-style)
  const gridLines = useMemo(() => {
    const lines: React.ReactNode[] = [];
    const cols = 12;
    const rows = 12;
    // Vertical lines
    for (let i = 1; i < cols; i++) {
      const pct = (i / cols) * 100;
      const isMajor = i % 3 === 0;
      lines.push(
        <div
          key={`v-${i}`}
          className="absolute top-0 bottom-0 pointer-events-none"
          style={{
            left: `${pct}%`,
            width: 1,
            background: isMajor ? "rgba(128,128,128,0.35)" : "rgba(128,128,128,0.15)",
          }}
        />
      );
    }
    // Horizontal lines
    for (let i = 1; i < rows; i++) {
      const pct = (i / rows) * 100;
      const isMajor = i % 3 === 0;
      lines.push(
        <div
          key={`h-${i}`}
          className="absolute left-0 right-0 pointer-events-none"
          style={{
            top: `${pct}%`,
            height: 1,
            background: isMajor ? "rgba(128,128,128,0.35)" : "rgba(128,128,128,0.15)",
          }}
        />
      );
    }
    // Center cross (stronger)
    lines.push(
      <div key="cx" className="absolute top-0 bottom-0 pointer-events-none" style={{ left: "50%", width: 1, background: "rgba(128,128,128,0.5)" }} />,
      <div key="cy" className="absolute left-0 right-0 pointer-events-none" style={{ top: "50%", height: 1, background: "rgba(128,128,128,0.5)" }} />
    );
    return lines;
  }, []);

  return (
    <div
      ref={containerRef}
      className="relative mx-auto w-full max-w-md overflow-hidden rounded-lg border bg-muted"
      style={{ aspectRatio: `${template.width} / ${template.height}` }}
    >
      {previewUrl ? (
        <img
          src={previewUrl}
          alt="Prévia da arte gerada"
          className="absolute inset-0 h-full w-full object-contain pointer-events-none select-none"
          draggable={false}
        />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground">
          Sem prévia
        </div>
      )}

      {/* Canva-style grid */}
      <div className="absolute inset-0 pointer-events-none z-[5]">
        {gridLines}
      </div>

      <div className="absolute inset-0 z-10">
        {hasBackgroundImage && <Box part="bg" label="Fundo" resizable />}
        <Box part="photo" label="Foto" resizable />
        <Box part="logo" label="Logo" resizable />
        <Box part="text" label="Texto" resizable />
        <Box part="contact" label="Contato" resizable />
        <Box part="mascot" label="Mascote" resizable />
        {els.shapes.map((s, idx) => (
          <Box
            key={s.id}
            part={`shape:${s.id}`}
            label={s.type === "circle" ? `Círculo ${idx + 1}` : `Retângulo ${idx + 1}`}
            resizable
          />
        ))}
      </div>
    </div>
  );
}
