import { useEffect, useRef } from "react";

interface TrimmedImageProps {
  src: string;
  alt?: string;
  trimInfluence?: number; // 0 = no trim, 1 = full trim
  fitScale?: number; // internal scale, default 1
  className?: string;
}

// Shared opaque-bounds cache (per src)
const boundsCache = new Map<string, { sx: number; sy: number; sw: number; sh: number }>();

function getOpaqueBounds(img: HTMLImageElement, src: string) {
  const cached = boundsCache.get(src);
  if (cached) return cached;
  const natW = img.naturalWidth || img.width;
  const natH = img.naturalHeight || img.height;
  const fallback = { sx: 0, sy: 0, sw: Math.max(1, natW), sh: Math.max(1, natH) };
  if (!natW || !natH) return fallback;
  const maxDim = 512;
  const scale = Math.min(1, maxDim / Math.max(natW, natH));
  const scanW = Math.max(1, Math.round(natW * scale));
  const scanH = Math.max(1, Math.round(natH * scale));
  const c = document.createElement("canvas");
  c.width = scanW;
  c.height = scanH;
  const ctx = c.getContext("2d", { willReadFrequently: true });
  if (!ctx) return fallback;
  ctx.clearRect(0, 0, scanW, scanH);
  ctx.drawImage(img, 0, 0, scanW, scanH);
  let data: Uint8ClampedArray;
  try { data = ctx.getImageData(0, 0, scanW, scanH).data; } catch { boundsCache.set(src, fallback); return fallback; }
  let minX = scanW, minY = scanH, maxX = -1, maxY = -1;
  for (let y = 0; y < scanH; y++) {
    for (let x = 0; x < scanW; x++) {
      if (data[(y * scanW + x) * 4 + 3] > 8) {
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) { boundsCache.set(src, fallback); return fallback; }
  const inv = 1 / scale;
  const result = {
    sx: Math.max(0, Math.floor(minX * inv)),
    sy: Math.max(0, Math.floor(minY * inv)),
    sw: Math.min(natW, Math.ceil((maxX + 1) * inv)) - Math.max(0, Math.floor(minX * inv)),
    sh: Math.min(natH, Math.ceil((maxY + 1) * inv)) - Math.max(0, Math.floor(minY * inv)),
  };
  boundsCache.set(src, result);
  return result;
}

export const TrimmedImage = ({ src, alt = "", trimInfluence = 0.6, fitScale = 1, className = "" }: TrimmedImageProps) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!src) return;
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const parent = canvas.parentElement;
      if (!parent) return;
      const boxW = parent.clientWidth;
      const boxH = parent.clientHeight;
      if (!boxW || !boxH) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = boxW * dpr;
      canvas.height = boxH * dpr;
      canvas.style.width = `${boxW}px`;
      canvas.style.height = `${boxH}px`;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.scale(dpr, dpr);
      ctx.clearRect(0, 0, boxW, boxH);

      const natW = img.naturalWidth;
      const natH = img.naturalHeight;
      const bounds = getOpaqueBounds(img, src);
      const bsx = bounds.sx * trimInfluence;
      const bsy = bounds.sy * trimInfluence;
      const bsw = natW - (natW - bounds.sw) * trimInfluence;
      const bsh = natH - (natH - bounds.sh) * trimInfluence;
      const srcAspect = bsw / bsh;
      const boxAspect = boxW / boxH;
      let drawW = boxW, drawH = boxH;
      if (srcAspect > boxAspect) drawH = boxW / srcAspect;
      else drawW = boxH * srcAspect;
      drawW *= fitScale;
      drawH *= fitScale;
      const drawX = (boxW - drawW) / 2;
      const drawY = (boxH - drawH) / 2;
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(img, bsx, bsy, bsw, bsh, drawX, drawY, drawW, drawH);
    };
    img.src = src;
  }, [src, trimInfluence, fitScale]);

  return <canvas ref={canvasRef} className={className} style={{ width: "100%", height: "100%" }} />;
};
