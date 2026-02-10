import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Users, Copy, Check, LogOut, Loader2, FileDown, CheckCircle2, Calendar, Power, PowerOff, Pencil, Search, FileX, Palette, Video } from "lucide-react";
import { ClientEditor } from "@/components/ClientEditor";
import { ClientDashboard } from "@/components/ClientDashboard";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import * as XLSX from 'xlsx';
import { supabase } from "@/integrations/supabase/client";
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
  bulkUpdateBriefDeadline
} from "@/lib/clientDatabase";

interface Client {
  id: string;
  name: string;
  email: string;
  company?: string;
  phone?: string;
  notes?: string;
  team?: string;
  slug: string;
  brand_kit?: any;
  projectCount: number;
  created_at: string;
  active?: boolean;
  payment_method?: "pix" | "credit_card";
  payment_due_day?: number;
  monthly_amount?: number;
  narration_type?: string;
  image_type?: string;
  particularity_type?: string;
  briefing?: string;
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
  const [searchQuery, setSearchQuery] = useState("");
  const [showOnlyWithoutText, setShowOnlyWithoutText] = useState(false);
  const [clientsWithoutText, setClientsWithoutText] = useState<Set<string>>(new Set());
  const [availableTeams, setAvailableTeams] = useState<{ id: string; name: string }[]>([]);
  const { toast } = useToast();
  const { user, signOut } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    loadClients();
    supabase.from("teams").select("*").order("created_at", { ascending: true }).then(({ data }) => {
      if (data) setAvailableTeams(data);
    });
  }, []);

  // Load clients without text in todo cards (optimized - handles 1000+ row limit)
  useEffect(() => {
    const checkClientsWithoutText = async () => {
      try {
        // Buscar TODOS os briefs todo paginando para evitar limite de 1000 linhas
        let allTodoBriefs: any[] = [];
        let page = 0;
        const pageSize = 1000;
        let hasMore = true;

        while (hasMore) {
          const from = page * pageSize;
          const to = from + pageSize - 1;
          const { data, error } = await supabase
            .from("project_briefs")
            .select("client_id, description")
            .eq("status", "todo")
            .range(from, to);

          if (error) {
            console.error("Error fetching briefs for filter:", error);
            return;
          }

          if (data && data.length > 0) {
            allTodoBriefs = allTodoBriefs.concat(data);
          }
          hasMore = (data?.length || 0) === pageSize;
          page++;
        }

        // Agrupar por client_id
        const briefsByClient = new Map<string, { hasText: boolean }>();
        allTodoBriefs.forEach((brief: any) => {
          const existing = briefsByClient.get(brief.client_id);
          const thisHasText = brief.description && brief.description.trim() !== "";
          if (existing) {
            if (thisHasText) existing.hasText = true;
          } else {
            briefsByClient.set(brief.client_id, { hasText: !!thisHasText });
          }
        });

        const clientsNoText = new Set<string>();
        for (const client of clients) {
          if (!client.active) continue;
          const clientBriefs = briefsByClient.get(client.id);
          // Cliente entra no filtro se:
          // 1. Não tem nenhum card "a fazer", OU
          // 2. Tem cards "a fazer" mas NENHUM deles tem texto na descrição
          if (!clientBriefs || !clientBriefs.hasText) {
            clientsNoText.add(client.id);
          }
        }
        setClientsWithoutText(clientsNoText);
      } catch (error) {
        console.error("Error checking clients without text:", error);
      }
    };

    if (clients.length > 0) {
      checkClientsWithoutText();
    }
  }, [clients]);

  // Filter clients based on search and filters
  const filteredClients = clients.filter(client => {
    const matchesSearch = searchQuery === "" || 
      (client.company?.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (client.name.toLowerCase().includes(searchQuery.toLowerCase()));
    
    const matchesTextFilter = !showOnlyWithoutText || clientsWithoutText.has(client.id);
    
    return matchesSearch && matchesTextFilter;
  });

  const loadClients = async (retryCount = 0) => {
    const maxRetries = 2;
    const timeoutMs = 30000; // 30s timeout

    const withTimeout = <T,>(promise: Promise<T>, ms: number) =>
      Promise.race([
        promise,
        new Promise<T>((_, reject) =>
          window.setTimeout(() => reject(new Error("timeout")), ms)
        ),
      ]);

    try {
      setIsLoadingClients(true);
      const data = await withTimeout(getAllClients(), timeoutMs);
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
        active: c.active !== false,
        payment_method: c.payment_method,
        payment_due_day: c.payment_due_day,
        monthly_amount: c.monthly_amount,
        narration_type: c.narration_type || "",
        image_type: c.image_type || "",
        particularity_type: c.particularity_type || "",
        briefing: c.briefing || "",
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
      // Auto-retry on timeout
      if (retryCount < maxRetries) {
        console.log(`Retrying loadClients (${retryCount + 1}/${maxRetries})...`);
        return loadClients(retryCount + 1);
      }
      toast({
        title: "Erro ao carregar clientes",
        description:
          error?.message === "timeout"
            ? "O carregamento demorou demais. Tente novamente em instantes."
            : "Não foi possível carregar a lista de clientes.",
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
          payment_method: clientData.payment_method,
          payment_due_day: clientData.payment_due_day,
          monthly_amount: clientData.monthly_amount,
          narration_type: clientData.narration_type,
          image_type: clientData.image_type,
          particularity_type: clientData.particularity_type,
          briefing: clientData.briefing,
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
          narration_type: clientData.narration_type,
          image_type: clientData.image_type,
          particularity_type: clientData.particularity_type,
          briefing: clientData.briefing,
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
        ? clients.filter(c => (c.team || "").toLowerCase() === team.toLowerCase() && c.active)
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
        ? clients.filter(c => (c.team || "").toLowerCase() === selectedTeamForDeadline.toLowerCase() && c.active)
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
      const splitRows: any[] = [];

      // 1) Usar mesma lógica do loadClients - getAllClients retorna todos, filtramos aqui
      const allDbClients = await getAllClients();
      
      // Filtrar clientes ativos (comparação case-insensitive para equipe)
      const dbClients = allDbClients.filter((c: any) => {
        const isActive = c.active !== false;
        if (selectedTeam) {
          return isActive && (c.team || "").toLowerCase() === selectedTeam.toLowerCase();
        }
        return isActive;
      });

      console.log("Export:", allDbClients.length, "total,", dbClients.length, "filtered");

      if (dbClients.length === 0) {
        toast({
          title: "Nenhum cliente encontrado",
          description: "Não há clientes ativos para exportar.",
          variant: "destructive"
        });
        return;
      }

      console.log("Export: found", dbClients.length, "active clients");

      // 2) Buscar TODOS os briefs "todo" de uma vez com paginação (mesma lógica do filtro que funciona)
      let allTodoBriefs: any[] = [];
      let page = 0;
      const pageSize = 1000;
      let hasMore = true;

      while (hasMore) {
        const from = page * pageSize;
        const to = from + pageSize - 1;
        const { data, error } = await supabase
          .from("project_briefs")
          .select("id, client_id, title, description, status, deadline, sort_order, created_at")
          .eq("status", "todo")
          .range(from, to);

        if (error) {
          console.error("Export: error fetching briefs page", page, error);
          toast({
            title: "Erro ao buscar cards",
            description: error.message,
            variant: "destructive"
          });
          return;
        }

        if (data && data.length > 0) {
          allTodoBriefs = allTodoBriefs.concat(data);
        }
        hasMore = (data?.length || 0) === pageSize;
        page++;
      }

      console.log("Export: found", allTodoBriefs.length, "todo briefs total");

      // 3) Agrupar por client_id e pegar o primeiro card (menor sort_order, depois created_at)
      // Ordenar os briefs por sort_order e created_at
      allTodoBriefs.sort((a: any, b: any) => {
        const sortA = a.sort_order || 0;
        const sortB = b.sort_order || 0;
        if (sortA !== sortB) return sortA - sortB;
        return new Date(a.created_at || 0).getTime() - new Date(b.created_at || 0).getTime();
      });

      const firstTodoByClient = new Map<string, any>();
      for (const brief of allTodoBriefs) {
        if (brief.client_id && !firstTodoByClient.has(brief.client_id)) {
          firstTodoByClient.set(brief.client_id, brief);
        }
      }

      console.log("Export: first todo by client count:", firstTodoByClient.size);

      // 4) Montar as linhas do Excel
      for (const client of dbClients) {
        const firstTodoCard = firstTodoByClient.get(client.id);
        
        if (firstTodoCard) {
          const slug = client.slug || generateSlug(client.company || client.name);
          const cardUrl = `${window.location.origin}/${slug}#card-${firstTodoCard.id}`;
          
          const teamName = client.team || "Sem equipe";
          
          const cardText = firstTodoCard.description || firstTodoCard.title;
          
          const baseRow = {
            "Cliente": client.name,
            "Empresa": client.company || "",
            "Equipe": teamName,
            "Tipo Narração": client.narration_type || "",
            "Tipo Imagem": client.image_type || "",
            "Particularidade": client.particularity_type || "",
            "Texto do Card": "",
            "Link do Card": cardUrl,
            "Prazo": firstTodoCard.deadline ? new Date(firstTodoCard.deadline).toLocaleDateString('pt-BR') : ""
          };
          
          if (cardText && cardText.includes(";")) {
            const textParts = cardText.split(";").map((part: string) => part.trim()).filter((part: string) => part.length > 0);
            textParts.forEach((part: string) => {
              splitRows.push({
                ...baseRow,
                "Texto do Card": part,
              });
            });
          } else {
            excelData.push({
              ...baseRow,
              "Texto do Card": cardText || "",
            });
          }
        }
      }

      const finalData = [...excelData, ...splitRows];

      console.log("Export: finalData rows:", finalData.length, "(normal:", excelData.length, "split:", splitRows.length, ")");

      if (finalData.length === 0) {
        toast({
          title: "Nenhum card encontrado",
          description: `Clientes: ${dbClients.length}, Briefs todo: ${allTodoBriefs.length}, Matches: ${firstTodoByClient.size}. Verifique os logs do console (F12).`,
          variant: "destructive"
        });
        return;
      }

      const ws = XLSX.utils.json_to_sheet(finalData);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Primeiros Cards A Fazer");

      const colWidths = [
        { wch: 20 },  // Cliente
        { wch: 20 },  // Empresa
        { wch: 18 },  // Equipe
        { wch: 18 },  // Tipo Narração
        { wch: 18 },  // Tipo Imagem
        { wch: 20 },  // Particularidade
        { wch: 50 },  // Texto do Card
        { wch: 40 },  // Link do Card
        { wch: 12 }   // Prazo
      ];
      ws['!cols'] = colWidths;

      const teamSuffix = selectedTeam ? `_${selectedTeam.replace(/[^a-zA-Z0-9]/g, '_')}` : '';
      const fileName = `Primeiros_Cards_A_Fazer${teamSuffix}_${new Date().toLocaleDateString('pt-BR').replace(/\//g, '-')}.xlsx`;
      XLSX.writeFile(wb, fileName);

      toast({
        title: "Exportado com sucesso!",
        description: `${finalData.length} linhas foram exportadas para Excel.`,
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
            <div className="flex justify-center gap-6 text-sm text-white/90 flex-wrap">
              {(() => {
                const teamCounts = new Map<string, number>();
                clients.filter(c => c.active).forEach(c => {
                  const t = c.team || "Sem equipe";
                  teamCounts.set(t, (teamCounts.get(t) || 0) + 1);
                });
                return Array.from(teamCounts.entries()).map(([team, count]) => (
                  <span key={team}>{team}: {count}</span>
                ));
              })()}
            </div>
          </div>
        </div>
      </div>

      {/* Header */}
      <div className="border-b bg-background/80 backdrop-blur-sm px-6 py-4">
        <div className="container mx-auto flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4">
          <h2 className="text-3xl font-bold gradient-text">Seus Clientes</h2>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={() => navigate("/master-art")}>
              <Palette className="mr-1 h-4 w-4" />
              Artes
            </Button>
            <Button size="sm" variant="outline" onClick={() => navigate("/master-video")}>
              <Video className="mr-1 h-4 w-4" />
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
                {availableTeams.map((team) => (
                  <DropdownMenuItem key={team.id} onClick={() => handleBulkMoveToCompleted(team.name)}>
                    {team.name}
                  </DropdownMenuItem>
                ))}
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
                <DropdownMenuSeparator />
                {availableTeams.map((team) => (
                  <DropdownMenuItem key={team.id} onClick={() => handleExportToExcel(team.name)}>
                    {team.name}
                  </DropdownMenuItem>
                ))}
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
                      {availableTeams.map((team) => (
                        <option key={team.id} value={team.name}>{team.name}</option>
                      ))}
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
            {/* Search and Filters */}
            <div className="space-y-2 mb-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Pesquisar empresa..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9 h-9"
                />
              </div>
              <button
                onClick={() => setShowOnlyWithoutText(!showOnlyWithoutText)}
                className={`w-full flex items-center gap-2 px-3 py-2 text-sm rounded-md transition-colors ${
                  showOnlyWithoutText 
                    ? 'bg-primary text-primary-foreground' 
                    : 'bg-muted hover:bg-muted/80 text-muted-foreground'
                }`}
              >
                <FileX className="h-4 w-4" />
                Sem texto para fazer
                {clientsWithoutText.size > 0 && (
                  <span className={`ml-auto px-2 py-0.5 rounded-full text-xs ${
                    showOnlyWithoutText 
                      ? 'bg-primary-foreground/20' 
                      : 'bg-primary/20 text-primary'
                  }`}>
                    {clientsWithoutText.size}
                  </span>
                )}
              </button>
            </div>
            <p className="text-sm text-muted-foreground px-3 mb-2">
              {filteredClients.length} de {clients.length} clientes
            </p>
            {filteredClients.length > 0 ? (
              filteredClients.map((client) => (
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
                      {client.team || "Sem equipe"}
                    </div>
                  )}
                </button>
              ))
            ) : (
              <div className="text-center p-8">
                <Users className="h-12 w-12 mx-auto mb-3 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">
                  {searchQuery || showOnlyWithoutText 
                    ? "Nenhum cliente encontrado com os filtros aplicados" 
                    : "Nenhum cliente cadastrado"}
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
