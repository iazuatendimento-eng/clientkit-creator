/**
 * Draw new decorative canvas shapes: heart, cross, cloud, speechBubble, lightning, shield, crescent
 * Used by MasterArtEditor, BatchArtGenerator, MasterVideoEditor, BatchVideoGenerator
 */

/**
 * Compute vertices for a regular polygon (hexagon, pentagon, star, diamond, triangle)
 */
export function getPolygonVertices(
  type: string,
  x: number,
  y: number,
  width: number,
  height: number,
): { x: number; y: number }[] {
  const cx = x + width / 2;
  const cy = y + height / 2;
  const r = Math.min(width, height) / 2;

  if (type === "hexagon") {
    return Array.from({ length: 6 }, (_, i) => {
      const a = (Math.PI / 3) * i - Math.PI / 2;
      return { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) };
    });
  }
  if (type === "pentagon") {
    return Array.from({ length: 5 }, (_, i) => {
      const a = (Math.PI * 2 / 5) * i - Math.PI / 2;
      return { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) };
    });
  }
  if (type === "star") {
    const outerR = r;
    const innerR = r * 0.4;
    return Array.from({ length: 10 }, (_, i) => {
      const a = (Math.PI / 5) * i - Math.PI / 2;
      const rad = i % 2 === 0 ? outerR : innerR;
      return { x: cx + rad * Math.cos(a), y: cy + rad * Math.sin(a) };
    });
  }
  if (type === "diamond") {
    return [
      { x: cx, y: y },
      { x: x + width, y: cy },
      { x: cx, y: y + height },
      { x: x, y: cy },
    ];
  }
  if (type === "triangle") {
    return [
      { x: cx, y: y },
      { x: x + width, y: y + height },
      { x: x, y: y + height },
    ];
  }
  return [];
}

/**
 * Build a rounded polygon path using arcTo for each corner.
 * `radius` is the rounding radius in pixels (clamped automatically).
 */
export function buildRoundedPolygonPath(
  ctx: CanvasRenderingContext2D,
  vertices: { x: number; y: number }[],
  radius: number,
) {
  const n = vertices.length;
  if (n < 3) return;

  // Clamp radius to half the shortest edge
  let maxR = Infinity;
  for (let i = 0; i < n; i++) {
    const next = vertices[(i + 1) % n];
    const dx = next.x - vertices[i].x;
    const dy = next.y - vertices[i].y;
    const edgeLen = Math.sqrt(dx * dx + dy * dy);
    maxR = Math.min(maxR, edgeLen / 2);
  }
  const r = Math.min(radius, maxR);

  ctx.beginPath();
  for (let i = 0; i < n; i++) {
    const prev = vertices[(i - 1 + n) % n];
    const curr = vertices[i];
    const next = vertices[(i + 1) % n];

    if (r > 0) {
      // Mid-point approach to start the path for the first vertex
      if (i === 0) {
        const mx = (prev.x + curr.x) / 2;
        const my = (prev.y + curr.y) / 2;
        ctx.moveTo(mx, my);
        // Re-draw arc for last corner since we started at midpoint
      }
      ctx.arcTo(curr.x, curr.y, next.x, next.y, r);
    } else {
      if (i === 0) ctx.moveTo(curr.x, curr.y);
      else ctx.lineTo(curr.x, curr.y);
    }
  }
  // Close: arcTo back to first vertex midpoint
  if (r > 0) {
    const last = vertices[n - 1];
    const first = vertices[0];
    const second = vertices[1];
    ctx.arcTo(first.x, first.y, second.x, second.y, r);
  }
  ctx.closePath();
}

/** Polygon types that support rounded corners */
export const ROUNDABLE_POLYGON_TYPES = ["triangle", "diamond", "hexagon", "pentagon", "star"] as const;

export function drawNewShape(
  ctx: CanvasRenderingContext2D,
  type: string,
  x: number,
  y: number,
  width: number,
  height: number,
  color: string,
) {
  ctx.fillStyle = color;

  if (type === "heart") {
    const cx = x + width / 2;
    const cy = y + height * 0.35;
    const w = width / 2;
    const h = height;
    ctx.beginPath();
    ctx.moveTo(cx, y + h * 0.85);
    ctx.bezierCurveTo(cx - w * 1.5, cy - h * 0.1, cx - w * 0.3, y - h * 0.1, cx, cy + h * 0.15);
    ctx.bezierCurveTo(cx + w * 0.3, y - h * 0.1, cx + w * 1.5, cy - h * 0.1, cx, y + h * 0.85);
    ctx.closePath();
    ctx.fill();
  } else if (type === "cross") {
    const arm = Math.min(width, height) * 0.3;
    ctx.beginPath();
    ctx.moveTo(x + width / 2 - arm, y);
    ctx.lineTo(x + width / 2 + arm, y);
    ctx.lineTo(x + width / 2 + arm, y + height / 2 - arm);
    ctx.lineTo(x + width, y + height / 2 - arm);
    ctx.lineTo(x + width, y + height / 2 + arm);
    ctx.lineTo(x + width / 2 + arm, y + height / 2 + arm);
    ctx.lineTo(x + width / 2 + arm, y + height);
    ctx.lineTo(x + width / 2 - arm, y + height);
    ctx.lineTo(x + width / 2 - arm, y + height / 2 + arm);
    ctx.lineTo(x, y + height / 2 + arm);
    ctx.lineTo(x, y + height / 2 - arm);
    ctx.lineTo(x + width / 2 - arm, y + height / 2 - arm);
    ctx.closePath();
    ctx.fill();
  } else if (type === "cloud") {
    const cx = x + width / 2;
    const cy = y + height * 0.6;
    ctx.beginPath();
    ctx.arc(cx - width * 0.25, cy, height * 0.3, 0, Math.PI * 2);
    ctx.arc(cx, cy - height * 0.15, height * 0.38, 0, Math.PI * 2);
    ctx.arc(cx + width * 0.25, cy, height * 0.3, 0, Math.PI * 2);
    ctx.arc(cx - width * 0.12, cy + height * 0.05, height * 0.28, 0, Math.PI * 2);
    ctx.arc(cx + width * 0.12, cy + height * 0.05, height * 0.28, 0, Math.PI * 2);
    ctx.fill();
  } else if (type === "speechBubble") {
    const r = 20;
    const tailH = height * 0.2;
    const bodyH = height - tailH;
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + width - r, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + r);
    ctx.lineTo(x + width, y + bodyH - r);
    ctx.quadraticCurveTo(x + width, y + bodyH, x + width - r, y + bodyH);
    ctx.lineTo(x + width * 0.35, y + bodyH);
    ctx.lineTo(x + width * 0.15, y + height);
    ctx.lineTo(x + width * 0.25, y + bodyH);
    ctx.lineTo(x + r, y + bodyH);
    ctx.quadraticCurveTo(x, y + bodyH, x, y + bodyH - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
    ctx.fill();
  } else if (type === "lightning") {
    ctx.beginPath();
    ctx.moveTo(x + width * 0.55, y);
    ctx.lineTo(x + width * 0.15, y + height * 0.5);
    ctx.lineTo(x + width * 0.45, y + height * 0.45);
    ctx.lineTo(x + width * 0.35, y + height);
    ctx.lineTo(x + width * 0.85, y + height * 0.4);
    ctx.lineTo(x + width * 0.55, y + height * 0.45);
    ctx.closePath();
    ctx.fill();
  } else if (type === "shield") {
    const cx = x + width / 2;
    ctx.beginPath();
    ctx.moveTo(cx, y);
    ctx.lineTo(x + width, y + height * 0.2);
    ctx.lineTo(x + width, y + height * 0.55);
    ctx.quadraticCurveTo(x + width, y + height * 0.85, cx, y + height);
    ctx.quadraticCurveTo(x, y + height * 0.85, x, y + height * 0.55);
    ctx.lineTo(x, y + height * 0.2);
    ctx.closePath();
    ctx.fill();
  } else if (type === "crescent") {
    // Use a temporary canvas to avoid destination-out erasing other elements
    const cx = x + width / 2;
    const cy = y + height / 2;
    const r = Math.min(width, height) / 2;
    
    const margin = 4;
    const tmpW = width + margin * 2;
    const tmpH = height + margin * 2;
    const tmpCanvas = document.createElement("canvas");
    tmpCanvas.width = tmpW;
    tmpCanvas.height = tmpH;
    const tmp = tmpCanvas.getContext("2d")!;
    
    // Draw the full circle on temp canvas (offset coords)
    const localCx = tmpW / 2;
    const localCy = tmpH / 2;
    tmp.fillStyle = color;
    tmp.beginPath();
    tmp.arc(localCx, localCy, r, 0, Math.PI * 2);
    tmp.fill();
    
    // Cut out the inner circle on temp canvas only
    tmp.globalCompositeOperation = "destination-out";
    tmp.beginPath();
    tmp.arc(localCx + r * 0.35, localCy - r * 0.1, r * 0.8, 0, Math.PI * 2);
    tmp.fill();
    
    // Composite the result onto the main canvas
    ctx.drawImage(tmpCanvas, x - margin, y - margin);
  } else if (type === "chevron") {
    // Long-shaft arrow with arrowhead pointing right (→)
    const cy = y + height / 2;
    const shaftY = cy;
    const headSize = Math.min(width * 0.18, height * 0.4);
    const shaftStart = x + width * 0.1;
    const shaftEnd = x + width * 0.9;
    ctx.strokeStyle = color;
    ctx.lineWidth = Math.max(2, Math.min(width, height) * 0.06);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    // Shaft
    ctx.beginPath();
    ctx.moveTo(shaftStart, shaftY);
    ctx.lineTo(shaftEnd, shaftY);
    ctx.stroke();
    // Arrowhead
    ctx.beginPath();
    ctx.moveTo(shaftEnd - headSize, shaftY - headSize);
    ctx.lineTo(shaftEnd, shaftY);
    ctx.lineTo(shaftEnd - headSize, shaftY + headSize);
    ctx.stroke();
  } else {
    return false; // Not a new shape
  }
  return true; // Shape was drawn
}

export const NEW_SHAPE_TYPES = ["heart", "cross", "cloud", "speechBubble", "lightning", "shield", "crescent", "chevron"] as const;
