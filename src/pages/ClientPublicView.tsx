import { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { ArrowLeft, Loader2 } from "lucide-react";
import ProjectBoard from "@/components/ProjectBoard";
import { getClientBySlug, getProjectBriefsByClient } from "@/lib/clientDatabase";
import { Json } from "@/integrations/supabase/types";
import { LinkableText } from "@/components/LinkableText";

interface Client {
  id: string;
  name: string;
  email: string;
  company?: string;
  team?: string;
  notes?: string;
  narration_type?: string;
  image_type?: string;
  particularity_type?: string;
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
            notes: clientData.notes || undefined,
            narration_type: clientData.narration_type || undefined,
            image_type: clientData.image_type || undefined,
            particularity_type: clientData.particularity_type || undefined,
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
    <div className="min-h-screen bg-background">
      {/* Header - Modern & Clean */}
      <div className="sticky top-0 z-10 border-b border-border/50 bg-background/90 backdrop-blur-xl">
        <div className="container mx-auto px-4 sm:px-6 py-4 sm:py-5">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="text-center sm:text-left">
              <h1 className="text-2xl sm:text-3xl font-bold tracking-tight bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent">
                {client.name}
              </h1>
              <p className="text-sm text-muted-foreground mt-0.5">{client.email}</p>
            </div>
            <div className="flex items-center justify-center sm:justify-end gap-2 flex-wrap">
              {client.company && (
                <span className="px-3 py-1.5 bg-primary/10 text-primary rounded-full text-xs font-medium border border-primary/20">
                  {client.company}
                </span>
              )}
              {client.team && (
                <span className="px-3 py-1.5 bg-muted text-muted-foreground rounded-full text-xs font-medium border border-border/50">
                  {client.team}
                </span>
              )}
            </div>
          </div>
          {client.notes && (
            <div className="mt-3">
              <div className="px-3 py-2 bg-muted/50 rounded-lg text-muted-foreground text-xs leading-relaxed border border-border/30">
                📝 <LinkableText text={client.notes} />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="py-3 sm:px-4 sm:py-8 w-full">
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
