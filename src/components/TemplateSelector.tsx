import { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Loader2, Check, ArrowLeft } from "lucide-react";
import { buildRoundedPolygonPath, drawNewShape, getPolygonVertices } from "@/lib/canvasShapes";

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
  stockImage: HTMLImageElement | null;
}

const PREVIEW_MAX = 160;
const CYCLE_MS = 2200;
const SAMPLE_CLIENT = "IAZU Digital Brasil";

function applyBrandToElement(el: any, brand: BrandColors): any {
  const clone = { ...el };
  const roleToColor = (role: string) => {
    if (role === "background") return brand.primary;
    if (role === "text") return brand.secondary;
    if (role === "accessory1" || role === "accessory2") return brand.secondary;
    return null;
  };
  // Apply colors based on colorRole
  if (clone.colorRole) {
    const c = roleToColor(clone.colorRole);
    if (c) clone.color = c;
  }
  // Apply border color based on borderColorRole
  if (clone.borderColorRole) {
    const bc = roleToColor(clone.borderColorRole);
    if (bc) clone.borderColor = bc;
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
  const deferredTransparentRectBorders: any[] = [];

  const buildRectPath = (x: number, y: number, width: number, height: number, radius: number) => {
    ctx.beginPath();
    if (radius > 0) {
      ctx.moveTo(x + radius, y);
      ctx.lineTo(x + width - radius, y);
      ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
      ctx.lineTo(x + width, y + height - radius);
      ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
      ctx.lineTo(x + radius, y + height);
      ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
      ctx.lineTo(x, y + radius);
      ctx.quadraticCurveTo(x, y, x + radius, y);
      ctx.closePath();
    } else {
      ctx.rect(x, y, width, height);
    }
  };

  const buildShapePath = (shape: string, x: number, y: number, width: number, height: number, radius: number = 0) => {
    const normalizedShape = shape || "rect";
    const clampedRadius = Math.min(Math.max(radius, 0), Math.min(width, height) / 2);

    if (normalizedShape === "circle") {
      ctx.beginPath();
      ctx.ellipse(x + width / 2, y + height / 2, width / 2, height / 2, 0, 0, Math.PI * 2);
      return;
    }

    if (["triangle", "diamond", "hexagon", "pentagon", "star"].includes(normalizedShape)) {
      const vertices = getPolygonVertices(normalizedShape, x, y, width, height);
      if (vertices.length >= 3) {
        if (clampedRadius > 0) {
          buildRoundedPolygonPath(ctx, vertices, clampedRadius);
        } else {
          ctx.beginPath();
          vertices.forEach((vertex, index) => {
            if (index === 0) ctx.moveTo(vertex.x, vertex.y);
            else ctx.lineTo(vertex.x, vertex.y);
          });
          ctx.closePath();
        }
        return;
      }
    }

    buildRectPath(x, y, width, height, clampedRadius);
  };

  const drawRectBorder = (rectEl: any) => {
    const rx = (rectEl.x || 0) * scale;
    const ry = (rectEl.y || 0) * scale;
    const rw = (rectEl.width || 100) * scale;
    const rh = (rectEl.height || 100) * scale;
    const rr = Math.min((rectEl.borderRadius || 0) * scale, rw / 2, rh / 2);
    const borderW = Number(rectEl.borderWidth) || 0;
    if (borderW <= 0) return;

    ctx.save();
    if (rectEl.rotation) {
      const cx = rx + rw / 2;
      const cy = ry + rh / 2;
      ctx.translate(cx, cy);
      ctx.rotate((Number(rectEl.rotation) * Math.PI) / 180);
      ctx.translate(-cx, -cy);
    }
    ctx.globalAlpha = 1;
    ctx.strokeStyle = rectEl.borderColor || rectEl.color || rectEl.fill || "#cccccc";
    ctx.lineWidth = Math.max(borderW * scale, 1.25);
    buildRectPath(rx, ry, rw, rh, rr);
    ctx.stroke();
    ctx.restore();
  };

  const flushDeferredBordersInsideImage = (imageEl: any) => {
    const ix = Number(imageEl.x || 0);
    const iy = Number(imageEl.y || 0);
    const iw = Number(imageEl.width || 0);
    const ih = Number(imageEl.height || 0);

    for (let i = deferredTransparentRectBorders.length - 1; i >= 0; i--) {
      const borderEl = deferredTransparentRectBorders[i];
      const bx = Number(borderEl.x || 0);
      const by = Number(borderEl.y || 0);
      const bw = Number(borderEl.width || 0);
      const bh = Number(borderEl.height || 0);
      const isInsideImage = bx >= ix - 1 && by >= iy - 1 && bx + bw <= ix + iw + 1 && by + bh <= iy + ih + 1;

      if (isInsideImage) {
        drawRectBorder(borderEl);
        deferredTransparentRectBorders.splice(i, 1);
      }
    }
  };

  for (const el of elements) {
    const ex = (el.x || 0) * scale;
    const ey = (el.y || 0) * scale;
    const ew = (el.width || 100) * scale;
    const eh = (el.height || 100) * scale;
    const color = el.color || el.fill || "#cccccc";
    const rawOpacity = el.opacity != null ? Number(el.opacity) : 1;
    const normalizedOpacity = Number.isFinite(rawOpacity) ? (rawOpacity > 1 ? rawOpacity / 100 : rawOpacity) : 1;

    ctx.globalAlpha = normalizedOpacity;

    if (el.type === "rect") {
      const borderOnlyRect = normalizedOpacity <= 0 && Number(el.borderWidth || 0) > 0;
      if (borderOnlyRect) {
        deferredTransparentRectBorders.push(el);
        ctx.globalAlpha = 1;
        continue;
      }

      ctx.fillStyle = color;
      const r = Math.min((el.borderRadius || 0) * scale, ew / 2, eh / 2);
      if (normalizedOpacity > 0) {
        buildRectPath(ex, ey, ew, eh, r);
        ctx.fill();
      }

      if (el.borderWidth && el.borderWidth > 0) {
        const savedAlpha = ctx.globalAlpha;
        ctx.globalAlpha = 1;
        ctx.strokeStyle = el.borderColor || color;
        ctx.lineWidth = Math.max(Number(el.borderWidth) * scale, 1);
        buildRectPath(ex, ey, ew, eh, r);
        ctx.stroke();
        ctx.globalAlpha = savedAlpha;
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
              : el.type === "image"
                ? previewAssets?.stockImage
                : null;

      if (assetImage && assetImage.complete && assetImage.naturalWidth > 0 && assetImage.naturalHeight > 0) {
        ctx.save();
        const clipShape = el.clipShape || "rect";
        const cr = Math.min((el.borderRadius || 0) * scale, ew / 2, eh / 2);
        ctx.beginPath();
        if (clipShape === "circle") {
          ctx.ellipse(ex + ew / 2, ey + eh / 2, ew / 2, eh / 2, 0, 0, Math.PI * 2);
        } else if (clipShape === "triangle") {
          ctx.moveTo(ex + ew / 2, ey); ctx.lineTo(ex + ew, ey + eh); ctx.lineTo(ex, ey + eh); ctx.closePath();
        } else if (clipShape === "diamond") {
          ctx.moveTo(ex + ew / 2, ey); ctx.lineTo(ex + ew, ey + eh / 2); ctx.lineTo(ex + ew / 2, ey + eh); ctx.lineTo(ex, ey + eh / 2); ctx.closePath();
        } else if (clipShape === "hexagon") {
          const hcx = ex + ew / 2, hcy = ey + eh / 2, hr = Math.min(ew, eh) / 2;
          for (let i = 0; i < 6; i++) { const a = (Math.PI / 3) * i - Math.PI / 2; if (i === 0) ctx.moveTo(hcx + hr * Math.cos(a), hcy + hr * Math.sin(a)); else ctx.lineTo(hcx + hr * Math.cos(a), hcy + hr * Math.sin(a)); }
          ctx.closePath();
        } else if (clipShape === "pentagon") {
          const pcx = ex + ew / 2, pcy = ey + eh / 2, pr = Math.min(ew, eh) / 2;
          for (let i = 0; i < 5; i++) { const a = (Math.PI * 2 / 5) * i - Math.PI / 2; if (i === 0) ctx.moveTo(pcx + pr * Math.cos(a), pcy + pr * Math.sin(a)); else ctx.lineTo(pcx + pr * Math.cos(a), pcy + pr * Math.sin(a)); }
          ctx.closePath();
        } else if (clipShape === "star") {
          const scx = ex + ew / 2, scy = ey + eh / 2, outerR = Math.min(ew, eh) / 2, innerR = outerR * 0.4;
          for (let i = 0; i < 10; i++) { const a = (Math.PI / 5) * i - Math.PI / 2; const r = i % 2 === 0 ? outerR : innerR; if (i === 0) ctx.moveTo(scx + r * Math.cos(a), scy + r * Math.sin(a)); else ctx.lineTo(scx + r * Math.cos(a), scy + r * Math.sin(a)); }
          ctx.closePath();
        } else if (cr > 0) {
          ctx.moveTo(ex + cr, ey); ctx.lineTo(ex + ew - cr, ey);
          ctx.quadraticCurveTo(ex + ew, ey, ex + ew, ey + cr);
          ctx.lineTo(ex + ew, ey + eh - cr);
          ctx.quadraticCurveTo(ex + ew, ey + eh, ex + ew - cr, ey + eh);
          ctx.lineTo(ex + cr, ey + eh);
          ctx.quadraticCurveTo(ex, ey + eh, ex, ey + eh - cr);
          ctx.lineTo(ex, ey + cr);
          ctx.quadraticCurveTo(ex, ey, ex + cr, ey);
        } else {
          ctx.rect(ex, ey, ew, eh);
        }
        ctx.clip();
        const useContain = el.type === "logo" || el.type === "mascot" || el.type === "contact";
        const sf = useContain
          ? Math.min(ew / assetImage.naturalWidth, eh / assetImage.naturalHeight)
          : Math.max(ew / assetImage.naturalWidth, eh / assetImage.naturalHeight);
        const dw = assetImage.naturalWidth * sf;
        const dh = assetImage.naturalHeight * sf;
        const dx = ex + (ew - dw) / 2;
        const dy = ey + (eh - dh) / 2;
        ctx.drawImage(assetImage, dx, dy, dw, dh);
        ctx.restore();
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

      if (el.type === "image") {
        flushDeferredBordersInsideImage(el);
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

  if (deferredTransparentRectBorders.length > 0) {
    deferredTransparentRectBorders.forEach((rectEl) => drawRectBorder(rectEl));
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
    stockImage: null,
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

          // Fetch a stock image from Pixabay for "image" placeholders
          const fetchStockImage = async (): Promise<HTMLImageElement | null> => {
            try {
              const { data: fnData, error: fnError } = await supabase.functions.invoke("search-pixabay-images", {
                body: { query: "social media marketing", perPage: 1, page: 1 },
              });
              if (!fnError && fnData?.images?.[0]?.urls?.small) {
                return loadPreviewImage(fnData.images[0].urls.small);
              }
            } catch { /* ignore */ }
            return loadPreviewImage("https://picsum.photos/seed/template-preview/400/500");
          };

          const [bgLoaded, logoLoaded, mascotLoaded, contactLoaded, stockLoaded] = await Promise.all([
            loadPreviewImage(brandData.bgPngUrl),
            loadPreviewImage(brandData.logoUrl),
            loadPreviewImage(brandData.mascotUrl),
            loadPreviewImage(brandData.contactUrl),
            fetchStockImage(),
          ]);

          setBgImage(bgLoaded);
          setPreviewAssets({
            logo: logoLoaded,
            mascot: mascotLoaded,
            contact: contactLoaded,
            stockImage: stockLoaded,
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

      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-3 gap-4">
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
