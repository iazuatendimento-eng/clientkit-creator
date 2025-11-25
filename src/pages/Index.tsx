import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Plus, Users, Copy, Check, LogOut, Loader2, FileDown, CheckCircle2, ListTodo } from "lucide-react";
import { ClientEditor } from "@/components/ClientEditor";
import { ClientDashboard } from "@/components/ClientDashboard";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import * as XLSX from 'xlsx';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { 
  getAllClients, 
  createClient, 
  updateClient, 
  deleteClient, 
  generateSlug,
  bulkUpdateBriefStatus,
  getProjectBriefsByClient
} from "@/lib/clientDatabase";

interface Client {
  id: string;
  name: string;
  email: string;
  company?: string;
  phone?: string;
  notes?: string;
  team?: "1" | "2" | "3";
  slug: string;
  brand_kit?: any;
  projectCount: number;
  created_at: string;
}

const Index = () => {
  const [currentView, setCurrentView] = useState<"dashboard" | "client-editor" | "client-dashboard">("dashboard");
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [editingClient, setEditingClient] = useState<Client | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [clients, setClients] = useState<Client[]>([]);
  const [isLoadingClients, setIsLoadingClients] = useState(true);
  const { toast } = useToast();
  const { user, signOut } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    loadClients();
  }, []);

  const loadClients = async () => {
    try {
      setIsLoadingClients(true);
      const data = await getAllClients();
      const mappedClients: Client[] = data.map((c: any) => ({
        id: c.id,
        name: c.name,
        email: c.email,
        company: c.company,
        phone: c.phone,
        notes: c.notes,
        team: c.team,
        slug: c.slug,
        brand_kit: c.brand_kit,
        projectCount: 0,
        created_at: c.created_at || new Date().toISOString(),
      }));
      setClients(mappedClients);
    } catch (error) {
      console.error("Error loading clients:", error);
      toast({
        title: "Erro ao carregar clientes",
        description: "Não foi possível carregar a lista de clientes.",
        variant: "destructive",
      });
    } finally {
      setIsLoadingClients(false);
    }
  };

  const handleSaveClient = async (clientData: any) => {
    try {
      const slug = generateSlug(clientData.company || clientData.name);
      
      if (clientData.id && clients.find(c => c.id === clientData.id)) {
        await updateClient(clientData.id, {
          name: clientData.name,
          email: clientData.email,
          company: clientData.company,
          phone: clientData.phone,
          notes: clientData.notes,
          team: clientData.team,
          slug,
          brand_kit: clientData.brandKit || clientData.brand_kit,
        });
        toast({
          title: "Cliente atualizado!",
          description: "As informações do cliente foram atualizadas com sucesso.",
        });
      } else {
        await createClient({
          name: clientData.name,
          email: clientData.email,
          company: clientData.company,
          phone: clientData.phone,
          notes: clientData.notes,
          team: clientData.team,
          slug,
          brand_kit: clientData.brandKit || clientData.brand_kit,
        });
        toast({
          title: "Cliente cadastrado!",
          description: "O cliente foi adicionado com sucesso.",
        });
      }
      
      await loadClients();
      setCurrentView("dashboard");
      setEditingClient(null);
    } catch (error) {
      console.error("Error saving client:", error);
      toast({
        title: "Erro ao salvar cliente",
        description: "Não foi possível salvar as informações do cliente.",
        variant: "destructive",
      });
    }
  };

  const handleDeleteClient = async (id: string) => {
    try {
      await deleteClient(id);
      await loadClients();
      toast({
        title: "Cliente removido!",
        description: "O cliente foi removido com sucesso.",
      });
    } catch (error) {
      console.error("Error deleting client:", error);
      toast({
        title: "Erro ao remover cliente",
        description: "Não foi possível remover o cliente.",
        variant: "destructive",
      });
    }
  };

  const handleUpdateClient = async (updatedClient: Client) => {
    await loadClients();
    const refreshedClient = clients.find(c => c.id === updatedClient.id);
    if (refreshedClient) {
      setSelectedClient(refreshedClient);
    }
  };

  const handleCopyUrl = (clientId: string) => {
    const client = clients.find(c => c.id === clientId);
    if (!client) return;
    
    const url = `${window.location.origin}/${client.slug}`;
    
    navigator.clipboard.writeText(url);
    setCopiedId(clientId);
    toast({
      title: "Link copiado!",
      description: "O link do cliente foi copiado para a área de transferência.",
    });
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleBulkMoveToCompleted = async (team?: string) => {
    try {
      const filteredClients = team 
        ? clients.filter(c => c.team === team)
        : clients;
      
      const clientIds = filteredClients.map(c => c.id);
      await bulkUpdateBriefStatus(clientIds, "completed");
      
      toast({
        title: "Cards movidos!",
        description: `Primeiro card de cada cliente movido para Concluídos.`,
      });
    } catch (error) {
      console.error("Error moving cards:", error);
      toast({
        title: "Erro ao mover cards",
        description: "Não foi possível mover os cards.",
        variant: "destructive",
      });
    }
  };

  const handleBulkMoveToTodo = async (team?: string) => {
    try {
      const filteredClients = team 
        ? clients.filter(c => c.team === team)
        : clients;
      
      const clientIds = filteredClients.map(c => c.id);
      await bulkUpdateBriefStatus(clientIds, "todo");
      
      toast({
        title: "Cards movidos!",
        description: `Primeiro card de cada cliente movido para A Fazer.`,
      });
    } catch (error) {
      console.error("Error moving cards:", error);
      toast({
        title: "Erro ao mover cards",
        description: "Não foi possível mover os cards.",
        variant: "destructive",
      });
    }
  };

  const handleExportToExcel = async (selectedTeam?: string) => {
    try {
      const excelData: any[] = [];

      const filteredClients = selectedTeam 
        ? clients.filter(c => c.team === selectedTeam)
        : clients;

      for (const client of filteredClients) {
        try {
          const briefs = await getProjectBriefsByClient(client.id);
          const firstTodoCard = briefs.find((b: any) => b.status === "todo");
          
          if (firstTodoCard) {
            const slug = client.slug || generateSlug(client.company || client.name);
            const cardUrl = `${window.location.origin}/${slug}#card-${firstTodoCard.id}`;
            
            const teamName = client.team === "1" ? "SEG, QUA E SEX" : 
                           client.team === "2" ? "TER, QUI E SÁB" : 
                           client.team === "3" ? "SEG A SEX" : "SEG, QUA E SEX";
            
            const cardText = firstTodoCard.description || firstTodoCard.title;
            
            // Se o texto contém ";", dividir em múltiplas linhas
            if (cardText.includes(";")) {
              const textParts = cardText.split(";").map(part => part.trim()).filter(part => part.length > 0);
              textParts.forEach((part, index) => {
                excelData.push({
                  "Cliente": client.name,
                  "Empresa": client.company || "",
                  "Equipe": teamName,
                  "Texto do Card": part,
                  "Link do Card": index === 0 ? cardUrl : "",
                  "Prazo": index === 0 ? (firstTodoCard.deadline ? new Date(firstTodoCard.deadline).toLocaleDateString('pt-BR') : "") : ""
                });
              });
            } else {
              excelData.push({
                "Cliente": client.name,
                "Empresa": client.company || "",
                "Equipe": teamName,
                "Texto do Card": cardText,
                "Link do Card": cardUrl,
                "Prazo": firstTodoCard.deadline ? new Date(firstTodoCard.deadline).toLocaleDateString('pt-BR') : ""
              });
            }
          }
        } catch (error) {
          console.error(`Error processing client ${client.name}:`, error);
        }
      }

      if (excelData.length === 0) {
        toast({
          title: "Nenhum card encontrado",
          description: "Não há cards 'A Fazer' para exportar.",
          variant: "destructive"
        });
        return;
      }

      const ws = XLSX.utils.json_to_sheet(excelData);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Primeiros Cards A Fazer");

      const colWidths = [
        { wch: 20 },
        { wch: 20 },
        { wch: 18 },
        { wch: 50 },
        { wch: 40 },
        { wch: 12 }
      ];
      ws['!cols'] = colWidths;

      const teamNames = { "1": "SEG_QUA_SEX", "2": "TER_QUI_SAB", "3": "SEG_A_SEX" };
      const teamSuffix = selectedTeam ? `_${teamNames[selectedTeam as keyof typeof teamNames]}` : '';
      const fileName = `Primeiros_Cards_A_Fazer${teamSuffix}_${new Date().toLocaleDateString('pt-BR').replace(/\//g, '-')}.xlsx`;
      XLSX.writeFile(wb, fileName);

      toast({
        title: "Exportado com sucesso!",
        description: `${excelData.length} linhas foram exportadas para Excel.`,
      });
    } catch (error) {
      console.error("Error exporting to Excel:", error);
      toast({
        title: "Erro ao exportar",
        description: "Não foi possível exportar os dados para Excel.",
        variant: "destructive"
      });
    }
  };

  if (isLoadingClients) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

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
                  <CheckCircle2 className="mr-2 h-4 w-4" />
                  Mover para Concluídos
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                <DropdownMenuLabel>Por Equipe</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => handleBulkMoveToCompleted()}>
                  Todas as Equipes
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleBulkMoveToCompleted("1")}>
                  SEG, QUA E SEX
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleBulkMoveToCompleted("2")}>
                  TER, QUI E SÁB
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleBulkMoveToCompleted("3")}>
                  SEG A SEX
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline">
                  <ListTodo className="mr-2 h-4 w-4" />
                  Mover para A Fazer
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                <DropdownMenuLabel>Por Equipe</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => handleBulkMoveToTodo()}>
                  Todas as Equipes
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleBulkMoveToTodo("1")}>
                  SEG, QUA E SEX
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleBulkMoveToTodo("2")}>
                  TER, QUI E SÁB
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleBulkMoveToTodo("3")}>
                  SEG A SEX
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

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
