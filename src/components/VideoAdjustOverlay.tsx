import { useMemo, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

type ElementType = "rect" | "circle" | "text" | "image" | "logo" | "contact" | "mascot";

interface CanvasElement {
  id?: string;
  type: ElementType;
  x: number;
  y: number;
  width: number;
  height: number;
  placeholder?: boolean;
}

interface VideoTemplateLike {
  width: number;
  height: number;
  contentElements: CanvasElement[];
  signatureElements: CanvasElement[];
}

type Handle = "nw" | "ne" | "sw" | "se" | "n" | "s" | "e" | "w";
type Part = "logo" | "contact" | "mascot";

const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));

const handleHasW = (h: Handle) => h === "nw" || h === "sw" || h === "w";
const handleHasE = (h: Handle) => h === "ne" || h === "se" || h === "e";
const handleHasN = (h: Handle) => h === "nw" || h === "ne" || h === "n";
const handleHasS = (h: Handle) => h === "sw" || h === "se" || h === "s";

const handleSignX = (h: Handle) => (handleHasW(h) ? -1 : 1);
const handleSignY = (h: Handle) => (handleHasN(h) ? -1 : 1);

export function VideoAdjustOverlay({
  template,
  previewUrl,
  isBusy,
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
}: {
  template: VideoTemplateLike;
  previewUrl: string | null;
  isBusy?: boolean;

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
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState<Part>("logo");

  // Combine content and signature elements to find logo/contact/mascot
  const els = useMemo(() => {
    const allElements = [...template.contentElements, ...template.signatureElements];
    const logoEl = allElements.find((e) => e.type === "logo");
    const contactEl = allElements.find((e) => e.type === "contact");
    const mascotEl = allElements.find((e) => e.type === "mascot");
    return { logoEl, contactEl, mascotEl };
  }, [template.contentElements, template.signatureElements]);

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
        };
      }
  >(null);

  const begin = (e: React.PointerEvent, part: Part, mode: "move" | "resize", handle?: Handle) => {
    e.preventDefault();
    e.stopPropagation();

    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;

    const logoW = els.logoEl ? els.logoEl.width * (logoScaleX / 100) : 0;
    const logoH = els.logoEl ? els.logoEl.height * (logoScaleY / 100) : 0;
    const contactW = els.contactEl ? els.contactEl.width * (contactScaleX / 100) : 0;
    const contactH = els.contactEl ? els.contactEl.height * (contactScaleY / 100) : 0;
    const mascotW = els.mascotEl ? els.mascotEl.width * (mascotScaleX / 100) : 0;
    const mascotH = els.mascotEl ? els.mascotEl.height * (mascotScaleY / 100) : 0;

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
          // Corner handles - update both X and Y
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
    color,
  }: {
    part: Part;
    label: string;
    color: string;
  }) => {
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
            color
          )}
          onPointerDown={(e) => begin(e, part, "resize", h)}
        />
      );
    };

    return (
      <div
        className={cn(
          "absolute rounded-md border-2 border-dashed bg-background/0 touch-none cursor-move",
          isActive ? `border-${color.replace("bg-", "")} bg-${color.replace("bg-", "")}/10` : "border-border/70 hover:border-primary/70"
        )}
        style={{ 
          left: `${left}%`, 
          top: `${top}%`, 
          width: `${width}%`, 
          height: `${height}%`,
          borderColor: isActive ? undefined : undefined,
        }}
        onPointerDown={(e) => begin(e, part, "move")}
      >
        <div className={cn("absolute -top-6 left-0 rounded border px-1.5 py-0.5 text-[10px] shadow-sm", color, "text-white")}>
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
      className="relative mx-auto w-full aspect-[9/16] overflow-hidden rounded-lg border bg-muted"
    >
      {previewUrl ? (
        <img
          src={previewUrl}
          alt="Prévia do vídeo"
          className={cn(
            "absolute inset-0 h-full w-full object-contain",
            isBusy ? "opacity-80" : "opacity-100"
          )}
          draggable={false}
        />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground">
          Sem prévia
        </div>
      )}

      <div className="absolute inset-0">
        {els.logoEl && <Box part="logo" label="Logo" color="bg-blue-500" />}
        {els.contactEl && <Box part="contact" label="Contato" color="bg-green-500" />}
        {els.mascotEl && <Box part="mascot" label="Mascote" color="bg-purple-500" />}
      </div>

      {isBusy && (
        <div className="absolute inset-0 flex items-center justify-center bg-background/20 pointer-events-none">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      )}
    </div>
  );
}
