import { useState, useEffect, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  ArrowLeft,
  Save,
  Loader2,
  Search,
  Image as ImageIcon,
  RefreshCw,
  Check,
  ChevronLeft,
  ChevronRight,
  Download,
  Film,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import {
  BatchGeneration,
  BatchItem,
  updateBatchItem,
} from "@/lib/batchHistory";
import { searchImages, SearchImage } from "@/lib/imageSearch";
import { supabase } from "@/integrations/supabase/client";
import { createCardUpload, updateProjectBrief } from "@/lib/clientDatabase";
import { encodeVideoToMP4, MotionEffect, TransitionEffect, TextAnimation, LogoAnimation } from "@/lib/videoEncoder";

interface BatchHistoryEditorProps {
  batch: BatchGeneration;
  onBack: () => void;
  onSaved: () => void;
}

export const BatchHistoryEditor = ({
  batch,
  onBack,
  onSaved,
}: BatchHistoryEditorProps) => {
  const [items, setItems] = useState<BatchItem[]>(batch.items);
  const [selectedItemIndex, setSelectedItemIndex] = useState<number | null>(null);
  const [currentPageIndex, setCurrentPageIndex] = useState(0);
  const [isSaving, setIsSaving] = useState(false);
  const [isRegenerating, setIsRegenerating] = useState(false);

  // Image search
  const [isImageDialogOpen, setIsImageDialogOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchImage[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [editingPageIndex, setEditingPageIndex] = useState<number>(0);

  // Video effects
  const [motionEffect, setMotionEffect] = useState<MotionEffect>("ken-burns");
  const [transitionEffect, setTransitionEffect] = useState<TransitionEffect>("fade");
  const [textAnimation, setTextAnimation] = useState<TextAnimation>("fade-in");
  const [logoAnimation, setLogoAnimation] = useState<LogoAnimation>("fade-in");
  const [textAnimDuration, setTextAnimDuration] = useState(2.5);
  const [isExportingVideo, setIsExportingVideo] = useState(false);
  const [exportProgress, setExportProgress] = useState(0);
  const [isBulkExporting, setIsBulkExporting] = useState(false);
  const [bulkExportCurrent, setBulkExportCurrent] = useState(0);
  const [bulkExportTotal, setBulkExportTotal] = useState(0);

  // Element adjustments
  const [adjustments, setAdjustments] = useState<BatchItem["adjustments"]>({});

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { toast } = useToast();

  const selectedItem = selectedItemIndex !== null ? items[selectedItemIndex] : null;
  const template = batch.template_snapshot;

  useEffect(() => {
    if (selectedItem) {
      setAdjustments(selectedItem.adjustments || {});
      setCurrentPageIndex(0);
    }
  }, [selectedItemIndex]);

  useEffect(() => {
    if (selectedItem && canvasRef.current) {
      drawPreview();
    }
  }, [selectedItem, currentPageIndex, adjustments]);

  const drawPreview = useCallback(async () => {
    const canvas = canvasRef.current;
    if (!canvas || !selectedItem) return;

    const ctx = canvas.getContext("2d")!;
    const file = selectedItem.files[currentPageIndex];

    if (!file) {
      ctx.fillStyle = "#1a1a2e";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      return;
    }

    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    };
    img.src = file;
  }, [selectedItem, currentPageIndex]);

  const handleSearchImages = async () => {
    if (!searchQuery.trim()) return;
    setIsSearching(true);
    try {
      const images = await searchImages(searchQuery, 12);
      setSearchResults(images);
    } catch (error) {
      toast({
        title: "Erro ao buscar imagens",
        variant: "destructive",
      });
    } finally {
      setIsSearching(false);
    }
  };

  const handleSelectImage = async (imageUrl: string) => {
    if (selectedItemIndex === null) return;

    setIsRegenerating(true);
    try {
      // Update background image for this page and regenerate
      const updatedItems = [...items];
      const item = updatedItems[selectedItemIndex];

      if (!item.backgroundImages) {
        item.backgroundImages = [];
      }
      item.backgroundImages[editingPageIndex] = imageUrl;

      // Regenerate the page image with new background
      const newPageImage = await regeneratePageImage(
        item,
        editingPageIndex,
        imageUrl,
        adjustments
      );

      if (newPageImage) {
        item.files[editingPageIndex] = newPageImage;
      }

      setItems(updatedItems);
      setIsImageDialogOpen(false);

      toast({
        title: "Imagem atualizada",
        description: "A nova imagem foi aplicada.",
      });
    } catch (error) {
      console.error("Error updating image:", error);
      toast({
        title: "Erro ao atualizar imagem",
        variant: "destructive",
      });
    } finally {
      setIsRegenerating(false);
    }
  };

  const regeneratePageImage = async (
    item: BatchItem,
    pageIndex: number,
    backgroundImage: string,
    adj: BatchItem["adjustments"]
  ): Promise<string | null> => {
    const canvas = document.createElement("canvas");
    const isVideo = batch.type === "video";
    canvas.width = template.width || (isVideo ? 1080 : 1080);
    canvas.height = template.height || (isVideo ? 1920 : 1350);
    const ctx = canvas.getContext("2d")!;

    const brandKit = item.brandKit;
    const colors = Array.isArray(brandKit?.colors) ? brandKit.colors : [];
    const bgColor = colors[0] || template.backgroundColor || "#1a1a2e";
    const textColor = colors[1] || "#ffffff";

    // Draw background color
    ctx.fillStyle = bgColor;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Draw background image
    if (backgroundImage) {
      try {
        const bgImg = await loadImage(backgroundImage);
        if (bgImg) {
          const imgAspect = bgImg.width / bgImg.height;
          const canvasAspect = canvas.width / canvas.height;
          let drawWidth, drawHeight, drawX, drawY;

          if (imgAspect > canvasAspect) {
            drawHeight = canvas.height;
            drawWidth = drawHeight * imgAspect;
            drawX = (canvas.width - drawWidth) / 2;
            drawY = 0;
          } else {
            drawWidth = canvas.width;
            drawHeight = drawWidth / imgAspect;
            drawX = 0;
            drawY = (canvas.height - drawHeight) / 2;
          }

          ctx.drawImage(bgImg, drawX, drawY, drawWidth, drawHeight);

          // Overlay
          ctx.fillStyle = "rgba(0, 0, 0, 0.4)";
          ctx.fillRect(0, 0, canvas.width, canvas.height);
        }
      } catch (e) {
        console.error("Error loading background:", e);
      }
    }

    // Draw elements from template with adjustments
    const elements = isVideo
      ? pageIndex < (item.files.length - 1)
        ? template.contentElements
        : template.signatureElements
      : template.elements;

    for (const el of elements || []) {
      if (el.type === "text") {
        ctx.fillStyle = textColor;
        const fontSize = el.fontSize || 48;
        ctx.font = `${fontSize}px Arial`;
        ctx.fillText(el.text || item.cardTitle, el.x, el.y + fontSize);
      } else if (el.type === "logo") {
        const logoUrl = brandKit?.pngs?.[0];
        if (logoUrl) {
          const img = await loadImage(logoUrl);
          if (img) {
            const scale = adj?.logoScale || { x: 1, y: 1 };
            const offset = adj?.logoOffset || { x: 0, y: 0 };
            ctx.drawImage(
              img,
              el.x + offset.x,
              el.y + offset.y,
              el.width * scale.x,
              el.height * scale.y
            );
          }
        }
      } else if (el.type === "contact") {
        const contactUrl = brandKit?.pngs?.[1];
        if (contactUrl) {
          const img = await loadImage(contactUrl);
          if (img) {
            const scale = adj?.contactScale || { x: 1, y: 1 };
            const offset = adj?.contactOffset || { x: 0, y: 0 };
            ctx.drawImage(
              img,
              el.x + offset.x,
              el.y + offset.y,
              el.width * scale.x,
              el.height * scale.y
            );
          }
        }
      } else if (el.type === "mascot") {
        const mascotUrl = brandKit?.pngs?.[2] || brandKit?.mascot;
        if (mascotUrl) {
          const img = await loadImage(mascotUrl);
          if (img) {
            const scale = adj?.mascotScale || { x: 1, y: 1 };
            const offset = adj?.mascotOffset || { x: 0, y: 0 };
            ctx.drawImage(
              img,
              el.x + offset.x,
              el.y + offset.y,
              el.width * scale.x,
              el.height * scale.y
            );
          }
        }
      }
    }

    return canvas.toDataURL("image/png");
  };

  const loadImage = async (url: string): Promise<HTMLImageElement | null> => {
    if (!url) return null;
    
    // Data URIs: load directly
    if (url.startsWith("data:")) {
      return new Promise((resolve) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => resolve(null);
        img.src = url;
      });
    }
    
    // Strategy 1: fetch-as-blob (bypasses CORS)
    try {
      const response = await fetch(url);
      if (response.ok) {
        const blob = await response.blob();
        const objectUrl = URL.createObjectURL(blob);
        return new Promise((resolve) => {
          const img = new Image();
          img.onload = () => resolve(img);
          img.onerror = () => resolve(null);
          img.src = objectUrl;
        });
      }
    } catch { /* fallback */ }
    
    // Strategy 2: Image with crossOrigin
    return new Promise((resolve) => {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => resolve(img);
      img.onerror = () => {
        // Strategy 3: without crossOrigin
        const img2 = new Image();
        img2.onload = () => resolve(img2);
        img2.onerror = () => resolve(null);
        img2.src = url;
      };
      img.src = url;
    });
  };

  const handleExportVideo = async () => {
    if (!selectedItem || batch.type !== "video") return;

    setIsExportingVideo(true);
    setExportProgress(0);

    try {
      toast({
        title: "Gerando vídeo MP4...",
        description: "Aplicando efeitos de movimento e transição",
      });

      const pageDuration = template.pageDuration || template.page_duration || 3;
      const videoBlob = await encodeVideoToMP4(selectedItem.files, {
        width: template.width || 1080,
        height: template.height || 1920,
        pageDuration,
        fps: 24,
        motionEffect,
        transitionEffect,
        textAnimation,
        logoAnimation,
        textAnimDuration: textAnimDuration / pageDuration,
        overlayPages: (selectedItem as any).overlayPages || undefined,
        logoOverlayPages: (selectedItem as any).logoOverlayPages || undefined,
        frameOverlayPages: (selectedItem as any).frameOverlayPages || undefined,
        audioUrl: (() => {
          const t = template as any;
          const sel = (selectedItem as any).selectedAudio || 1;
          const url1 = t.audioUrl1 || t.audio_url_1;
          const url2 = t.audioUrl2 || t.audio_url_2;
          return sel === 2 ? url2 : url1;
        })(),
        requireEmailSafePreview: true,
        onProgress: (p) => setExportProgress(Math.round(p * 100)),
      });

      // Download the video
      const url = URL.createObjectURL(videoBlob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `video_${selectedItem.clientName}_${Date.now()}.mp4`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      toast({
        title: "Vídeo exportado!",
        description: "O download foi iniciado.",
      });
    } catch (error) {
      console.error("Error exporting video:", error);
      toast({
        title: "Erro ao exportar vídeo",
        variant: "destructive",
      });
    } finally {
      setIsExportingVideo(false);
      setExportProgress(0);
    }
  };

  const handleBulkExportVideos = async () => {
    if (batch.type !== "video") return;

    setIsBulkExporting(true);
    setBulkExportTotal(items.length);
    setBulkExportCurrent(0);

    let successCount = 0;

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      setBulkExportCurrent(i + 1);

      try {
        const pageDuration = template.pageDuration || (template as any).page_duration || 3;
        const videoBlob = await encodeVideoToMP4(item.files, {
          width: template.width || 1080,
          height: template.height || 1920,
          pageDuration,
          fps: 24,
          motionEffect,
          transitionEffect,
          textAnimation,
          logoAnimation,
          textAnimDuration: textAnimDuration / pageDuration,
          overlayPages: (item as any).overlayPages || undefined,
          logoOverlayPages: (item as any).logoOverlayPages || undefined,
          frameOverlayPages: (item as any).frameOverlayPages || undefined,
          audioUrl: (() => {
            const t = template as any;
            const sel = (item as any).selectedAudio || 1;
            const url1 = t.audioUrl1 || t.audio_url_1;
            const url2 = t.audioUrl2 || t.audio_url_2;
            return sel === 2 ? url2 : url1;
          })(),
          requireEmailSafePreview: true,
          onProgress: (p) => setExportProgress(Math.round(p * 100)),
        });

        const url = URL.createObjectURL(videoBlob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `video_${item.clientName}_${Date.now()}.mp4`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        successCount++;

        // Small delay between downloads to avoid browser blocking
        await new Promise(r => setTimeout(r, 500));
      } catch (error) {
        console.error(`Error exporting video for ${item.clientName}:`, error);
      }
    }

    toast({
      title: `${successCount}/${items.length} vídeos exportados`,
      description: "Todos os vídeos foram regerados com a página de assinatura.",
    });

    setIsBulkExporting(false);
    setBulkExportCurrent(0);
    setBulkExportTotal(0);
    setExportProgress(0);
  };

  const handleSaveChanges = async () => {
    setIsSaving(true);
    try {
      // Update each modified item in the batch
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        const original = batch.items[i];

        // Check if item was modified
        if (JSON.stringify(item) !== JSON.stringify(original)) {
          await updateBatchItem(batch.id, i, item);

          // Also update the card uploads if files changed
          for (let j = 0; j < item.files.length; j++) {
            if (item.files[j] !== original.files[j]) {
              // Upload new file to storage
              const response = await fetch(item.files[j]);
              const blob = await response.blob();
              const fileName = `${batch.type}_${item.cardId}_page${j + 1}_${Date.now()}.png`;

              const { data: uploadData, error: uploadError } = await supabase.storage
                .from("card-uploads")
                .upload(`${batch.type}s/${fileName}`, blob, {
                  contentType: "image/png",
                });

              if (!uploadError && uploadData) {
                const { data: urlData } = supabase.storage
                  .from("card-uploads")
                  .getPublicUrl(`${batch.type}s/${fileName}`);

                // Update card upload record
                await createCardUpload({
                  card_id: item.cardId,
                  file_name: fileName,
                  file_url: urlData.publicUrl,
                  file_type: "image/png",
                  upload_type: "final",
                });

                // Update cover if first page
                if (j === 0) {
                  await updateProjectBrief(item.cardId, {
                    cover_image: urlData.publicUrl,
                  });
                }
              }
            }
          }
        }
      }

      toast({
        title: "Alterações salvas",
        description: "As modificações foram aplicadas aos cards.",
      });

      onSaved();
    } catch (error) {
      console.error("Error saving changes:", error);
      toast({
        title: "Erro ao salvar",
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex">
      {/* Left sidebar - item list */}
      <div className="w-64 border-r bg-card flex flex-col">
        <div className="p-4 border-b">
          <Button variant="outline" onClick={onBack} className="w-full">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Voltar
          </Button>
        </div>

        <ScrollArea className="flex-1">
          <div className="p-2 space-y-1">
            {items.map((item, idx) => (
              <button
                key={idx}
                className={`w-full text-left p-2 rounded-lg flex items-center gap-2 transition-colors ${
                  selectedItemIndex === idx
                    ? "bg-primary/10 border border-primary"
                    : "hover:bg-muted"
                }`}
                onClick={() => setSelectedItemIndex(idx)}
              >
                <div className="w-8 h-10 bg-muted rounded overflow-hidden shrink-0">
                  {item.files[0] && (
                    <img
                      src={item.files[0]}
                      alt=""
                      className="w-full h-full object-cover"
                    />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium truncate">{item.clientName}</p>
                  <p className="text-xs text-muted-foreground">
                    {item.files.length} página(s)
                  </p>
                </div>
              </button>
            ))}
          </div>
        </ScrollArea>

        <div className="p-4 border-t">
          <Button
            onClick={handleSaveChanges}
            disabled={isSaving}
            className="w-full"
          >
            {isSaving ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Save className="mr-2 h-4 w-4" />
            )}
            Salvar Alterações
          </Button>
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 p-6">
        {selectedItem ? (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-xl font-semibold">{selectedItem.clientName}</h2>
                <p className="text-sm text-muted-foreground">{selectedItem.company}</p>
              </div>
              <Badge>{batch.type === "art" ? "Arte" : "Vídeo"}</Badge>
            </div>

            {/* Preview */}
            <div className="flex gap-6">
              <div className="flex-1">
                <div
                  className={`${
                    batch.type === "video" ? "aspect-[9/16]" : "aspect-[4/5]"
                  } bg-muted rounded-lg overflow-hidden relative max-w-md mx-auto`}
                >
                  {selectedItem.files[currentPageIndex] ? (
                    <img
                      src={selectedItem.files[currentPageIndex]}
                      alt="Preview"
                      className="w-full h-full object-contain"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-muted-foreground">
                      Sem preview
                    </div>
                  )}

                  {/* Page navigation */}
                  {selectedItem.files.length > 1 && (
                    <>
                      <Button
                        variant="secondary"
                        size="icon"
                        className="absolute left-2 top-1/2 -translate-y-1/2"
                        onClick={() =>
                          setCurrentPageIndex((p) =>
                            p > 0 ? p - 1 : selectedItem.files.length - 1
                          )
                        }
                      >
                        <ChevronLeft className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="secondary"
                        size="icon"
                        className="absolute right-2 top-1/2 -translate-y-1/2"
                        onClick={() =>
                          setCurrentPageIndex((p) =>
                            p < selectedItem.files.length - 1 ? p + 1 : 0
                          )
                        }
                      >
                        <ChevronRight className="h-4 w-4" />
                      </Button>
                      <div className="absolute bottom-2 left-1/2 -translate-x-1/2 bg-black/70 px-2 py-1 rounded text-xs text-white">
                        {currentPageIndex + 1} / {selectedItem.files.length}
                      </div>
                    </>
                  )}
                </div>

                {/* Page thumbnails */}
                {selectedItem.files.length > 1 && (
                  <div className="flex gap-2 mt-4 justify-center">
                    {selectedItem.files.map((file, idx) => (
                      <button
                        key={idx}
                        className={`w-12 h-16 rounded overflow-hidden border-2 transition-colors ${
                          currentPageIndex === idx
                            ? "border-primary"
                            : "border-transparent"
                        }`}
                        onClick={() => setCurrentPageIndex(idx)}
                      >
                        <img
                          src={file}
                          alt={`Page ${idx + 1}`}
                          className="w-full h-full object-cover"
                        />
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Edit controls */}
              <div className="w-72 space-y-4">
                <div className="bg-card border rounded-lg p-4 space-y-4">
                  <h3 className="font-medium">Editar Página {currentPageIndex + 1}</h3>

                  <Button
                    variant="outline"
                    className="w-full"
                    onClick={() => {
                      setEditingPageIndex(currentPageIndex);
                      setIsImageDialogOpen(true);
                    }}
                  >
                    <ImageIcon className="mr-2 h-4 w-4" />
                    Trocar Imagem de Fundo
                  </Button>

                  <div className="text-xs text-muted-foreground">
                    Clique para buscar uma nova imagem de fundo para esta página.
                  </div>
                </div>

                {/* Video Effects - Only show for video batches */}
                {batch.type === "video" && (
                  <div className="bg-card border rounded-lg p-4 space-y-4">
                    <h3 className="font-medium flex items-center gap-2">
                      <Film className="h-4 w-4" />
                      Efeitos do Vídeo
                    </h3>

                    <div className="space-y-3">

                      <div className="space-y-1">
                        <Label className="text-xs">Transição</Label>
                        <select
                          value={transitionEffect}
                          onChange={(e) => setTransitionEffect(e.target.value as TransitionEffect)}
                          className="w-full h-8 px-2 text-sm border rounded-md bg-background"
                        >
                          <option value="fade">Fade</option>
                          <option value="slide-left">Deslizar Esquerda</option>
                          <option value="slide-right">Deslizar Direita</option>
                          <option value="slide-up">Deslizar Cima</option>
                          <option value="slide-down">Deslizar Baixo</option>
                          <option value="zoom">Zoom In</option>
                          <option value="zoom-out">Zoom Out</option>
                        </select>
                      </div>
                    </div>

                    <Button
                      onClick={handleExportVideo}
                      disabled={isExportingVideo}
                      className="w-full"
                    >
                      {isExportingVideo ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Exportando... {exportProgress}%
                        </>
                      ) : (
                        <>
                          <Download className="mr-2 h-4 w-4" />
                          Exportar Vídeo MP4
                        </>
                      )}
                    </Button>

                    <div className="text-xs text-muted-foreground">
                      Exporte o vídeo com os efeitos de movimento e transição selecionados.
                    </div>
                  </div>
                )}

                <div className="bg-card border rounded-lg p-4">
                  <h4 className="font-medium mb-2">Texto do Card</h4>
                  <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                    {selectedItem.cardText}
                  </p>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="h-full flex items-center justify-center text-muted-foreground">
            Selecione um item para editar
          </div>
        )}
      </div>

      {/* Image search dialog */}
      <Dialog open={isImageDialogOpen} onOpenChange={setIsImageDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Buscar Imagem de Fundo</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="flex gap-2">
              <Input
                placeholder="Buscar imagens..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSearchImages()}
              />
              <Button onClick={handleSearchImages} disabled={isSearching}>
                {isSearching ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Search className="h-4 w-4" />
                )}
              </Button>
            </div>

            {isRegenerating && (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                <span className="ml-2">Aplicando nova imagem...</span>
              </div>
            )}

            {!isRegenerating && searchResults.length > 0 && (
              <div className="grid grid-cols-4 gap-2 max-h-96 overflow-y-auto">
                {searchResults.map((img) => (
                  <button
                    key={img.id}
                    className="aspect-square rounded overflow-hidden hover:ring-2 ring-primary transition-all"
                    onClick={() => handleSelectImage(img.urls.regular)}
                  >
                    <img
                      src={img.urls.small}
                      alt={img.description || ""}
                      className="w-full h-full object-cover"
                    />
                  </button>
                ))}
              </div>
            )}

            {!isRegenerating && searchResults.length === 0 && !isSearching && (
              <p className="text-center text-muted-foreground py-8">
                Digite algo para buscar imagens
              </p>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};
