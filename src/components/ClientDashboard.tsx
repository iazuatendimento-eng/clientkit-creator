import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ArrowLeft, Palette, Trello, Plus, Sparkles, Calendar, Wand2 } from "lucide-react";
import { BrandKitEditor } from "@/components/BrandKitEditor";
import { CanvasEditor } from "@/components/CanvasEditor";
import { AIArtGenerator } from "@/components/AIArtGenerator";
import ProjectBoard from "@/components/ProjectBoard";

interface Client {
  id: string;
  name: string;
  email: string;
  company?: string;
  brandKit?: {
    id: string;
    name: string;
    logo?: string;
    contactInfo?: string;
    mascot?: string;
    colors: string[];
    createdAt: string;
  };
  projectCount: number;
  createdAt: string;
}

interface ClientDashboardProps {
  client: Client;
  onBack: () => void;
  onUpdateClient: (client: Client) => void;
}

export const ClientDashboard = ({ client, onBack, onUpdateClient }: ClientDashboardProps) => {
  const [currentView, setCurrentView] = useState<"dashboard" | "brand-editor" | "canvas" | "ai-generator">("dashboard");
  const [selectedBrandKit, setSelectedBrandKit] = useState<any>(null);
  const [activeTab, setActiveTab] = useState("projects");

  const handleSaveBrandKit = (brandKit: any) => {
    const updatedClient = {
      ...client,
      brandKit: { ...brandKit, id: brandKit.id || "1" }
    };
    onUpdateClient(updatedClient);
    setCurrentView("dashboard");
  };

  const handleCreateProject = (brief: any, brandKitId: string) => {
    if (client.brandKit) {
      setSelectedBrandKit(client.brandKit);
      setCurrentView("ai-generator");
    }
  };

  if (currentView === "brand-editor") {
    return (
      <div className="min-h-screen p-6">
        <BrandKitEditor
          brandKit={client.brandKit}
          onSave={handleSaveBrandKit}
          onCancel={() => setCurrentView("dashboard")}
        />
      </div>
    );
  }

  if (currentView === "canvas" && selectedBrandKit) {
    return (
      <CanvasEditor
        brandKit={selectedBrandKit}
        onBack={() => setCurrentView("dashboard")}
      />
    );
  }

  if (currentView === "ai-generator" && client.brandKit) {
    return (
      <AIArtGenerator
        brandKit={client.brandKit}
        onBack={() => setCurrentView("dashboard")}
      />
    );
  }

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
                <h1 className="text-2xl font-bold gradient-text">{client.name}</h1>
                <p className="text-muted-foreground">{client.email}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {client.company && (
                <span className="px-3 py-1 bg-primary/10 text-primary rounded-full text-sm">
                  {client.company}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="container mx-auto px-6 py-8">
        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full max-w-md mx-auto grid-cols-2 mb-8">
            <TabsTrigger value="projects" className="flex items-center gap-2">
              <Trello className="h-4 w-4" />
              Projetos
            </TabsTrigger>
            <TabsTrigger value="brand" className="flex items-center gap-2">
              <Palette className="h-4 w-4" />
              Kit de Marca
            </TabsTrigger>
          </TabsList>

          <TabsContent value="projects">
            <ProjectBoard 
              brandKits={client.brandKit ? [client.brandKit] : []}
              onCreateProject={handleCreateProject}
              clientName={client.name}
            />
          </TabsContent>

          <TabsContent value="brand">
            <div className="space-y-6">
              <div className="flex justify-between items-center">
                <div>
                  <h2 className="text-2xl font-bold gradient-text">Kit de Marca</h2>
                  <p className="text-muted-foreground">
                    Gerencie a identidade visual do cliente
                  </p>
                </div>
                <div className="flex gap-2">
                  {client.brandKit && (
                    <Button
                      variant="hero"
                      onClick={() => setCurrentView("ai-generator")}
                      className="glow-effect"
                    >
                      <Wand2 className="mr-2 h-4 w-4" />
                      Gerador de Artes
                    </Button>
                  )}
                  <Button
                    variant="gradient"
                    onClick={() => setCurrentView("brand-editor")}
                    className="glow-effect"
                  >
                    <Plus className="mr-2 h-4 w-4" />
                    {client.brandKit ? "Editar Kit" : "Criar Kit"}
                  </Button>
                </div>
              </div>

              {client.brandKit ? (
                <Card className="bg-gradient-card border-primary/20">
                  <CardContent className="p-6">
                    <div className="space-y-4">
                      <div className="flex justify-between items-start">
                        <div>
                          <h3 className="text-xl font-semibold">{client.brandKit.name}</h3>
                          <p className="text-muted-foreground">
                            Criado em {new Date(client.brandKit.createdAt).toLocaleDateString('pt-BR')}
                          </p>
                        </div>
                        <Button
                          variant="outline"
                          onClick={() => setCurrentView("brand-editor")}
                        >
                          Editar
                        </Button>
                      </div>
                      
                      {client.brandKit.colors && client.brandKit.colors.length > 0 && (
                        <div>
                          <h4 className="font-medium mb-2">Paleta de Cores</h4>
                          <div className="flex gap-2">
                            {client.brandKit.colors.map((color, index) => (
                              <div
                                key={index}
                                className="w-12 h-12 rounded-lg border border-white/20 shadow-md"
                                style={{ backgroundColor: color }}
                                title={color}
                              />
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ) : (
                <Card className="bg-gradient-card border-primary/20 p-12 text-center">
                  <Palette className="h-16 w-16 mx-auto mb-4 text-muted-foreground" />
                  <h3 className="text-xl font-semibold mb-2">Nenhum kit de marca criado</h3>
                  <p className="text-muted-foreground mb-6">
                    Crie um kit de marca para este cliente com logo e cores personalizadas.
                  </p>
                  <Button
                    variant="gradient"
                    onClick={() => setCurrentView("brand-editor")}
                  >
                    <Plus className="mr-2 h-4 w-4" />
                    Criar Kit de Marca
                  </Button>
                </Card>
              )}
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};