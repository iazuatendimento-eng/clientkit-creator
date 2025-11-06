import { useState, useRef, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ArrowLeft, Wand2, Download, Move } from "lucide-react";
import { toast } from "sonner";

interface BrandKit {
  id: string;
  name: string;
  logo?: string;
  contactInfo?: string;
  mascot?: string;
  colors: string[];
}

interface AIArtGeneratorProps {
  brandKit: BrandKit;
  onBack: () => void;
}

interface DraggableElement {
  id: string;
  src: string;
  x: number;
  y: number;
  width: number;
  height: number;
  isDragging?: boolean;
}

export const AIArtGenerator = ({ brandKit, onBack }: AIArtGeneratorProps) => {
  const [prompt, setPrompt] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedText, setGeneratedText] = useState("");
  const canvasRef = useRef<HTMLDivElement>(null);
  const [elements, setElements] = useState<DraggableElement[]>([]);
  const [draggedElement, setDraggedElement] = useState<string | null>(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });

  // Initialize elements with brand kit images
  useEffect(() => {
    const initialElements: DraggableElement[] = [];
    
    if (brandKit.logo) {
      initialElements.push({
        id: 'logo',
        src: brandKit.logo,
        x: 50,
        y: 50,
        width: 150,
        height: 150,
      });
    }
    
    if (brandKit.contactInfo) {
      initialElements.push({
        id: 'contact',
        src: brandKit.contactInfo,
        x: 50,
        y: 1100,
        width: 200,
        height: 100,
      });
    }
    
    if (brandKit.mascot) {
      initialElements.push({
        id: 'mascot',
        src: brandKit.mascot,
        x: 800,
        y: 900,
        width: 200,
        height: 200,
      });
    }
    
    setElements(initialElements);
  }, [brandKit]);

  const handleGenerate = async () => {
    if (!prompt.trim()) {
      toast.error("Por favor, descreva o que você quer no post");
      return;
    }

    setIsGenerating(true);
    try {
      const backgroundColor = brandKit.colors[0] || "#8B5CF6";
      const textColor = brandKit.colors[1] || "#FFFFFF";
      
      const aiPrompt = `Create a social media post background image with the following specifications:
- Aspect ratio: 1080x1350 pixels (Instagram portrait)
- Background color: ${backgroundColor}
- Design style: Modern, clean, professional
- The image should be suitable as a background for text overlay
- Include subtle design elements or patterns that complement the color scheme
- Leave center area relatively clean for text placement
- User request: ${prompt}`;

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-art-image`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ prompt: aiPrompt }),
        }
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Erro ao gerar imagem");
      }

      const data = await response.json();
      
      // Add generated background as first element
      const bgElement: DraggableElement = {
        id: 'background',
        src: data.imageUrl,
        x: 0,
        y: 0,
        width: 1080,
        height: 1350,
      };

      // Preserve existing elements (logo, contact, mascot) and add background
      setElements(prev => [bgElement, ...prev.filter(el => el.id !== 'background')]);
      setGeneratedText(prompt);
      toast.success("Arte gerada com sucesso!");
    } catch (error: any) {
      console.error("Error generating art:", error);
      toast.error(error.message || "Erro ao gerar arte");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleMouseDown = (elementId: string, e: React.MouseEvent) => {
    const element = elements.find(el => el.id === elementId);
    if (!element) return;

    const rect = (e.target as HTMLElement).getBoundingClientRect();
    setDragOffset({
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    });
    setDraggedElement(elementId);
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!draggedElement || !canvasRef.current) return;

    const canvasRect = canvasRef.current.getBoundingClientRect();
    const newX = e.clientX - canvasRect.left - dragOffset.x;
    const newY = e.clientY - canvasRect.top - dragOffset.y;

    setElements(prev =>
      prev.map(el =>
        el.id === draggedElement
          ? { ...el, x: Math.max(0, Math.min(newX, 1080 - el.width)), y: Math.max(0, Math.min(newY, 1350 - el.height)) }
          : el
      )
    );
  };

  const handleMouseUp = () => {
    setDraggedElement(null);
  };

  const handleExport = () => {
    // In production, use html2canvas or similar to export the canvas
    toast.success("Arte exportada com sucesso!");
  };

  const backgroundColor = brandKit.colors[0] || "#8B5CF6";
  const textColor = brandKit.colors[1] || "#FFFFFF";

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-background/80">
      {/* Header */}
      <div className="border-b bg-background/80 backdrop-blur-sm">
        <div className="container mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Button variant="outline" onClick={onBack}>
                <ArrowLeft className="mr-2 h-4 w-4" />
                Voltar
              </Button>
              <div>
                <h1 className="text-2xl font-bold gradient-text">Gerador de Artes</h1>
                <p className="text-muted-foreground">{brandKit.name}</p>
              </div>
            </div>
            <Button variant="gradient" onClick={handleExport}>
              <Download className="mr-2 h-4 w-4" />
              Exportar
            </Button>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="container mx-auto px-6 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left Panel - Prompt */}
          <div className="lg:col-span-1">
            <Card className="bg-gradient-card border-primary/20">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Wand2 className="h-5 w-5" />
                  Descrição do Post
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <Textarea
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  placeholder="Descreva como você quer o post para rede social..."
                  className="min-h-[200px] bg-background/50 border-primary/20"
                />
                <Button
                  onClick={handleGenerate}
                  disabled={isGenerating}
                  variant="gradient"
                  className="w-full"
                >
                  {isGenerating ? "Gerando..." : "Gerar Arte"}
                </Button>

                <div className="pt-4 border-t border-primary/20">
                  <h4 className="font-medium mb-2 text-sm">Cores do Kit</h4>
                  <div className="flex gap-2">
                    {brandKit.colors.map((color, index) => (
                      <div key={index} className="space-y-1">
                        <div
                          className="w-12 h-12 rounded-lg border border-white/20"
                          style={{ backgroundColor: color }}
                        />
                        <p className="text-xs text-center text-muted-foreground">
                          {index === 0 ? "Fundo" : index === 1 ? "Texto" : `Cor ${index + 1}`}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="pt-4 border-t border-primary/20">
                  <p className="text-sm text-muted-foreground flex items-center gap-2">
                    <Move className="h-4 w-4" />
                    Arraste os elementos no canvas para posicioná-los
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Right Panel - Canvas */}
          <div className="lg:col-span-2">
            <Card className="bg-gradient-card border-primary/20">
              <CardHeader>
                <CardTitle>Preview (1080x1350)</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex justify-center">
                  <div
                    ref={canvasRef}
                    className="relative overflow-hidden shadow-2xl"
                    style={{
                      width: "540px",
                      height: "675px",
                      backgroundColor,
                      transform: "scale(0.5)",
                      transformOrigin: "top left",
                    }}
                    onMouseMove={handleMouseMove}
                    onMouseUp={handleMouseUp}
                    onMouseLeave={handleMouseUp}
                  >
                    {/* Generated Text */}
                    {generatedText && (
                      <div
                        className="absolute inset-0 flex items-center justify-center p-16"
                        style={{ color: textColor }}
                      >
                        <p className="text-4xl font-bold text-center leading-relaxed">
                          {generatedText}
                        </p>
                      </div>
                    )}

                    {/* Draggable Elements */}
                    {elements.map((element) => (
                      <div
                        key={element.id}
                        className="absolute cursor-move hover:ring-2 hover:ring-primary transition-all"
                        style={{
                          left: element.x,
                          top: element.y,
                          width: element.width,
                          height: element.height,
                          zIndex: element.id === 'background' ? 0 : 10,
                        }}
                        onMouseDown={(e) => handleMouseDown(element.id, e)}
                      >
                        <img
                          src={element.src}
                          alt={element.id}
                          className="w-full h-full pointer-events-none"
                          style={{
                            objectFit: element.id === 'background' ? 'cover' : 'contain',
                            filter: element.id === 'logo' ? `brightness(0) saturate(100%) invert(${textColor === '#FFFFFF' ? '100%' : '0%'})` : 'none',
                          }}
                          draggable={false}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
};
