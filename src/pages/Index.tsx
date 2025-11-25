import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Plus, Users, Building2, Sparkles, Copy, Check, LogOut, Loader2, FileDown } from "lucide-react";
import { ClientCard } from "@/components/ClientCard";
import { ClientEditor } from "@/components/ClientEditor";
import { ClientDashboard } from "@/components/ClientDashboard";
import heroImage from "@/assets/hero-image.jpg";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import * as XLSX from 'xlsx';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface Client {
  id: string;
  name: string;
  email: string;
  company?: string;
  phone?: string;
  notes?: string;
  team?: "1" | "2" | "3";
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
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [clients, setClients] = useState<Client[]>([
    {
      id: "1",
      name: "João Silva",
      email: "joao@techsolutions.com",
      company: "Tech Solutions",
      phone: "(11) 99999-9999",
      team: "1",
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
      team: "2",
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
  const { toast } = useToast();
  const { user, loading, signOut } = useAuth();
  const navigate = useNavigate();

  // Redirect to auth if not logged in
  useEffect(() => {
    // Redirect to auth if not logged in
    if (!loading && !user) {
      navigate("/auth");
    }

    // Persist clients to localStorage on any change
    localStorage.setItem('clients', JSON.stringify(clients));
  }, [user, loading, navigate, clients]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) {
    return null;
  }


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

  const handleCopyUrl = (clientId: string) => {
    const client = clients.find(c => c.id === clientId);
    if (!client) return;
    
    // Create slug from company name or client name
    const slug = (client.company || client.name).toLowerCase().replace(/\s+/g, '-');
    const url = `${window.location.origin}/${slug}`;

    // Persist a public-safe snapshot for the public page fallback
    try {
      const publicSnapshot = {
        id: client.id,
        name: client.name,
        company: client.company,
        brandKit: client.brandKit,
        createdAt: client.createdAt,
        projectCount: client.projectCount,
      };
      localStorage.setItem(`public-client-${slug}`, JSON.stringify(publicSnapshot));
    } catch {}
    
    navigator.clipboard.writeText(url);
    setCopiedId(clientId);
    toast({
      title: "Link copiado!",
      description: "O link do cliente foi copiado para a área de transferência.",
    });
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleExportToExcel = (selectedTeam?: string) => {
    const excelData: any[] = [];

    // Filter clients by team if specified
    const filteredClients = selectedTeam 
      ? clients.filter(c => c.team === selectedTeam)
      : clients;

    filteredClients.forEach((client) => {
      const storageKey = `project-briefs-${client.name}`;
      const saved = localStorage.getItem(storageKey);
      
      if (saved) {
        try {
          const briefs = JSON.parse(saved);
          // Get the first "todo" card
          const firstTodoCard = briefs.find((b: any) => b.status === "todo");
          
          if (firstTodoCard) {
            const slug = (client.company || client.name).toLowerCase().replace(/\s+/g, '-');
            const cardUrl = `${window.location.origin}/${slug}#card-${firstTodoCard.id}`;
            
            const teamName = client.team === "1" ? "SEG, QUA E SEX" : 
                           client.team === "2" ? "TER, QUI E SÁB" : 
                           client.team === "3" ? "SEG A SEX" : "SEG, QUA E SEX";
            
            excelData.push({
              "Cliente": client.name,
              "Empresa": client.company || "",
              "Equipe": teamName,
              "Texto do Card": firstTodoCard.description || firstTodoCard.title,
              "Link do Card": cardUrl,
              "Prazo": new Date(firstTodoCard.deadline).toLocaleDateString('pt-BR')
            });
          }
        } catch {}
      }
    });

    if (excelData.length === 0) {
      toast({
        title: "Nenhum card encontrado",
        description: "Não há cards 'A Fazer' para exportar.",
        variant: "destructive"
      });
      return;
    }

    // Create worksheet and workbook
    const ws = XLSX.utils.json_to_sheet(excelData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Primeiros Cards A Fazer");

    // Auto-size columns
    const colWidths = [
      { wch: 20 }, // Cliente
      { wch: 20 }, // Empresa
      { wch: 18 }, // Equipe
      { wch: 50 }, // Texto do Card
      { wch: 40 }, // Link do Card
      { wch: 12 }  // Prazo
    ];
    ws['!cols'] = colWidths;

    // Generate and download file
    const teamNames = { "1": "SEG_QUA_SEX", "2": "TER_QUI_SAB", "3": "SEG_A_SEX" };
    const teamSuffix = selectedTeam ? `_${teamNames[selectedTeam as keyof typeof teamNames]}` : '';
    const fileName = `Primeiros_Cards_A_Fazer${teamSuffix}_${new Date().toLocaleDateString('pt-BR').replace(/\//g, '-')}.xlsx`;
    XLSX.writeFile(wb, fileName);

    toast({
      title: "Exportado com sucesso!",
      description: `${excelData.length} cards foram exportados para Excel.`,
    });
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

  return (
    <div className="min-h-screen flex flex-col">
      {/* Top Banner */}
      <div className="bg-gradient-primary py-6 px-6">
        <div className="container mx-auto">
          <h1 className="text-2xl font-bold text-white text-center">
            Você tem {clients.length} {clients.length === 1 ? 'empresa ativa' : 'empresas ativas'}
          </h1>
        </div>
      </div>

      {/* Header */}
      <div className="border-b bg-background/80 backdrop-blur-sm px-6 py-4">
        <div className="container mx-auto flex justify-between items-center">
          <h2 className="text-3xl font-bold gradient-text">Seus Clientes</h2>
          <div className="flex gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline">
                  <FileDown className="mr-2 h-4 w-4" />
                  Exportar Cards
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                <DropdownMenuItem onClick={() => handleExportToExcel()}>
                  Todas as Equipes
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleExportToExcel("1")}>
                  SEG, QUA E SEX
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleExportToExcel("2")}>
                  TER, QUI E SÁB
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleExportToExcel("3")}>
                  SEG A SEX
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <Button
              variant="outline"
              onClick={async () => {
                await signOut();
                navigate("/auth");
              }}
            >
              <LogOut className="mr-2 h-4 w-4" />
              Sair
            </Button>
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
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Sidebar - Client List */}
        <div className="w-80 border-r bg-card/50 overflow-y-auto">
          <div className="p-4 space-y-2">
            <p className="text-sm text-muted-foreground px-3 mb-2">
              Gerencie todos os seus clientes e projetos
            </p>
            {clients.length > 0 ? (
              clients.map((client) => (
                <button
                  key={client.id}
                  onClick={() => {
                    setSelectedClient(client);
                    setCurrentView("client-dashboard");
                  }}
                  className={`w-full text-left p-4 rounded-lg transition-all ${
                    selectedClient?.id === client.id
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-card hover:bg-card/80 border border-border'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <div className="font-semibold">{client.name}</div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleCopyUrl(client.id);
                      }}
                      className={`p-1 rounded transition-colors ${
                        selectedClient?.id === client.id
                          ? 'hover:bg-primary-foreground/20'
                          : 'hover:bg-muted'
                      }`}
                      title="Copiar link do cliente"
                    >
                      {copiedId === client.id ? (
                        <Check className="h-4 w-4" />
                      ) : (
                        <Copy className="h-4 w-4" />
                      )}
                    </button>
                  </div>
                  <div className={`text-sm ${
                    selectedClient?.id === client.id
                      ? 'text-primary-foreground/80'
                      : 'text-muted-foreground'
                  }`}>
                    {client.company}
                  </div>
                  {client.team && (
                    <div className={`text-xs mt-1 ${
                      selectedClient?.id === client.id
                        ? 'text-primary-foreground/60'
                        : 'text-muted-foreground'
                    }`}>
                      {client.team === "1" ? "SEG, QUA E SEX" : client.team === "2" ? "TER, QUI E SÁB" : "SEG A SEX"}
                    </div>
                  )}
                </button>
              ))
            ) : (
              <div className="text-center p-8">
                <Users className="h-12 w-12 mx-auto mb-3 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">
                  Nenhum cliente cadastrado
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Main Content Area */}
        <div className="flex-1 overflow-y-auto">
          {currentView === "client-dashboard" && selectedClient ? (
            <ClientDashboard
              client={selectedClient}
              onBack={() => {
                setCurrentView("dashboard");
                setSelectedClient(null);
              }}
              onUpdateClient={handleUpdateClient}
            />
          ) : (
            <div className="flex items-center justify-center h-full">
              <div className="text-center">
                <Users className="h-24 w-24 mx-auto mb-6 text-muted-foreground" />
                <h3 className="text-2xl font-semibold mb-2">Selecione um Cliente</h3>
                <p className="text-muted-foreground">
                  Escolha um cliente na lista ao lado para ver seu dashboard
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Index;