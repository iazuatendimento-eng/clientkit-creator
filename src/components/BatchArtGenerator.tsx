import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";
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
  Move,
  Upload,
  Link,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { getTaggedCardsForArtGeneration, createCardUpload, clearArtGenerationTags } from "@/lib/clientDatabase";
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

interface ElementOverrides {
  logoX?: number;
  logoY?: number;
  logoScale?: number;
  textX?: number;
  textY?: number;
  textFontSize?: number;
  contactX?: number;
  contactY?: number;
  contactScale?: number;
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
  pageIndex?: number; // For carousel - which page this is (0-based)
  totalPages?: number; // For carousel - total pages in this card
}

// Helper to load image - handles both base64 data URLs and HTTP URLs
const loadImage = async (url: string): Promise<HTMLImageElement | null> => {
  if (!url) return null;
  
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      console.log("Image loaded successfully:", url.substring(0, 50));
      resolve(img);
    };
    img.onerror = (e) => {
      console.error("Error loading image:", url.substring(0, 50), e);
      resolve(null);
    };
    img.src = url;
  });
};

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
  const [isAdjustDialogOpen, setIsAdjustDialogOpen] = useState(false);
  const [photoOffsetX, setPhotoOffsetX] = useState(0);
  const [photoOffsetY, setPhotoOffsetY] = useState(0);
  const [searchQuery, setSearchQuery] = useState("");
  const [unsplashImages, setUnsplashImages] = useState<UnsplashImage[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [customImageUrl, setCustomImageUrl] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // Element override states
  const [logoX, setLogoX] = useState(0);
  const [logoY, setLogoY] = useState(0);
  const [logoScale, setLogoScale] = useState(100);
  const [textX, setTextX] = useState(0);
  const [textY, setTextY] = useState(0);
  const [textFontSize, setTextFontSize] = useState(100);
  const [contactX, setContactX] = useState(0);
  const [contactY, setContactY] = useState(0);
  const [contactScale, setContactScale] = useState(100);
  
  const { toast } = useToast();

  useEffect(() => {
    loadTaggedCards();
  }, []);

  // Auto-generate arts when cards are loaded
  useEffect(() => {
    if (clientArts.length > 0 && !isLoading && !isGenerating && !clientArts.some(a => a.imageUrl)) {
      generateAllArts();
    }
  }, [clientArts, isLoading]);

  const loadTaggedCards = async () => {
    try {
      setIsLoading(true);
      const taggedCards = await getTaggedCardsForArtGeneration();

      const arts: ClientArt[] = [];
      
      taggedCards.forEach((card: any) => {
        const fullText = card.description || card.title;
        // Check if text contains semicolons - indicates carousel
        const textParts = fullText.split(';').map((t: string) => t.trim()).filter((t: string) => t.length > 0);
        const isCarousel = textParts.length > 1;
        
        if (isCarousel) {
          // Create multiple arts for carousel
          textParts.forEach((text: string, pageIndex: number) => {
            arts.push({
              clientId: card.client?.id || card.client_id,
              clientName: card.client?.name || "Cliente",
              company: card.client?.company || card.client?.name || "Cliente",
              cardId: card.id,
              cardTitle: card.title,
              cardText: text,
              brandKit: card.client?.brand_kit,
              imageUrl: null,
              status: "pending",
              pageIndex,
              totalPages: textParts.length,
            });
          });
        } else {
          // Single art
          arts.push({
            clientId: card.client?.id || card.client_id,
            clientName: card.client?.name || "Cliente",
            company: card.client?.company || card.client?.name || "Cliente",
            cardId: card.id,
            cardTitle: card.title,
            cardText: fullText,
            brandKit: card.client?.brand_kit,
            imageUrl: null,
            status: "pending",
          });
        }
      });

      setClientArts(arts);

      if (arts.length === 0) {
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

  const generateArtForClient = async (art: ClientArt): Promise<string> => {
    console.log("Generating art for:", art.clientName, "Template elements:", template.elements.length);
    
    const canvas = document.createElement("canvas");
    canvas.width = template.width;
    canvas.height = template.height;
    const ctx = canvas.getContext("2d")!;

    // Color mapping from brand kit:
    // colors[0] = background color
    // colors[1] = text color  
    // colors[2] = accessory color 1
    // colors[3] = accessory color 2
    const bgColor = art.brandKit?.colors?.[0] || template.backgroundColor;
    const textColor = art.brandKit?.colors?.[1] || "#000000";
    const accessoryColor1 = art.brandKit?.colors?.[2] || "#cccccc";
    const accessoryColor2 = art.brandKit?.colors?.[3] || "#aaaaaa";
    
    console.log("Colors - BG:", bgColor, "Text:", textColor, "Acc1:", accessoryColor1, "Acc2:", accessoryColor2);
    
    ctx.fillStyle = bgColor;
    ctx.fillRect(0, 0, template.width, template.height);

    // Draw background image if set
    if (art.backgroundImage) {
      const bgImg = await loadImage(art.backgroundImage);
      if (bgImg) {
        ctx.drawImage(bgImg, 0, 0, template.width, template.height);
      }
    }

    // Draw elements
    for (const el of template.elements) {
      if (el.type === "rect") {
        // Accessories use colors 3 or 4
        ctx.fillStyle = accessoryColor1;
        ctx.fillRect(el.x, el.y, el.width, el.height);
      } else if (el.type === "circle") {
        // Accessories use colors 3 or 4
        ctx.fillStyle = accessoryColor2;
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
        // Text uses color 2 and client's font
        ctx.fillStyle = textColor;
        const baseFontSize = el.fontSize || 32;
        const fontSizeMultiplier = (art.elementOverrides?.textFontSize || 100) / 100;
        const fontSize = Math.round(baseFontSize * fontSizeMultiplier);
        const fontFamily = art.brandKit?.fontFamily || "Arial";
        ctx.font = `${fontSize}px ${fontFamily}`;
        
        // Use card text for text elements
        const text = art.cardText || el.text || "";
        
        // Apply text position overrides
        const textOffsetX = art.elementOverrides?.textX || 0;
        const textOffsetY = art.elementOverrides?.textY || 0;
        const baseX = el.x + textOffsetX;
        const baseY = el.y + textOffsetY;
        
        // Word wrap text within element width
        const words = text.split(' ');
        let line = '';
        let y = baseY + fontSize;
        const maxWidth = el.width || 400;
        const lineHeight = fontSize * 1.2;
        
        for (let i = 0; i < words.length; i++) {
          const testLine = line + words[i] + ' ';
          const metrics = ctx.measureText(testLine);
          if (metrics.width > maxWidth && i > 0) {
            ctx.fillText(line.trim(), baseX, y);
            line = words[i] + ' ';
            y += lineHeight;
          } else {
            line = testLine;
          }
        }
        ctx.fillText(line.trim(), baseX, y);
        console.log("Drew text at:", baseX, baseY, "Text:", text.substring(0, 50), "Font:", fontFamily);
      } else if (el.type === "image" && el.placeholder && art.photoImage) {
        // Draw photo with offset support
        const img = await loadImage(art.photoImage);
        if (img) {
          const offset = art.photoOffset || { x: 0, y: 0 };
          // Calculate source dimensions to maintain aspect ratio and allow panning
          const imgAspect = img.width / img.height;
          const frameAspect = el.width / el.height;
          
          let sx = 0, sy = 0, sw = img.width, sh = img.height;
          
          if (imgAspect > frameAspect) {
            // Image is wider - allow horizontal panning
            sh = img.height;
            sw = sh * frameAspect;
            sx = (img.width - sw) / 2 + (offset.x * img.width / el.width);
            sx = Math.max(0, Math.min(sx, img.width - sw));
          } else {
            // Image is taller - allow vertical panning
            sw = img.width;
            sh = sw / frameAspect;
            sy = (img.height - sh) / 2 + (offset.y * img.height / el.height);
            sy = Math.max(0, Math.min(sy, img.height - sh));
          }
          
          ctx.drawImage(img, sx, sy, sw, sh, el.x, el.y, el.width, el.height);
        } else {
          // Draw placeholder if image fails to load
          ctx.fillStyle = "#e5e7eb";
          ctx.fillRect(el.x, el.y, el.width, el.height);
        }
      } else if (el.type === "image" && el.imageUrl && !el.placeholder) {
        const img = await loadImage(el.imageUrl);
        if (img) {
          ctx.drawImage(img, el.x, el.y, el.width, el.height);
        }
      } else if (el.type === "logo") {
        // Logo uses PNG[0] from brand kit with optional overrides
        const logoUrl = art.brandKit?.pngs?.[0] || art.brandKit?.logo;
        console.log("Loading logo from:", logoUrl?.substring(0, 50));
        if (logoUrl) {
          const img = await loadImage(logoUrl);
          if (img) {
            const logoOffsetX = art.elementOverrides?.logoX || 0;
            const logoOffsetY = art.elementOverrides?.logoY || 0;
            const logoScaleMultiplier = (art.elementOverrides?.logoScale || 100) / 100;
            const newWidth = el.width * logoScaleMultiplier;
            const newHeight = el.height * logoScaleMultiplier;
            ctx.drawImage(img, el.x + logoOffsetX, el.y + logoOffsetY, newWidth, newHeight);
          } else {
            ctx.fillStyle = "#e5e7eb";
            ctx.fillRect(el.x, el.y, el.width, el.height);
            ctx.fillStyle = "#666";
            ctx.font = "14px Arial";
            ctx.textAlign = "center";
            ctx.fillText("Logo", el.x + el.width / 2, el.y + el.height / 2);
            ctx.textAlign = "left";
          }
        }
      } else if (el.type === "contact") {
        // Contact uses PNG[1] from brand kit with optional overrides
        const contactUrl = art.brandKit?.pngs?.[1] || art.brandKit?.contactInfo;
        console.log("Loading contact from:", contactUrl?.substring(0, 50));
        if (contactUrl) {
          const img = await loadImage(contactUrl);
          if (img) {
            const contactOffsetX = art.elementOverrides?.contactX || 0;
            const contactOffsetY = art.elementOverrides?.contactY || 0;
            const contactScaleMultiplier = (art.elementOverrides?.contactScale || 100) / 100;
            const newWidth = el.width * contactScaleMultiplier;
            const newHeight = el.height * contactScaleMultiplier;
            ctx.drawImage(img, el.x + contactOffsetX, el.y + contactOffsetY, newWidth, newHeight);
          }
        }
      } else if (el.type === "mascot") {
        // Mascot uses PNG[2] from brand kit
        const mascotUrl = art.brandKit?.pngs?.[2] || art.brandKit?.mascot;
        console.log("Loading mascot from:", mascotUrl?.substring(0, 50));
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

  const generateAllArts = async () => {
    setIsGenerating(true);
    try {
      const updatedArts = [...clientArts];
      
      // Check if template has image placeholders
      const hasImagePlaceholder = template.elements.some(el => el.type === "image" && el.placeholder);

      for (let i = 0; i < updatedArts.length; i++) {
        const art = updatedArts[i];
        
        // Search for relevant image if template has image placeholder
        if (hasImagePlaceholder && !art.photoImage) {
          try {
            const searchTerms = art.cardText.split(" ").slice(0, 3).join(" ");
            const images = await searchUnsplashImages(searchTerms, 1);
            if (images.length > 0) {
              updatedArts[i] = { ...art, photoImage: images[0].urls.regular };
            }
          } catch (error) {
            console.error("Error searching image for:", art.cardText);
          }
        }
        
        const imageUrl = await generateArtForClient(updatedArts[i]);
        updatedArts[i] = { ...updatedArts[i], imageUrl };
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

  const handleSelectPhotoImage = (image: UnsplashImage) => {
    if (!selectedArt) return;
    const index = clientArts.findIndex((a) => 
      a.clientId === selectedArt.clientId && 
      a.cardId === selectedArt.cardId &&
      a.pageIndex === selectedArt.pageIndex
    );
    if (index === -1) return;

    const updatedArts = [...clientArts];
    updatedArts[index] = { ...updatedArts[index], photoImage: image.urls.regular, photoOffset: { x: 0, y: 0 } };
    setClientArts(updatedArts);
    setIsImageDialogOpen(false);
    setCustomImageUrl("");

    // Regenerate the art with new photo
    regenerateArt(index);
  };

  const handleCustomImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !selectedArt) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const base64 = event.target?.result as string;
      applyCustomImage(base64);
    };
    reader.readAsDataURL(file);
  };

  const handleCustomImageUrl = () => {
    if (!customImageUrl.trim() || !selectedArt) return;
    applyCustomImage(customImageUrl.trim());
  };

  const applyCustomImage = (imageUrl: string) => {
    if (!selectedArt) return;
    const index = clientArts.findIndex((a) => 
      a.clientId === selectedArt.clientId && 
      a.cardId === selectedArt.cardId &&
      a.pageIndex === selectedArt.pageIndex
    );
    if (index === -1) return;

    const updatedArts = [...clientArts];
    updatedArts[index] = { ...updatedArts[index], photoImage: imageUrl, photoOffset: { x: 0, y: 0 } };
    setClientArts(updatedArts);
    setIsImageDialogOpen(false);
    setCustomImageUrl("");

    // Regenerate the art with new photo
    regenerateArt(index);
    
    toast({
      title: "Imagem aplicada!",
      description: "A arte será regenerada com a nova imagem.",
    });
  };

  const openAdjustDialog = (art: ClientArt) => {
    setSelectedArt(art);
    setPhotoOffsetX(art.photoOffset?.x || 0);
    setPhotoOffsetY(art.photoOffset?.y || 0);
    // Load element overrides
    setLogoX(art.elementOverrides?.logoX || 0);
    setLogoY(art.elementOverrides?.logoY || 0);
    setLogoScale(art.elementOverrides?.logoScale || 100);
    setTextX(art.elementOverrides?.textX || 0);
    setTextY(art.elementOverrides?.textY || 0);
    setTextFontSize(art.elementOverrides?.textFontSize || 100);
    setContactX(art.elementOverrides?.contactX || 0);
    setContactY(art.elementOverrides?.contactY || 0);
    setContactScale(art.elementOverrides?.contactScale || 100);
    setIsAdjustDialogOpen(true);
  };

  const handleApplyElementOverrides = async () => {
    if (!selectedArt) return;
    const index = clientArts.findIndex((a) => 
      a.clientId === selectedArt.clientId && 
      a.cardId === selectedArt.cardId &&
      a.pageIndex === selectedArt.pageIndex
    );
    if (index === -1) return;

    const updatedArts = [...clientArts];
    updatedArts[index] = { 
      ...updatedArts[index], 
      photoOffset: { x: photoOffsetX, y: photoOffsetY },
      elementOverrides: {
        logoX,
        logoY,
        logoScale,
        textX,
        textY,
        textFontSize,
        contactX,
        contactY,
        contactScale,
      }
    };
    setClientArts(updatedArts);
    setIsAdjustDialogOpen(false);

    // Regenerate the art with new overrides
    const imageUrl = await generateArtForClient(updatedArts[index]);
    updatedArts[index] = { ...updatedArts[index], imageUrl };
    setClientArts([...updatedArts]);
    
    toast({
      title: "Ajustes aplicados!",
      description: "A arte foi regenerada com as novas configurações.",
    });
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

      // Clear the art generation tags
      await clearArtGenerationTags();

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
              {clientArts.length} cards marcados para geração
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
              key={`${art.clientId}-${art.cardId}-${art.pageIndex ?? 0}`}
              className={`border rounded-lg overflow-hidden bg-card ${
                art.status === "approved"
                  ? "ring-2 ring-green-500"
                  : art.status === "rejected"
                  ? "ring-2 ring-red-500 opacity-50"
                  : ""
              }`}
            >
              {/* Art Preview - Double click to adjust photo position */}
              <div 
                className="aspect-[4/5] bg-muted relative cursor-pointer"
                onDoubleClick={() => {
                  if (art.imageUrl && art.status === "pending") {
                    openAdjustDialog(art);
                  }
                }}
                title={art.status === "pending" ? "Duplo clique para ajustar posição" : ""}
              >
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

                {/* Carousel page indicator */}
                {art.totalPages && art.totalPages > 1 && (
                  <div className="absolute top-2 left-2 bg-primary text-primary-foreground text-xs px-2 py-1 rounded-full font-semibold">
                    {(art.pageIndex ?? 0) + 1}/{art.totalPages}
                  </div>
                )}
                
                {art.status === "pending" && art.imageUrl && (
                  <div className="absolute bottom-2 left-2 bg-background/80 text-foreground text-xs px-2 py-1 rounded opacity-0 hover:opacity-100 transition-opacity">
                    Duplo clique para ajustar
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
                      title="Trocar foto"
                      onClick={() => {
                        setSelectedArt(art);
                        setSearchQuery(art.cardText.split(" ").slice(0, 3).join(" "));
                        setIsImageDialogOpen(true);
                      }}
                    >
                      <ImageIcon className="h-4 w-4" />
                    </Button>
                    {art.photoImage && (
                      <Button
                        size="sm"
                        variant="outline"
                        title="Ajustar posição da foto"
                        onClick={() => openAdjustDialog(art)}
                      >
                        <Move className="h-4 w-4" />
                      </Button>
                    )}
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
      <Dialog open={isImageDialogOpen} onOpenChange={(open) => {
        setIsImageDialogOpen(open);
        if (!open) setCustomImageUrl("");
      }}>
        <DialogContent className="max-w-3xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle>Trocar Foto</DialogTitle>
          </DialogHeader>

          <Tabs defaultValue="bank" className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="bank">
                <Search className="h-4 w-4 mr-2" />
                Banco de Imagens
              </TabsTrigger>
              <TabsTrigger value="custom">
                <Upload className="h-4 w-4 mr-2" />
                Minha Imagem
              </TabsTrigger>
            </TabsList>

            <TabsContent value="bank" className="space-y-4">
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

              <ScrollArea className="h-[350px]">
                <div className="grid grid-cols-3 gap-2">
                  {unsplashImages.map((image) => (
                    <div
                      key={image.id}
                      className="aspect-[4/5] rounded-lg overflow-hidden cursor-pointer hover:ring-2 ring-primary transition-all"
                      onClick={() => handleSelectPhotoImage(image)}
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
            </TabsContent>

            <TabsContent value="custom" className="space-y-6">
              {/* File Upload */}
              <div className="space-y-3">
                <Label className="text-sm font-medium">Fazer Upload</Label>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleCustomImageUpload}
                />
                <Button 
                  variant="outline" 
                  className="w-full h-24 border-dashed"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <div className="flex flex-col items-center gap-2">
                    <Upload className="h-6 w-6" />
                    <span>Clique para selecionar uma imagem</span>
                  </div>
                </Button>
              </div>

              {/* URL Paste */}
              <div className="space-y-3">
                <Label className="text-sm font-medium">Ou cole uma URL</Label>
                <div className="flex gap-2">
                  <Input
                    placeholder="https://exemplo.com/imagem.jpg"
                    value={customImageUrl}
                    onChange={(e) => setCustomImageUrl(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleCustomImageUrl()}
                  />
                  <Button onClick={handleCustomImageUrl} disabled={!customImageUrl.trim()}>
                    <Link className="h-4 w-4 mr-2" />
                    Usar
                  </Button>
                </div>
              </div>

              {/* Preview of custom URL */}
              {customImageUrl.trim() && (
                <div className="space-y-2">
                  <Label className="text-sm font-medium">Preview</Label>
                  <div className="aspect-video bg-muted rounded-lg overflow-hidden max-w-xs">
                    <img
                      src={customImageUrl}
                      alt="Preview"
                      className="w-full h-full object-contain"
                      onError={(e) => {
                        (e.target as HTMLImageElement).style.display = 'none';
                      }}
                    />
                  </div>
                </div>
              )}
            </TabsContent>
          </Tabs>
        </DialogContent>
      </Dialog>

      {/* Element Adjustment Dialog */}
      <Dialog open={isAdjustDialogOpen} onOpenChange={setIsAdjustDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Ajustar Elementos da Arte</DialogTitle>
          </DialogHeader>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 py-4">
            {/* Preview Column */}
            <div>
              <Label className="text-sm font-medium mb-2 block">Preview</Label>
              {selectedArt?.imageUrl && (
                <div className="aspect-[4/5] bg-muted rounded-lg overflow-hidden border">
                  <img
                    src={selectedArt.imageUrl}
                    alt="Preview da arte gerada"
                    className="w-full h-full object-contain"
                  />
                </div>
              )}
            </div>

            {/* Controls Column */}
            <div className="space-y-6">
              {/* Photo Position */}
              <div className="space-y-3 p-3 bg-muted/50 rounded-lg">
                <Label className="text-sm font-semibold flex items-center gap-2">
                  <ImageIcon className="h-4 w-4" />
                  Posição da Foto
                </Label>
                <div className="space-y-2">
                  <div>
                    <span className="text-xs text-muted-foreground">Horizontal: {photoOffsetX}</span>
                    <Slider
                      value={[photoOffsetX]}
                      onValueChange={([v]) => setPhotoOffsetX(v)}
                      min={-100}
                      max={100}
                      step={5}
                    />
                  </div>
                  <div>
                    <span className="text-xs text-muted-foreground">Vertical: {photoOffsetY}</span>
                    <Slider
                      value={[photoOffsetY]}
                      onValueChange={([v]) => setPhotoOffsetY(v)}
                      min={-100}
                      max={100}
                      step={5}
                    />
                  </div>
                </div>
              </div>

              {/* Logo Controls */}
              <div className="space-y-3 p-3 bg-muted/50 rounded-lg">
                <Label className="text-sm font-semibold">🏷️ Logo</Label>
                <div className="space-y-2">
                  <div>
                    <span className="text-xs text-muted-foreground">Posição X: {logoX}</span>
                    <Slider
                      value={[logoX]}
                      onValueChange={([v]) => setLogoX(v)}
                      min={-200}
                      max={200}
                      step={5}
                    />
                  </div>
                  <div>
                    <span className="text-xs text-muted-foreground">Posição Y: {logoY}</span>
                    <Slider
                      value={[logoY]}
                      onValueChange={([v]) => setLogoY(v)}
                      min={-200}
                      max={200}
                      step={5}
                    />
                  </div>
                  <div>
                    <span className="text-xs text-muted-foreground">Tamanho: {logoScale}%</span>
                    <Slider
                      value={[logoScale]}
                      onValueChange={([v]) => setLogoScale(v)}
                      min={25}
                      max={200}
                      step={5}
                    />
                  </div>
                </div>
              </div>

              {/* Text Controls */}
              <div className="space-y-3 p-3 bg-muted/50 rounded-lg">
                <Label className="text-sm font-semibold">📝 Texto</Label>
                <div className="space-y-2">
                  <div>
                    <span className="text-xs text-muted-foreground">Posição X: {textX}</span>
                    <Slider
                      value={[textX]}
                      onValueChange={([v]) => setTextX(v)}
                      min={-200}
                      max={200}
                      step={5}
                    />
                  </div>
                  <div>
                    <span className="text-xs text-muted-foreground">Posição Y: {textY}</span>
                    <Slider
                      value={[textY]}
                      onValueChange={([v]) => setTextY(v)}
                      min={-200}
                      max={200}
                      step={5}
                    />
                  </div>
                  <div>
                    <span className="text-xs text-muted-foreground">Tamanho Fonte: {textFontSize}%</span>
                    <Slider
                      value={[textFontSize]}
                      onValueChange={([v]) => setTextFontSize(v)}
                      min={50}
                      max={200}
                      step={5}
                    />
                  </div>
                </div>
              </div>

              {/* Contact Controls */}
              <div className="space-y-3 p-3 bg-muted/50 rounded-lg">
                <Label className="text-sm font-semibold">📞 Contato</Label>
                <div className="space-y-2">
                  <div>
                    <span className="text-xs text-muted-foreground">Posição X: {contactX}</span>
                    <Slider
                      value={[contactX]}
                      onValueChange={([v]) => setContactX(v)}
                      min={-200}
                      max={200}
                      step={5}
                    />
                  </div>
                  <div>
                    <span className="text-xs text-muted-foreground">Posição Y: {contactY}</span>
                    <Slider
                      value={[contactY]}
                      onValueChange={([v]) => setContactY(v)}
                      min={-200}
                      max={200}
                      step={5}
                    />
                  </div>
                  <div>
                    <span className="text-xs text-muted-foreground">Tamanho: {contactScale}%</span>
                    <Slider
                      value={[contactScale]}
                      onValueChange={([v]) => setContactScale(v)}
                      min={25}
                      max={200}
                      step={5}
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="flex gap-2 justify-end pt-4 border-t">
            <Button variant="outline" onClick={() => setIsAdjustDialogOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleApplyElementOverrides} className="bg-gradient-primary">
              Aplicar Ajustes
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};
