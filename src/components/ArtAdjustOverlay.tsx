import { useMemo, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

type ElementType = "rect" | "circle" | "text" | "image" | "logo" | "contact" | "mascot";

interface CanvasElement {
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

type Part = "photo" | "logo" | "text" | "contact";
type Handle = "nw" | "ne" | "sw" | "se";

const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));

function handleHasW(h: Handle) {
  return h === "nw" || h === "sw";
}
function handleHasN(h: Handle) {
  return h === "nw" || h === "ne";
}
function handleSignX(h: Handle) {
  return h === "nw" || h === "sw" ? -1 : 1;
}

export function ArtAdjustOverlay({
  template,
  previewUrl,
  isBusy,
  photoOffsetX,
  photoOffsetY,
  setPhotoOffsetX,
  setPhotoOffsetY,
  logoX,
  logoY,
  logoScale,
  setLogoX,
  setLogoY,
  setLogoScale,
  textX,
  textY,
  textFontSize,
  setTextX,
  setTextY,
  setTextFontSize,
  contactX,
  contactY,
  contactScale,
  setContactX,
  setContactY,
  setContactScale,
}: {
  template: MasterTemplateLike;
  previewUrl: string | null;
  isBusy?: boolean;

  photoOffsetX: number;
  photoOffsetY: number;
  setPhotoOffsetX: (v: number) => void;
  setPhotoOffsetY: (v: number) => void;

  logoX: number;
  logoY: number;
  logoScale: number;
  setLogoX: (v: number) => void;
  setLogoY: (v: number) => void;
  setLogoScale: (v: number) => void;

  textX: number;
  textY: number;
  textFontSize: number;
  setTextX: (v: number) => void;
  setTextY: (v: number) => void;
  setTextFontSize: (v: number) => void;

  contactX: number;
  contactY: number;
  contactScale: number;
  setContactX: (v: number) => void;
  setContactY: (v: number) => void;
  setContactScale: (v: number) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState<Part>("photo");

  const els = useMemo(() => {
    const photoFrame = template.elements.find((e) => e.type === "image" && e.placeholder);
    const logoEl = template.elements.find((e) => e.type === "logo");
    const contactEl = template.elements.find((e) => e.type === "contact");
    const textEl = template.elements.find((e) => e.type === "text");
    return { photoFrame, logoEl, contactEl, textEl };
  }, [template.elements]);

  const getRect = (part: Part) => {
    if (part === "photo") {
      if (!els.photoFrame) return null;
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
        w: els.logoEl.width * (logoScale / 100),
        h: els.logoEl.height * (logoScale / 100),
      };
    }

    if (part === "contact") {
      if (!els.contactEl) return null;
      return {
        x: els.contactEl.x + contactX,
        y: els.contactEl.y + contactY,
        w: els.contactEl.width * (contactScale / 100),
        h: els.contactEl.height * (contactScale / 100),
      };
    }

    // text
    if (!els.textEl) return null;
    return {
      x: els.textEl.x + textX,
      y: els.textEl.y + textY,
      w: els.textEl.width,
      h: Math.max(140, els.textEl.height * 3),
    };
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
          logoX: number;
          logoY: number;
          logoScale: number;
          textX: number;
          textY: number;
          textFontSize: number;
          contactX: number;
          contactY: number;
          contactScale: number;
          logoW: number;
          contactW: number;
          textW: number;
        };
      }
  >(null);

  const begin = (e: React.PointerEvent, part: Part, mode: "move" | "resize", handle?: Handle) => {
    e.preventDefault();
    e.stopPropagation();

    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;

    const logoW = els.logoEl ? els.logoEl.width * (logoScale / 100) : 0;
    const contactW = els.contactEl ? els.contactEl.width * (contactScale / 100) : 0;
    const textW = els.textEl ? els.textEl.width * (textFontSize / 100) : 0;

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
        logoX,
        logoY,
        logoScale,
        textX,
        textY,
        textFontSize,
        contactX,
        contactY,
        contactScale,
        logoW,
        contactW,
        textW,
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
        setPhotoOffsetX(clamp(s.start.photoOffsetX + dx, -100, 100));
        setPhotoOffsetY(clamp(s.start.photoOffsetY + dy, -100, 100));
        return;
      }

      if (s.part === "logo") {
        if (s.mode === "move") {
          setLogoX(clamp(s.start.logoX + dx, -200, 200));
          setLogoY(clamp(s.start.logoY + dy, -200, 200));
          return;
        }

        const baseW = els.logoEl?.width || 1;
        const handle = s.handle || "se";
        const signedDx = handleSignX(handle) * dx;
        const newW = clamp(s.start.logoW + signedDx, baseW * 0.25, baseW * 2);
        const newScale = clamp((newW / baseW) * 100, 25, 200);
        setLogoScale(newScale);

        if (handleHasW(handle)) setLogoX(clamp(s.start.logoX + dx, -200, 200));
        if (handleHasN(handle)) setLogoY(clamp(s.start.logoY + dy, -200, 200));
        return;
      }

      if (s.part === "contact") {
        if (s.mode === "move") {
          setContactX(clamp(s.start.contactX + dx, -200, 200));
          setContactY(clamp(s.start.contactY + dy, -200, 200));
          return;
        }

        const baseW = els.contactEl?.width || 1;
        const handle = s.handle || "se";
        const signedDx = handleSignX(handle) * dx;
        const newW = clamp(s.start.contactW + signedDx, baseW * 0.25, baseW * 2);
        const newScale = clamp((newW / baseW) * 100, 25, 200);
        setContactScale(newScale);

        if (handleHasW(handle)) setContactX(clamp(s.start.contactX + dx, -200, 200));
        if (handleHasN(handle)) setContactY(clamp(s.start.contactY + dy, -200, 200));
        return;
      }

      // text
      if (s.mode === "move") {
        setTextX(clamp(s.start.textX + dx, -200, 200));
        setTextY(clamp(s.start.textY + dy, -200, 200));
        return;
      }

      const baseW = els.textEl?.width || 1;
      const handle = s.handle || "se";
      const signedDx = handleSignX(handle) * dx;
      const newW = clamp(s.start.textW + signedDx, baseW * 0.5, baseW * 2);
      const newScale = clamp((newW / baseW) * 100, 50, 200);
      setTextFontSize(newScale);

      if (handleHasW(handle)) setTextX(clamp(s.start.textX + dx, -200, 200));
      if (handleHasN(handle)) setTextY(clamp(s.start.textY + dy, -200, 200));
    };

    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      startRef.current = null;
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  const Box = ({ part, label, resizable }: { part: Part; label: string; resizable?: boolean }) => {
    const rect = getRect(part);
    if (!rect) return null;

    const left = (rect.x / template.width) * 100;
    const top = (rect.y / template.height) * 100;
    const width = (rect.w / template.width) * 100;
    const height = (rect.h / template.height) * 100;

    const isActive = active === part;

    const HandleDot = ({ h }: { h: Handle }) => {
      const pos =
        h === "nw"
          ? "-left-1.5 -top-1.5"
          : h === "ne"
            ? "-right-1.5 -top-1.5"
            : h === "sw"
              ? "-left-1.5 -bottom-1.5"
              : "-right-1.5 -bottom-1.5";

      return (
        <button
          type="button"
          aria-label={`Redimensionar ${label}`}
          className={cn(
            "absolute z-20 h-3.5 w-3.5 rounded-sm border-2 border-background bg-primary",
            pos
          )}
          onPointerDown={(e) => begin(e, part, "resize", h)}
        />
      );
    };

    return (
      <div
        className={cn(
          "absolute rounded-md border-2 border-dashed bg-background/0 touch-none",
          isActive ? "border-primary bg-primary/5" : "border-border/70 hover:border-primary/70"
        )}
        style={{ left: `${left}%`, top: `${top}%`, width: `${width}%`, height: `${height}%` }}
        onPointerDown={(e) => begin(e, part, "move")}
      >
        <div className="absolute -top-6 left-0 rounded border bg-background/80 px-1.5 py-0.5 text-[10px] text-foreground shadow-sm">
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

  return (
    <div
      ref={containerRef}
      className="relative mx-auto w-full max-w-md aspect-[4/5] overflow-hidden rounded-lg border bg-muted"
    >
      {previewUrl ? (
        <img
          src={previewUrl}
          alt="Prévia da arte gerada"
          className={cn("absolute inset-0 h-full w-full object-cover", isBusy ? "opacity-80" : "opacity-100")}
          draggable={false}
        />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground">
          Sem prévia
        </div>
      )}

      <div className="absolute inset-0">
        <Box part="photo" label="Foto" />
        <Box part="logo" label="Logo" resizable />
        <Box part="text" label="Texto" resizable />
        <Box part="contact" label="Contato" resizable />
      </div>

      {isBusy && (
        <div className="absolute inset-0 flex items-center justify-center bg-background/20 pointer-events-none">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      )}
    </div>
  );
}
