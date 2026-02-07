import { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { ArrowLeft, Loader2 } from "lucide-react";
import ProjectBoard from "@/components/ProjectBoard";
import { getClientBySlug, getProjectBriefsByClient } from "@/lib/clientDatabase";
import { Json } from "@/integrations/supabase/types";

interface Client {
  id: string;
  name: string;
  email: string;
  company?: string;
  team?: string;
  brand_kit?: Json;
  projectCount: number;
  created_at: string;
}

const ClientPublicView = () => {
  const { clientSlug } = useParams<{ clientSlug?: string }>();
  const [client, setClient] = useState<Client | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadClient = async () => {
      if (!clientSlug) {
        setLoading(false);
        return;
      }

      try {
        const clientData = await getClientBySlug(clientSlug);
        
        if (clientData) {
          // Fetch project briefs count
          const briefs = await getProjectBriefsByClient(clientData.id);
          
          setClient({
            ...clientData,
            team: clientData.team || undefined,
            projectCount: briefs.length
          });
        } else {
          setClient(null);
        }
      } catch (error) {
        console.error("Error loading client:", error);
        setClient(null);
      } finally {
        setLoading(false);
      }
    };

    loadClient();
  }, [clientSlug]);


  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-background via-background to-background/80 flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!client) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-background via-background to-background/80 flex items-center justify-center">
        <Card className="bg-gradient-card border-primary/20 p-12 text-center">
          <ArrowLeft className="h-16 w-16 mx-auto mb-4 text-muted-foreground" />
          <h3 className="text-xl font-semibold mb-2">Cliente não encontrado</h3>
          <p className="text-muted-foreground">
            Verifique se o link está correto ou entre em contato com o administrador.
          </p>
        </Card>
      </div>
    );
  }

  const handleCreateProject = (brief: any, brandKitId: string) => {
    // This is a public view, so we don't allow creating projects
    console.log("Create project not available in public view");
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-background/80">
      {/* Header - Mobile Optimized */}
      <div className="border-b bg-background/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="container mx-auto px-4 sm:px-6 py-3 sm:py-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 sm:gap-4">
            <div className="text-center sm:text-left">
              <h1 className="text-xl sm:text-2xl font-bold gradient-text truncate">{client.name}</h1>
              <p className="text-sm text-muted-foreground truncate">{client.email}</p>
            </div>
            <div className="flex items-center justify-center sm:justify-end gap-2 flex-wrap">
              {client.company && (
                <span className="px-2 sm:px-3 py-1 bg-primary/10 text-primary rounded-full text-xs sm:text-sm">
                  {client.company}
                </span>
              )}
              {client.team && (
                <span className="px-2 sm:px-3 py-1 bg-secondary/10 text-secondary-foreground rounded-full text-xs sm:text-sm whitespace-nowrap">
                  {client.team}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Content - Mobile Optimized */}
      <div className="container mx-auto px-3 sm:px-6 py-4 sm:py-8">
        <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-3 sm:p-4 mb-4 sm:mb-6">
          <h3 className="font-semibold text-blue-600 dark:text-blue-400 mb-1 text-sm sm:text-base">📱 Portal do Cliente</h3>
          <p className="text-xs sm:text-sm text-blue-600/80 dark:text-blue-400/80">
            Visualize e baixe suas artes. Toque no card para ver detalhes.
          </p>
        </div>
        <ProjectBoard 
          brandKits={client.brand_kit ? [client.brand_kit as any] : []}
          onCreateProject={handleCreateProject}
          clientName={client.name}
          clientId={client.id}
          isPublicView={true}
        />
      </div>
    </div>
  );
};

export default ClientPublicView;
