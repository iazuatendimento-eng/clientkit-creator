/**
 * Draw new decorative canvas shapes: heart, cross, cloud, speechBubble, lightning, shield, crescent
 * Used by MasterArtEditor, BatchArtGenerator, MasterVideoEditor, BatchVideoGenerator
 */

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
    // Right-pointing chevron for carousel "next page" indicator
    const cx = x + width / 2;
    const cy = y + height / 2;
    const armW = width * 0.45;
    const armH = height * 0.4;
    ctx.strokeStyle = color;
    ctx.lineWidth = Math.max(width, height) * 0.12;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.beginPath();
    ctx.moveTo(cx - armW, cy - armH);
    ctx.lineTo(cx + armW, cy);
    ctx.lineTo(cx - armW, cy + armH);
    ctx.stroke();
  } else {
    return false; // Not a new shape
  }
  return true; // Shape was drawn
}

export const NEW_SHAPE_TYPES = ["heart", "cross", "cloud", "speechBubble", "lightning", "shield", "crescent", "chevron"] as const;
