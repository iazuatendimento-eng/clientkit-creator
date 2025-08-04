import { useState, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  ArrowLeft, 
  Download, 
  Type, 
  Image, 
  Square, 
  Circle,
  Palette,
  Move,
  RotateCcw,
  Copy
} from "lucide-react";

interface CanvasEditorProps {
  brandKit: {
    id: string;
    name: string;
    logo?: string;
    colors: string[];
  };
  onBack: () => void;
}

export function CanvasEditor({ brandKit, onBack }: CanvasEditorProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [selectedTool, setSelectedTool] = useState("move");
  const [selectedColor, setSelectedColor] = useState(brandKit.colors[0] || "#8B5CF6");
  const [textContent, setTextContent] = useState("");
  const [fontSize, setFontSize] = useState("24");

  const canvasTemplates = [
    { name: "Post Instagram", width: 1080, height: 1080 },
    { name: "Story Instagram", width: 1080, height: 1920 },
    { name: "Banner Facebook", width: 1200, height: 630 },
    { name: "Flyer A4", width: 2480, height: 3508 },
    { name: "Logo", width: 1000, height: 1000 },
  ];

  const [selectedTemplate, setSelectedTemplate] = useState(canvasTemplates[0]);

  const tools = [
    { id: "move", icon: Move, label: "Mover" },
    { id: "text", icon: Type, label: "Texto" },
    { id: "image", icon: Image, label: "Imagem" },
    { id: "rectangle", icon: Square, label: "Retângulo" },
    { id: "circle", icon: Circle, label: "Círculo" },
  ];

  const handleExport = () => {
    const canvas = canvasRef.current;
    if (canvas) {
      const link = document.createElement('a');
      link.download = `${brandKit.name}_design.png`;
      link.href = canvas.toDataURL();
      link.click();
    }
  };

  return (
    <div className="h-screen flex flex-col bg-background">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-primary/20 bg-card">
        <div className="flex items-center gap-4">
          <Button variant="ghost" onClick={onBack} className="p-2">
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h2 className="text-xl font-bold gradient-text">Editor de Design</h2>
            <p className="text-sm text-muted-foreground">Kit: {brandKit.name}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Select 
            value={selectedTemplate.name} 
            onValueChange={(value) => {
              const template = canvasTemplates.find(t => t.name === value);
              if (template) setSelectedTemplate(template);
            }}
          >
            <SelectTrigger className="w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {canvasTemplates.map((template) => (
                <SelectItem key={template.name} value={template.name}>
                  {template.name} ({template.width}x{template.height})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="gradient" onClick={handleExport}>
            <Download className="h-4 w-4 mr-2" />
            Exportar
          </Button>
        </div>
      </div>

      <div className="flex-1 flex">
        {/* Sidebar */}
        <div className="w-80 border-r border-primary/20 bg-card/50">
          <Tabs defaultValue="tools" className="h-full">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="tools">Ferramentas</TabsTrigger>
              <TabsTrigger value="brand">Marca</TabsTrigger>
              <TabsTrigger value="assets">Assets</TabsTrigger>
            </TabsList>

            {/* Tools Panel */}
            <TabsContent value="tools" className="p-4 space-y-4">
              <div className="space-y-2">
                <Label>Ferramentas</Label>
                <div className="grid grid-cols-2 gap-2">
                  {tools.map((tool) => (
                    <Button
                      key={tool.id}
                      variant={selectedTool === tool.id ? "default" : "outline"}
                      onClick={() => setSelectedTool(tool.id)}
                      className="flex items-center gap-2 h-12"
                    >
                      <tool.icon className="h-4 w-4" />
                      <span className="text-xs">{tool.label}</span>
                    </Button>
                  ))}
                </div>
              </div>

              {/* Tool Properties */}
              {selectedTool === "text" && (
                <Card className="bg-background/50">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm">Propriedades do Texto</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div>
                      <Label htmlFor="text-content">Texto</Label>
                      <Input
                        id="text-content"
                        value={textContent}
                        onChange={(e) => setTextContent(e.target.value)}
                        placeholder="Digite seu texto..."
                        className="bg-background/50"
                      />
                    </div>
                    <div>
                      <Label htmlFor="font-size">Tamanho</Label>
                      <Input
                        id="font-size"
                        type="number"
                        value={fontSize}
                        onChange={(e) => setFontSize(e.target.value)}
                        className="bg-background/50"
                      />
                    </div>
                  </CardContent>
                </Card>
              )}
            </TabsContent>

            {/* Brand Panel */}
            <TabsContent value="brand" className="p-4 space-y-4">
              <div className="space-y-4">
                <div>
                  <Label>Logo da Marca</Label>
                  <div className="mt-2 p-4 border-2 border-dashed border-primary/30 rounded-lg bg-background/30">
                    {brandKit.logo ? (
                      <img 
                        src={brandKit.logo} 
                        alt="Logo" 
                        className="h-20 w-auto mx-auto cursor-pointer hover:scale-105 transition-transform"
                      />
                    ) : (
                      <div className="text-center text-muted-foreground">
                        <Image className="h-8 w-8 mx-auto mb-2" />
                        <p className="text-sm">Nenhuma logo definida</p>
                      </div>
                    )}
                  </div>
                </div>

                <div>
                  <Label>Paleta de Cores</Label>
                  <div className="grid grid-cols-4 gap-2 mt-2">
                    {brandKit.colors.map((color, index) => (
                      <div
                        key={index}
                        className={`w-full h-12 rounded cursor-pointer border-2 transition-transform hover:scale-105 ${
                          selectedColor === color ? 'border-primary' : 'border-primary/20'
                        }`}
                        style={{ backgroundColor: color }}
                        onClick={() => setSelectedColor(color)}
                      />
                    ))}
                  </div>
                </div>
              </div>
            </TabsContent>

            {/* Assets Panel */}
            <TabsContent value="assets" className="p-4">
              <div className="text-center text-muted-foreground">
                <Image className="h-12 w-12 mx-auto mb-3" />
                <p>Assets em breve...</p>
                <p className="text-xs">Upload de imagens e elementos</p>
              </div>
            </TabsContent>
          </Tabs>
        </div>

        {/* Canvas Area */}
        <div className="flex-1 flex items-center justify-center p-8 bg-muted/20">
          <div className="bg-white rounded-lg shadow-2xl p-4">
            <canvas
              ref={canvasRef}
              width={Math.min(selectedTemplate.width, 800)}
              height={Math.min(selectedTemplate.height, 600)}
              className="border border-gray-300 bg-white"
              style={{
                maxWidth: '800px',
                maxHeight: '600px',
                width: 'auto',
                height: 'auto'
              }}
            />
            <div className="text-center mt-2 text-xs text-muted-foreground">
              {selectedTemplate.width} x {selectedTemplate.height}px
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}