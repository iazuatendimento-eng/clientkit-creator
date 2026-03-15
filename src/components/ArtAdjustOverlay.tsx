import { useEffect, useMemo, useRef, useState } from "react";
import { Loader2, ZoomIn, ZoomOut, Move } from "lucide-react";
import { cn } from "@/lib/utils";
import { Slider } from "@/components/ui/slider";

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

type BasePart = "photo" | "logo" | "text" | "contact";

type ShapePart = `shape:${string}`;

type Part = BasePart | ShapePart;

const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));

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
  shapeOverrides,
  setShapeOverrides,
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

  shapeOverrides?: Record<string, ShapeOverride>;
  setShapeOverrides?: (next: Record<string, ShapeOverride>) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState<Part>("photo");

  // Use a ref for onDragEnd to avoid stale closures in pointer event listeners
  const onDragEndRef = useRef(onDragEnd);
  useEffect(() => { onDragEndRef.current = onDragEnd; });

  const els = useMemo(() => {
    const photoFrame = template.elements.find((e) => e.type === "image" && e.placeholder);
    const logoEl = template.elements.find((e) => e.type === "logo");
    const contactEl = template.elements.find((e) => e.type === "contact");
    const textEl = template.elements.find((e) => e.type === "text");
    const shapes = template.elements
      .filter((e) => (e.type === "rect" || e.type === "circle") && !!e.id)
      .map((e) => ({ ...e, id: e.id as string }));
    return { photoFrame, logoEl, contactEl, textEl, shapes };
  }, [template.elements]);

  const partOptions = useMemo(() => {
    const opts: { value: Part; label: string }[] = [];

    if (els.photoFrame) opts.push({ value: "photo", label: "Foto" });
    if (els.logoEl) opts.push({ value: "logo", label: "Logo" });
    if (els.textEl) opts.push({ value: "text", label: "Texto" });
    if (els.contactEl) opts.push({ value: "contact", label: "Contato" });

    els.shapes.forEach((s, idx) => {
      opts.push({
        value: `shape:${s.id}`,
        label: s.type === "circle" ? `Círculo ${idx + 1}` : `Retângulo ${idx + 1}`,
      });
    });

    return opts;
  }, [els]);

  const getRect = (part: Part) => {
    if (part === "photo") {
      if (!els.photoFrame) return null;

      // If caller provides a resized frame, use it (this is "resize photo" without zoom).
      if (photoFrame) {
        return {
          x: photoFrame.x,
          y: photoFrame.y,
          w: photoFrame.width,
          h: photoFrame.height,
        };
      }

      // Backwards-compat fallback: represent zoom as a scaled box.
      const scaledW = els.photoFrame.width * (photoScale / 100);
      const scaledH = els.photoFrame.height * (photoScale / 100);
      const centerX = els.photoFrame.x + els.photoFrame.width / 2;
      const centerY = els.photoFrame.y + els.photoFrame.height / 2;
      return {
        x: centerX - scaledW / 2 + photoOffsetX,
        y: centerY - scaledH / 2 + photoOffsetY,
        w: scaledW,
        h: scaledH,
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

    if (part === "text") {
      if (!els.textEl) return null;
      const scale = textFontSize / 100;
      const w = els.textEl.width * scale;
      const h = els.textEl.height * scale;
      const rawX = els.textEl.x + textX;
      const rawY = els.textEl.y + textY;
      const x = clamp(rawX, 0, template.width - w);
      const y = clamp(rawY, 0, template.height - h);
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
          textW: number;
          shapeRect?: ShapeOverride;
        };
      }
  >(null);

  const begin = (e: React.PointerEvent, part: Part, mode: "move" | "resize", handle?: Handle) => {
    e.preventDefault();
    e.stopPropagation();

    // Important for touch devices: ensure we can prevent scrolling/zooming during drag/resize
    try {
      (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    } catch {
      // ignore
    }

    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;

    const logoW = els.logoEl ? els.logoEl.width * (logoScaleX / 100) : 0;
    const logoH = els.logoEl ? els.logoEl.height * (logoScaleY / 100) : 0;
    const contactW = els.contactEl ? els.contactEl.width * (contactScaleX / 100) : 0;
    const contactH = els.contactEl ? els.contactEl.height * (contactScaleY / 100) : 0;
    const textW = els.textEl ? els.textEl.width * (textFontSize / 100) : 0;

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
        textW,
        shapeRect,
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

      const dx = (dxClient / r.width) * template.width;
      const dy = (dyClient / r.height) * template.height;

      if (s.part === "photo") {
        const base = els.photoFrame;
        if (!base) return;

        // New behavior: resize/move the photo frame (no zoom) when photoFrame is enabled.
        if (setPhotoFrame) {
          const startRect = s.start.photoRect || { x: base.x, y: base.y, width: base.width, height: base.height };
          const minSize = 20;

          if (s.mode === "move") {
            const next: ShapeOverride = {
              x: clamp(startRect.x + dx, 0, template.width - minSize),
              y: clamp(startRect.y + dy, 0, template.height - minSize),
              width: startRect.width,
              height: startRect.height,
            };
            setPhotoFrame(next);
            return;
          }

          const h = s.handle || "se";
          const startW = Math.max(minSize, startRect.width);
          const startH = Math.max(minSize, startRect.height);

          // Corner-only proportional resize to preserve aspect ratio
          const signedDx = handleSignX(h) * dx;
          const signedDy = handleSignY(h) * dy;
          const dominant = Math.abs(signedDx / startW) > Math.abs(signedDy / startH)
            ? signedDx / startW
            : signedDy / startH;

          let newW = Math.max(minSize, startW + dominant * startW);
          let newH = Math.max(minSize, startH + dominant * startH);

          // Keep exact aspect ratio from resize start
          const aspect = startW / startH;
          if (newW / newH > aspect) {
            newH = newW / aspect;
          } else {
            newW = newH * aspect;
          }

          const newX = handleHasW(h) ? startRect.x + (startRect.width - newW) : startRect.x;
          const newY = handleHasN(h) ? startRect.y + (startRect.height - newH) : startRect.y;

          setPhotoFrame({ x: newX, y: newY, width: newW, height: newH });
          return;
        }

        // Legacy behavior: move = pan, resize = zoom
        if (s.mode === "move") {
          setPhotoOffsetX(clamp(s.start.photoOffsetX + dx, -100, 100));
          setPhotoOffsetY(clamp(s.start.photoOffsetY + dy, -100, 100));
          return;
        }

        const h = s.handle as Handle;
        const isVerticalHandle = h === "n" || h === "s";
        const isHorizontalHandle = h === "e" || h === "w";

        const baseW = els.photoFrame?.width || 1;
        const baseH = els.photoFrame?.height || 1;

        let signedDelta: number;
        let baseDimension: number;
        let startDimension: number;

        if (isVerticalHandle) {
          signedDelta = handleSignY(h) * dy;
          baseDimension = baseH;
          startDimension = s.start.photoH;
        } else if (isHorizontalHandle) {
          signedDelta = handleSignX(h) * dx;
          baseDimension = baseW;
          startDimension = s.start.photoW;
        } else {
          const signedDx = handleSignX(h) * dx;
          const signedDy = handleSignY(h) * dy;
          if (Math.abs(signedDx) > Math.abs(signedDy)) {
            signedDelta = signedDx;
            baseDimension = baseW;
            startDimension = s.start.photoW;
          } else {
            signedDelta = signedDy;
            baseDimension = baseH;
            startDimension = s.start.photoH;
          }
        }

        const newDimension = clamp(startDimension + signedDelta, baseDimension * 0.1, baseDimension * 3);
        const newScale = clamp((newDimension / baseDimension) * 100, 10, 300);
        setPhotoScale(newScale);
        return;
      }

      if (s.part === "logo") {
        if (s.mode === "move") {
          setLogoX(clamp(s.start.logoX + dx, -200, 200));
          setLogoY(clamp(s.start.logoY + dy, -200, 200));
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
          if (handleHasW(h)) setLogoX(clamp(s.start.logoX + dx, -200, 200));
        } else if (isVerticalHandle) {
          // Side handles: stretch Y only
          const signedDy = handleSignY(h) * dy;
          const newH = clamp(s.start.logoH + signedDy, baseH * 0.25, baseH * 3);
          const newScaleY = clamp((newH / baseH) * 100, 25, 300);
          setLogoScaleY(newScaleY);
          if (handleHasN(h)) setLogoY(clamp(s.start.logoY + dy, -200, 200));
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
          if (handleHasW(h)) setLogoX(clamp(s.start.logoX + (s.start.logoW - newW), -200, 200));
          if (handleHasN(h)) setLogoY(clamp(s.start.logoY + (s.start.logoH - newH), -200, 200));
        }
        return;
      }

      if (s.part === "contact") {
        if (s.mode === "move") {
          setContactX(clamp(s.start.contactX + dx, -200, 200));
          setContactY(clamp(s.start.contactY + dy, -200, 200));
          return;
        }

        const baseW = els.contactEl?.width || 1;
        const baseH = els.contactEl?.height || 1;
        const h = s.handle as Handle;
        const isVerticalHandle = h === "n" || h === "s";
        const isHorizontalHandle = h === "e" || h === "w";

        const isCorner = !isVerticalHandle && !isHorizontalHandle;

        if (isHorizontalHandle) {
          const signedDx = handleSignX(h) * dx;
          const newW = clamp(s.start.contactW + signedDx, baseW * 0.25, baseW * 3);
          const newScaleX = clamp((newW / baseW) * 100, 25, 300);
          setContactScaleX(newScaleX);
          if (handleHasW(h)) setContactX(clamp(s.start.contactX + dx, -200, 200));
        } else if (isVerticalHandle) {
          const signedDy = handleSignY(h) * dy;
          const newH = clamp(s.start.contactH + signedDy, baseH * 0.25, baseH * 3);
          const newScaleY = clamp((newH / baseH) * 100, 25, 300);
          setContactScaleY(newScaleY);
          if (handleHasN(h)) setContactY(clamp(s.start.contactY + dy, -200, 200));
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
          if (handleHasW(h)) setContactX(clamp(s.start.contactX + (s.start.contactW - newW), -200, 200));
          if (handleHasN(h)) setContactY(clamp(s.start.contactY + (s.start.contactH - newH), -200, 200));
        }
        return;
      }

      if (s.part === "text") {
        if (s.mode === "move") {
          setTextX(clamp(s.start.textX + dx, -200, 200));
          setTextY(clamp(s.start.textY + dy, -200, 200));
          return;
        }

        const baseW = els.textEl?.width || 1;
        const baseH = els.textEl?.height || 1;
        const h = s.handle as Handle;
        const isVerticalHandle = h === "n" || h === "s";
        const isHorizontalHandle = h === "e" || h === "w";

        const isCorner = !isVerticalHandle && !isHorizontalHandle;

        if (isHorizontalHandle) {
          const signedDx = handleSignX(h) * dx;
          const newW = clamp(s.start.textW + signedDx, baseW * 0.5, baseW * 2);
          const newScale = clamp((newW / baseW) * 100, 50, 200);
          setTextFontSize(newScale);
          if (handleHasW(h)) setTextX(clamp(s.start.textX + dx, -200, 200));
        } else if (isVerticalHandle) {
          const signedDy = handleSignY(h) * dy;
          const newH = clamp(s.start.textW + signedDy, baseH * 0.5, baseH * 2);
          const newScale = clamp((newH / baseH) * 100, 50, 200);
          setTextFontSize(newScale);
          if (handleHasN(h)) setTextY(clamp(s.start.textY + dy, -200, 200));
        } else {
          // Corner: proportional
          const signedDx = handleSignX(h) * dx;
          const signedDy = handleSignY(h) * dy;
          const signedDelta = Math.abs(signedDx) > Math.abs(signedDy) ? signedDx : signedDy;
          const newW = clamp(s.start.textW + signedDelta, baseW * 0.5, baseW * 2);
          const newScale = clamp((newW / baseW) * 100, 50, 200);
          setTextFontSize(newScale);
          if (handleHasW(h)) setTextX(clamp(s.start.textX + dx, -200, 200));
          if (handleHasN(h)) setTextY(clamp(s.start.textY + dy, -200, 200));
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

    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      startRef.current = null;
      if (hasMoved) onDragEndRef.current?.();
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
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

    return (
      <div
        className={cn(
          "absolute touch-none cursor-move",
          isActive ? "z-30" : "z-10"
        )}
        style={{ left: `${left}%`, top: `${top}%`, width: `${width}%`, height: `${height}%` }}
        onPointerDown={(e) => begin(e, part, "move")}
      >
        {/* Border lines - Canva style solid */}
        <div className={cn(
          "absolute inset-0 border-[1.5px]",
          isActive ? "border-primary" : "border-primary/40 hover:border-primary/70"
        )} />

        {/* Label badge */}
        <div className={cn(
          "absolute -top-5 left-1/2 -translate-x-1/2 rounded-sm px-1.5 py-0.5 text-[9px] font-medium shadow-sm whitespace-nowrap",
          isActive ? "bg-primary text-primary-foreground" : "bg-background/90 text-muted-foreground border border-border/50"
        )}>
          {label}
        </div>

        {isActive && resizable && (
          <>
            <HandleDot h="nw" />
            <HandleDot h="ne" />
            <HandleDot h="sw" />
            <HandleDot h="se" />
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
          className={cn(
            "absolute inset-0 h-full w-full object-cover pointer-events-none select-none",
            isBusy ? "opacity-80" : "opacity-100"
          )}
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

      <div className="absolute left-3 bottom-3 z-50 flex flex-col gap-2">
        <div className="rounded-md border bg-background backdrop-blur px-2 py-1 shadow-lg">
          <label className="mr-2 text-[10px] text-muted-foreground">Camada</label>
          <select
            className="bg-background text-xs text-foreground outline-none border-none cursor-pointer"
            value={active}
            onChange={(e) => setActive(e.target.value as Part)}
          >
            {partOptions.map((o) => (
              <option key={o.value} value={o.value} className="bg-background text-foreground">
                {o.label}
              </option>
            ))}
          </select>
        </div>

        {active === "photo" && els.photoFrame && (
          <div className="rounded-md border bg-background backdrop-blur px-2 py-1.5 shadow-lg flex items-center gap-2 min-w-[180px]">
            <ZoomOut className="h-3 w-3 text-muted-foreground flex-shrink-0" />
            <Slider
              min={10}
              max={300}
              step={5}
              value={[photoScale]}
              onValueChange={([v]) => { setPhotoScale(v); }}
              onValueCommit={() => onDragEndRef.current?.()}
              className="flex-1"
            />
            <ZoomIn className="h-3 w-3 text-muted-foreground flex-shrink-0" />
            <span className="text-[10px] text-muted-foreground w-8 text-right">{photoScale}%</span>
          </div>
        )}

        {active === "photo" && els.photoFrame && photoScale !== 100 && (
          <div className="rounded-md border bg-background backdrop-blur px-2 py-1.5 shadow-lg flex items-center gap-2 text-[10px] text-muted-foreground">
            <Move className="h-3 w-3 flex-shrink-0" />
            <span>X</span>
            <input
              type="range"
              min={-200}
              max={200}
              value={photoOffsetX}
              onChange={(e) => setPhotoOffsetX(Number(e.target.value))}
              onMouseUp={() => onDragEndRef.current?.()}
              onTouchEnd={() => onDragEndRef.current?.()}
              className="flex-1 h-1 accent-primary"
            />
            <span>Y</span>
            <input
              type="range"
              min={-200}
              max={200}
              value={photoOffsetY}
              onChange={(e) => setPhotoOffsetY(Number(e.target.value))}
              onMouseUp={() => onDragEndRef.current?.()}
              onTouchEnd={() => onDragEndRef.current?.()}
              className="flex-1 h-1 accent-primary"
            />
          </div>
        )}
      </div>

      <div className="absolute inset-0">
        <Box part="photo" label="Foto" resizable />
        <Box part="logo" label="Logo" resizable />
        <Box part="text" label="Texto" resizable />
        <Box part="contact" label="Contato" resizable />
        {els.shapes.map((s, idx) => (
          <Box
            key={s.id}
            part={`shape:${s.id}`}
            label={s.type === "circle" ? `Círculo ${idx + 1}` : `Retângulo ${idx + 1}`}
            resizable
          />
        ))}
      </div>

      {isBusy && (
        <div className="absolute inset-0 flex items-center justify-center bg-background/20 pointer-events-none">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      )}
    </div>
  );
}
