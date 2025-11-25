import { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { ArrowLeft } from "lucide-react";
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

const ClientPublicView = () => {
  const { clientId, clientSlug } = useParams<{ clientId?: string; clientSlug?: string }>();
  const [client, setClient] = useState<Client | null>(null);

  useEffect(() => {
    let foundClient = null;
    
    // First, try to find in public snapshots if we have a slug
    if (clientSlug) {
      const publicSnapshot = localStorage.getItem(`public-client-${clientSlug}`);
      if (publicSnapshot) {
        foundClient = JSON.parse(publicSnapshot);
      }
    }
    
    // Fallback: search in general clients list
    if (!foundClient) {
      const storedClients = localStorage.getItem('clients');
      if (storedClients) {
        const clients = JSON.parse(storedClients);
        
        if (clientId) {
          foundClient = clients.find((c: Client) => c.id === clientId);
        } else if (clientSlug) {
          // Try to find by slug (normalized name or company)
          const slug = clientSlug.toLowerCase();
          foundClient = clients.find((c: Client) => {
            const nameSlug = c.name.toLowerCase().replace(/\s+/g, '-');
            const companySlug = c.company?.toLowerCase().replace(/\s+/g, '-');
            return nameSlug === slug || companySlug === slug;
          });
        }
      }
    }
    
    setClient(foundClient || null);
  }, [clientId, clientSlug]);

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
          brandKits={client.brandKit ? [client.brandKit] : []}
          onCreateProject={handleCreateProject}
          clientName={client.name}
        />
      </div>
    </div>
  );
};

export default ClientPublicView;
