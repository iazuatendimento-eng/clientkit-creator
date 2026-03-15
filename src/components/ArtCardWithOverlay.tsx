import { useState, useRef, useCallback, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Textarea } from "@/components/ui/textarea";
import {
  Check,
  X,
  ImageIcon,
  RefreshCw,
  Loader2,
  Save,
  MessageSquareWarning,
  Scissors,
  Eraser,
} from "lucide-react";
import { ArtAdjustOverlay } from "@/components/ArtAdjustOverlay";
import { cn } from "@/lib/utils";

type ShapeOverride = { x: number; y: number; width: number; height: number };

interface ElementOverrides {
  logoX?: number;
  logoY?: number;
  logoScale?: number;
  logoScaleX?: number;
  logoScaleY?: number;
  textX?: number;
  textY?: number;
  textFontSize?: number;
  contactX?: number;
  contactY?: number;
  contactScale?: number;
  contactScaleX?: number;
  contactScaleY?: number;
  photoScale?: number;
  photoFrame?: ShapeOverride;
  shapes?: Record<string, ShapeOverride>;
}

interface ClientArt {
  clientId: string;
  clientName: string;
  company: string;
  cardId: string;
  cardTitle: string;
  cardText: string;
  brandKit: any;
  imageUrl: string | null;
  status: "pending" | "approved" | "rejected";
  backgroundImage?: string;
  photoImage?: string;
  photoOffset?: { x: number; y: number };
  elementOverrides?: ElementOverrides;
  pageIndex?: number;
  totalPages?: number;
  imageType?: string;
  narrationType?: string;
  briefing?: string;
  note?: string;
  noteRead?: boolean;
}

interface MasterTemplate {
  id: string;
  name: string;
  elements: any[];
  width: number;
  height: number;
  backgroundColor: string;
}

interface ArtCardWithOverlayProps {
  art: ClientArt;
  index: number;
  template: MasterTemplate;
  onArtUpdate: (index: number, updatedArt: Partial<ClientArt>) => void;
  onRegenerate: (art: ClientArt) => Promise<string>;
  onApprove: (index: number) => void;
  onReject: (index: number) => void;
  onOpenImageDialog: (art: ClientArt, index: number) => void;
  onRefreshBrandKit: (index: number) => void;
  onRemoveBackground: (art: ClientArt, index: number) => void;
  onOpenEraser: (art: ClientArt, index: number) => void;
  onSaveNote: (index: number, note: string) => Promise<void>;
  onResolveNote: (index: number) => Promise<void>;
  isRemovingBg?: boolean;
  removeBgProgress?: string;
}

export function ArtCardWithOverlay({
  art,
  index,
  template,
  onArtUpdate,
  onRegenerate,
  onApprove,
  onReject,
  onOpenImageDialog,
  onRefreshBrandKit,
  onRemoveBackground,
  onOpenEraser,
  onSaveNote,
  onResolveNote,
  isRemovingBg,
  removeBgProgress,
}: ArtCardWithOverlayProps) {
  // Local override states initialized from art
  const [photoOffsetX, _setPhotoOffsetX] = useState(art.photoOffset?.x || 0);
  const [photoOffsetY, _setPhotoOffsetY] = useState(art.photoOffset?.y || 0);
  const [photoScale, _setPhotoScale] = useState(art.elementOverrides?.photoScale || 100);
  const [photoFrame, _setPhotoFrame] = useState<ShapeOverride | null>(art.elementOverrides?.photoFrame || null);
  const [logoX, _setLogoX] = useState(art.elementOverrides?.logoX || 0);
  const [logoY, _setLogoY] = useState(art.elementOverrides?.logoY || 0);
  const [logoScaleX, _setLogoScaleX] = useState(art.elementOverrides?.logoScaleX || art.elementOverrides?.logoScale || 100);
  const [logoScaleY, _setLogoScaleY] = useState(art.elementOverrides?.logoScaleY || art.elementOverrides?.logoScale || 100);
  const [textX, _setTextX] = useState(art.elementOverrides?.textX || 0);
  const [textY, _setTextY] = useState(art.elementOverrides?.textY || 0);
  const [textFontSize, _setTextFontSize] = useState(art.elementOverrides?.textFontSize || 100);
  const [contactX, _setContactX] = useState(art.elementOverrides?.contactX || 0);
  const [contactY, _setContactY] = useState(art.elementOverrides?.contactY || 0);
  const [contactScaleX, _setContactScaleX] = useState(art.elementOverrides?.contactScaleX || art.elementOverrides?.contactScale || 100);
  const [contactScaleY, _setContactScaleY] = useState(art.elementOverrides?.contactScaleY || art.elementOverrides?.contactScale || 100);
  const [shapeOverrides, _setShapeOverrides] = useState<Record<string, ShapeOverride>>(art.elementOverrides?.shapes || {});
  const [isRegenerating, setIsRegenerating] = useState(false);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const regenerateRequestRef = useRef(0);

  // Ref that always holds the latest values — updated synchronously by wrapped setters
  // so handleDragEnd (fired on pointerup before React re-renders) reads fresh data.
  const latestRef = useRef({
    photoOffsetX, photoOffsetY, photoScale, photoFrame,
    logoX, logoY, logoScaleX, logoScaleY,
    textX, textY, textFontSize,
    contactX, contactY, contactScaleX, contactScaleY,
    shapeOverrides,
  });

  // Wrapped setters that update both React state AND the ref synchronously
  const setPhotoOffsetX = useCallback((v: number) => { latestRef.current.photoOffsetX = v; _setPhotoOffsetX(v); }, []);
  const setPhotoOffsetY = useCallback((v: number) => { latestRef.current.photoOffsetY = v; _setPhotoOffsetY(v); }, []);
  const setPhotoScale = useCallback((v: number) => { latestRef.current.photoScale = v; _setPhotoScale(v); }, []);
  const setPhotoFrame = useCallback((v: ShapeOverride | null) => { latestRef.current.photoFrame = v; _setPhotoFrame(v); }, []);
  const setLogoX = useCallback((v: number) => { latestRef.current.logoX = v; _setLogoX(v); }, []);
  const setLogoY = useCallback((v: number) => { latestRef.current.logoY = v; _setLogoY(v); }, []);
  const setLogoScaleX = useCallback((v: number) => { latestRef.current.logoScaleX = v; _setLogoScaleX(v); }, []);
  const setLogoScaleY = useCallback((v: number) => { latestRef.current.logoScaleY = v; _setLogoScaleY(v); }, []);
  const setTextX = useCallback((v: number) => { latestRef.current.textX = v; _setTextX(v); }, []);
  const setTextY = useCallback((v: number) => { latestRef.current.textY = v; _setTextY(v); }, []);
  const setTextFontSize = useCallback((v: number) => { latestRef.current.textFontSize = v; _setTextFontSize(v); }, []);
  const setContactX = useCallback((v: number) => { latestRef.current.contactX = v; _setContactX(v); }, []);
  const setContactY = useCallback((v: number) => { latestRef.current.contactY = v; _setContactY(v); }, []);
  const setContactScaleX = useCallback((v: number) => { latestRef.current.contactScaleX = v; _setContactScaleX(v); }, []);
  const setContactScaleY = useCallback((v: number) => { latestRef.current.contactScaleY = v; _setContactScaleY(v); }, []);
  const setShapeOverrides = useCallback((v: Record<string, ShapeOverride>) => { latestRef.current.shapeOverrides = v; _setShapeOverrides(v); }, []);

  // Sync local state when art changes externally (e.g., after image swap)
  const artKeyRef = useRef(`${art.clientId}-${art.cardId}-${art.pageIndex}-${art.imageUrl}`);
  useEffect(() => {
    const newKey = `${art.clientId}-${art.cardId}-${art.pageIndex}-${art.imageUrl}`;
    if (newKey !== artKeyRef.current) {
      artKeyRef.current = newKey;
      setPhotoOffsetX(art.photoOffset?.x || 0);
      setPhotoOffsetY(art.photoOffset?.y || 0);
      setPhotoScale(art.elementOverrides?.photoScale || 100);
      setPhotoFrame(art.elementOverrides?.photoFrame || null);
      setLogoX(art.elementOverrides?.logoX || 0);
      setLogoY(art.elementOverrides?.logoY || 0);
      setLogoScaleX(art.elementOverrides?.logoScaleX || art.elementOverrides?.logoScale || 100);
      setLogoScaleY(art.elementOverrides?.logoScaleY || art.elementOverrides?.logoScale || 100);
      setTextX(art.elementOverrides?.textX || 0);
      setTextY(art.elementOverrides?.textY || 0);
      setTextFontSize(art.elementOverrides?.textFontSize || 100);
      setContactX(art.elementOverrides?.contactX || 0);
      setContactY(art.elementOverrides?.contactY || 0);
      setContactScaleX(art.elementOverrides?.contactScaleX || art.elementOverrides?.contactScale || 100);
      setContactScaleY(art.elementOverrides?.contactScaleY || art.elementOverrides?.contactScale || 100);
      setShapeOverrides(art.elementOverrides?.shapes || {});
    }
  }, [art]);

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      regenerateRequestRef.current += 1;
    };
  }, []);

  const handleDragEnd = useCallback(async () => {
    // Read from refs to get the absolute latest values (pointerup fires before React re-renders)
    const v = latestRef.current;

    const updatedOverrides: ElementOverrides = {
      logoX: v.logoX, logoY: v.logoY,
      logoScaleX: v.logoScaleX, logoScaleY: v.logoScaleY,
      textX: v.textX, textY: v.textY, textFontSize: v.textFontSize,
      contactX: v.contactX, contactY: v.contactY,
      contactScaleX: v.contactScaleX, contactScaleY: v.contactScaleY,
      photoScale: v.photoScale,
      photoFrame: v.photoFrame || undefined,
      shapes: v.shapeOverrides,
    };

    const updatedArt: ClientArt = {
      ...art,
      photoOffset: { x: v.photoOffsetX, y: v.photoOffsetY },
      elementOverrides: updatedOverrides,
    };

    // Update parent state
    onArtUpdate(index, {
      photoOffset: updatedArt.photoOffset,
      elementOverrides: updatedOverrides,
    });

    // Debounce regeneration (latest-only to prevent stale image swaps)
    const requestId = regenerateRequestRef.current + 1;
    regenerateRequestRef.current = requestId;

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      setIsRegenerating(true);
      try {
        const newImageUrl = await onRegenerate(updatedArt);

        // Ignore stale async responses
        if (requestId !== regenerateRequestRef.current) return;

        onArtUpdate(index, {
          imageUrl: newImageUrl,
          photoOffset: { x: v.photoOffsetX, y: v.photoOffsetY },
          elementOverrides: updatedOverrides,
        });
      } catch (e) {
        console.error("Error regenerating:", e);
      } finally {
        if (requestId === regenerateRequestRef.current) {
          setIsRegenerating(false);
        }
      }
    }, 150);
  }, [art, index, onArtUpdate, onRegenerate]);

  const showOverlay = art.imageUrl && art.status === "pending";

  return (
    <div
      className={cn(
        "border rounded-lg overflow-hidden bg-card",
        art.status === "approved" && "ring-2 ring-green-500",
        art.status === "rejected" && "ring-2 ring-destructive opacity-50",
      )}
    >
      {/* Art Preview with always-on overlay */}
      <div className="relative bg-muted">
        {showOverlay ? (
          <div className="relative">
            <ArtAdjustOverlay
              template={template}
              previewUrl={art.imageUrl}
              isBusy={isRegenerating}
              photoOffsetX={photoOffsetX}
              photoOffsetY={photoOffsetY}
              photoScale={photoScale}
              photoFrame={photoFrame}
              setPhotoOffsetX={setPhotoOffsetX}
              setPhotoOffsetY={setPhotoOffsetY}
              setPhotoScale={setPhotoScale}
              setPhotoFrame={setPhotoFrame}
              logoX={logoX}
              logoY={logoY}
              logoScaleX={logoScaleX}
              logoScaleY={logoScaleY}
              setLogoX={setLogoX}
              setLogoY={setLogoY}
              setLogoScaleX={setLogoScaleX}
              setLogoScaleY={setLogoScaleY}
              textX={textX}
              textY={textY}
              textFontSize={textFontSize}
              setTextX={setTextX}
              setTextY={setTextY}
              setTextFontSize={setTextFontSize}
              contactX={contactX}
              contactY={contactY}
              contactScaleX={contactScaleX}
              contactScaleY={contactScaleY}
              setContactX={setContactX}
              setContactY={setContactY}
              setContactScaleX={setContactScaleX}
              setContactScaleY={setContactScaleY}
              shapeOverrides={shapeOverrides}
              setShapeOverrides={setShapeOverrides}
              onDragEnd={handleDragEnd}
            />
            {isRegenerating && (
              <div className="absolute top-2 right-2">
                <Loader2 className="h-4 w-4 animate-spin text-primary" />
              </div>
            )}
          </div>
        ) : art.imageUrl ? (
          <img
            src={art.imageUrl}
            alt={art.company}
            className="w-full h-auto"
          />
        ) : (
          <div className="aspect-square flex items-center justify-center">
            <ImageIcon className="h-12 w-12 text-muted-foreground" />
          </div>
        )}

        {art.status === "approved" && (
          <div className="absolute top-2 right-2 bg-green-500 text-white p-1 rounded-full">
            <Check className="h-4 w-4" />
          </div>
        )}

        {art.totalPages && art.totalPages > 1 && (
          <div className="absolute top-2 left-2 bg-primary text-primary-foreground text-xs px-2 py-1 rounded-full font-semibold">
            {(art.pageIndex ?? 0) + 1}/{art.totalPages}
          </div>
        )}
      </div>

      {/* Info & Actions */}
      <div className="p-3">
        <h3 className="font-semibold truncate">{art.company}</h3>
        <p className="text-sm text-muted-foreground truncate">{art.cardText}</p>
        {art.imageType && (
          <p className="text-xs text-primary/70 truncate mt-0.5">{art.imageType}</p>
        )}

        {art.imageUrl && art.status === "pending" && (
          <div className="flex flex-wrap gap-2 mt-3">
            <Button size="sm" variant="outline" title="Trocar foto" onClick={() => onOpenImageDialog(art, index)}>
              <ImageIcon className="h-4 w-4" />
            </Button>
            <Button size="sm" variant="outline" title="Atualizar cores e regenerar" onClick={() => onRefreshBrandKit(index)}>
              <RefreshCw className="h-4 w-4" />
            </Button>
            {art.photoImage && (
              <>
                <Button
                  size="sm"
                  variant="outline"
                  title="Recortar fundo"
                  onClick={() => onRemoveBackground(art, index)}
                  disabled={isRemovingBg}
                >
                  {isRemovingBg ? <Loader2 className="h-4 w-4 animate-spin" /> : <Scissors className="h-4 w-4" />}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  title="Borracha"
                  onClick={() => onOpenEraser(art, index)}
                >
                  <Eraser className="h-4 w-4" />
                </Button>
              </>
            )}
            <Button size="sm" variant="destructive" onClick={() => onReject(index)}>
              <X className="h-4 w-4" />
            </Button>
            <Button size="sm" className="bg-green-500 hover:bg-green-600" onClick={() => onApprove(index)}>
              <Check className="h-4 w-4" />
            </Button>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="relative px-2"
                  title="Anotação"
                  onClick={() => {
                    if (art.note && !art.noteRead) {
                      onArtUpdate(index, { noteRead: true });
                    }
                  }}
                >
                  <MessageSquareWarning className="h-4 w-4" />
                  {art.note && !art.noteRead && (
                    <span className="absolute -top-1 -right-1 h-2.5 w-2.5 bg-red-500 rounded-full animate-pulse" />
                  )}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-64 p-3" onClick={(e) => e.stopPropagation()}>
                <div className="space-y-2">
                  <p className="text-xs font-medium text-foreground">Anotação</p>
                  <Textarea
                    placeholder="Escreva uma observação..."
                    className="text-xs min-h-[60px] resize-none"
                    value={art.note || ""}
                    onChange={(e) => {
                      onArtUpdate(index, { note: e.target.value, noteRead: false });
                    }}
                  />
                  <Button
                    size="sm"
                    variant="default"
                    className="w-full text-xs"
                    onClick={() => onSaveNote(index, art.note || "")}
                  >
                    <Save className="h-3 w-3 mr-1" /> Salvar
                  </Button>
                  {art.note && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="w-full text-xs"
                      onClick={() => onResolveNote(index)}
                    >
                      <Check className="h-3 w-3 mr-1" /> Resolvido
                    </Button>
                  )}
                </div>
              </PopoverContent>
            </Popover>
          </div>
        )}

        {art.status === "approved" && (
          <div className="mt-3 text-center">
            <Badge className="bg-green-500">Aprovada</Badge>
          </div>
        )}
        {art.status === "rejected" && (
          <div className="mt-3 text-center">
            <Badge variant="destructive">Rejeitada</Badge>
          </div>
        )}
      </div>
    </div>
  );
}
