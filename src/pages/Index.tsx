import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Users, Copy, Check, LogOut, Loader2, FileDown, CheckCircle2, Calendar, Power, PowerOff, Pencil, Palette, Film } from "lucide-react";
import { ClientEditor } from "@/components/ClientEditor";
import { ClientDashboard } from "@/components/ClientDashboard";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import * as XLSX from 'xlsx';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
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
  bulkUpdateBriefDeadline,
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
  active?: boolean;
  payment_method?: "pix" | "credit_card";
  payment_due_day?: number;
  monthly_amount?: number;
}

const Index = () => {
  const [currentView, setCurrentView] = useState<"dashboard" | "client-editor" | "client-dashboard">("dashboard");
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [editingClient, setEditingClient] = useState<Client | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [clients, setClients] = useState<Client[]>([]);
  const [isLoadingClients, setIsLoadingClients] = useState(true);
  const [isDeadlineDialogOpen, setIsDeadlineDialogOpen] = useState(false);
  const [bulkDeadline, setBulkDeadline] = useState("");
  const [selectedTeamForDeadline, setSelectedTeamForDeadline] = useState<string | undefined>();
  const { toast } = useToast();
  const { user, signOut } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    loadClients();
  }, []);

  const loadClients = async () => {
    const withTimeout = <T,>(promise: Promise<T>, ms: number) =>
      Promise.race([
        promise,
        new Promise<T>((_, reject) =>
          window.setTimeout(() => reject(new Error("timeout")), ms)
        ),
      ]);

    try {
      setIsLoadingClients(true);
      const data = await withTimeout(getAllClients(), 15000);
      const mappedClients: Client[] = (data as any[]).map((c: any) => ({
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
        active: c.active !== false, // Default to true if not set
        payment_method: c.payment_method,
        payment_due_day: c.payment_due_day,
        monthly_amount: c.monthly_amount,
      }));

      // Sort: active clients first, then by creation date
      mappedClients.sort((a, b) => {
        if (a.active === b.active) {
          return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
        }
        return a.active ? -1 : 1;
      });

      setClients(mappedClients);
    } catch (error: any) {
      console.error("Error loading clients:", error);
      toast({
        title: "Erro ao carregar clientes",
        description:
          error?.message === "timeout"
            ? "O carregamento demorou demais. Tente novamente em instantes."
            : "Não foi possível carregar a lista de clientes.",
        variant: "destructive",
      });
      setClients([]);
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
          payment_method: clientData.payment_method,
          payment_due_day: clientData.payment_due_day,
          monthly_amount: clientData.monthly_amount,
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
          payment_method: clientData.payment_method,
          payment_due_day: clientData.payment_due_day,
          monthly_amount: clientData.monthly_amount,
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

  const handleToggleClientActive = async (clientId: string, currentActive: boolean) => {
    try {
      await updateClient(clientId, { active: !currentActive });
      await loadClients();
      toast({
        title: !currentActive ? "Cliente ativado!" : "Cliente inativado!",
        description: !currentActive 
          ? "O cliente foi ativado e pode ter ações executadas." 
          : "O cliente foi inativado e não pode ter novas ações.",
      });
    } catch (error) {
      console.error("Error toggling client active status:", error);
      toast({
        title: "Erro ao alterar status",
        description: "Não foi possível alterar o status do cliente.",
        variant: "destructive",
      });
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
      const filteredClients = (team 
        ? clients.filter(c => c.team === team && c.active)
        : clients.filter(c => c.active));
      
      const clientIds = filteredClients.map(c => c.id);
      
      if (clientIds.length === 0) {
        toast({
          title: "Nenhum cliente ativo",
          description: "Não há clientes ativos para mover.",
          variant: "destructive",
        });
        return;
      }
      
      await bulkUpdateBriefStatus(clientIds, "completed");
      
      // Dispatch event to notify all ProjectBoard instances to reload
      window.dispatchEvent(new Event("bulkBriefsUpdated"));
      
      toast({
        title: "Cards movidos!",
        description: `Primeiro card de ${clientIds.length} ${clientIds.length === 1 ? 'cliente ativo' : 'clientes ativos'} movido para Concluídos.`,
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

  const handleBulkUpdateDeadline = async () => {
    if (!bulkDeadline) {
      toast({
        title: "Data obrigatória",
        description: "Por favor, selecione uma data.",
        variant: "destructive",
      });
      return;
    }

    try {
      const filteredClients = (selectedTeamForDeadline 
        ? clients.filter(c => c.team === selectedTeamForDeadline && c.active)
        : clients.filter(c => c.active));
      
      const clientIds = filteredClients.map(c => c.id);
      
      if (clientIds.length === 0) {
        toast({
          title: "Nenhum cliente ativo",
          description: "Não há clientes ativos para definir prazo.",
          variant: "destructive",
        });
        return;
      }
      
      await bulkUpdateBriefDeadline(clientIds, bulkDeadline);
      
      // Dispatch event to notify all ProjectBoard instances to reload
      window.dispatchEvent(new Event("bulkBriefsUpdated"));
      
      setIsDeadlineDialogOpen(false);
      setBulkDeadline("");
      setSelectedTeamForDeadline(undefined);
      
      toast({
        title: "Prazos atualizados!",
        description: `Prazo definido para ${clientIds.length} primeiros cards de clientes ativos.`,
      });
    } catch (error) {
      console.error("Error updating deadlines:", error);
      toast({
        title: "Erro ao atualizar prazos",
        description: "Não foi possível atualizar os prazos.",
        variant: "destructive",
      });
    }
  };
  const handleExportToExcel = async (selectedTeam?: string) => {
    try {
      const excelData: any[] = [];

      const filteredClients = (selectedTeam 
        ? clients.filter(c => c.team === selectedTeam && c.active)
        : clients.filter(c => c.active));

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
              textParts.forEach((part) => {
                excelData.push({
                  "Cliente": client.name,
                  "Empresa": client.company || "",
                  "Equipe": teamName,
                  "Texto do Card": part,
                  "Link do Card": cardUrl,
                  "Prazo": firstTodoCard.deadline ? new Date(firstTodoCard.deadline).toLocaleDateString('pt-BR') : ""
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
          <div className="text-center space-y-2">
            <h1 className="text-2xl font-bold text-white">
              Total: {clients.filter(c => c.active).length} {clients.filter(c => c.active).length === 1 ? 'empresa ativa' : 'empresas ativas'}
            </h1>
            <div className="flex justify-center gap-6 text-sm text-white/90">
              <span>SEG, QUA E SEX: {clients.filter(c => c.active && c.team === "1").length}</span>
              <span>TER, QUI E SÁB: {clients.filter(c => c.active && c.team === "2").length}</span>
              <span>SEG A SEX: {clients.filter(c => c.active && c.team === "3").length}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Header */}
      <div className="border-b bg-background/80 backdrop-blur-sm px-6 py-4">
        <div className="container mx-auto flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4">
          <h2 className="text-3xl font-bold gradient-text">Seus Clientes</h2>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" className="bg-gradient-primary" onClick={() => navigate("/master-art")}>
              <Palette className="mr-1 h-4 w-4" />
              Artes
            </Button>
            <Button size="sm" className="bg-gradient-primary" onClick={() => navigate("/master-video")}>
              <Film className="mr-1 h-4 w-4" />
              Vídeos
            </Button>
            <Button size="sm" variant="outline" onClick={() => navigate("/receivables")}>
              <FileDown className="mr-1 h-4 w-4" />
              Recebimentos
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="sm" variant="outline">
                  <CheckCircle2 className="mr-1 h-4 w-4" />
                  Concluir
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
                <Button size="sm" variant="outline">
                  <FileDown className="mr-1 h-4 w-4" />
                  Exportar
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
            
            <Dialog open={isDeadlineDialogOpen} onOpenChange={setIsDeadlineDialogOpen}>
              <DialogTrigger asChild>
                <Button size="sm" variant="outline">
                  <Calendar className="mr-1 h-4 w-4" />
                  Prazo
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-md">
                <DialogHeader>
                  <DialogTitle>Definir Prazo em Massa</DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                  <div>
                    <label className="text-sm font-medium mb-2 block">Data do Prazo</label>
                    <Input
                      type="date"
                      value={bulkDeadline}
                      onChange={(e) => setBulkDeadline(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium mb-2 block">Equipe</label>
                    <select
                      className="w-full p-2 border rounded-md bg-background"
                      value={selectedTeamForDeadline || ""}
                      onChange={(e) => setSelectedTeamForDeadline(e.target.value || undefined)}
                    >
                      <option value="">Todas as Equipes</option>
                      <option value="1">SEG, QUA E SEX</option>
                      <option value="2">TER, QUI E SÁB</option>
                      <option value="3">SEG A SEX</option>
                    </select>
                  </div>
                  <Button onClick={handleBulkUpdateDeadline} className="w-full">
                    Aplicar Prazo
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
            
            <Button
              size="sm"
              variant="outline"
              onClick={async () => {
                await signOut();
                navigate("/auth");
              }}
            >
              <LogOut className="h-4 w-4" />
            </Button>
            <Button
              size="sm"
              variant="gradient"
              onClick={() => {
                setEditingClient(null);
                setCurrentView("client-editor");
              }}
              className="glow-effect"
            >
              <Plus className="mr-1 h-4 w-4" />
              Novo
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
                    !client.active ? 'opacity-60' : ''
                  } ${
                    selectedClient?.id === client.id
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-card hover:bg-card/80 border border-border'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2">
                      <div className="font-semibold">{client.name}</div>
                      {!client.active && (
                        <span className="text-xs px-2 py-0.5 rounded bg-red-500/20 text-red-500">
                          Inativa
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setEditingClient(client);
                          setCurrentView("client-editor");
                        }}
                        className={`p-1 rounded transition-colors ${
                          selectedClient?.id === client.id
                            ? 'hover:bg-primary-foreground/20'
                            : 'hover:bg-muted'
                        }`}
                        title="Editar cliente"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleToggleClientActive(client.id, client.active !== false);
                        }}
                        className={`p-1 rounded transition-colors ${
                          selectedClient?.id === client.id
                            ? 'hover:bg-primary-foreground/20'
                            : 'hover:bg-muted'
                        }`}
                        title={client.active ? "Inativar empresa" : "Ativar empresa"}
                      >
                        {client.active ? (
                          <Power className="h-4 w-4" />
                        ) : (
                          <PowerOff className="h-4 w-4" />
                        )}
                      </button>
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
