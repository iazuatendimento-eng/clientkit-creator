import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Plus, Palette, Sparkles, Users } from "lucide-react";
import { BrandKitCard } from "@/components/BrandKitCard";
import { BrandKitEditor } from "@/components/BrandKitEditor";
import { CanvasEditor } from "@/components/CanvasEditor";
import heroImage from "@/assets/hero-image.jpg";

const Index = () => {
  const [currentView, setCurrentView] = useState<"dashboard" | "editor" | "canvas">("dashboard");
  const [selectedBrandKit, setSelectedBrandKit] = useState<any>(null);
  const [editingBrandKit, setEditingBrandKit] = useState<any>(null);
  
  // Mock data
  const [brandKits, setBrandKits] = useState([
    {
      id: "1",
      name: "Tech Solutions",
      logo: "",
      colors: ["#8B5CF6", "#EC4899", "#F59E0B", "#10B981"],
      createdAt: "2024-01-15",
      projectCount: 5
    },
    {
      id: "2", 
      name: "Café Central",
      logo: "",
      colors: ["#92400E", "#FCD34D", "#F59E0B"],
      createdAt: "2024-01-10",
      projectCount: 3
    }
  ]);

  const handleSaveBrandKit = (brandKit: any) => {
    if (brandKit.id && brandKits.find(bk => bk.id === brandKit.id)) {
      setBrandKits(brandKits.map(bk => bk.id === brandKit.id ? brandKit : bk));
    } else {
      setBrandKits([...brandKits, { ...brandKit, id: Date.now().toString() }]);
    }
    setCurrentView("dashboard");
    setEditingBrandKit(null);
  };

  const handleDeleteBrandKit = (id: string) => {
    setBrandKits(brandKits.filter(bk => bk.id !== id));
  };

  const handleSelectBrandKit = (id: string) => {
    const brandKit = brandKits.find(bk => bk.id === id);
    if (brandKit) {
      setSelectedBrandKit(brandKit);
      setCurrentView("canvas");
    }
  };

  if (currentView === "editor") {
    return (
      <div className="min-h-screen p-6">
        <BrandKitEditor
          brandKit={editingBrandKit}
          onSave={handleSaveBrandKit}
          onCancel={() => {
            setCurrentView("dashboard");
            setEditingBrandKit(null);
          }}
        />
      </div>
    );
  }

  if (currentView === "canvas" && selectedBrandKit) {
    return (
      <CanvasEditor
        brandKit={selectedBrandKit}
        onBack={() => {
          setCurrentView("dashboard");
          setSelectedBrandKit(null);
        }}
      />
    );
  }

  return (
    <div className="min-h-screen">
      {/* Hero Section */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-hero opacity-90" />
        <div 
          className="absolute inset-0 bg-cover bg-center opacity-20"
          style={{ backgroundImage: `url(${heroImage})` }}
        />
        <div className="relative container mx-auto px-6 py-20">
          <div className="max-w-4xl mx-auto text-center space-y-8">
            <div className="animate-fade-in">
              <h1 className="text-6xl font-bold mb-6 gradient-text">
                Sistema de Kits de Marca
              </h1>
              <p className="text-xl text-foreground/80 mb-8 max-w-2xl mx-auto">
                Crie designs incríveis com as cores e logos personalizadas de cada cliente. 
                Gerencie kits de marca e produza materiais profissionais.
              </p>
              <Button
                variant="hero"
                size="lg"
                onClick={() => {
                  setEditingBrandKit(null);
                  setCurrentView("editor");
                }}
                className="text-lg px-8 py-4 glow-effect"
              >
                <Plus className="mr-2 h-5 w-5" />
                Criar Primeiro Kit
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* Dashboard Section */}
      <section className="container mx-auto px-6 py-16">
        <div className="mb-12">
          <div className="flex justify-between items-center mb-8">
            <div>
              <h2 className="text-3xl font-bold gradient-text mb-2">Seus Kits de Marca</h2>
              <p className="text-muted-foreground">
                Gerencie as identidades visuais dos seus clientes
              </p>
            </div>
            <Button
              variant="gradient"
              onClick={() => {
                setEditingBrandKit(null);
                setCurrentView("editor");
              }}
              className="glow-effect"
            >
              <Plus className="mr-2 h-4 w-4" />
              Novo Kit
            </Button>
          </div>

          {/* Stats Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
            <Card className="bg-gradient-card border-primary/20">
              <CardContent className="p-6 text-center">
                <Users className="h-8 w-8 mx-auto mb-3 text-primary" />
                <div className="text-2xl font-bold gradient-text">{brandKits.length}</div>
                <div className="text-sm text-muted-foreground">Kits de Marca</div>
              </CardContent>
            </Card>
            <Card className="bg-gradient-card border-primary/20">
              <CardContent className="p-6 text-center">
                <Palette className="h-8 w-8 mx-auto mb-3 text-secondary" />
                <div className="text-2xl font-bold gradient-text">
                  {brandKits.reduce((acc, kit) => acc + kit.colors.length, 0)}
                </div>
                <div className="text-sm text-muted-foreground">Cores Definidas</div>
              </CardContent>
            </Card>
            <Card className="bg-gradient-card border-primary/20">
              <CardContent className="p-6 text-center">
                <Sparkles className="h-8 w-8 mx-auto mb-3 text-accent" />
                <div className="text-2xl font-bold gradient-text">
                  {brandKits.reduce((acc, kit) => acc + kit.projectCount, 0)}
                </div>
                <div className="text-sm text-muted-foreground">Projetos Criados</div>
              </CardContent>
            </Card>
          </div>

          {/* Brand Kits Grid */}
          {brandKits.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {brandKits.map((brandKit) => (
                <BrandKitCard
                  key={brandKit.id}
                  brandKit={brandKit}
                  onEdit={(id) => {
                    setEditingBrandKit(brandKits.find(bk => bk.id === id));
                    setCurrentView("editor");
                  }}
                  onDelete={handleDeleteBrandKit}
                  onSelect={handleSelectBrandKit}
                />
              ))}
            </div>
          ) : (
            <Card className="bg-gradient-card border-primary/20 p-12 text-center">
              <Palette className="h-16 w-16 mx-auto mb-4 text-muted-foreground" />
              <h3 className="text-xl font-semibold mb-2">Nenhum kit de marca criado</h3>
              <p className="text-muted-foreground mb-6">
                Comece criando seu primeiro kit de marca para gerenciar a identidade visual dos seus clientes.
              </p>
              <Button
                variant="gradient"
                onClick={() => {
                  setEditingBrandKit(null);
                  setCurrentView("editor");
                }}
              >
                <Plus className="mr-2 h-4 w-4" />
                Criar Primeiro Kit
              </Button>
            </Card>
          )}
        </div>
      </section>
    </div>
  );
};

export default Index;
