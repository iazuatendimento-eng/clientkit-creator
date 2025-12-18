import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
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
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { getAllClients, getProjectBriefsByClient, createCardUpload } from "@/lib/clientDatabase";
import { searchUnsplashImages, UnsplashImage } from "@/lib/unsplash";
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

interface MasterTemplate {
  id: string;
  name: string;
  elements: CanvasElement[];
  width: number;
  height: number;
  backgroundColor: string;
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
}

interface BatchArtGeneratorProps {
  template: MasterTemplate;
  onBack: () => void;
  onComplete: () => void;
}

export const BatchArtGenerator = ({ template, onBack, onComplete }: BatchArtGeneratorProps) => {
  const [clientArts, setClientArts] = useState<ClientArt[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);
  const [selectedArt, setSelectedArt] = useState<ClientArt | null>(null);
  const [isImageDialogOpen, setIsImageDialogOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [unsplashImages, setUnsplashImages] = useState<UnsplashImage[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    loadClientsWithTodayCards();
  }, []);

  const loadClientsWithTodayCards = async () => {
    try {
      setIsLoading(true);
      const allClients = await getAllClients();
      const today = new Date().toISOString().split("T")[0];

      const arts: ClientArt[] = [];

      for (const client of allClients) {
        if (!client.active) continue;

        const briefs = await getProjectBriefsByClient(client.id);
        const todayCard = briefs.find(
          (b: any) =>
            b.status === "todo" &&
            b.deadline &&
            b.deadline.split("T")[0] === today
        );

        if (todayCard) {
          arts.push({
            clientId: client.id,
            clientName: client.name,
            company: client.company || client.name,
            cardId: todayCard.id,
            cardTitle: todayCard.title,
            cardText: todayCard.description || todayCard.title,
            brandKit: client.brand_kit,
            imageUrl: null,
            status: "pending",
          });
        }
      }

      setClientArts(arts);

      if (arts.length === 0) {
        toast({
          title: "Nenhum card encontrado",
          description: "Não há cards com prazo para hoje.",
        });
      }
    } catch (error) {
      console.error("Error loading clients:", error);
      toast({
        title: "Erro ao carregar clientes",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const generateArtForClient = async (art: ClientArt): Promise<string> => {
    return new Promise((resolve) => {
      const canvas = document.createElement("canvas");
      canvas.width = template.width;
      canvas.height = template.height;
      const ctx = canvas.getContext("2d")!;

      // Background color from client's brand kit or template
      const bgColor = art.brandKit?.colors?.[0] || template.backgroundColor;
      ctx.fillStyle = bgColor;
      ctx.fillRect(0, 0, template.width, template.height);

      // Draw background image if set
      if (art.backgroundImage) {
        const bgImg = new Image();
        bgImg.crossOrigin = "anonymous";
        bgImg.onload = () => {
          ctx.drawImage(bgImg, 0, 0, template.width, template.height);
          drawElements();
        };
        bgImg.onerror = () => drawElements();
        bgImg.src = art.backgroundImage;
      } else {
        drawElements();
      }

      function drawElements() {
        const imagesLoaded: Promise<void>[] = [];

        template.elements.forEach((el) => {
          if (el.type === "rect") {
            ctx.fillStyle = el.color || "#cccccc";
            ctx.fillRect(el.x, el.y, el.width, el.height);
          } else if (el.type === "circle") {
            ctx.fillStyle = el.color || "#cccccc";
            ctx.beginPath();
            ctx.ellipse(
              el.x + el.width / 2,
              el.y + el.height / 2,
              el.width / 2,
              el.height / 2,
              0,
              0,
              Math.PI * 2
            );
            ctx.fill();
          } else if (el.type === "text") {
            // Use font color from brand kit
            const fontColor = art.brandKit?.colors?.[1] || el.color || "#000000";
            ctx.fillStyle = fontColor;
            ctx.font = `${el.fontSize || 32}px Arial`;
            
            // Replace placeholder text with card text if it's a generic placeholder
            const text = el.text?.toLowerCase().includes("texto") ? art.cardText : el.text || "";
            ctx.fillText(text, el.x, el.y + (el.fontSize || 32));
          } else if (el.type === "image" && el.imageUrl) {
            const promise = new Promise<void>((imgResolve) => {
              const img = new Image();
              img.crossOrigin = "anonymous";
              img.onload = () => {
                ctx.drawImage(img, el.x, el.y, el.width, el.height);
                imgResolve();
              };
              img.onerror = () => imgResolve();
              img.src = el.imageUrl!;
            });
            imagesLoaded.push(promise);
          } else if (el.type === "logo" && art.brandKit?.pngs?.[0]) {
            const promise = new Promise<void>((imgResolve) => {
              const img = new Image();
              img.crossOrigin = "anonymous";
              img.onload = () => {
                ctx.drawImage(img, el.x, el.y, el.width, el.height);
                imgResolve();
              };
              img.onerror = () => {
                // Draw placeholder if logo fails to load
                ctx.fillStyle = "#e5e7eb";
                ctx.fillRect(el.x, el.y, el.width, el.height);
                imgResolve();
              };
              img.src = art.brandKit.pngs[0];
            });
            imagesLoaded.push(promise);
          } else if (el.type === "contact" && art.brandKit?.pngs?.[1]) {
            const promise = new Promise<void>((imgResolve) => {
              const img = new Image();
              img.crossOrigin = "anonymous";
              img.onload = () => {
                ctx.drawImage(img, el.x, el.y, el.width, el.height);
                imgResolve();
              };
              img.onerror = () => imgResolve();
              img.src = art.brandKit.pngs[1];
            });
            imagesLoaded.push(promise);
          } else if (el.type === "mascot" && art.brandKit?.pngs?.[2]) {
            const promise = new Promise<void>((imgResolve) => {
              const img = new Image();
              img.crossOrigin = "anonymous";
              img.onload = () => {
                ctx.drawImage(img, el.x, el.y, el.width, el.height);
                imgResolve();
              };
              img.onerror = () => imgResolve();
              img.src = art.brandKit.pngs[2];
            });
            imagesLoaded.push(promise);
          }
        });

        Promise.all(imagesLoaded).then(() => {
          resolve(canvas.toDataURL("image/png"));
        });
      }
    });
  };

  const generateAllArts = async () => {
    setIsGenerating(true);
    try {
      const updatedArts = [...clientArts];

      for (let i = 0; i < updatedArts.length; i++) {
        const art = updatedArts[i];
        const imageUrl = await generateArtForClient(art);
        updatedArts[i] = { ...art, imageUrl };
        setClientArts([...updatedArts]);
      }

      toast({
        title: "Artes geradas!",
        description: `${updatedArts.length} artes foram geradas com sucesso.`,
      });
    } catch (error) {
      console.error("Error generating arts:", error);
      toast({
        title: "Erro ao gerar artes",
        variant: "destructive",
      });
    } finally {
      setIsGenerating(false);
    }
  };

  const regenerateArt = async (index: number) => {
    const art = clientArts[index];
    const imageUrl = await generateArtForClient(art);
    const updatedArts = [...clientArts];
    updatedArts[index] = { ...art, imageUrl };
    setClientArts(updatedArts);
  };

  const handleApprove = (index: number) => {
    const updatedArts = [...clientArts];
    updatedArts[index] = { ...updatedArts[index], status: "approved" };
    setClientArts(updatedArts);
  };

  const handleReject = (index: number) => {
    const updatedArts = [...clientArts];
    updatedArts[index] = { ...updatedArts[index], status: "rejected" };
    setClientArts(updatedArts);
  };

  const handleSearchImages = async () => {
    if (!searchQuery.trim()) return;
    setIsSearching(true);
    try {
      const images = await searchUnsplashImages(searchQuery, 12);
      setUnsplashImages(images);
    } catch (error) {
      toast({
        title: "Erro ao buscar imagens",
        variant: "destructive",
      });
    } finally {
      setIsSearching(false);
    }
  };

  const handleSelectBackgroundImage = (image: UnsplashImage) => {
    if (!selectedArt) return;
    const index = clientArts.findIndex((a) => a.clientId === selectedArt.clientId);
    if (index === -1) return;

    const updatedArts = [...clientArts];
    updatedArts[index] = { ...updatedArts[index], backgroundImage: image.urls.regular };
    setClientArts(updatedArts);
    setIsImageDialogOpen(false);

    // Regenerate the art with new background
    regenerateArt(index);
  };

  const handleApproveAll = async () => {
    const approvedArts = clientArts.filter((a) => a.status === "approved" && a.imageUrl);

    if (approvedArts.length === 0) {
      toast({
        title: "Nenhuma arte aprovada",
        description: "Aprove as artes antes de salvar.",
        variant: "destructive",
      });
      return;
    }

    try {
      for (const art of approvedArts) {
        // Convert base64 to blob and upload
        const response = await fetch(art.imageUrl!);
        const blob = await response.blob();
        const fileName = `art_${art.cardId}_${Date.now()}.png`;

        const { data: uploadData, error: uploadError } = await supabase.storage
          .from("card-uploads")
          .upload(`artes/${fileName}`, blob, {
            contentType: "image/png",
          });

        if (uploadError) {
          console.error("Upload error:", uploadError);
          continue;
        }

        const { data: urlData } = supabase.storage
          .from("card-uploads")
          .getPublicUrl(`artes/${fileName}`);

        // Create card upload record
        await createCardUpload({
          card_id: art.cardId,
          file_name: fileName,
          file_url: urlData.publicUrl,
          file_type: "image/png",
          upload_type: "final",
        });
      }

      toast({
        title: "Artes salvas!",
        description: `${approvedArts.length} artes foram anexadas aos cards.`,
      });

      onComplete();
    } catch (error) {
      console.error("Error saving arts:", error);
      toast({
        title: "Erro ao salvar artes",
        variant: "destructive",
      });
    }
  };

  const approvedCount = clientArts.filter((a) => a.status === "approved").length;
  const pendingCount = clientArts.filter((a) => a.status === "pending").length;

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
          <Button variant="ghost" size="icon" onClick={onBack}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="font-semibold">Geração em Lote</h1>
            <p className="text-sm text-muted-foreground">
              {clientArts.length} clientes com cards para hoje
            </p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex gap-2">
            <Badge variant="outline">{pendingCount} pendentes</Badge>
            <Badge className="bg-green-500">{approvedCount} aprovadas</Badge>
          </div>
          {!clientArts.some((a) => a.imageUrl) ? (
            <Button
              onClick={generateAllArts}
              disabled={isGenerating || clientArts.length === 0}
              className="bg-gradient-primary"
            >
              {isGenerating ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Gerando...
                </>
              ) : (
                "Gerar Todas as Artes"
              )}
            </Button>
          ) : (
            <Button
              onClick={handleApproveAll}
              disabled={approvedCount === 0}
              className="bg-gradient-primary"
            >
              <CheckCircle2 className="mr-2 h-4 w-4" />
              Salvar {approvedCount} Aprovadas
            </Button>
          )}
        </div>
      </div>

      {/* Gallery */}
      <ScrollArea className="flex-1 p-6">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {clientArts.map((art, index) => (
            <div
              key={art.clientId}
              className={`border rounded-lg overflow-hidden bg-card ${
                art.status === "approved"
                  ? "ring-2 ring-green-500"
                  : art.status === "rejected"
                  ? "ring-2 ring-red-500 opacity-50"
                  : ""
              }`}
            >
              {/* Art Preview */}
              <div className="aspect-[4/5] bg-muted relative">
                {art.imageUrl ? (
                  <img
                    src={art.imageUrl}
                    alt={art.company}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <ImageIcon className="h-12 w-12 text-muted-foreground" />
                  </div>
                )}

                {art.status === "approved" && (
                  <div className="absolute top-2 right-2 bg-green-500 text-white p-1 rounded-full">
                    <Check className="h-4 w-4" />
                  </div>
                )}
              </div>

              {/* Info */}
              <div className="p-3">
                <h3 className="font-semibold truncate">{art.company}</h3>
                <p className="text-sm text-muted-foreground truncate">{art.cardText}</p>

                {/* Actions */}
                {art.imageUrl && art.status === "pending" && (
                  <div className="flex gap-2 mt-3">
                    <Button
                      size="sm"
                      variant="outline"
                      className="flex-1"
                      onClick={() => {
                        setSelectedArt(art);
                        setSearchQuery(art.cardText.split(" ").slice(0, 3).join(" "));
                        setIsImageDialogOpen(true);
                      }}
                    >
                      <ImageIcon className="h-4 w-4" />
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => regenerateArt(index)}
                    >
                      <RefreshCw className="h-4 w-4" />
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={() => handleReject(index)}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                    <Button
                      size="sm"
                      className="bg-green-500 hover:bg-green-600"
                      onClick={() => handleApprove(index)}
                    >
                      <Check className="h-4 w-4" />
                    </Button>
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
          ))}
        </div>

        {clientArts.length === 0 && (
          <div className="text-center py-12">
            <p className="text-muted-foreground">Nenhum card com prazo para hoje</p>
          </div>
        )}
      </ScrollArea>

      {/* Image Search Dialog */}
      <Dialog open={isImageDialogOpen} onOpenChange={setIsImageDialogOpen}>
        <DialogContent className="max-w-3xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle>Trocar Imagem de Fundo</DialogTitle>
          </DialogHeader>

          <div className="flex gap-2 mb-4">
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

          <ScrollArea className="h-[400px]">
            <div className="grid grid-cols-3 gap-2">
              {unsplashImages.map((image) => (
                <div
                  key={image.id}
                  className="aspect-[4/5] rounded-lg overflow-hidden cursor-pointer hover:ring-2 ring-primary transition-all"
                  onClick={() => handleSelectBackgroundImage(image)}
                >
                  <img
                    src={image.urls.small}
                    alt={image.description || "Unsplash image"}
                    className="w-full h-full object-cover"
                  />
                </div>
              ))}
            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </div>
  );
};
