import { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Palette, Image as ImageIcon } from "lucide-react";

interface Client {
  id: string;
  name: string;
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
          <Palette className="h-16 w-16 mx-auto mb-4 text-muted-foreground" />
          <h3 className="text-xl font-semibold mb-2">Cliente não encontrado</h3>
          <p className="text-muted-foreground">
            Verifique se o link está correto ou entre em contato com o administrador.
          </p>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-background/80">
      {/* Header */}
      <div className="border-b bg-background/80 backdrop-blur-sm">
        <div className="container mx-auto px-6 py-6">
          <div className="text-center">
            <h1 className="text-3xl font-bold gradient-text mb-2">{client.name}</h1>
            {client.company && (
              <span className="inline-block px-3 py-1 bg-primary/10 text-primary rounded-full text-sm">
                {client.company}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="container mx-auto px-6 py-8">
        <Tabs defaultValue="arts" className="w-full">
          <TabsList className="grid w-full max-w-md mx-auto grid-cols-2 mb-8">
            <TabsTrigger value="arts" className="flex items-center gap-2">
              <ImageIcon className="h-4 w-4" />
              Artes Geradas
            </TabsTrigger>
            <TabsTrigger value="brand" className="flex items-center gap-2">
              <Palette className="h-4 w-4" />
              Kit de Marca
            </TabsTrigger>
          </TabsList>

          <TabsContent value="arts">
            <div className="space-y-6">
              <div className="text-center">
                <h2 className="text-2xl font-bold gradient-text mb-2">Suas Artes</h2>
                <p className="text-muted-foreground">
                  Todas as artes criadas para {client.name}
                </p>
              </div>

              {/* TODO: Load generated arts from storage */}
              <Card className="bg-gradient-card border-primary/20 p-12 text-center">
                <ImageIcon className="h-16 w-16 mx-auto mb-4 text-muted-foreground" />
                <h3 className="text-xl font-semibold mb-2">Nenhuma arte gerada ainda</h3>
                <p className="text-muted-foreground">
                  As artes criadas para você aparecerão aqui.
                </p>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="brand">
            {client.brandKit ? (
              <Card className="bg-gradient-card border-primary/20">
                <CardContent className="p-6">
                  <div className="space-y-6">
                    <div className="text-center">
                      <h3 className="text-2xl font-semibold mb-2">{client.brandKit.name}</h3>
                      <p className="text-muted-foreground">
                        Kit de marca criado em {new Date(client.brandKit.createdAt).toLocaleDateString('pt-BR')}
                      </p>
                    </div>
                    
                    {client.brandKit.colors && client.brandKit.colors.length > 0 && (
                      <div>
                        <h4 className="font-medium mb-3 text-center">Paleta de Cores</h4>
                        <div className="flex gap-3 justify-center flex-wrap">
                          {client.brandKit.colors.map((color, index) => (
                            <div key={index} className="text-center">
                              <div
                                className="w-20 h-20 rounded-lg border border-white/20 shadow-md mx-auto mb-2"
                                style={{ backgroundColor: color }}
                              />
                              <span className="text-xs text-muted-foreground">{color}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {client.brandKit.logo && (
                      <div className="text-center">
                        <h4 className="font-medium mb-3">Logo</h4>
                        <img 
                          src={client.brandKit.logo} 
                          alt="Logo" 
                          className="max-w-xs mx-auto rounded-lg"
                        />
                      </div>
                    )}

                    {client.brandKit.contactInfo && (
                      <div className="text-center">
                        <h4 className="font-medium mb-2">Informações de Contato</h4>
                        <p className="text-muted-foreground">{client.brandKit.contactInfo}</p>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            ) : (
              <Card className="bg-gradient-card border-primary/20 p-12 text-center">
                <Palette className="h-16 w-16 mx-auto mb-4 text-muted-foreground" />
                <h3 className="text-xl font-semibold mb-2">Nenhum kit de marca criado</h3>
                <p className="text-muted-foreground">
                  Entre em contato com o administrador para criar seu kit de marca.
                </p>
              </Card>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

export default ClientPublicView;
