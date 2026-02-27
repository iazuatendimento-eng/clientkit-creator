import { useState, useEffect, useCallback } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Loader2, Download, Palette } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { drawNewShape } from "@/lib/canvasShapes";

// ── Types ──────────────────────────────────────────────────────────────────────

interface CanvasElement {
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
  colorRole?: "background" | "text" | "accessory1" | "accessory2";
  opacity?: number;
  borderRadius?: number;
  borderWidth?: number;
  borderColor?: string;
  borderColorRole?: "background" | "text" | "accessory1" | "accessory2";
  clipShape?: "rect" | "circle";
  shadowBlur?: number;
  shadowColor?: string;
  shadowOffsetX?: number;
  shadowOffsetY?: number;
  gradient?: {
    type: "linear" | "radial";
    color1: string;
    color2: string;
    color1Role?: string;
    color2Role?: string;
    opacity1?: number;
    opacity2?: number;
    angle?: number;
    fadeMode?: boolean;
  };
  rotation?: number;
}

interface ArtTemplate {
  id: string;
  name: string;
  elements: CanvasElement[];
  width: number;
  height: number;
  backgroundColor: string;
}

interface ArtGeneratorModalProps {
  isOpen: boolean;
  onClose: () => void;
  cardId: string;
  cardTitle: string;
  cardText: string;
  brandKit: any;
  clientName: string;
  cardIndex: number;
  onExported?: () => void;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

const imageCache = new Map<string, HTMLImageElement>();

const loadImage = async (url: string): Promise<HTMLImageElement | null> => {
  if (!url) return null;
  const cacheKey = url.length > 200 ? url.substring(0, 100) + url.length : url;
  const cached = imageCache.get(cacheKey);
  if (cached) return cached;

  if (url.startsWith("data:")) {
    return new Promise((resolve) => {
      const el = new Image();
      el.onload = () => { imageCache.set(cacheKey, el); resolve(el); };
      el.onerror = () => resolve(null);
      el.src = url;
    });
  }

  // Fetch as blob
  try {
    const resp = await fetch(url);
    if (resp.ok) {
      const blob = await resp.blob();
      const objUrl = URL.createObjectURL(blob);
      return new Promise((resolve) => {
        const el = new Image();
        el.onload = () => { imageCache.set(cacheKey, el); resolve(el); };
        el.onerror = () => resolve(null);
        el.src = objUrl;
      });
    }
  } catch { /* fallback */ }

  // CORS fallback
  return new Promise((resolve) => {
    const el = new Image();
    el.crossOrigin = "anonymous";
    el.onload = () => { imageCache.set(cacheKey, el); resolve(el); };
    el.onerror = () => resolve(null);
    el.src = url;
  });
};

const SYSTEM_FONTS = new Set([
  "Arial", "Verdana", "Helvetica", "Tahoma", "Trebuchet MS",
  "Times New Roman", "Georgia", "Garamond", "Courier New",
  "Impact", "Comic Sans MS", "Segoe UI", "Lucida Sans",
]);

const loadGoogleFont = async (fontFamily: string): Promise<void> => {
  if (!fontFamily || SYSTEM_FONTS.has(fontFamily)) return;
  const id = `google-font-${fontFamily.replace(/\s+/g, "-")}`;
  if (document.getElementById(id)) return;
  const link = document.createElement("link");
  link.id = id;
  link.rel = "stylesheet";
  link.href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(fontFamily)}:wght@400;700&display=swap`;
  document.head.appendChild(link);
  try { await document.fonts.load(`16px "${fontFamily}"`); } catch { /* ok */ }
};

// ── Render art ─────────────────────────────────────────────────────────────────

async function renderArt(
  template: ArtTemplate,
  brandKit: any,
  cardText: string,
  materialImages: string[],
): Promise<string> {
  const canvas = document.createElement("canvas");
  canvas.width = template.width;
  canvas.height = template.height;
  const ctx = canvas.getContext("2d")!;

  const bgColor = brandKit?.colors?.[0] || template.backgroundColor;
  const textColor = brandKit?.colors?.[1] || "#000000";
  const acc1 = brandKit?.colors?.[2] || "#cccccc";
  const acc2 = brandKit?.colors?.[3] || "#aaaaaa";

  const getColor = (el: CanvasElement, def: string) => {
    if (el.colorRole === "background") return bgColor;
    if (el.colorRole === "text") return textColor;
    if (el.colorRole === "accessory1") return acc1;
    if (el.colorRole === "accessory2") return acc2;
    return el.color || def;
  };

  const getBorderColor = (el: CanvasElement) => {
    if (el.borderColorRole === "background") return bgColor;
    if (el.borderColorRole === "text") return textColor;
    if (el.borderColorRole === "accessory1") return acc1;
    if (el.borderColorRole === "accessory2") return acc2;
    return el.borderColor || "#000000";
  };

  const drawBorder = (el: CanvasElement) => {
    if (el.borderWidth && el.borderWidth > 0) {
      ctx.globalAlpha = 1;
      ctx.strokeStyle = getBorderColor(el);
      ctx.lineWidth = el.borderWidth;
      ctx.stroke();
      ctx.globalAlpha = (el.opacity ?? 100) / 100;
    }
  };

  const hexToRgba = (hex: string, op: number) => {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r},${g},${b},${op / 100})`;
  };

  const getFill = (el: CanvasElement, x: number, y: number, w: number, h: number, def: string): string | CanvasGradient => {
    if (el.gradient) {
      let gradient: CanvasGradient;
      if (el.gradient.type === "linear") {
        const angle = (el.gradient.angle || 0) * Math.PI / 180;
        const cx2 = x + w / 2, cy2 = y + h / 2;
        const dx = Math.cos(angle) * w / 2, dy = Math.sin(angle) * h / 2;
        gradient = ctx.createLinearGradient(cx2 - dx, cy2 - dy, cx2 + dx, cy2 + dy);
      } else {
        gradient = ctx.createRadialGradient(x + w / 2, y + h / 2, 0, x + w / 2, y + h / 2, Math.max(w, h) / 2);
      }
      const c1 = el.gradient.color1Role === "background" ? bgColor : el.gradient.color1Role === "text" ? textColor : el.gradient.color1Role === "accessory1" ? acc1 : el.gradient.color1Role === "accessory2" ? acc2 : el.gradient.color1;
      const c2Raw = el.gradient.color2Role === "background" ? bgColor : el.gradient.color2Role === "text" ? textColor : el.gradient.color2Role === "accessory1" ? acc1 : el.gradient.color2Role === "accessory2" ? acc2 : el.gradient.color2;
      const c2 = el.gradient.fadeMode ? c1 : c2Raw;
      gradient.addColorStop(0, hexToRgba(c1, el.gradient.opacity1 ?? 100));
      gradient.addColorStop(1, hexToRgba(c2, el.gradient.opacity2 ?? (el.gradient.fadeMode ? 0 : 100)));
      return gradient;
    }
    return getColor(el, def);
  };

  const applyStyles = (el: CanvasElement) => {
    ctx.globalAlpha = (el.opacity ?? 100) / 100;
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

  // Background
  ctx.fillStyle = bgColor;
  ctx.fillRect(0, 0, template.width, template.height);

  for (const el of template.elements) {
    ctx.save();
    applyStyles(el);

    if (el.rotation) {
      const cx2 = el.x + el.width / 2;
      const cy2 = el.y + el.height / 2;
      ctx.translate(cx2, cy2);
      ctx.rotate((el.rotation * Math.PI) / 180);
      ctx.translate(-cx2, -cy2);
    }

    const { x, y, width: w, height: h } = el;

    if (el.type === "rect") {
      ctx.fillStyle = getFill(el, x, y, w, h, acc1) as string;
      if (el.borderRadius && el.borderRadius > 0) {
        ctx.beginPath();
        ctx.roundRect(x, y, w, h, el.borderRadius);
        ctx.fill();
        drawBorder(el);
      } else {
        ctx.fillRect(x, y, w, h);
        if (el.borderWidth) { ctx.beginPath(); ctx.rect(x, y, w, h); drawBorder(el); }
      }
    } else if (el.type === "circle") {
      ctx.fillStyle = getFill(el, x, y, w, h, acc2) as string;
      ctx.beginPath();
      ctx.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, 0, 0, Math.PI * 2);
      ctx.fill();
      drawBorder(el);
    } else if (el.type === "triangle") {
      ctx.fillStyle = getFill(el, x, y, w, h, acc1) as string;
      ctx.beginPath();
      ctx.moveTo(x + w / 2, y); ctx.lineTo(x + w, y + h); ctx.lineTo(x, y + h);
      ctx.closePath(); ctx.fill(); drawBorder(el);
    } else if (el.type === "line") {
      ctx.strokeStyle = getColor(el, acc1);
      ctx.lineWidth = h || 4;
      ctx.lineCap = "round";
      ctx.beginPath(); ctx.moveTo(x, y + h / 2); ctx.lineTo(x + w, y + h / 2); ctx.stroke();
    } else if (el.type === "text") {
      ctx.fillStyle = textColor;
      const fontSize = el.fontSize || 32;
      const fontFamily = brandKit?.font || brandKit?.fontFamily || "Arial";
      ctx.font = `${fontSize}px ${fontFamily}`;
      const text = cardText || el.text || "";
      const align = el.textAlign || "left";
      ctx.textAlign = align;
      const drawX = align === "center" ? x + w / 2 : align === "right" ? x + w : x;
      const words = text.split(" ");
      let line = "";
      let ly = y + fontSize;
      const lineH = (el.lineHeight || 1.2) * fontSize;
      for (let i = 0; i < words.length; i++) {
        const testLine = line + words[i] + " ";
        if (ctx.measureText(testLine).width > w && i > 0) {
          ctx.fillText(line.trim(), drawX, ly);
          line = words[i] + " ";
          ly += lineH;
        } else {
          line = testLine;
        }
      }
      ctx.fillText(line.trim(), drawX, ly);
      ctx.textAlign = "left";
    } else if (el.type === "image" && el.placeholder && materialImages.length > 0) {
      const img = await loadImage(materialImages[0]);
      if (img) {
        const clipShape = (el as any).clipShape || "rect";
        const radius = el.borderRadius || 0;
        if (clipShape === "circle") {
          ctx.beginPath();
          ctx.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, 0, 0, Math.PI * 2);
          ctx.clip();
        } else if (radius > 0) {
          ctx.beginPath();
          ctx.roundRect(x, y, w, h, radius);
          ctx.clip();
        }
        // Cover crop
        const imgA = img.width / img.height;
        const frameA = w / h;
        let sw = img.width, sh = img.height;
        if (imgA > frameA) { sh = img.height; sw = sh * frameA; }
        else { sw = img.width; sh = sw / frameA; }
        const sx = (img.width - sw) / 2;
        const sy = (img.height - sh) / 2;
        ctx.drawImage(img, sx, sy, sw, sh, x, y, w, h);
      } else {
        ctx.fillStyle = "#e5e7eb";
        ctx.fillRect(x, y, w, h);
      }
    } else if (el.type === "logo") {
      const logoUrl = brandKit?.pngs?.[0] || brandKit?.logo;
      if (logoUrl) {
        const img = await loadImage(logoUrl);
        if (img) ctx.drawImage(img, x, y, w, h);
      }
    } else if (el.type === "contact") {
      const contactUrl = brandKit?.pngs?.[1] || brandKit?.contactInfo;
      if (contactUrl) {
        const img = await loadImage(contactUrl);
        if (img) ctx.drawImage(img, x, y, w, h);
      }
    } else if (el.type === "mascot") {
      const mascotUrl = brandKit?.pngs?.[2] || brandKit?.mascot;
      if (mascotUrl) {
        const img = await loadImage(mascotUrl);
        if (img) ctx.drawImage(img, x, y, w, h);
      }
    } else {
      // Try shape helpers (diamond, hexagon, pentagon, star, etc.)
      ctx.fillStyle = getFill(el, x, y, w, h, acc1) as string;
      drawNewShape(ctx, el.type as any, x, y, w, h, ctx.fillStyle as string);
    }

    ctx.restore();
  }

  return canvas.toDataURL("image/png");
}

// ── Component ──────────────────────────────────────────────────────────────────

export function ArtGeneratorModal({
  isOpen,
  onClose,
  cardId,
  cardTitle,
  cardText,
  brandKit,
  clientName,
  cardIndex,
  onExported,
}: ArtGeneratorModalProps) {
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [artDataUrl, setArtDataUrl] = useState<string | null>(null);

  const generateArt = useCallback(async () => {
    setStatus("loading");
    setArtDataUrl(null);

    try {
      const { data: templates, error } = await supabase
        .from("master_templates")
        .select("*")
        .order("created_at", { ascending: true });

      if (error || !templates || templates.length === 0) {
        toast.error("Nenhum template de arte encontrado");
        setStatus("error");
        return;
      }

      const selectedIdx = cardIndex % templates.length;
      const raw = templates[selectedIdx];
      const tmpl: ArtTemplate = {
        id: raw.id,
        name: raw.name,
        elements: (raw.elements || []) as unknown as CanvasElement[],
        width: raw.width,
        height: raw.height,
        backgroundColor: raw.background_color,
      };

      const fontFamily = brandKit?.font || brandKit?.fontFamily || "Arial";
      await loadGoogleFont(fontFamily);

      // Load material images from card uploads
      let matImages: string[] = [];
      try {
        const { data: uploads } = await supabase
          .from("card_uploads")
          .select("file_url, file_type")
          .eq("card_id", cardId)
          .eq("upload_type", "material");
        matImages = (uploads || [])
          .filter(u => u.file_type.startsWith("image"))
          .map(u => u.file_url);
      } catch { /* ignore */ }

      const text = cardText || cardTitle || clientName;
      const dataUrl = await renderArt(tmpl, brandKit, text, matImages);
      setArtDataUrl(dataUrl);
      setStatus("ready");
    } catch (err) {
      console.error("Art generation error:", err);
      toast.error("Erro ao gerar arte");
      setStatus("error");
    }
  }, [cardId, cardTitle, cardText, brandKit, clientName, cardIndex]);

  useEffect(() => {
    if (isOpen) {
      generateArt();
    } else {
      setStatus("loading");
      setArtDataUrl(null);
    }
  }, [isOpen]);

  const handleDownload = () => {
    if (!artDataUrl) return;
    const link = document.createElement("a");
    link.download = `${clientName}-${cardTitle.slice(0, 20)}.png`;
    link.href = artDataUrl;
    link.click();
    onExported?.();
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Palette className="h-5 w-5" />
            Arte Gerada
          </DialogTitle>
        </DialogHeader>

        {status === "loading" && (
          <div className="flex flex-col items-center justify-center py-12 gap-3">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">Gerando arte...</p>
          </div>
        )}

        {status === "error" && (
          <div className="text-center py-8">
            <p className="text-destructive mb-4">Erro ao gerar arte</p>
            <Button variant="outline" onClick={generateArt}>Tentar novamente</Button>
          </div>
        )}

        {status === "ready" && artDataUrl && (
          <div className="space-y-4">
            <div className="border rounded-lg overflow-hidden bg-muted/30">
              <img src={artDataUrl} alt="Arte gerada" className="w-full h-auto" />
            </div>
            <Button onClick={handleDownload} className="w-full">
              <Download className="mr-2 h-4 w-4" />
              Baixar Arte
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
