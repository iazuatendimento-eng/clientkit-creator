import { useMemo, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

type ElementType = "rect" | "circle" | "text" | "image" | "logo" | "contact" | "mascot" | "triangle" | "line" | "star" | "diamond" | "hexagon" | "pentagon";

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
  previewUrl,
  isBusy,
  photoOffsetX,
  photoOffsetY,
  photoScale,
  setPhotoOffsetX,
  setPhotoOffsetY,
  setPhotoScale,
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

  photoOffsetX: number;
  photoOffsetY: number;
  photoScale: number;
  setPhotoOffsetX: (v: number) => void;
  setPhotoOffsetY: (v: number) => void;
  setPhotoScale: (v: number) => void;

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
      // Photo box visually scales with photoScale so user can see the resize effect
      const scaledW = els.photoFrame.width * (photoScale / 100);
      const scaledH = els.photoFrame.height * (photoScale / 100);
      // Center the scaled box around the original center, then apply offset
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
      return {
        x: els.textEl.x + textX,
        y: els.textEl.y + textY,
        w: els.textEl.width,
        h: Math.max(140, els.textEl.height * 3),
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
    const photoW = els.photoFrame ? els.photoFrame.width * (photoScale / 100) : 0;
    const photoH = els.photoFrame ? els.photoFrame.height * (photoScale / 100) : 0;

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

    const onMove = (ev: PointerEvent) => {
      const s = startRef.current;
      const r = containerRef.current?.getBoundingClientRect();
      if (!s || !r) return;

      const dxClient = ev.clientX - s.startClientX;
      const dyClient = ev.clientY - s.startClientY;

      const dx = (dxClient / r.width) * template.width;
      const dy = (dyClient / r.height) * template.height;

      if (s.part === "photo") {
        if (s.mode === "move") {
          setPhotoOffsetX(clamp(s.start.photoOffsetX + dx, -100, 100));
          setPhotoOffsetY(clamp(s.start.photoOffsetY + dy, -100, 100));
          return;
        }

        // Resize photo - use height for vertical handles, width for horizontal
        const h = s.handle as Handle;
        const isVerticalHandle = h === "n" || h === "s";
        const isHorizontalHandle = h === "e" || h === "w";
        
        const baseW = els.photoFrame?.width || 1;
        const baseH = els.photoFrame?.height || 1;

        let signedDelta: number;
        let baseDimension: number;
        let startDimension: number;

        if (isVerticalHandle) {
          // For N/S handles, use height-based calculation
          signedDelta = handleSignY(h) * dy;
          baseDimension = baseH;
          startDimension = s.start.photoH;
        } else if (isHorizontalHandle) {
          // For E/W handles, use width-based calculation
          signedDelta = handleSignX(h) * dx;
          baseDimension = baseW;
          startDimension = s.start.photoW;
        } else {
          // For corner handles, use the dominant direction
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

        if (isHorizontalHandle) {
          const signedDx = handleSignX(h) * dx;
          const newW = clamp(s.start.logoW + signedDx, baseW * 0.25, baseW * 3);
          const newScaleX = clamp((newW / baseW) * 100, 25, 300);
          setLogoScaleX(newScaleX);
          if (handleHasW(h)) setLogoX(clamp(s.start.logoX + dx, -200, 200));
        } else if (isVerticalHandle) {
          const signedDy = handleSignY(h) * dy;
          const newH = clamp(s.start.logoH + signedDy, baseH * 0.25, baseH * 3);
          const newScaleY = clamp((newH / baseH) * 100, 25, 300);
          setLogoScaleY(newScaleY);
          if (handleHasN(h)) setLogoY(clamp(s.start.logoY + dy, -200, 200));
        } else {
          // Corner handles - update both X and Y
          const signedDx = handleSignX(h) * dx;
          const signedDy = handleSignY(h) * dy;
          const newW = clamp(s.start.logoW + signedDx, baseW * 0.25, baseW * 3);
          const newH = clamp(s.start.logoH + signedDy, baseH * 0.25, baseH * 3);
          const newScaleX = clamp((newW / baseW) * 100, 25, 300);
          const newScaleY = clamp((newH / baseH) * 100, 25, 300);
          setLogoScaleX(newScaleX);
          setLogoScaleY(newScaleY);
          if (handleHasW(h)) setLogoX(clamp(s.start.logoX + dx, -200, 200));
          if (handleHasN(h)) setLogoY(clamp(s.start.logoY + dy, -200, 200));
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
          // Corner handles - update both X and Y
          const signedDx = handleSignX(h) * dx;
          const signedDy = handleSignY(h) * dy;
          const newW = clamp(s.start.contactW + signedDx, baseW * 0.25, baseW * 3);
          const newH = clamp(s.start.contactH + signedDy, baseH * 0.25, baseH * 3);
          const newScaleX = clamp((newW / baseW) * 100, 25, 300);
          const newScaleY = clamp((newH / baseH) * 100, 25, 300);
          setContactScaleX(newScaleX);
          setContactScaleY(newScaleY);
          if (handleHasW(h)) setContactX(clamp(s.start.contactX + dx, -200, 200));
          if (handleHasN(h)) setContactY(clamp(s.start.contactY + dy, -200, 200));
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
        const h = s.handle as Handle;

        const signedDx = handleHasW(h) || handleHasE(h) ? handleSignX(h) * dx : 0;
        const signedDy = handleHasN(h) || handleHasS(h) ? handleSignY(h) * dy : 0;
        const signedDelta = Math.abs(signedDx) > Math.abs(signedDy) ? signedDx : signedDy;

        const newW = clamp(s.start.textW + signedDelta, baseW * 0.5, baseW * 2);
        const newScale = clamp((newW / baseW) * 100, 50, 200);
        setTextFontSize(newScale);

        if (handleHasW(h)) setTextX(clamp(s.start.textX + dx, -200, 200));
        if (handleHasN(h)) setTextY(clamp(s.start.textY + dy, -200, 200));
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

    const left = (rect.x / template.width) * 100;
    const top = (rect.y / template.height) * 100;
    const width = (rect.w / template.width) * 100;
    const height = (rect.h / template.height) * 100;

    const isActive = active === part;

    const HandleDot = ({ h }: { h: Handle }) => {
      // Keep handles INSIDE the box so they never get clipped by the container.
      const pos =
        h === "nw"
          ? "left-0 top-0"
          : h === "ne"
            ? "right-0 top-0 -translate-x-full"
            : h === "sw"
              ? "left-0 bottom-0 -translate-y-full"
              : h === "se"
                ? "right-0 bottom-0 -translate-x-full -translate-y-full"
                : h === "n"
                  ? "left-1/2 top-0 -translate-x-1/2"
                  : h === "s"
                    ? "left-1/2 bottom-0 -translate-x-1/2 -translate-y-full"
                    : h === "w"
                      ? "left-0 top-1/2 -translate-y-1/2"
                      : "right-0 top-1/2 -translate-x-full -translate-y-1/2";

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
          className={cn(
            "absolute z-30 touch-none",
            pos,
            cursor,
            "h-6 w-6 flex items-center justify-center"
          )}
          onPointerDown={(e) => {
            e.preventDefault();
            e.stopPropagation();
            begin(e, part, "resize", h);
          }}
        >
          <div className="h-4 w-4 rounded-sm border-2 border-background bg-primary shadow-md" />
        </div>
      );
    };

    return (
      <div
        className={cn(
          "absolute rounded-md border-2 border-dashed bg-background/0 touch-none",
          isActive ? "border-primary bg-primary/5 z-20" : "border-border/70 hover:border-primary/70 z-10"
        )}
        style={{ left: `${left}%`, top: `${top}%`, width: `${width}%`, height: `${height}%` }}
        onPointerDown={(e) => begin(e, part, "move")}
      >
        <div className="absolute -top-6 left-0 rounded border bg-background/80 px-1.5 py-0.5 text-[10px] text-foreground shadow-sm z-30">
          {label}
        </div>

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

  return (
    <div
      ref={containerRef}
      className="relative mx-auto w-full max-w-md aspect-[4/5] overflow-hidden rounded-lg border bg-muted"
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

      <div className="absolute left-3 bottom-3 z-40 rounded-md border bg-background/80 backdrop-blur px-2 py-1">
        <label className="mr-2 text-[10px] text-muted-foreground">Camada</label>
        <select
          className="bg-transparent text-xs text-foreground outline-none"
          value={active}
          onChange={(e) => setActive(e.target.value as Part)}
        >
          {partOptions.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
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
