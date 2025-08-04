import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Plus, Users, Building2, Sparkles } from "lucide-react";
import { ClientCard } from "@/components/ClientCard";
import { ClientEditor } from "@/components/ClientEditor";
import { ClientDashboard } from "@/components/ClientDashboard";
import heroImage from "@/assets/hero-image.jpg";

interface Client {
  id: string;
  name: string;
  email: string;
  company?: string;
  phone?: string;
  notes?: string;
  brandKit?: {
    id: string;
    name: string;
    logo: string;
    colors: string[];
    createdAt: string;
  };
  projectCount: number;
  createdAt: string;
}

const Index = () => {
  const [currentView, setCurrentView] = useState<"dashboard" | "client-editor" | "client-dashboard">("dashboard");
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [editingClient, setEditingClient] = useState<Client | null>(null);
  
  // Mock data for clients
  const [clients, setClients] = useState<Client[]>([
    {
      id: "1",
      name: "João Silva",
      email: "joao@techsolutions.com",
      company: "Tech Solutions",
      phone: "(11) 99999-9999",
      brandKit: {
        id: "1",
        name: "Tech Solutions",
        logo: "",
        colors: ["#8B5CF6", "#EC4899", "#F59E0B", "#10B981"],
        createdAt: "2024-01-15"
      },
      projectCount: 5,
      createdAt: "2024-01-15"
    },
    {
      id: "2",
      name: "Maria Santos",
      email: "maria@cafecentral.com",
      company: "Café Central",
      phone: "(11) 88888-8888",
      brandKit: {
        id: "2",
        name: "Café Central",
        logo: "",
        colors: ["#92400E", "#FCD34D", "#F59E0B"],
        createdAt: "2024-01-10"
      },
      projectCount: 3,
      createdAt: "2024-01-10"
    }
  ]);

  const handleSaveClient = (client: Client) => {
    if (client.id && clients.find(c => c.id === client.id)) {
      setClients(clients.map(c => c.id === client.id ? client : c));
    } else {
      setClients([...clients, { ...client, id: Date.now().toString() }]);
    }
    setCurrentView("dashboard");
    setEditingClient(null);
  };

  const handleDeleteClient = (id: string) => {
    setClients(clients.filter(c => c.id !== id));
  };

  const handleSelectClient = (id: string) => {
    const client = clients.find(c => c.id === id);
    if (client) {
      setSelectedClient(client);
      setCurrentView("client-dashboard");
    }
  };

  const handleUpdateClient = (updatedClient: Client) => {
    setClients(clients.map(c => c.id === updatedClient.id ? updatedClient : c));
    setSelectedClient(updatedClient);
  };

  if (currentView === "client-editor") {
    return (
      <ClientEditor
        client={editingClient}
        onSave={handleSaveClient}
        onCancel={() => {
          setCurrentView("dashboard");
          setEditingClient(null);
        }}
      />
    );
  }

  if (currentView === "client-dashboard" && selectedClient) {
    return (
      <ClientDashboard
        client={selectedClient}
        onBack={() => {
          setCurrentView("dashboard");
          setSelectedClient(null);
        }}
        onUpdateClient={handleUpdateClient}
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
                Sistema de Gestão de Clientes
              </h1>
              <p className="text-xl text-foreground/80 mb-8 max-w-2xl mx-auto">
                Gerencie clientes, kits de marca e projetos em um só lugar. 
                Cada cliente tem seu próprio dashboard personalizado.
              </p>
              <Button
                variant="hero"
                size="lg"
                onClick={() => {
                  setEditingClient(null);
                  setCurrentView("client-editor");
                }}
                className="text-lg px-8 py-4 glow-effect"
              >
                <Plus className="mr-2 h-5 w-5" />
                Adicionar Cliente
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
              <h2 className="text-3xl font-bold gradient-text mb-2">Seus Clientes</h2>
              <p className="text-muted-foreground">
                Gerencie todos os seus clientes e projetos
              </p>
            </div>
            <Button
              variant="gradient"
              onClick={() => {
                setEditingClient(null);
                setCurrentView("client-editor");
              }}
              className="glow-effect"
            >
              <Plus className="mr-2 h-4 w-4" />
              Novo Cliente
            </Button>
          </div>

          {/* Stats Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
            <Card className="bg-gradient-card border-primary/20">
              <CardContent className="p-6 text-center">
                <Users className="h-8 w-8 mx-auto mb-3 text-primary" />
                <div className="text-2xl font-bold gradient-text">{clients.length}</div>
                <div className="text-sm text-muted-foreground">Clientes</div>
              </CardContent>
            </Card>
            <Card className="bg-gradient-card border-primary/20">
              <CardContent className="p-6 text-center">
                <Building2 className="h-8 w-8 mx-auto mb-3 text-secondary" />
                <div className="text-2xl font-bold gradient-text">
                  {clients.filter(c => c.brandKit).length}
                </div>
                <div className="text-sm text-muted-foreground">Kits de Marca</div>
              </CardContent>
            </Card>
            <Card className="bg-gradient-card border-primary/20">
              <CardContent className="p-6 text-center">
                <Sparkles className="h-8 w-8 mx-auto mb-3 text-accent" />
                <div className="text-2xl font-bold gradient-text">
                  {clients.reduce((acc, client) => acc + client.projectCount, 0)}
                </div>
                <div className="text-sm text-muted-foreground">Projetos Totais</div>
              </CardContent>
            </Card>
          </div>

          {/* Clients Grid */}
          {clients.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {clients.map((client) => (
                <ClientCard
                  key={client.id}
                  client={client}
                  onEdit={(id) => {
                    setEditingClient(clients.find(c => c.id === id) || null);
                    setCurrentView("client-editor");
                  }}
                  onDelete={handleDeleteClient}
                  onSelect={handleSelectClient}
                />
              ))}
            </div>
          ) : (
            <Card className="bg-gradient-card border-primary/20 p-12 text-center">
              <Users className="h-16 w-16 mx-auto mb-4 text-muted-foreground" />
              <h3 className="text-xl font-semibold mb-2">Nenhum cliente cadastrado</h3>
              <p className="text-muted-foreground mb-6">
                Comece adicionando seu primeiro cliente para gerenciar kits de marca e projetos.
              </p>
              <Button
                variant="gradient"
                onClick={() => {
                  setEditingClient(null);
                  setCurrentView("client-editor");
                }}
              >
                <Plus className="mr-2 h-4 w-4" />
                Adicionar Primeiro Cliente
              </Button>
            </Card>
          )}
        </div>
      </section>
    </div>
  );
};

export default Index;