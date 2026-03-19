import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ArrowLeft } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BrandKitEditor } from "@/components/BrandKitEditor";
import { CanvasEditor } from "@/components/CanvasEditor";
import { AIArtGenerator } from "@/components/AIArtGenerator";
import ProjectBoard from "@/components/ProjectBoard";

import { LinkableText } from "@/components/LinkableText";

interface Client {
  id: string;
  name: string;
  email: string;
  company?: string;
  team?: string;
  slug: string;
  notes?: string;
  narration_type?: string;
  image_type?: string;
  particularity_type?: string;
  brand_kit?: {
    id: string;
    name: string;
    logo?: string;
    contactInfo?: string;
    mascot?: string;
    colors: string[];
    createdAt: string;
  };
  projectCount: number;
  created_at: string;
  active?: boolean;
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
      brand_kit: { ...brandKit, id: brandKit.id || "1" }
    };
    onUpdateClient(updatedClient);
    setCurrentView("dashboard");
  };

  const handleCreateProject = (brief: any, brandKitId: string) => {
    if (client.brand_kit) {
      setSelectedBrandKit(client.brand_kit);
      setCurrentView("ai-generator");
    }
  };

  if (currentView === "brand-editor") {
    return (
      <div className="min-h-screen p-6">
        <BrandKitEditor
          brandKit={client.brand_kit}
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

  if (currentView === "ai-generator" && client.brand_kit) {
    return (
      <AIArtGenerator
        brandKit={client.brand_kit}
        onBack={() => setCurrentView("dashboard")}
      />
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-background/80">
      {/* Content */}
      <div className="container mx-auto px-6 py-8">
        {!client.active && (
          <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-4 mb-6">
            <h3 className="font-semibold text-yellow-600 dark:text-yellow-400 mb-1">Empresa Inativa</h3>
            <p className="text-sm text-yellow-600/80 dark:text-yellow-400/80">
              Esta empresa está inativa. Você pode visualizar os cards existentes, mas não pode mover cards ou adicionar novas ações.
            </p>
          </div>
        )}
        <ProjectBoard
          clientId={client.id}
          clientName={client.name}
          brandKits={client.brand_kit ? [client.brand_kit] : []}
          onCreateProject={handleCreateProject}
          isInactive={client.active === false}
        />
      </div>
    </div>
  );
};