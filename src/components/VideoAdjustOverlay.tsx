import { useMemo, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

type ElementType = "rect" | "circle" | "text" | "image" | "logo" | "contact" | "mascot" | "triangle" | "line" | "star" | "diamond" | "hexagon" | "pentagon" | "polkaDots" | "dotsGrid" | "confetti" | "splatter" | "zigzag" | "spiral" | "wave" | "blob" | "arch" | "arrow" | "badge" | "ribbon" | "heart" | "cross" | "cloud" | "speechBubble" | "lightning" | "shield" | "crescent";

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

type Handle = "nw" | "ne" | "sw" | "se" | "n" | "s" | "e" | "w";
type Part = "logo" | "contact" | "mascot" | "text" | "image";
type Tone = "primary" | "secondary" | "accent" | "muted" | "warning";

const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));

const handleHasW = (h: Handle) => h === "nw" || h === "sw" || h === "w";
const handleHasN = (h: Handle) => h === "nw" || h === "ne" || h === "n";

const handleSignX = (h: Handle) => (handleHasW(h) ? -1 : 1);
const handleSignY = (h: Handle) => (handleHasN(h) ? -1 : 1);

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
  backgroundImageUrl,
  backgroundVideoUrl,

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
  backgroundImageUrl?: string;
  backgroundVideoUrl?: string;

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
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState<Part>("logo");

  const els = useMemo(() => {
    const currentElements = isContentPage ? template.contentElements : template.signatureElements;
    const logoEl = currentElements.find((e) => e.type === "logo");
    const contactEl = currentElements.find((e) => e.type === "contact");
    const mascotEl = currentElements.find((e) => e.type === "mascot");
    const textEl = currentElements.find((e) => e.type === "text");
    // Image placeholder comes from contentElements always
    const imageEl = template.contentElements.find((e) => e.type === "image");
    return { logoEl, contactEl, mascotEl, textEl, imageEl };
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
      const elW = els.textEl.width * scale;

      // Use canvas to measure actual text width for accurate line wrapping
      const baseFontSize = els.textEl.fontSize || 48;
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
            ctx.font = `${fontWeight} ${baseFontSize}px ${fontFamily}`;
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
          // fallback: rough estimate
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

      const estimatedH = Math.max(estimatedLines * lineHeight * scale, els.textEl.height * scale);

      return {
        x: els.textEl.x + textX,
        y: els.textEl.y + textY,
        w: elW,
        h: estimatedH,
      };
    }

    if (part === "image") {
      if (!els.imageEl) return null;
      // Fixed frame matching the template element - zoom/pan happens to content inside
      return {
        x: els.imageEl.x,
        y: els.imageEl.y,
        w: els.imageEl.width,
        h: els.imageEl.height,
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
    const textW = els.textEl ? els.textEl.width * (textScale / 100) : 0;
    const textH = els.textEl ? els.textEl.height * (textScale / 100) : 0;
    const currentImageScale = imageScale ?? 100;
    const imgElW = els.imageEl?.width || template.width;
    const imgElH = els.imageEl?.height || template.height;
    const imageW = imgElW * (currentImageScale / 100);
    const imageH = imgElH * (currentImageScale / 100);

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
          setLogoX(clamp(s.start.logoX + dx, -500, 500));
          setLogoY(clamp(s.start.logoY + dy, -500, 500));
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
          if (handleHasW(h)) setLogoX(clamp(s.start.logoX + dx, -500, 500));
        } else if (isVerticalHandle) {
          const signedDy = handleSignY(h) * dy;
          const newH = clamp(s.start.logoH + signedDy, baseH * 0.25, baseH * 3);
          const newScaleY = clamp((newH / baseH) * 100, 25, 300);
          setLogoScaleY(newScaleY);
          if (handleHasN(h)) setLogoY(clamp(s.start.logoY + dy, -500, 500));
        } else {
          const signedDx = handleSignX(h) * dx;
          const signedDy = handleSignY(h) * dy;
          const newW = clamp(s.start.logoW + signedDx, baseW * 0.25, baseW * 3);
          const newH = clamp(s.start.logoH + signedDy, baseH * 0.25, baseH * 3);
          const newScaleX = clamp((newW / baseW) * 100, 25, 300);
          const newScaleY = clamp((newH / baseH) * 100, 25, 300);
          setLogoScaleX(newScaleX);
          setLogoScaleY(newScaleY);
          if (handleHasW(h)) setLogoX(clamp(s.start.logoX + dx, -500, 500));
          if (handleHasN(h)) setLogoY(clamp(s.start.logoY + dy, -500, 500));
        }
        return;
      }

      if (s.part === "contact") {
        if (s.mode === "move") {
          setContactX(clamp(s.start.contactX + dx, -500, 500));
          setContactY(clamp(s.start.contactY + dy, -500, 500));
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
          if (handleHasW(h)) setContactX(clamp(s.start.contactX + dx, -500, 500));
        } else if (isVerticalHandle) {
          const signedDy = handleSignY(h) * dy;
          const newH = clamp(s.start.contactH + signedDy, baseH * 0.25, baseH * 3);
          const newScaleY = clamp((newH / baseH) * 100, 25, 300);
          setContactScaleY(newScaleY);
          if (handleHasN(h)) setContactY(clamp(s.start.contactY + dy, -500, 500));
        } else {
          const signedDx = handleSignX(h) * dx;
          const signedDy = handleSignY(h) * dy;
          const newW = clamp(s.start.contactW + signedDx, baseW * 0.25, baseW * 3);
          const newH = clamp(s.start.contactH + signedDy, baseH * 0.25, baseH * 3);
          const newScaleX = clamp((newW / baseW) * 100, 25, 300);
          const newScaleY = clamp((newH / baseH) * 100, 25, 300);
          setContactScaleX(newScaleX);
          setContactScaleY(newScaleY);
          if (handleHasW(h)) setContactX(clamp(s.start.contactX + dx, -500, 500));
          if (handleHasN(h)) setContactY(clamp(s.start.contactY + dy, -500, 500));
        }
        return;
      }

      if (s.part === "mascot") {
        if (s.mode === "move") {
          setMascotX(clamp(s.start.mascotX + dx, -500, 500));
          setMascotY(clamp(s.start.mascotY + dy, -500, 500));
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
          if (handleHasW(h)) setMascotX(clamp(s.start.mascotX + dx, -500, 500));
        } else if (isVerticalHandle) {
          const signedDy = handleSignY(h) * dy;
          const newH = clamp(s.start.mascotH + signedDy, baseH * 0.25, baseH * 3);
          const newScaleY = clamp((newH / baseH) * 100, 25, 300);
          setMascotScaleY(newScaleY);
          if (handleHasN(h)) setMascotY(clamp(s.start.mascotY + dy, -500, 500));
        } else {
          const signedDx = handleSignX(h) * dx;
          const signedDy = handleSignY(h) * dy;
          const newW = clamp(s.start.mascotW + signedDx, baseW * 0.25, baseW * 3);
          const newH = clamp(s.start.mascotH + signedDy, baseH * 0.25, baseH * 3);
          const newScaleX = clamp((newW / baseW) * 100, 25, 300);
          const newScaleY = clamp((newH / baseH) * 100, 25, 300);
          setMascotScaleX(newScaleX);
          setMascotScaleY(newScaleY);
          if (handleHasW(h)) setMascotX(clamp(s.start.mascotX + dx, -500, 500));
          if (handleHasN(h)) setMascotY(clamp(s.start.mascotY + dy, -500, 500));
        }
        return;
      }

      if (s.part === "text") {
        if (s.mode === "move") {
          setTextX(clamp(s.start.textX + dx, -500, 500));
          setTextY(clamp(s.start.textY + dy, -500, 500));
          return;
        }

        // Text uses uniform scale (font size scaling)
        const baseW = els.textEl?.width || 1;
        const h = s.handle as Handle;

        // Use the larger of dx or dy for uniform scaling
        const signedDx = handleSignX(h) * dx;
        const signedDy = handleSignY(h) * dy;
        const delta = Math.abs(signedDx) > Math.abs(signedDy) ? signedDx : signedDy;
        
        const newW = clamp(s.start.textW + delta, baseW * 0.25, baseW * 3);
        const newScale = clamp((newW / baseW) * 100, 25, 300);
        setTextScale(newScale);
        
        if (handleHasW(h)) setTextX(clamp(s.start.textX + dx, -500, 500));
        if (handleHasN(h)) setTextY(clamp(s.start.textY + dy, -500, 500));
        return;
      }

      if (s.part === "image" && setImageX && setImageY && setImageScale) {
        if (s.mode === "move") {
          // Drag = pan the image inside the fixed frame
          setImageX(clamp(s.start.imageX + dx, -1000, 1000));
          setImageY(clamp(s.start.imageY + dy, -1000, 1000));
          return;
        }

        // Resize handles = zoom the image content (frame stays fixed)
        const h = s.handle as Handle;
        const signedDx = handleSignX(h) * dx;
        const signedDy = handleSignY(h) * dy;
        const delta = Math.abs(signedDx) > Math.abs(signedDy) ? signedDx : signedDy;
        const imgElW = els.imageEl?.width || template.width;
        
        // Scale relative to the element size
        const scaleDelta = (delta / imgElW) * 100;
        const newScale = clamp(s.start.imageScale + scaleDelta, 50, 300);
        setImageScale(newScale);
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
          <div className="absolute inset-0 pointer-events-none flex items-center justify-center overflow-hidden p-1">
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

  return (
    <div
      ref={containerRef}
      className="relative mx-auto w-full aspect-[9/16] overflow-hidden rounded-lg border bg-muted touch-none"
      style={{ containerType: "size" }}
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
          {/* Frame overlay layer */}
          {frameOverlayUrl && (
            <img src={frameOverlayUrl} alt="" className="absolute inset-0 h-full w-full object-contain pointer-events-none z-[1]" draggable={false} />
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
        const panX = ((imageX ?? 0) / els.imageEl.width) * 100;
        const panY = ((imageY ?? 0) / els.imageEl.height) * 100;
        const mediaStyle: React.CSSProperties = {
          transform: `scale(${scale}) translate(${panX}%, ${panY}%)`,
          transformOrigin: "center center",
        };
        return (
          <div
            className="absolute overflow-hidden z-[0] pointer-events-none"
            style={{ left: `${left}%`, top: `${top}%`, width: `${width}%`, height: `${height}%` }}
          >
            <div className="absolute inset-0" style={mediaStyle}>
              {backgroundVideoUrl ? (
                <video
                  src={backgroundVideoUrl}
                  className="w-full h-full object-cover"
                  muted loop autoPlay playsInline crossOrigin="anonymous" draggable={false}
                />
              ) : backgroundImageUrl ? (
                <img src={backgroundImageUrl} alt="Fundo" className="w-full h-full object-cover" draggable={false} />
              ) : null}
            </div>
          </div>
        );
      })()}

      <div className="absolute inset-0 z-[5]">
        {/* Image interactive handles - on top for interaction */}
        {isContentPage && setImageX && els.imageEl && (
          <Box part="image" label="Foto (zoom)" tone="warning" />
        )}
        {/* Text - only on content pages */}
        {isContentPage && els.textEl && (
          <Box part="text" label="Texto" tone="muted">
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
        )}
        {/* Logo, Contato, Mascote */}
        {els.logoEl && (
          <Box part="logo" label="Logo" tone="primary">
            {logoUrl && <img src={logoUrl} alt="Logo" className="w-full h-full object-contain" draggable={false} />}
          </Box>
        )}
        {els.contactEl && (
          <Box part="contact" label="Contato" tone="accent">
            {contactUrl && <img src={contactUrl} alt="Contato" className="w-full h-full object-contain" draggable={false} />}
          </Box>
        )}
        {els.mascotEl && (
          <Box part="mascot" label="Mascote" tone="secondary">
            {mascotUrl && <img src={mascotUrl} alt="Mascote" className="w-full h-full object-contain" draggable={false} />}
          </Box>
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
