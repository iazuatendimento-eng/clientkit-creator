import { useState, useEffect, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  ArrowLeft,
  Check,
  X,
  Loader2,
  Download,
  RefreshCw,
  CheckCircle2,
  Image as ImageIcon,
  Search,
  Play,
  Film,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { getTaggedCardsForArtGeneration, createCardUpload, clearArtGenerationTags, updateProjectBrief, autoTagFirstCardsForAllActiveClients } from "@/lib/clientDatabase";
import { searchImages, SearchImage } from "@/lib/imageSearch";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface CanvasElement {
  id: string;
  type: "rect" | "circle" | "text" | "image" | "logo" | "contact" | "mascot";
  x: number;
  y: number;
  width: number;
  height: number;
  color?: string;
  text?: string;
  fontSize?: number;
  imageUrl?: string;
  placeholder?: boolean;
}

interface VideoTemplate {
  id: string;
  name: string;
  contentElements: CanvasElement[];
  signatureElements: CanvasElement[];
  width: number;
  height: number;
  backgroundColor: string;
  pageDuration: number;
}

interface ClientVideo {
  clientId: string;
  clientName: string;
  company: string;
  cardId: string;
  cardTitle: string;
  cardText: string;
  brandKit: any;
  pages: string[]; // Array of page images (base64)
  videoUrl: string | null;
  status: "pending" | "approved" | "rejected";
  backgroundImages?: string[];
  pageTexts: string[]; // Text for each content page
}

interface BatchVideoGeneratorProps {
  template: VideoTemplate;
  onBack: () => void;
  onComplete: () => void;
}

// Helper to load image
const loadImage = async (url: string): Promise<HTMLImageElement | null> => {
  if (!url) return null;
  
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = url;
  });
};

export const BatchVideoGenerator = ({ template, onBack, onComplete }: BatchVideoGeneratorProps) => {
  const [clientVideos, setClientVideos] = useState<ClientVideo[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);
  const [selectedVideo, setSelectedVideo] = useState<ClientVideo | null>(null);
  const [currentPreviewPage, setCurrentPreviewPage] = useState(0);
  const [isImageDialogOpen, setIsImageDialogOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchImage[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  
  const { toast } = useToast();

  useEffect(() => {
    loadTaggedCards();
  }, []);

  useEffect(() => {
    if (clientVideos.length > 0 && !isLoading && !isGenerating && !clientVideos.some(v => v.pages.length > 0)) {
      generateAllVideos();
    }
  }, [clientVideos, isLoading]);

  const loadTaggedCards = async () => {
    try {
      setIsLoading(true);
      
      await autoTagFirstCardsForAllActiveClients();
      const taggedCards = await getTaggedCardsForArtGeneration();

      const videos: ClientVideo[] = taggedCards.map((card: any) => {
        const fullText = card.description || card.title;
        // Split by semicolons for carousel pages
        const textParts = fullText.split(';').map((t: string) => t.trim()).filter((t: string) => t.length > 0);
        
        return {
          clientId: card.client?.id || card.client_id,
          clientName: card.client?.name || "Cliente",
          company: card.client?.company || card.client?.name || "Cliente",
          cardId: card.id,
          cardTitle: card.title,
          cardText: fullText,
          brandKit: card.client?.brand_kit,
          pages: [],
          videoUrl: null,
          status: "pending",
          pageTexts: textParts.length > 1 ? textParts : [fullText],
        };
      });

      setClientVideos(videos);

      if (videos.length === 0) {
        toast({
          title: "Nenhum card marcado",
          description: "Marque os cards pelo botão 'Criar Artes' no dashboard.",
        });
      }
    } catch (error) {
      console.error("Error loading tagged cards:", error);
      toast({
        title: "Erro ao carregar cards",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const generatePageImage = async (
    elements: CanvasElement[],
    text: string,
    brandKit: any,
    isSignature: boolean
  ): Promise<string> => {
    const canvas = document.createElement("canvas");
    canvas.width = template.width;
    canvas.height = template.height;
    const ctx = canvas.getContext("2d")!;

    // Colors from brand kit
    const bgColor = brandKit?.colors?.[0] || template.backgroundColor;
    const textColor = brandKit?.colors?.[1] || "#ffffff";
    const accessoryColor1 = brandKit?.colors?.[2] || "#cccccc";
    const accessoryColor2 = brandKit?.colors?.[3] || "#aaaaaa";

    // Draw background
    ctx.fillStyle = bgColor;
    ctx.fillRect(0, 0, template.width, template.height);

    // Draw elements
    for (const el of elements) {
      if (el.type === "rect") {
        ctx.fillStyle = accessoryColor1;
        ctx.fillRect(el.x, el.y, el.width, el.height);
      } else if (el.type === "circle") {
        ctx.fillStyle = accessoryColor2;
        ctx.beginPath();
        ctx.ellipse(el.x + el.width / 2, el.y + el.height / 2, el.width / 2, el.height / 2, 0, 0, Math.PI * 2);
        ctx.fill();
      } else if (el.type === "text") {
        ctx.fillStyle = textColor;
        const fontSize = el.fontSize || 48;
        const fontFamily = brandKit?.fontFamily || "Arial";
        ctx.font = `${fontSize}px ${fontFamily}`;
        
        // Use card text for content pages, placeholder for signature
        const displayText = isSignature ? (el.text || "") : text;
        
        // Word wrap
        const words = displayText.split(' ');
        let line = '';
        let y = el.y + fontSize;
        const maxWidth = el.width || 800;
        const lineHeight = fontSize * 1.3;
        
        for (let i = 0; i < words.length; i++) {
          const testLine = line + words[i] + ' ';
          const metrics = ctx.measureText(testLine);
          if (metrics.width > maxWidth && i > 0) {
            ctx.fillText(line.trim(), el.x, y);
            line = words[i] + ' ';
            y += lineHeight;
          } else {
            line = testLine;
          }
        }
        ctx.fillText(line.trim(), el.x, y);
      } else if (el.type === "logo") {
        const logoUrl = brandKit?.pngs?.[0] || brandKit?.logo;
        if (logoUrl) {
          const img = await loadImage(logoUrl);
          if (img) {
            ctx.drawImage(img, el.x, el.y, el.width, el.height);
          }
        } else {
          ctx.fillStyle = "rgba(59, 130, 246, 0.3)";
          ctx.fillRect(el.x, el.y, el.width, el.height);
        }
      } else if (el.type === "contact") {
        const contactUrl = brandKit?.pngs?.[1] || brandKit?.contactInfo;
        if (contactUrl) {
          const img = await loadImage(contactUrl);
          if (img) {
            ctx.drawImage(img, el.x, el.y, el.width, el.height);
          }
        } else {
          ctx.fillStyle = "rgba(16, 185, 129, 0.3)";
          ctx.fillRect(el.x, el.y, el.width, el.height);
        }
      } else if (el.type === "mascot") {
        const mascotUrl = brandKit?.pngs?.[2] || brandKit?.mascot;
        if (mascotUrl) {
          const img = await loadImage(mascotUrl);
          if (img) {
            ctx.drawImage(img, el.x, el.y, el.width, el.height);
          }
        }
      }
    }

    return canvas.toDataURL("image/png");
  };

  const generateVideoForClient = async (video: ClientVideo): Promise<string[]> => {
    const pages: string[] = [];

    // Generate content pages (one per text segment)
    for (const text of video.pageTexts) {
      const pageImage = await generatePageImage(
        template.contentElements,
        text,
        video.brandKit,
        false
      );
      pages.push(pageImage);
    }

    // Always add signature page at the end
    const signaturePage = await generatePageImage(
      template.signatureElements,
      "",
      video.brandKit,
      true
    );
    pages.push(signaturePage);

    return pages;
  };

  const generateAllVideos = async () => {
    setIsGenerating(true);
    try {
      const updatedVideos = [...clientVideos];

      for (let i = 0; i < updatedVideos.length; i++) {
        const video = updatedVideos[i];
        const pages = await generateVideoForClient(video);
        updatedVideos[i] = { ...video, pages };
        setClientVideos([...updatedVideos]);
      }

      toast({
        title: "Vídeos gerados!",
        description: `${updatedVideos.length} vídeos foram gerados com sucesso.`,
      });
    } catch (error) {
      console.error("Error generating videos:", error);
      toast({
        title: "Erro ao gerar vídeos",
        variant: "destructive",
      });
    } finally {
      setIsGenerating(false);
    }
  };

  const handleApprove = (index: number) => {
    const updatedVideos = [...clientVideos];
    updatedVideos[index] = { ...updatedVideos[index], status: "approved" };
    setClientVideos(updatedVideos);
  };

  const handleReject = (index: number) => {
    const updatedVideos = [...clientVideos];
    updatedVideos[index] = { ...updatedVideos[index], status: "rejected" };
    setClientVideos(updatedVideos);
  };

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

  const handleApproveAll = async () => {
    const approvedVideos = clientVideos.filter((v) => v.status === "approved" && v.pages.length > 0);

    if (approvedVideos.length === 0) {
      toast({
        title: "Nenhum vídeo aprovado",
        description: "Aprove os vídeos antes de salvar.",
        variant: "destructive",
      });
      return;
    }

    try {
      for (const video of approvedVideos) {
        // Save all pages as images (for now - video encoding would require additional tools)
        for (let i = 0; i < video.pages.length; i++) {
          const response = await fetch(video.pages[i]);
          const blob = await response.blob();
          const isLastPage = i === video.pages.length - 1;
          const fileName = `video_${video.cardId}_page${i + 1}_${Date.now()}.png`;

          const { data: uploadData, error: uploadError } = await supabase.storage
            .from("card-uploads")
            .upload(`videos/${fileName}`, blob, {
              contentType: "image/png",
            });

          if (uploadError) {
            console.error("Upload error:", uploadError);
            continue;
          }

          const { data: urlData } = supabase.storage
            .from("card-uploads")
            .getPublicUrl(`videos/${fileName}`);

          // Create card upload record
          await createCardUpload({
            card_id: video.cardId,
            file_name: fileName,
            file_url: urlData.publicUrl,
            file_type: "image/png",
            upload_type: "final",
          });

          // Use first page as cover image
          if (i === 0) {
            await updateProjectBrief(video.cardId, { cover_image: urlData.publicUrl });
          }
        }
      }

      await clearArtGenerationTags();
      
      // Dispatch event to notify ProjectBoard to reload
      window.dispatchEvent(new Event("bulkBriefsUpdated"));

      toast({
        title: "Vídeos salvos!",
        description: `${approvedVideos.length} vídeos foram salvos como slides.`,
      });

      onComplete();
    } catch (error) {
      console.error("Error saving videos:", error);
      toast({
        title: "Erro ao salvar vídeos",
        variant: "destructive",
      });
    }
  };

  const approvedCount = clientVideos.filter((v) => v.status === "approved").length;
  const pendingCount = clientVideos.filter((v) => v.status === "pending").length;

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <div className="border-b bg-card px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="outline" onClick={onBack}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Voltar ao Editor
          </Button>
          <div>
            <h1 className="text-lg font-semibold flex items-center gap-2">
              <Film className="h-5 w-5" />
              Geração em Lote de Vídeos
            </h1>
            <p className="text-sm text-muted-foreground">
              {template.name} • {template.pageDuration}s/página
            </p>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="flex gap-2">
            <Badge variant="outline" className="bg-yellow-500/20 text-yellow-500">
              Pendentes: {pendingCount}
            </Badge>
            <Badge variant="outline" className="bg-green-500/20 text-green-500">
              Aprovados: {approvedCount}
            </Badge>
          </div>
          <Button
            onClick={handleApproveAll}
            disabled={approvedCount === 0}
            className="bg-gradient-primary"
          >
            <CheckCircle2 className="mr-2 h-4 w-4" />
            Salvar Aprovados ({approvedCount})
          </Button>
        </div>
      </div>

      {/* Content */}
      <ScrollArea className="flex-1 p-6">
        {isGenerating ? (
          <div className="flex flex-col items-center justify-center h-64 gap-4">
            <Loader2 className="h-12 w-12 animate-spin text-primary" />
            <p className="text-muted-foreground">Gerando vídeos...</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {clientVideos.map((video, index) => (
              <div
                key={`${video.cardId}-${index}`}
                className={`bg-card rounded-lg border overflow-hidden transition-all ${
                  video.status === "approved"
                    ? "border-green-500 ring-2 ring-green-500/30"
                    : video.status === "rejected"
                    ? "border-red-500 ring-2 ring-red-500/30"
                    : "border-border"
                }`}
              >
                {/* Video Preview */}
                <div
                  className="aspect-[9/16] bg-muted relative group cursor-pointer"
                  onClick={() => {
                    setSelectedVideo(video);
                    setCurrentPreviewPage(0);
                  }}
                >
                  {video.pages[0] ? (
                    <img
                      src={video.pages[0]}
                      alt={video.clientName}
                      className="w-full h-full object-contain"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                    </div>
                  )}
                  
                  {/* Page indicator */}
                  <div className="absolute bottom-2 left-1/2 -translate-x-1/2 bg-black/70 px-2 py-1 rounded text-xs text-white">
                    {video.pages.length} páginas
                  </div>

                  {/* Status overlay */}
                  {video.status !== "pending" && (
                    <div
                      className={`absolute inset-0 flex items-center justify-center ${
                        video.status === "approved" ? "bg-green-500/20" : "bg-red-500/20"
                      }`}
                    >
                      {video.status === "approved" ? (
                        <Check className="h-16 w-16 text-green-500" />
                      ) : (
                        <X className="h-16 w-16 text-red-500" />
                      )}
                    </div>
                  )}
                </div>

                {/* Info */}
                <div className="p-3 space-y-2">
                  <div>
                    <h3 className="font-medium truncate">{video.clientName}</h3>
                    <p className="text-xs text-muted-foreground truncate">{video.company}</p>
                  </div>

                  <p className="text-xs line-clamp-2">{video.cardTitle}</p>

                  {/* Actions */}
                  <div className="flex gap-2 pt-2">
                    <Button
                      variant={video.status === "approved" ? "default" : "outline"}
                      size="sm"
                      className="flex-1"
                      onClick={() => handleApprove(index)}
                    >
                      <Check className="h-4 w-4" />
                    </Button>
                    <Button
                      variant={video.status === "rejected" ? "destructive" : "outline"}
                      size="sm"
                      className="flex-1"
                      onClick={() => handleReject(index)}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </ScrollArea>

      {/* Preview Dialog */}
      <Dialog open={!!selectedVideo} onOpenChange={() => setSelectedVideo(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{selectedVideo?.clientName} - Preview</DialogTitle>
          </DialogHeader>
          
          {selectedVideo && (
            <div className="space-y-4">
              <div className="aspect-[9/16] bg-muted rounded-lg overflow-hidden">
                {selectedVideo.pages[currentPreviewPage] && (
                  <img
                    src={selectedVideo.pages[currentPreviewPage]}
                    alt={`Page ${currentPreviewPage + 1}`}
                    className="w-full h-full object-contain"
                  />
                )}
              </div>
              
              {/* Page navigation */}
              <div className="flex items-center justify-center gap-2">
                {selectedVideo.pages.map((_, idx) => (
                  <Button
                    key={idx}
                    variant={currentPreviewPage === idx ? "default" : "outline"}
                    size="sm"
                    onClick={() => setCurrentPreviewPage(idx)}
                  >
                    {idx + 1}
                  </Button>
                ))}
              </div>
              
              <p className="text-center text-sm text-muted-foreground">
                Página {currentPreviewPage + 1} de {selectedVideo.pages.length}
                {currentPreviewPage === selectedVideo.pages.length - 1 && " (Assinatura)"}
              </p>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};
