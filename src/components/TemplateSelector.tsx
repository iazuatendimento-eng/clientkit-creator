import { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Loader2, Check, ArrowLeft } from "lucide-react";
import { drawNewShape } from "@/lib/canvasShapes";

interface TemplateRecord {
  id: string;
  name: string;
  width: number;
  height: number;
  background_color: string;
  elements?: any[];
  content_elements?: any[];
  signature_elements?: any[];
}

interface TemplateSelectorProps {
  type: "art" | "video";
  onSelect: (index: number) => void;
  onBack: () => void;
  initialTemplateId?: string;
}

const PREVIEW_MAX = 160;

function renderMiniPreview(
  canvas: HTMLCanvasElement,
  tmpl: TemplateRecord,
  type: "art" | "video"
) {
  const elements = type === "art"
    ? (tmpl.elements || [])
    : [...(tmpl.content_elements || []), ...(tmpl.signature_elements || [])];

  const scale = Math.min(PREVIEW_MAX / tmpl.width, PREVIEW_MAX / tmpl.height);
  const w = Math.round(tmpl.width * scale);
  const h = Math.round(tmpl.height * scale);
  canvas.width = w;
  canvas.height = h;

  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  // Background
  ctx.fillStyle = tmpl.background_color || "#ffffff";
  ctx.fillRect(0, 0, w, h);

  // Render elements as simplified shapes
  for (const el of elements as any[]) {
    const ex = (el.x || 0) * scale;
    const ey = (el.y || 0) * scale;
    const ew = (el.width || 100) * scale;
    const eh = (el.height || 100) * scale;
    const color = el.color || el.fill || "#cccccc";

    ctx.globalAlpha = el.opacity != null ? el.opacity : 1;

    if (el.type === "rect") {
      ctx.fillStyle = color;
      const r = Math.min((el.borderRadius || 0) * scale, ew / 2, eh / 2);
      if (r > 0) {
        ctx.beginPath();
        ctx.moveTo(ex + r, ey);
        ctx.lineTo(ex + ew - r, ey);
        ctx.quadraticCurveTo(ex + ew, ey, ex + ew, ey + r);
        ctx.lineTo(ex + ew, ey + eh - r);
        ctx.quadraticCurveTo(ex + ew, ey + eh, ex + ew - r, ey + eh);
        ctx.lineTo(ex + r, ey + eh);
        ctx.quadraticCurveTo(ex, ey + eh, ex, ey + eh - r);
        ctx.lineTo(ex, ey + r);
        ctx.quadraticCurveTo(ex, ey, ex + r, ey);
        ctx.closePath();
        ctx.fill();
      } else {
        ctx.fillRect(ex, ey, ew, eh);
      }
    } else if (el.type === "circle") {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.ellipse(ex + ew / 2, ey + eh / 2, ew / 2, eh / 2, 0, 0, Math.PI * 2);
      ctx.fill();
    } else if (el.type === "text") {
      ctx.fillStyle = color;
      const fs = Math.max(((el.fontSize || 24) * scale), 4);
      ctx.font = `${el.fontWeight || "normal"} ${fs}px sans-serif`;
      ctx.textAlign = (el.textAlign as CanvasTextAlign) || "left";
      const tx = el.textAlign === "center" ? ex + ew / 2 : el.textAlign === "right" ? ex + ew : ex;
      ctx.fillText(el.content || el.text || "Texto", tx, ey + fs, ew);
    } else if (el.type === "image" || el.type === "logo" || el.type === "mascot" || el.type === "contact") {
      // Placeholder rectangle
      ctx.fillStyle = el.type === "logo" ? "#6366f1" : el.type === "mascot" ? "#f59e0b" : "#94a3b8";
      ctx.globalAlpha = 0.3;
      ctx.fillRect(ex, ey, ew, eh);
      ctx.globalAlpha = 1;
      // Label
      const label = el.type === "logo" ? "L" : el.type === "mascot" ? "M" : el.type === "contact" ? "C" : "I";
      ctx.fillStyle = "#fff";
      ctx.font = `bold ${Math.max(ew * 0.4, 8)}px sans-serif`;
      ctx.textAlign = "center";
      ctx.fillText(label, ex + ew / 2, ey + eh / 2 + ew * 0.15);
    } else if (el.type === "triangle") {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(ex + ew / 2, ey);
      ctx.lineTo(ex + ew, ey + eh);
      ctx.lineTo(ex, ey + eh);
      ctx.closePath();
      ctx.fill();
    } else if (el.type === "line") {
      ctx.strokeStyle = color;
      ctx.lineWidth = Math.max((el.lineWidth || 2) * scale, 1);
      ctx.beginPath();
      ctx.moveTo(ex, ey + eh / 2);
      ctx.lineTo(ex + ew, ey + eh / 2);
      ctx.stroke();
    } else {
      // Use canvasShapes for decorative shapes
      try {
        drawNewShape(ctx, el.type, ex, ey, ew, eh, color);
      } catch {
        ctx.fillStyle = color;
        ctx.fillRect(ex, ey, ew, eh);
      }
    }

    ctx.globalAlpha = 1;
  }
}

export function TemplateSelector({ type, onSelect, onBack, initialTemplateId }: TemplateSelectorProps) {
  const [templates, setTemplates] = useState<TemplateRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<number | null>(null);
  const initialAutoSelected = useRef(false);
  const canvasRefs = useRef<Map<number, HTMLCanvasElement>>(new Map());

  useEffect(() => {
    const fetchTemplates = async () => {
      setLoading(true);
      const table = type === "art" ? "master_templates" : "master_video_templates";
      const { data, error } = await supabase
        .from(table)
        .select("*")
        .eq("deleted", false)
        .order("created_at", { ascending: true });

      if (!error && data) {
        setTemplates(data as unknown as TemplateRecord[]);
      }
      setLoading(false);
    };
    fetchTemplates();
  }, [type]);

  const renderPreviews = useCallback(() => {
    templates.forEach((tmpl, idx) => {
      const canvas = canvasRefs.current.get(idx);
      if (canvas) {
        renderMiniPreview(canvas, tmpl, type);
      }
    });
  }, [templates, type]);

  useEffect(() => {
    if (templates.length > 0) {
      // Small delay to ensure canvas refs are set
      requestAnimationFrame(renderPreviews);
    }
  }, [templates, renderPreviews]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (templates.length === 0) {
    return (
      <div className="text-center py-16 space-y-4">
        <p className="text-muted-foreground">Nenhum template encontrado.</p>
        <Button variant="outline" onClick={onBack}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Voltar
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <Button variant="ghost" size="sm" onClick={onBack}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Voltar
        </Button>
        <Label className="text-sm font-medium">
          Escolha um Template ({templates.length} disponíveis)
        </Label>
        <div className="w-20" />
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
        {templates.map((tmpl, idx) => (
          <button
            key={tmpl.id}
            onClick={() => setSelected(idx)}
            className={`relative rounded-lg border-2 p-2 transition-all hover:scale-105 hover:shadow-lg ${
              selected === idx
                ? "border-primary ring-2 ring-primary/30 shadow-md"
                : "border-border hover:border-primary/50"
            }`}
          >
            {selected === idx && (
              <div className="absolute top-1 right-1 z-10 bg-primary rounded-full p-0.5">
                <Check className="h-3 w-3 text-primary-foreground" />
              </div>
            )}
            <div className="flex items-center justify-center">
              <canvas
                ref={(el) => {
                  if (el) canvasRefs.current.set(idx, el);
                }}
                className="rounded border border-border/50"
                style={{ maxWidth: "100%", height: "auto" }}
              />
            </div>
            <p className="text-xs text-center mt-2 truncate text-foreground/80">
              {tmpl.name}
            </p>
            <p className="text-[10px] text-center text-muted-foreground">
              {tmpl.width}×{tmpl.height}
            </p>
          </button>
        ))}
      </div>

      <Button
        onClick={() => selected !== null && onSelect(selected)}
        disabled={selected === null}
        className="w-full h-12 text-base font-semibold"
      >
        Usar Template Selecionado
      </Button>
    </div>
  );
}
