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
  const [photoOffsetX, setPhotoOffsetX] = useState(art.photoOffset?.x || 0);
  const [photoOffsetY, setPhotoOffsetY] = useState(art.photoOffset?.y || 0);
  const [photoScale, setPhotoScale] = useState(art.elementOverrides?.photoScale || 100);
  const [photoFrame, setPhotoFrame] = useState<ShapeOverride | null>(art.elementOverrides?.photoFrame || null);
  const [logoX, setLogoX] = useState(art.elementOverrides?.logoX || 0);
  const [logoY, setLogoY] = useState(art.elementOverrides?.logoY || 0);
  const [logoScaleX, setLogoScaleX] = useState(art.elementOverrides?.logoScaleX || art.elementOverrides?.logoScale || 100);
  const [logoScaleY, setLogoScaleY] = useState(art.elementOverrides?.logoScaleY || art.elementOverrides?.logoScale || 100);
  const [textX, setTextX] = useState(art.elementOverrides?.textX || 0);
  const [textY, setTextY] = useState(art.elementOverrides?.textY || 0);
  const [textFontSize, setTextFontSize] = useState(art.elementOverrides?.textFontSize || 100);
  const [contactX, setContactX] = useState(art.elementOverrides?.contactX || 0);
  const [contactY, setContactY] = useState(art.elementOverrides?.contactY || 0);
  const [contactScaleX, setContactScaleX] = useState(art.elementOverrides?.contactScaleX || art.elementOverrides?.contactScale || 100);
  const [contactScaleY, setContactScaleY] = useState(art.elementOverrides?.contactScaleY || art.elementOverrides?.contactScale || 100);
  const [shapeOverrides, setShapeOverrides] = useState<Record<string, ShapeOverride>>(art.elementOverrides?.shapes || {});
  const [isRegenerating, setIsRegenerating] = useState(false);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  const handleDragEnd = useCallback(async () => {
    // Build updated art with current overrides
    const updatedOverrides: ElementOverrides = {
      logoX, logoY,
      logoScaleX, logoScaleY,
      textX, textY, textFontSize,
      contactX, contactY,
      contactScaleX, contactScaleY,
      photoScale,
      photoFrame: photoFrame || undefined,
      shapes: shapeOverrides,
    };

    const updatedArt: ClientArt = {
      ...art,
      photoOffset: { x: photoOffsetX, y: photoOffsetY },
      elementOverrides: updatedOverrides,
    };

    // Update parent state
    onArtUpdate(index, {
      photoOffset: updatedArt.photoOffset,
      elementOverrides: updatedOverrides,
    });

    // Debounce regeneration
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      setIsRegenerating(true);
      try {
        const newImageUrl = await onRegenerate(updatedArt);
        onArtUpdate(index, {
          imageUrl: newImageUrl,
          photoOffset: { x: photoOffsetX, y: photoOffsetY },
          elementOverrides: updatedOverrides,
        });
      } catch (e) {
        console.error("Error regenerating:", e);
      } finally {
        setIsRegenerating(false);
      }
    }, 150);
  }, [
    art, index, photoOffsetX, photoOffsetY, photoScale, photoFrame,
    logoX, logoY, logoScaleX, logoScaleY,
    textX, textY, textFontSize,
    contactX, contactY, contactScaleX, contactScaleY,
    shapeOverrides, onArtUpdate, onRegenerate,
  ]);

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
