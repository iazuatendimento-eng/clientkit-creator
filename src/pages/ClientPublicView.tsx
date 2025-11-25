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
  team?: "1" | "2" | "3";
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
            team: clientData.team as "1" | "2" | "3",
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
      {/* Header */}
      <div className="border-b bg-background/80 backdrop-blur-sm">
        <div className="container mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold gradient-text">{client.name}</h1>
              <p className="text-muted-foreground">{client.email}</p>
            </div>
            <div className="flex items-center gap-2">
              {client.company && (
                <span className="px-3 py-1 bg-primary/10 text-primary rounded-full text-sm">
                  {client.company}
                </span>
              )}
              {client.team && (
                <span className="px-3 py-1 bg-secondary/10 text-secondary-foreground rounded-full text-sm">
                  {client.team === "1" ? "SEG, QUA E SEX" : client.team === "2" ? "TER, QUI E SÁB" : "SEG A SEX"}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="container mx-auto px-6 py-8">
        <ProjectBoard 
          brandKits={client.brand_kit ? [client.brand_kit as any] : []}
          onCreateProject={handleCreateProject}
          clientName={client.name}
        />
      </div>
    </div>
  );
};

export default ClientPublicView;
