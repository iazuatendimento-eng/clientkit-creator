import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ArrowLeft } from "lucide-react";
import { BrandKitEditor } from "@/components/BrandKitEditor";
import { CanvasEditor } from "@/components/CanvasEditor";
import { AIArtGenerator } from "@/components/AIArtGenerator";
import ProjectBoard from "@/components/ProjectBoard";

interface Client {
  id: string;
  name: string;
  email: string;
  company?: string;
  team?: "1" | "2" | "3";
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
              {client.team && (
                <span className="px-3 py-1 bg-secondary/10 text-secondary-foreground rounded-full text-sm">
                  {client.team === "1" ? "SEG, QUA E SEX" : client.team === "2" ? "TER, QUI E SÁB" : "DE SEG A SEX"}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="container mx-auto px-6 py-8">
        <ProjectBoard 
          brandKits={client.brandKit ? [client.brandKit] : []}
          onCreateProject={handleCreateProject}
          clientName={client.name}
        />
      </div>
    </div>
  );
};