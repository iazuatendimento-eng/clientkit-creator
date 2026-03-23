import { useState, useEffect, useCallback } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Play, Pause, RotateCcw, ZoomIn, ZoomOut } from "lucide-react";

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
  clipShape?: string;
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

const BASE_PREVIEW_SCALE = 0.28;
const MIN_PREVIEW_SCALE = 0.2;
const MAX_PREVIEW_SCALE = 0.7;
const SCALE_STEP = 0.04;

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
  const [previewScale, setPreviewScale] = useState(BASE_PREVIEW_SCALE);

  const previewW = canvasWidth * previewScale;
  const previewH = canvasHeight * previewScale;

  const elements = currentPage === "content" ? contentElements : signatureElements;

  const adjustPreviewScale = useCallback((direction: "in" | "out") => {
    setPreviewScale((prev) => {
      const next = direction === "in" ? prev + SCALE_STEP : prev - SCALE_STEP;
      return Math.min(MAX_PREVIEW_SCALE, Math.max(MIN_PREVIEW_SCALE, Number(next.toFixed(2))));
    });
  }, []);

  const resetPreviewScale = useCallback(() => {
    setPreviewScale(BASE_PREVIEW_SCALE);
  }, []);

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

  const getClipPathStyle = (el: CanvasElement): React.CSSProperties => {
    const shape = (el as any).clipShape || "rect";
    if (shape === "circle") return { borderRadius: "50%" };
    if (shape === "triangle") return { clipPath: "polygon(50% 0%, 100% 100%, 0% 100%)" };
    if (shape === "diamond") return { clipPath: "polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%)" };
    if (shape === "hexagon") return { clipPath: "polygon(50% 0%, 93.3% 25%, 93.3% 75%, 50% 100%, 6.7% 75%, 6.7% 25%)" };
    if (shape === "pentagon") return { clipPath: "polygon(50% 0%, 97.6% 34.5%, 79.4% 90.5%, 20.6% 90.5%, 2.4% 34.5%)" };
    if (shape === "star") return { clipPath: "polygon(50% 0%, 61.8% 35%, 100% 35%, 69.1% 57%, 80.9% 91%, 50% 70%, 19.1% 91%, 30.9% 57%, 0% 35%, 38.2% 35%)" };
    return {};
  };

  const renderElement = (el: CanvasElement) => {
    const animClass = getAnimClass(el);
    const isAnimated = el.animated !== false && el.animationType && el.animationType !== "none";
    const duration = el.animDuration || 0.8;
    const loop = el.animLoop;

    const baseStyle: React.CSSProperties = {
      position: "absolute",
      left: el.x * previewScale,
      top: el.y * previewScale,
      width: el.width * previewScale,
      height: el.height * previewScale,
      opacity: (el.opacity ?? 100) / 100,
      transform: el.rotation ? `rotate(${el.rotation}deg)` : undefined,
      borderRadius: el.borderRadius ? el.borderRadius * previewScale : undefined,
      borderWidth: el.borderWidth ? el.borderWidth * previewScale : undefined,
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
            fontSize: (el.fontSize || 48) * previewScale,
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
      const w = el.width * previewScale;
      const h = el.height * previewScale;
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
            fontSize: 10 * previewScale,
            color: "rgba(255,255,255,0.6)",
            border: "1px dashed rgba(255,255,255,0.3)",
          }}
        >
          {el.type === "logo" ? "LOGO" : "MASCOTE"}
        </div>
      );
    }

    if (el.type === "image") {
      const clipStyle = getClipPathStyle(el);
      return (
        <div
          key={`${el.id}-${animKey}`}
          className={animClass}
          style={{
            ...baseStyle,
            ...clipStyle,
            backgroundColor: "rgba(255,255,255,0.05)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 10 * previewScale,
            color: "rgba(255,255,255,0.4)",
            border: el.borderWidth ? `${el.borderWidth * previewScale}px solid ${el.borderColor || "#fff"}` : "1px dashed rgba(255,255,255,0.2)",
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
            height: Math.max(2, (el.height || 4) * previewScale),
            backgroundColor: el.color || "#3B82F6",
            borderRadius: 999,
          }}
        />
      );
    }

    // Default: rect and other shapes
    const defaultClipStyle = getClipPathStyle(el);
    return (
      <div
        key={`${el.id}-${animKey}`}
        className={animClass}
        style={{ ...baseStyle, ...defaultClipStyle }}
      />
    );
  };

  const zoomPercentage = Math.round((previewScale / BASE_PREVIEW_SCALE) * 100);

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-[380px] p-0 bg-card border-primary/30 overflow-hidden">
        <div className="p-3 border-b border-primary/20 flex items-center justify-between gap-2">
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
              onClick={() => adjustPreviewScale("out")}
              disabled={previewScale <= MIN_PREVIEW_SCALE}
            >
              <ZoomOut className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-[11px]"
              onClick={resetPreviewScale}
            >
              {zoomPercentage}%
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0"
              onClick={() => adjustPreviewScale("in")}
              disabled={previewScale >= MAX_PREVIEW_SCALE}
            >
              <ZoomIn className="h-4 w-4" />
            </Button>
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
        <div className="flex items-center justify-center p-4 bg-muted/30 overflow-auto max-h-[70vh]">
          <div
            className="relative rounded-lg overflow-hidden shadow-xl shrink-0"
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
