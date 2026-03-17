import { useState, useEffect, useCallback } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Play, Pause, RotateCcw } from "lucide-react";

interface CanvasElement {
  id: string;
  type: string;
  x: number;
  y: number;
  width: number;
  height: number;
  name?: string;
  color?: string;
  text?: string;
  fontSize?: number;
  textAlign?: "left" | "center" | "right";
  lineHeight?: number;
  imageUrl?: string;
  placeholder?: boolean;
  rotation?: number;
  opacity?: number;
  borderRadius?: number;
  borderWidth?: number;
  borderColor?: string;
  animated?: boolean;
  animationType?: string;
  animDuration?: number;
  animLoop?: boolean;
  gradient?: {
    type: "linear" | "radial";
    color1: string;
    color2: string;
    opacity1?: number;
    opacity2?: number;
    angle?: number;
    fadeMode?: boolean;
  };
}

interface TemplatePreviewModalProps {
  open: boolean;
  onClose: () => void;
  contentElements: CanvasElement[];
  signatureElements: CanvasElement[];
  backgroundColor: string;
  pageDuration: number;
  canvasWidth: number;
  canvasHeight: number;
}

export function TemplatePreviewModal({
  open,
  onClose,
  contentElements,
  signatureElements,
  backgroundColor,
  pageDuration,
  canvasWidth,
  canvasHeight,
}: TemplatePreviewModalProps) {
  const [currentPage, setCurrentPage] = useState<"content" | "signature">("content");
  const [playing, setPlaying] = useState(true);
  const [animKey, setAnimKey] = useState(0);

  const PREVIEW_SCALE = 0.28;
  const previewW = canvasWidth * PREVIEW_SCALE;
  const previewH = canvasHeight * PREVIEW_SCALE;

  const elements = currentPage === "content" ? contentElements : signatureElements;

  // Auto-cycle pages
  useEffect(() => {
    if (!open || !playing) return;
    const timer = setTimeout(() => {
      setCurrentPage((p) => (p === "content" ? "signature" : "content"));
      setAnimKey((k) => k + 1);
    }, pageDuration * 1000);
    return () => clearTimeout(timer);
  }, [open, playing, currentPage, pageDuration]);

  // Reset on open
  useEffect(() => {
    if (open) {
      setCurrentPage("content");
      setPlaying(true);
      setAnimKey(0);
    }
  }, [open]);

  const restart = () => {
    setCurrentPage("content");
    setAnimKey((k) => k + 1);
    setPlaying(true);
  };

  const getAnimClass = (el: CanvasElement) => {
    if (el.animated === false || !el.animationType || el.animationType === "none") return "";
    return `anim-preview-${el.animationType}`;
  };

  const getGradientStyle = (el: CanvasElement): string | undefined => {
    if (!el.gradient) return undefined;
    const { type, color1, color2, opacity1 = 100, opacity2 = 100, angle = 0 } = el.gradient;
    const hexToRgba = (hex: string, op: number) => {
      const r = parseInt(hex.slice(1, 3), 16);
      const g = parseInt(hex.slice(3, 5), 16);
      const b = parseInt(hex.slice(5, 7), 16);
      return `rgba(${r},${g},${b},${op / 100})`;
    };
    if (type === "radial") {
      return `radial-gradient(circle, ${hexToRgba(color1, opacity1)}, ${hexToRgba(color2, opacity2)})`;
    }
    return `linear-gradient(${angle}deg, ${hexToRgba(color1, opacity1)}, ${hexToRgba(color2, opacity2)})`;
  };

  const renderElement = (el: CanvasElement) => {
    const animClass = getAnimClass(el);
    const isAnimated = el.animated !== false && el.animationType && el.animationType !== "none";
    const duration = el.animDuration || 0.8;
    const loop = el.animLoop;

    const baseStyle: React.CSSProperties = {
      position: "absolute",
      left: el.x * PREVIEW_SCALE,
      top: el.y * PREVIEW_SCALE,
      width: el.width * PREVIEW_SCALE,
      height: el.height * PREVIEW_SCALE,
      opacity: (el.opacity ?? 100) / 100,
      transform: el.rotation ? `rotate(${el.rotation}deg)` : undefined,
      borderRadius: el.borderRadius ? el.borderRadius * PREVIEW_SCALE : undefined,
      borderWidth: el.borderWidth ? el.borderWidth * PREVIEW_SCALE : undefined,
      borderColor: el.borderColor,
      borderStyle: el.borderWidth ? "solid" : undefined,
      animationDuration: isAnimated ? `${duration}s` : undefined,
      animationIterationCount: isAnimated && loop ? "infinite" : undefined,
      animationDirection: isAnimated && loop ? "alternate" : undefined,
    };

    const gradient = getGradientStyle(el);
    if (gradient) {
      baseStyle.background = gradient;
    } else if (el.color) {
      baseStyle.backgroundColor = el.color;
    }

    // Shape-specific rendering
    if (el.type === "text" || el.type === "contact") {
      return (
        <div
          key={`${el.id}-${animKey}`}
          className={animClass}
          style={{
            ...baseStyle,
            color: el.color || "#ffffff",
            fontSize: (el.fontSize || 48) * PREVIEW_SCALE,
            lineHeight: el.lineHeight || 1.2,
            textAlign: el.textAlign || "left",
            display: "flex",
            alignItems: "center",
            backgroundColor: "transparent",
            background: undefined,
            fontWeight: "normal",
            overflow: "hidden",
            wordBreak: "break-word",
          }}
        >
          {el.text || (el.type === "contact" ? "Contato" : "Texto")}
        </div>
      );
    }

    if (el.type === "circle") {
      baseStyle.borderRadius = "50%";
    }

    if (el.type === "triangle") {
      const w = el.width * PREVIEW_SCALE;
      const h = el.height * PREVIEW_SCALE;
      return (
        <div
          key={`${el.id}-${animKey}`}
          className={animClass}
          style={{
            ...baseStyle,
            backgroundColor: "transparent",
            background: "transparent",
            width: 0,
            height: 0,
            borderLeft: `${w / 2}px solid transparent`,
            borderRight: `${w / 2}px solid transparent`,
            borderBottom: `${h}px solid ${el.color || "#3B82F6"}`,
            borderRadius: 0,
            borderWidth: undefined,
            borderColor: undefined,
            borderStyle: undefined,
          }}
        />
      );
    }

    if (el.type === "logo" || el.type === "mascot") {
      return (
        <div
          key={`${el.id}-${animKey}`}
          className={animClass}
          style={{
            ...baseStyle,
            backgroundColor: "rgba(255,255,255,0.1)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 10 * PREVIEW_SCALE,
            color: "rgba(255,255,255,0.6)",
            border: "1px dashed rgba(255,255,255,0.3)",
          }}
        >
          {el.type === "logo" ? "LOGO" : "MASCOTE"}
        </div>
      );
    }

    if (el.type === "image") {
      return (
        <div
          key={`${el.id}-${animKey}`}
          className={animClass}
          style={{
            ...baseStyle,
            backgroundColor: "rgba(255,255,255,0.05)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 10 * PREVIEW_SCALE,
            color: "rgba(255,255,255,0.4)",
            border: "1px dashed rgba(255,255,255,0.2)",
            overflow: "hidden",
          }}
        >
          {el.imageUrl ? (
            <img src={el.imageUrl} alt="" className="w-full h-full object-cover" />
          ) : (
            "IMG"
          )}
        </div>
      );
    }

    if (el.type === "line") {
      return (
        <div
          key={`${el.id}-${animKey}`}
          className={animClass}
          style={{
            ...baseStyle,
            height: Math.max(2, (el.height || 4) * PREVIEW_SCALE),
            backgroundColor: el.color || "#3B82F6",
            borderRadius: 999,
          }}
        />
      );
    }

    // Default: rect and other shapes
    return (
      <div
        key={`${el.id}-${animKey}`}
        className={animClass}
        style={baseStyle}
      />
    );
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-[380px] p-0 bg-card border-primary/30 overflow-hidden">
        <div className="p-3 border-b border-primary/20 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-foreground">Preview Template</span>
            <span className="text-xs text-muted-foreground px-2 py-0.5 rounded bg-muted">
              {currentPage === "content" ? "Conteúdo" : "Assinatura"}
            </span>
          </div>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0"
              onClick={() => setPlaying(!playing)}
            >
              {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0"
              onClick={restart}
            >
              <RotateCcw className="h-4 w-4" />
            </Button>
          </div>
        </div>
        <div className="flex items-center justify-center p-4 bg-muted/30">
          <div
            className="relative rounded-lg overflow-hidden shadow-xl"
            style={{
              width: previewW,
              height: previewH,
              backgroundColor,
            }}
          >
            {/* Page label */}
            <div className="absolute inset-x-0 top-4 text-center text-[10px] text-white/20 font-bold uppercase pointer-events-none z-0">
              {currentPage === "content" ? "Página de Conteúdo" : "Página de Assinatura"}
            </div>
            {/* Elements */}
            {elements.map((el) => renderElement(el))}
            {/* Progress bar */}
            <div className="absolute bottom-0 left-0 right-0 h-1 bg-black/20">
              <div
                className="h-full bg-primary"
                style={{
                  animation: playing
                    ? `progress ${pageDuration}s linear`
                    : "none",
                  animationFillMode: "forwards",
                }}
                key={`progress-${animKey}-${currentPage}`}
              />
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
