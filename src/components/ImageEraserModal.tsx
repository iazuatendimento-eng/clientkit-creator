import { useState, useRef, useCallback, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Eraser, RotateCcw, Check, Minus, Plus } from "lucide-react";

interface ImageEraserModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  imageUrl: string;
  onSave: (newImageUrl: string) => void;
}

export function ImageEraserModal({
  open,
  onOpenChange,
  imageUrl,
  onSave,
}: ImageEraserModalProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [brushSize, setBrushSize] = useState(30);
  const [isErasing, setIsErasing] = useState(false);
  const [history, setHistory] = useState<ImageData[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const lastPosRef = useRef<{ x: number; y: number } | null>(null);

  // Load image and initialize canvas
  useEffect(() => {
    if (!open || !imageUrl || !canvasRef.current) return;

    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      imageRef.current = img;
      const canvas = canvasRef.current!;
      const ctx = canvas.getContext("2d")!;
      
      // Set canvas size to image size (max 800px for display)
      const maxSize = 800;
      const scale = Math.min(1, maxSize / Math.max(img.width, img.height));
      canvas.width = img.width * scale;
      canvas.height = img.height * scale;
      
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      
      // Save initial state
      const initialState = ctx.getImageData(0, 0, canvas.width, canvas.height);
      setHistory([initialState]);
      setHistoryIndex(0);
    };
    img.src = imageUrl;
  }, [open, imageUrl]);

  const saveState = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const ctx = canvas.getContext("2d")!;
    const state = ctx.getImageData(0, 0, canvas.width, canvas.height);
    
    // Remove any states after current index (new branch)
    const newHistory = history.slice(0, historyIndex + 1);
    newHistory.push(state);
    
    // Limit history size
    if (newHistory.length > 50) {
      newHistory.shift();
    }
    
    setHistory(newHistory);
    setHistoryIndex(newHistory.length - 1);
  }, [history, historyIndex]);

  const undo = useCallback(() => {
    if (historyIndex > 0) {
      const canvas = canvasRef.current;
      if (!canvas) return;
      
      const ctx = canvas.getContext("2d")!;
      const prevIndex = historyIndex - 1;
      ctx.putImageData(history[prevIndex], 0, 0);
      setHistoryIndex(prevIndex);
    }
  }, [history, historyIndex]);

  const getCanvasCoords = (e: React.PointerEvent | PointerEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
    };
  };

  const erase = useCallback((x: number, y: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const ctx = canvas.getContext("2d")!;
    
    // Save composite operation
    const prevOp = ctx.globalCompositeOperation;
    ctx.globalCompositeOperation = "destination-out";
    
    // Draw eraser circle
    ctx.beginPath();
    ctx.arc(x, y, brushSize / 2, 0, Math.PI * 2);
    ctx.fill();
    
    // Draw line from last position for smooth erasing
    if (lastPosRef.current) {
      ctx.beginPath();
      ctx.lineWidth = brushSize;
      ctx.lineCap = "round";
      ctx.moveTo(lastPosRef.current.x, lastPosRef.current.y);
      ctx.lineTo(x, y);
      ctx.stroke();
    }
    
    // Restore composite operation
    ctx.globalCompositeOperation = prevOp;
    
    lastPosRef.current = { x, y };
  }, [brushSize]);

  const handlePointerDown = (e: React.PointerEvent) => {
    e.preventDefault();
    setIsErasing(true);
    
    try {
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
    } catch {}
    
    const { x, y } = getCanvasCoords(e);
    lastPosRef.current = { x, y };
    erase(x, y);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isErasing) return;
    
    const { x, y } = getCanvasCoords(e);
    erase(x, y);
  };

  const handlePointerUp = () => {
    if (isErasing) {
      setIsErasing(false);
      lastPosRef.current = null;
      saveState();
    }
  };

  const handleSave = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    // Convert canvas to data URL (PNG with transparency)
    const dataUrl = canvas.toDataURL("image/png");
    onSave(dataUrl);
    onOpenChange(false);
  };

  const handleReset = () => {
    if (history.length > 0 && canvasRef.current) {
      const ctx = canvasRef.current.getContext("2d")!;
      ctx.putImageData(history[0], 0, 0);
      setHistory([history[0]]);
      setHistoryIndex(0);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Eraser className="h-5 w-5" />
            Borracha - Limpar Artefatos
          </DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4">
          {/* Brush Size Control */}
          <div className="flex items-center gap-4 p-3 bg-muted/50 rounded-lg">
            <Label className="text-sm whitespace-nowrap">Tamanho:</Label>
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8"
              onClick={() => setBrushSize(Math.max(5, brushSize - 10))}
            >
              <Minus className="h-4 w-4" />
            </Button>
            <Slider
              value={[brushSize]}
              onValueChange={([v]) => setBrushSize(v)}
              min={5}
              max={100}
              step={1}
              className="flex-1"
            />
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8"
              onClick={() => setBrushSize(Math.min(100, brushSize + 10))}
            >
              <Plus className="h-4 w-4" />
            </Button>
            <span className="text-sm text-muted-foreground w-12 text-right">{brushSize}px</span>
          </div>
          
          {/* Canvas Container */}
          <div 
            className="relative bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAiIGhlaWdodD0iMjAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PGRlZnM+PHBhdHRlcm4gaWQ9ImdyaWQiIHdpZHRoPSIyMCIgaGVpZ2h0PSIyMCIgcGF0dGVyblVuaXRzPSJ1c2VyU3BhY2VPblVzZSI+PHJlY3Qgd2lkdGg9IjEwIiBoZWlnaHQ9IjEwIiBmaWxsPSIjZTVlNWU1Ii8+PHJlY3QgeD0iMTAiIHk9IjEwIiB3aWR0aD0iMTAiIGhlaWdodD0iMTAiIGZpbGw9IiNlNWU1ZTUiLz48L3BhdHRlcm4+PC9kZWZzPjxyZWN0IHdpZHRoPSIxMDAlIiBoZWlnaHQ9IjEwMCUiIGZpbGw9InVybCgjZ3JpZCkiLz48L3N2Zz4=')] rounded-lg overflow-hidden flex items-center justify-center p-4"
            style={{ minHeight: "400px" }}
          >
            <canvas
              ref={canvasRef}
              className="max-w-full max-h-[500px] cursor-crosshair touch-none"
              style={{ 
                cursor: `url('data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="${brushSize}" height="${brushSize}" viewBox="0 0 ${brushSize} ${brushSize}"><circle cx="${brushSize/2}" cy="${brushSize/2}" r="${brushSize/2 - 1}" fill="none" stroke="black" stroke-width="1"/></svg>') ${brushSize/2} ${brushSize/2}, crosshair`
              }}
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerLeave={handlePointerUp}
              onPointerCancel={handlePointerUp}
            />
          </div>
          
          <p className="text-xs text-muted-foreground text-center">
            Clique e arraste sobre as áreas que deseja apagar. O fundo quadriculado indica transparência.
          </p>
          
          {/* Action Buttons */}
          <div className="flex gap-2 justify-end">
            <Button
              variant="outline"
              onClick={undo}
              disabled={historyIndex <= 0}
            >
              <RotateCcw className="h-4 w-4 mr-2" />
              Desfazer
            </Button>
            <Button
              variant="outline"
              onClick={handleReset}
            >
              Resetar
            </Button>
            <Button
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancelar
            </Button>
            <Button onClick={handleSave}>
              <Check className="h-4 w-4 mr-2" />
              Aplicar
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
