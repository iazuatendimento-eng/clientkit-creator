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

interface BrandColors {
  primary: string;
  secondary: string;
  bg: string;
  text: string;
  logoUrl?: string;
  mascotUrl?: string;
  contactUrl?: string;
  bgPngUrl?: string;
}

interface PreviewAssets {
  logo: HTMLImageElement | null;
  mascot: HTMLImageElement | null;
  contact: HTMLImageElement | null;
}

const PREVIEW_MAX = 160;
const CYCLE_MS = 2200;
const SAMPLE_CLIENT = "IAZU Digital Brasil";

function applyBrandToElement(el: any, brand: BrandColors): any {
  const clone = { ...el };
  // Apply colors based on colorRole
  if (clone.colorRole === "background") {
    clone.color = brand.primary;
  } else if (clone.colorRole === "text") {
    clone.color = brand.secondary;
  } else if (clone.colorRole === "accessory1" || clone.colorRole === "accessory2") {
    clone.color = brand.secondary;
  }
  if (clone.type === "text") {
    clone.color = brand.text;
    clone.content = "Criamos artes e vídeos todos os dias para sua rede social";
  }
  return clone;
}

function getBrandValue(source: any, keys: string[]): string {
  for (const key of keys) {
    const value = source?.[key];
    if (typeof value === "string" && value.trim()) return value;
  }
  return "";
}

function loadPreviewImage(url?: string): Promise<HTMLImageElement | null> {
  if (!url) return Promise.resolve(null);

  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

function renderMiniPreview(
  canvas: HTMLCanvasElement,
  tmpl: TemplateRecord,
  type: "art" | "video",
  elements: any[],
  bgColor?: string,
  bgImage?: HTMLImageElement | null,
  previewAssets?: PreviewAssets,
) {
  const scale = Math.min(PREVIEW_MAX / tmpl.width, PREVIEW_MAX / tmpl.height);
  const w = Math.round(tmpl.width * scale);
  const h = Math.round(tmpl.height * scale);
  canvas.width = w;
  canvas.height = h;

  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  // Background
  ctx.fillStyle = bgColor || tmpl.background_color || "#ffffff";
  ctx.fillRect(0, 0, w, h);

  // Background PNG if available
  if (bgImage && bgImage.complete && bgImage.naturalWidth > 0) {
    ctx.drawImage(bgImage, 0, 0, w, h);
  }

  // Render elements
  for (const el of elements) {
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
      const assetImage =
        el.type === "logo"
          ? previewAssets?.logo
          : el.type === "mascot"
            ? previewAssets?.mascot
            : el.type === "contact"
              ? previewAssets?.contact
              : null;

      if (assetImage && assetImage.complete && assetImage.naturalWidth > 0 && assetImage.naturalHeight > 0) {
        const scaleFit = Math.min(ew / assetImage.naturalWidth, eh / assetImage.naturalHeight);
        const dw = assetImage.naturalWidth * scaleFit;
        const dh = assetImage.naturalHeight * scaleFit;
        const dx = ex + (ew - dw) / 2;
        const dy = ey + (eh - dh) / 2;
        ctx.drawImage(assetImage, dx, dy, dw, dh);
      } else {
        ctx.fillStyle = el.type === "logo" ? "#6366f1" : el.type === "mascot" ? "#f59e0b" : "#94a3b8";
        ctx.globalAlpha = 0.3;
        ctx.fillRect(ex, ey, ew, eh);
        ctx.globalAlpha = 1;
        const label = el.type === "logo" ? "L" : el.type === "mascot" ? "M" : el.type === "contact" ? "C" : "I";
        ctx.fillStyle = "#fff";
        ctx.font = `bold ${Math.max(ew * 0.4, 8)}px sans-serif`;
        ctx.textAlign = "center";
        ctx.fillText(label, ex + ew / 2, ey + eh / 2 + ew * 0.15);
      }
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
      try {
        drawNewShape(ctx, el.type, ex, ey, ew, eh, color);
      } catch {
        ctx.fillStyle = color;
        ctx.fillRect(ex, ey, ew, eh);
      }
    }

    ctx.globalAlpha = 1;
  }

  // Page indicator dot
  return ctx;
}

function AnimatedTemplateCard({
  tmpl,
  type,
  idx,
  selected,
  onSelect,
  brand,
  bgImage,
  previewAssets,
}: {
  tmpl: TemplateRecord;
  type: "art" | "video";
  idx: number;
  selected: boolean;
  onSelect: () => void;
  brand: BrandColors | null;
  bgImage: HTMLImageElement | null;
  previewAssets: PreviewAssets;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [currentPage, setCurrentPage] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval>>();

  // For video templates, build pages array: [content, signature]
  const pages = type === "video"
    ? [
        { elements: tmpl.content_elements || [], label: "Conteúdo" },
        { elements: tmpl.signature_elements || [], label: "Assinatura" },
      ]
    : [{ elements: tmpl.elements || [], label: tmpl.name }];

  const renderPage = useCallback((pageIdx: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const page = pages[pageIdx % pages.length];
    let elements = page.elements as any[];

    // Apply brand colors if available
    if (brand) {
      elements = elements.map(el => applyBrandToElement(el, brand));
    }

    const isSignature = type === "video" && pageIdx === 1;
    const bgCol = brand ? brand.primary : tmpl.background_color;

    renderMiniPreview(
      canvas,
      tmpl,
      type,
      elements,
      bgCol,
      isSignature ? bgImage : null,
      previewAssets,
    );

    // Draw page indicator dots for video
    if (type === "video" && pages.length > 1) {
      const ctx = canvas.getContext("2d");
      if (ctx) {
        const dotY = canvas.height - 8;
        const totalW = pages.length * 10;
        const startX = (canvas.width - totalW) / 2;
        pages.forEach((_, di) => {
          ctx.beginPath();
          ctx.arc(startX + di * 10 + 4, dotY, 3, 0, Math.PI * 2);
          ctx.fillStyle = di === pageIdx % pages.length ? "#ffffff" : "rgba(255,255,255,0.4)";
          ctx.fill();
        });
      }
    }
  }, [tmpl, type, brand, bgImage, previewAssets, pages]);

  // Initial render
  useEffect(() => {
    renderPage(0);
  }, [renderPage]);

  // Cycle pages for video templates
  useEffect(() => {
    if (type !== "video" || pages.length <= 1) return;

    intervalRef.current = setInterval(() => {
      setCurrentPage(prev => {
        const next = (prev + 1) % pages.length;
        return next;
      });
    }, CYCLE_MS);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [type, pages.length]);

  // Re-render on page change
  useEffect(() => {
    renderPage(currentPage);
  }, [currentPage, renderPage]);

  return (
    <button
      onClick={onSelect}
      className={`relative rounded-lg border-2 p-2 transition-all hover:scale-105 hover:shadow-lg ${
        selected
          ? "border-primary ring-2 ring-primary/30 shadow-md"
          : "border-border hover:border-primary/50"
      }`}
    >
      {selected && (
        <div className="absolute top-1 right-1 z-10 bg-primary rounded-full p-0.5">
          <Check className="h-3 w-3 text-primary-foreground" />
        </div>
      )}
      <div className="flex items-center justify-center">
        <canvas
          ref={canvasRef}
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
  );
}

export function TemplateSelector({ type, onSelect, onBack, initialTemplateId }: TemplateSelectorProps) {
  const [templates, setTemplates] = useState<TemplateRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<number | null>(null);
  const initialAutoSelected = useRef(false);
  const [brand, setBrand] = useState<BrandColors | null>(null);
  const [bgImage, setBgImage] = useState<HTMLImageElement | null>(null);
  const [previewAssets, setPreviewAssets] = useState<PreviewAssets>({
    logo: null,
    mascot: null,
    contact: null,
  });

  // Fetch sample client brand kit for realistic preview
  useEffect(() => {

    const fetchBrand = async () => {
      try {
        const { data: featuredBrand } = await supabase
          .from("client_data")
          .select("brand_kit")
          .or("name.ilike.%IAZU DIGITAL BRASIL%,slug.ilike.%iazu-digital-brasil%")
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        let brandKit = featuredBrand?.brand_kit as any;

        if (!brandKit) {
          const { data: fallbackBrand } = await supabase
            .from("client_data")
            .select("brand_kit")
            .not("brand_kit", "is", null)
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle();

          brandKit = fallbackBrand?.brand_kit as any;
        }

        if (brandKit) {
          const bk = brandKit;
          const colors = bk.colors || [];
          const brandData: BrandColors = {
            primary: colors[0] || "#a225ac",
            secondary: colors[1] || "#f0b128",
            bg: colors[0] || "#a225ac",
            text: "#ffffff",
            logoUrl: getBrandValue(bk, ["logo", "logoUrl", "logo_url"]),
            mascotUrl: getBrandValue(bk, ["mascot", "mascotUrl", "mascot_url"]),
            contactUrl: getBrandValue(bk, ["contactInfo", "contact", "contactUrl", "contact_url"]),
            bgPngUrl: getBrandValue(bk, ["backgroundPng", "background_png", "background", "backgroundUrl", "background_url"]),
          };
          setBrand(brandData);

          const [bgLoaded, logoLoaded, mascotLoaded, contactLoaded] = await Promise.all([
            loadPreviewImage(brandData.bgPngUrl),
            loadPreviewImage(brandData.logoUrl),
            loadPreviewImage(brandData.mascotUrl),
            loadPreviewImage(brandData.contactUrl),
          ]);

          setBgImage(bgLoaded);
          setPreviewAssets({
            logo: logoLoaded,
            mascot: mascotLoaded,
            contact: contactLoaded,
          });
        }
      } catch {
        /* ignore - will use template defaults */
      }
    };
    fetchBrand();
  }, [type]);

  useEffect(() => {
    const fetchTemplates = async () => {
      setLoading(true);
      const table = type === "art" ? "master_templates" : "master_video_templates";
      const { data, error } = await supabase
        .from(table)
        .select("*")
        .eq("deleted", false)
        .order("name", { ascending: true });

      if (!error && data) {
        setTemplates(data as unknown as TemplateRecord[]);
      }
      setLoading(false);
    };
    fetchTemplates();
  }, [type]);

  useEffect(() => {
    if (templates.length > 0 && initialTemplateId && !initialAutoSelected.current) {
      const idx = templates.findIndex(t => t.id === initialTemplateId);
      if (idx >= 0) {
        setSelected(idx);
        initialAutoSelected.current = true;
      }
    }
  }, [templates, initialTemplateId]);

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
          <AnimatedTemplateCard
            key={tmpl.id}
            tmpl={tmpl}
            type={type}
            idx={idx}
            selected={selected === idx}
            onSelect={() => setSelected(idx)}
            brand={brand}
            bgImage={bgImage}
            previewAssets={previewAssets}
          />
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
