import { useState, useRef, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { ArrowLeft, Wand2, Download, Move, Type, RotateCw, ZoomIn, Save, Search, ExternalLink, Palette } from "lucide-react";
import { toast } from "sonner";
import { FileUpload, UploadedFile } from "@/components/FileUpload";
import { searchUnsplashImages, UnsplashImage, FREE_STOCK_SOURCES } from "@/lib/unsplash";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface TextElement {
  id: string;
  text: string;
  x: number;
  y: number;
  fontSize: number;
  color: string;
  rotation: number;
}

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
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  const [textElements, setTextElements] = useState<TextElement[]>([]);
  const [selectedText, setSelectedText] = useState<string | null>(null);
  const [newText, setNewText] = useState("");
  const [newTextColor, setNewTextColor] = useState("#FFFFFF");
  const [newTextSize, setNewTextSize] = useState(48);
  const projectId = `brandkit-${brandKit.id}`;
  const [unsplashQuery, setUnsplashQuery] = useState("");
  const [unsplashResults, setUnsplashResults] = useState<UnsplashImage[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [duotoneColor1, setDuotoneColor1] = useState(brandKit.colors[0] || "#8B5CF6");
  const [duotoneColor2, setDuotoneColor2] = useState(brandKit.colors[1] || "#EC4899");
  const [selectedElementForDuotone, setSelectedElementForDuotone] = useState<string | null>(null);
  const [pages, setPages] = useState<Array<{ elements: DraggableElement[], textElements: TextElement[] }>>([
    { elements: [], textElements: [] }
  ]);
  const [currentPage, setCurrentPage] = useState(0);

  // Sync current page state with pages array
  useEffect(() => {
    const updatedPages = [...pages];
    updatedPages[currentPage] = { elements, textElements };
    setPages(updatedPages);
  }, [elements, textElements]);

  // Load current page state when page changes
  useEffect(() => {
    if (pages[currentPage]) {
      setElements(pages[currentPage].elements);
      setTextElements(pages[currentPage].textElements);
    }
  }, [currentPage]);

  // Initialize elements with brand kit images and load saved uploads
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

    // Load saved uploads
    const savedUploads = localStorage.getItem(`uploads-${projectId}`);
    if (savedUploads) {
      try {
        setUploadedFiles(JSON.parse(savedUploads));
      } catch {}
    }
  }, [brandKit, projectId]);

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
    const textElement = textElements.find(el => el.id === elementId);
    
    if (!element && !textElement) return;

    const rect = (e.target as HTMLElement).getBoundingClientRect();
    setDragOffset({
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    });
    setDraggedElement(elementId);
    
    if (textElement) {
      setSelectedText(elementId);
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!draggedElement || !canvasRef.current) return;

    const canvasRect = canvasRef.current.getBoundingClientRect();
    const scale = 0.5; // Canvas is scaled to 50%
    const newX = (e.clientX - canvasRect.left) / scale - dragOffset.x;
    const newY = (e.clientY - canvasRect.top) / scale - dragOffset.y;

    // Update image elements
    setElements(prev =>
      prev.map(el =>
        el.id === draggedElement
          ? { ...el, x: Math.max(0, Math.min(newX, 1080 - el.width)), y: Math.max(0, Math.min(newY, 1350 - el.height)) }
          : el
      )
    );

    // Update text elements
    setTextElements(prev =>
      prev.map(el =>
        el.id === draggedElement
          ? { ...el, x: Math.max(0, Math.min(newX, 1080)), y: Math.max(0, Math.min(newY, 1350)) }
          : el
      )
    );
  };

  const handleMouseUp = () => {
    setDraggedElement(null);
  };

  const handleAddText = () => {
    if (!newText.trim()) {
      toast.error("Digite um texto");
      return;
    }

    const textEl: TextElement = {
      id: `text-${Date.now()}`,
      text: newText,
      x: 540,
      y: 675,
      fontSize: newTextSize,
      color: newTextColor,
      rotation: 0,
    };

    setTextElements([...textElements, textEl]);
    setNewText("");
    toast.success("Texto adicionado!");
  };

  const handleUpdateTextSize = (size: number) => {
    if (!selectedText) return;
    setTextElements(prev =>
      prev.map(el => (el.id === selectedText ? { ...el, fontSize: size } : el))
    );
  };

  const handleUpdateTextRotation = (rotation: number) => {
    if (!selectedText) return;
    setTextElements(prev =>
      prev.map(el => (el.id === selectedText ? { ...el, rotation } : el))
    );
  };

  const handleUpdateTextColor = (color: string) => {
    if (!selectedText) return;
    setTextElements(prev =>
      prev.map(el => (el.id === selectedText ? { ...el, color } : el))
    );
  };

  const handleSearchUnsplash = async () => {
    if (!unsplashQuery.trim()) {
      toast.error("Digite um termo de busca");
      return;
    }

    setIsSearching(true);
    try {
      const { translateSearchQuery } = await import("@/lib/translateSearch");
      const translated = await translateSearchQuery(unsplashQuery);
      const results = await searchUnsplashImages(translated);
      setUnsplashResults(results);
      if (results.length === 0) {
        toast.info("Nenhuma imagem encontrada");
      }
    } catch (error) {
      toast.error("Erro ao buscar imagens");
    } finally {
      setIsSearching(false);
    }
  };

  const handleAddUnsplashImage = (image: UnsplashImage) => {
    const newElement: DraggableElement = {
      id: `unsplash-${image.id}`,
      src: image.urls.regular,
      x: 200,
      y: 200,
      width: 400,
      height: 400,
    };
    setElements([...elements, newElement]);
    toast.success("Imagem adicionada ao canvas!");
  };

  const handleApplyDuotone = (elementId: string) => {
    // Apply duotone filter using CSS filters
    setSelectedElementForDuotone(elementId);
    toast.success("Efeito duotone aplicado!");
  };

  const handleExport = async () => {
    if (!canvasRef.current) return;
    
    try {
      const html2canvas = (await import('html2canvas')).default;
      const canvas = await html2canvas(canvasRef.current, {
        backgroundColor: backgroundColor,
        scale: 2,
        width: 1080,
        height: 1350,
      });
      
      // Convert to blob and download
      canvas.toBlob((blob) => {
        if (blob) {
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `arte-${brandKit.name}-${Date.now()}.png`;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
          toast.success("Arte exportada com sucesso!");
        }
      });
    } catch (error) {
      console.error("Error exporting:", error);
      toast.error("Erro ao exportar arte");
    }
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
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-2 mr-4">
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={() => setCurrentPage(Math.max(0, currentPage - 1))}
                  disabled={currentPage === 0}
                >
                  ←
                </Button>
                <span className="text-sm text-muted-foreground">
                  Página {currentPage + 1} de {pages.length}
                </span>
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={() => setCurrentPage(Math.min(pages.length - 1, currentPage + 1))}
                  disabled={currentPage === pages.length - 1}
                >
                  →
                </Button>
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={() => {
                    setPages([...pages, { elements: [], textElements: [] }]);
                    setCurrentPage(pages.length);
                    toast.success("Nova página adicionada!");
                  }}
                >
                  + Página
                </Button>
              </div>
              <Button variant="gradient" onClick={handleExport}>
                <Download className="mr-2 h-4 w-4" />
                Exportar
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="container mx-auto px-6 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left Panel - Controls */}
          <div className="lg:col-span-1 space-y-6">
            <Card className="bg-gradient-card border-primary/20">
              <CardHeader>
                <CardTitle>Ferramentas</CardTitle>
              </CardHeader>
              <CardContent>
                <Tabs defaultValue="generate" className="w-full">
                  <TabsList className="grid w-full grid-cols-3">
                    <TabsTrigger value="generate">
                      <Wand2 className="h-4 w-4" />
                    </TabsTrigger>
                    <TabsTrigger value="stock">
                      <Search className="h-4 w-4" />
                    </TabsTrigger>
                    <TabsTrigger value="duotone">
                      <Palette className="h-4 w-4" />
                    </TabsTrigger>
                  </TabsList>

                  <TabsContent value="generate" className="space-y-4">
                    <div>
                      <Label>Descrição da Arte</Label>
                      <Textarea
                        value={prompt}
                        onChange={(e) => setPrompt(e.target.value)}
                        placeholder="Descreva como você quer o post..."
                        className="min-h-[120px] bg-background/50 border-primary/20 mt-2"
                      />
                    </div>
                    <Button
                      onClick={handleGenerate}
                      disabled={isGenerating}
                      variant="gradient"
                      className="w-full"
                    >
                      {isGenerating ? "Gerando..." : "Gerar Arte com IA"}
                    </Button>

                    <div className="pt-4 border-t border-primary/20">
                      <h4 className="font-medium mb-2 text-sm">Cores do Kit</h4>
                      <div className="flex gap-2">
                        {brandKit.colors.map((color, index) => (
                          <div key={index} className="space-y-1">
                            <div
                              className="w-10 h-10 rounded-lg border border-white/20 cursor-pointer hover:scale-110 transition-transform"
                              style={{ backgroundColor: color }}
                              onClick={() => {
                                if (index === 0) setDuotoneColor1(color);
                                if (index === 1) setDuotoneColor2(color);
                              }}
                            />
                            <p className="text-xs text-center text-muted-foreground">
                              {index === 0 ? "Fundo" : index === 1 ? "Texto" : `${index + 1}`}
                            </p>
                          </div>
                        ))}
                      </div>
                    </div>
                  </TabsContent>

                  <TabsContent value="stock" className="space-y-4">
                    <div>
                      <Label>Buscar Imagens Gratuitas</Label>
                      <div className="flex gap-2 mt-2">
                        <Input
                          value={unsplashQuery}
                          onChange={(e) => setUnsplashQuery(e.target.value)}
                          placeholder="Ex: café, comida, tecnologia..."
                          className="bg-background/50 border-primary/20"
                          onKeyPress={(e) => e.key === 'Enter' && handleSearchUnsplash()}
                        />
                        <Button
                          onClick={handleSearchUnsplash}
                          disabled={isSearching}
                          size="icon"
                        >
                          <Search className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2 max-h-96 overflow-y-auto">
                      {unsplashResults.map((image) => (
                        <div key={image.id} className="relative group cursor-pointer" onClick={() => handleAddUnsplashImage(image)}>
                          <img
                            src={image.urls.small}
                            alt={image.description || "Unsplash"}
                            className="w-full h-24 object-cover rounded-lg"
                          />
                          <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity rounded-lg flex items-center justify-center">
                            <p className="text-white text-xs">Adicionar</p>
                          </div>
                        </div>
                      ))}
                    </div>

                    <div className="pt-4 border-t border-primary/20">
                      <p className="text-xs text-muted-foreground mb-2">Outros bancos gratuitos:</p>
                      {FREE_STOCK_SOURCES.map((source) => (
                        <a
                          key={source.name}
                          href={source.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-2 text-xs text-primary hover:underline mb-1"
                        >
                          <ExternalLink className="h-3 w-3" />
                          {source.name}
                        </a>
                      ))}
                    </div>
                  </TabsContent>

                  <TabsContent value="duotone" className="space-y-4">
                    <div>
                      <Label>Efeito Duotone</Label>
                      <p className="text-xs text-muted-foreground mt-1">
                        Aplique cores do kit nas imagens
                      </p>
                    </div>

                    <div className="space-y-3">
                      <div>
                        <Label>Cor 1 (Sombras)</Label>
                        <Input
                          type="color"
                          value={duotoneColor1}
                          onChange={(e) => setDuotoneColor1(e.target.value)}
                          className="h-12 mt-2"
                        />
                      </div>
                      <div>
                        <Label>Cor 2 (Luzes)</Label>
                        <Input
                          type="color"
                          value={duotoneColor2}
                          onChange={(e) => setDuotoneColor2(e.target.value)}
                          className="h-12 mt-2"
                        />
                      </div>
                    </div>

                    <div className="pt-4 border-t border-primary/20">
                      <p className="text-xs text-muted-foreground">
                        Selecione um elemento no canvas e clique para aplicar o duotone
                      </p>
                    </div>
                  </TabsContent>
                </Tabs>
              </CardContent>
            </Card>

            {/* Text Controls */}
            <Card className="bg-gradient-card border-primary/20">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Type className="h-5 w-5" />
                  Adicionar Texto
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label htmlFor="newText">Texto</Label>
                  <Input
                    id="newText"
                    value={newText}
                    onChange={(e) => setNewText(e.target.value)}
                    placeholder="Digite o texto..."
                    className="bg-background/50 border-primary/20"
                  />
                </div>
                
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label htmlFor="textSize">Tamanho</Label>
                    <Input
                      id="textSize"
                      type="number"
                      value={newTextSize}
                      onChange={(e) => setNewTextSize(Number(e.target.value))}
                      className="bg-background/50 border-primary/20"
                    />
                  </div>
                  <div>
                    <Label htmlFor="textColor">Cor</Label>
                    <Input
                      id="textColor"
                      type="color"
                      value={newTextColor}
                      onChange={(e) => setNewTextColor(e.target.value)}
                      className="bg-background/50 border-primary/20 h-10"
                    />
                  </div>
                </div>

                <Button onClick={handleAddText} className="w-full" variant="outline">
                  <Type className="mr-2 h-4 w-4" />
                  Adicionar Texto
                </Button>

                {selectedText && (
                  <div className="pt-4 border-t border-primary/20 space-y-3">
                    <h4 className="font-medium text-sm">Editar Texto Selecionado</h4>
                    
                    <div>
                      <Label>Tamanho: {textElements.find(t => t.id === selectedText)?.fontSize}px</Label>
                      <Slider
                        value={[textElements.find(t => t.id === selectedText)?.fontSize || 48]}
                        onValueChange={([size]) => handleUpdateTextSize(size)}
                        min={20}
                        max={120}
                        step={2}
                        className="mt-2"
                      />
                    </div>

                    <div>
                      <Label>Rotação: {textElements.find(t => t.id === selectedText)?.rotation}°</Label>
                      <Slider
                        value={[textElements.find(t => t.id === selectedText)?.rotation || 0]}
                        onValueChange={([rotation]) => handleUpdateTextRotation(rotation)}
                        min={-180}
                        max={180}
                        step={5}
                        className="mt-2"
                      />
                    </div>

                    <div>
                      <Label htmlFor="editTextColor">Cor do Texto</Label>
                      <Input
                        id="editTextColor"
                        type="color"
                        value={textElements.find(t => t.id === selectedText)?.color || "#FFFFFF"}
                        onChange={(e) => handleUpdateTextColor(e.target.value)}
                        className="bg-background/50 border-primary/20 h-10 mt-2"
                      />
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            <FileUpload
              projectId={projectId}
              onUploadComplete={setUploadedFiles}
              existingFiles={uploadedFiles}
            />
          </div>

          {/* Right Panel - Canvas */}
          <div className="lg:col-span-2">
            <Card className="bg-gradient-card border-primary/20">
              <CardHeader>
                <CardTitle>Preview (1080x1350)</CardTitle>
              </CardHeader>
              <CardContent className="flex justify-center">
                <div className="relative" style={{ width: "540px", height: "675px" }}>
                  <div
                    ref={canvasRef}
                    className="absolute inset-0 overflow-hidden shadow-2xl origin-top-left"
                    style={{
                      width: "1080px",
                      height: "1350px",
                      backgroundColor,
                      transform: "scale(0.5)",
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

                    {/* Text Elements */}
                    {textElements.map((textEl) => (
                      <div
                        key={textEl.id}
                        className={`absolute cursor-move transition-all ${
                          selectedText === textEl.id ? 'ring-2 ring-primary' : 'hover:ring-2 hover:ring-primary/50'
                        }`}
                        style={{
                          left: textEl.x,
                          top: textEl.y,
                          fontSize: textEl.fontSize,
                          color: textEl.color,
                          transform: `translate(-50%, -50%) rotate(${textEl.rotation}deg)`,
                          zIndex: 20,
                          fontWeight: 'normal',
                          textShadow: '2px 2px 4px rgba(0,0,0,0.5)',
                          whiteSpace: 'nowrap',
                        }}
                        onMouseDown={(e) => handleMouseDown(textEl.id, e)}
                      >
                        {textEl.text}
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
