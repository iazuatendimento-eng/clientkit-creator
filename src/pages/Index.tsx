import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Users, Copy, Check, LogOut, Loader2, FileDown, CheckCircle2, Calendar, Power, PowerOff, Pencil, Search, FileX, Palette, Video, History, Trash2, Mail, Sparkles, Layers } from "lucide-react";
import { ClientEditor } from "@/components/ClientEditor";
import { ClientDashboard } from "@/components/ClientDashboard";
import { QuickCreate } from "@/components/QuickCreate";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import * as XLSX from 'xlsx';
import { supabase } from "@/integrations/supabase/client";
import { DatabaseUsageBar } from "@/components/DatabaseUsageBar";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
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
  getClientWithBrandKit,
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
  email_2?: string;
  email_3?: string;
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

// Searchable client picker for Alteração dialog
const QuickCreateClientPicker = ({ clients, onSelect }: { clients: Client[]; onSelect: (id: string) => void }) => {
  const [search, setSearch] = useState("");
  const filtered = clients.filter(c => {
    const label = (c.company || c.name).toLowerCase();
    return label.includes(search.toLowerCase());
  });
  return (
    <div className="space-y-3 pt-2">
      <p className="text-sm text-muted-foreground">Selecione o cliente:</p>
      <Input
        placeholder="Buscar cliente..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        autoFocus
      />
      <div className="max-h-60 overflow-y-auto border rounded-md">
        {filtered.length === 0 ? (
          <p className="text-sm text-muted-foreground p-3 text-center">Nenhum cliente encontrado</p>
        ) : (
          filtered.map(c => (
            <button
              key={c.id}
              className="w-full text-left px-3 py-2 text-sm hover:bg-accent hover:text-accent-foreground transition-colors"
              onClick={() => onSelect(c.id)}
            >
              {c.company || c.name}
            </button>
          ))
        )}
      </div>
    </div>
  );
};

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
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isQuickCreateOpen, setIsQuickCreateOpen] = useState(false);
  const [quickCreateClientId, setQuickCreateClientId] = useState<string>("");
  const [quickCreateBrandKit, setQuickCreateBrandKit] = useState<any>(null);
  const [visibleCount, setVisibleCount] = useState(50);
  const { toast } = useToast();
  const { user, signOut } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    loadClients();
    supabase.from("teams").select("*").order("name", { ascending: true }).then(({ data }) => {
      if (data) setAvailableTeams(data.filter(t => /^T\d{4}/.test(t.name.trim())));
    });

  }, []);

  // Load clients without text in todo cards (deferred to avoid blocking initial render)
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
      // Defer this heavy query so it doesn't compete with initial client load
      const timer = window.setTimeout(checkClientsWithoutText, 1500);
      return () => window.clearTimeout(timer);
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

  // Reset visible count when filters change
  useEffect(() => {
    setVisibleCount(50);
  }, [searchQuery, showOnlyWithoutText]);

  const visibleClients = filteredClients.slice(0, visibleCount);
  const hasMoreClients = visibleCount < filteredClients.length;

  const [loadError, setLoadError] = useState(false);

  const loadClients = async (retryCount = 0) => {
    const maxRetries = 5;
    const timeoutMs = 30000;

    const withTimeout = <T,>(promise: Promise<T>, ms: number) =>
      Promise.race([
        promise,
        new Promise<T>((_, reject) =>
          window.setTimeout(() => reject(new Error("timeout")), ms)
        ),
      ]);

    const delay = (ms: number) => new Promise(r => window.setTimeout(r, ms));

    try {
      setIsLoadingClients(true);
      setLoadError(false);

      // Add increasing delay between retries to let DB wake up
      if (retryCount > 0) {
        await delay(Math.min(retryCount * 2000, 8000));
      }

      const data = await withTimeout(getAllClients(), timeoutMs);
      const mappedClients: Client[] = (data as any[]).map((c: any) => ({
        id: c.id,
        name: c.name,
        email: c.email,
        email_2: c.email_2 || "",
        email_3: c.email_3 || "",
        company: c.company,
        phone: c.phone,
        notes: c.notes,
        team: (c.team || "").trim(),
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

      mappedClients.sort((a, b) => {
        return (a.name || "").localeCompare(b.name || "", 'pt-BR', { numeric: true });
      });

      setClients(mappedClients);
      setLoadError(false);
    } catch (error: any) {
      console.error("Error loading clients:", error);
      if (retryCount < maxRetries) {
        console.log(`Retrying loadClients (${retryCount + 1}/${maxRetries})...`);
        return loadClients(retryCount + 1);
      }
      setLoadError(true);
      toast({
        title: "Erro ao carregar clientes",
        description:
          error?.message === "timeout"
            ? "O banco demorou para responder. Clique em 'Tentar novamente'."
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
      const normalizedEmail = (clientData.email || "").trim();
      const normalizedEmail2 = (clientData.email_2 || "").trim();
      const normalizedEmail3 = (clientData.email_3 || "").trim();
      const rawTeam = (clientData.team || "").trim();
      const matchedTeam = availableTeams.find((t) => t.name.toLowerCase() === rawTeam.toLowerCase())?.name;
      const normalizedTeam = matchedTeam || rawTeam;
      
      if (clientData.id && clients.find(c => c.id === clientData.id)) {
        await updateClient(clientData.id, {
          name: clientData.name,
          email: normalizedEmail,
          email_2: normalizedEmail2 || null,
          email_3: normalizedEmail3 || null,
          company: clientData.company,
          phone: clientData.phone,
          notes: clientData.notes,
          team: normalizedTeam,
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
          email: normalizedEmail,
          email_2: normalizedEmail2 || null,
          email_3: normalizedEmail3 || null,
          company: clientData.company,
          phone: clientData.phone,
          notes: clientData.notes,
          team: normalizedTeam,
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
    setIsDeleting(true);
    try {
      await deleteClient(id);
      if (selectedClient?.id === id) {
        setSelectedClient(null);
        setCurrentView("dashboard");
      }
      await loadClients();
      toast({
        title: "Cliente excluído!",
        description: "O cliente e todos os dados relacionados foram removidos permanentemente.",
      });
    } catch (error) {
      console.error("Error deleting client:", error);
      toast({
        title: "Erro ao excluir cliente",
        description: "Não foi possível excluir o cliente.",
        variant: "destructive",
      });
    } finally {
      setIsDeleting(false);
      setDeleteConfirmId(null);
    }
  };

  const handleUpdateClient = async (updatedClient: Client) => {
    await loadClients();
    // Re-fetch full client with brand_kit (excluded from listing for performance)
    try {
      const fullClient = await getClientWithBrandKit(updatedClient.id);
      if (fullClient) {
        setSelectedClient({
          ...updatedClient,
          brand_kit: fullClient.brand_kit,
        });
        return;
      }
    } catch (e) {
      console.error("Error re-fetching client with brand_kit:", e);
    }
    setSelectedClient(updatedClient);
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
  const handleExportToExcel = async (selectedTeam?: string, exportType: 'arte' | 'video' = 'video') => {
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
            "E-mail": client.email || "",
            "E-mail 2": client.email_2 || "",
            "E-mail 3": client.email_3 || "",
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

      // Numerar arquivos
      let fileCounter = 1;
      for (const row of excelData) {
        row["Nome do Arquivo"] = String(fileCounter);
        fileCounter++;
      }
      // splitRows: for arte each page gets its own number; for video carousel pages share a number
      if (exportType === 'arte') {
        for (const row of splitRows) {
          row["Nome do Arquivo"] = String(fileCounter);
          fileCounter++;
        }
      } else {
        let i = 0;
        while (i < splitRows.length) {
          const currentLink = splitRows[i]["Link do Card"];
          const num = fileCounter;
          while (i < splitRows.length && splitRows[i]["Link do Card"] === currentLink) {
            splitRows[i]["Nome do Arquivo"] = String(num);
            i++;
          }
          fileCounter++;
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
      const typeSuffix = exportType === 'arte' ? '_ARTE' : '_VIDEO';
      const fileName = `Primeiros_Cards_A_Fazer${teamSuffix}${typeSuffix}_${new Date().toLocaleDateString('pt-BR').replace(/\//g, '-')}.xlsx`;
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
      <div className="min-h-screen flex flex-col items-center justify-center gap-4">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="text-muted-foreground text-sm">Conectando ao banco de dados...</p>
      </div>
    );
  }

  if (loadError && clients.length === 0) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4">
        <p className="text-destructive font-semibold">Falha ao carregar clientes</p>
        <p className="text-muted-foreground text-sm">O banco de dados demorou para responder.</p>
        <Button onClick={() => loadClients()} variant="default">
          Tentar novamente
        </Button>
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
                return Array.from(teamCounts.entries())
                  .sort((a, b) => a[0].localeCompare(b[0], "pt-BR", { numeric: true }))
                  .map(([team, count]) => (
                  <span key={team}>{team}: {count}</span>
                ));
              })()}
            </div>
          </div>
        </div>
      </div>

      {/* Header */}
      <div className="border-b bg-background/80 backdrop-blur-sm px-6 py-4">
        <div className="container mx-auto flex items-center gap-4">
          <h2 className="text-3xl font-bold gradient-text whitespace-nowrap">Seus Clientes</h2>
          <div className="flex flex-nowrap gap-1.5 items-center flex-1 justify-end">
            <Dialog>
              <DialogTrigger asChild>
                <Button size="sm" variant="outline" className="px-2">
                  <FileDown className="h-4 w-4 mr-1" />
                  Exportar
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-xs">
                <DialogHeader>
                  <DialogTitle>Exportar Excel</DialogTitle>
                </DialogHeader>
                <div className="space-y-3 pt-2">
                  <p className="text-sm text-muted-foreground">Escolha o tipo de exportação:</p>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="outline" className="w-full justify-start">
                        <Palette className="h-4 w-4 mr-2" />
                        Exportar Arte
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent className="max-h-60 overflow-y-auto">
                      <DropdownMenuItem onClick={() => handleExportToExcel(undefined, 'arte')}>Todos</DropdownMenuItem>
                      {availableTeams.map(t => (
                        <DropdownMenuItem key={`arte-${t.id}`} onClick={() => handleExportToExcel(t.name, 'arte')}>{t.name}</DropdownMenuItem>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="outline" className="w-full justify-start">
                        <Video className="h-4 w-4 mr-2" />
                        Exportar Vídeo
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent className="max-h-60 overflow-y-auto">
                      <DropdownMenuItem onClick={() => handleExportToExcel(undefined, 'video')}>Todos</DropdownMenuItem>
                      {availableTeams.map(t => (
                        <DropdownMenuItem key={`video-${t.id}`} onClick={() => handleExportToExcel(t.name, 'video')}>{t.name}</DropdownMenuItem>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </DialogContent>
            </Dialog>
            <Button size="sm" variant="outline" onClick={() => setIsDeadlineDialogOpen(true)}>
              <Calendar className="mr-1 h-4 w-4" />
              Prazo
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="sm" variant="outline">
                  <CheckCircle2 className="mr-1 h-4 w-4" />
                  Concluir
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                <DropdownMenuItem onClick={() => handleBulkMoveToCompleted()}>Todos</DropdownMenuItem>
                {availableTeams.map(t => (
                  <DropdownMenuItem key={t.id} onClick={() => handleBulkMoveToCompleted(t.name)}>{t.name}</DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
            <Dialog>
              <DialogTrigger asChild>
                <Button size="sm" variant="outline">
                  <Layers className="mr-1 h-4 w-4" />
                  Gerar
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-xs">
                <DialogHeader>
                  <DialogTitle>Gerar Lote</DialogTitle>
                </DialogHeader>
                <div className="space-y-3 pt-2">
                  <p className="text-sm text-muted-foreground">Escolha o tipo de geração:</p>
                  <Button variant="outline" className="w-full justify-start" onClick={() => navigate("/master-art")}>
                    <Palette className="h-4 w-4 mr-2" />
                    Gerar Lote de Artes
                  </Button>
                  <Button variant="outline" className="w-full justify-start" onClick={() => navigate("/master-video")}>
                    <Video className="h-4 w-4 mr-2" />
                    Gerar Lote de Vídeos
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
            <Dialog>
              <DialogTrigger asChild>
                <Button size="sm" variant="outline">
                  <History className="mr-1 h-4 w-4" />
                  Histórico
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-xs">
                <DialogHeader>
                  <DialogTitle>Histórico de Lotes</DialogTitle>
                </DialogHeader>
                <div className="space-y-3 pt-2">
                  <Button variant="outline" className="w-full justify-start" onClick={() => navigate("/batch-history?type=art")}>
                    <Palette className="h-4 w-4 mr-2" />
                    Histórico de Artes
                  </Button>
                  <Button variant="outline" className="w-full justify-start" onClick={() => navigate("/batch-history?type=video")}>
                    <Video className="h-4 w-4 mr-2" />
                    Histórico de Vídeos
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
            <Button size="sm" variant="outline" onClick={() => navigate("/send-media")}>
              <Mail className="mr-1 h-4 w-4" />
              Enviar
            </Button>
            <Button size="sm" variant="outline" onClick={() => setIsQuickCreateOpen(true)}>
              <Sparkles className="mr-1 h-4 w-4" />
              Alteração
            </Button>

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
        <div className="w-80 border-r bg-card/50 overflow-y-auto" onScroll={(e) => {
          const el = e.currentTarget;
          if (hasMoreClients && el.scrollTop + el.clientHeight >= el.scrollHeight - 200) {
            setVisibleCount(prev => prev + 50);
          }
        }}>
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
              <Button
                variant={showOnlyWithoutText ? "default" : "outline"}
                size="sm"
                onClick={() => setShowOnlyWithoutText(!showOnlyWithoutText)}
                className="w-full h-9"
                title="Sem texto para fazer"
              >
                <FileX className="h-4 w-4 mr-2" />
                Sem texto para fazer
              </Button>
            </div>
            <p className="text-sm text-muted-foreground px-3 mb-2">
              {filteredClients.length} de {clients.length} clientes
            </p>
            {visibleClients.length > 0 ? (
              <>
              {visibleClients.map((client) => (
                <button
                  key={client.id}
                  onClick={async () => {
                    // Load brand_kit on demand (it's excluded from listing for performance)
                    try {
                      const fullClient = await getClientWithBrandKit(client.id);
                      const clientWithBrandKit = {
                        ...client,
                        brand_kit: fullClient?.brand_kit || null,
                      };
                      setSelectedClient(clientWithBrandKit);
                    } catch {
                      setSelectedClient(client);
                    }
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
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      <div className="font-semibold line-clamp-2">{client.name}</div>
                      {!client.active && (
                        <span className="text-xs px-2 py-0.5 rounded bg-red-500/20 text-red-500">
                          Inativa
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                      onClick={async (e) => {
                          e.stopPropagation();
                          // Load full client data for editing (including brand_kit, email_2, email_3)
                          try {
                            const fullClient = await getClientWithBrandKit(client.id);
                            if (fullClient) {
                              setEditingClient({ ...client, ...fullClient, projectCount: client.projectCount || 0, payment_method: fullClient.payment_method as "pix" | "credit_card" | undefined });
                            } else {
                              setEditingClient(client);
                            }
                          } catch {
                            setEditingClient(client);
                          }
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
                          setDeleteConfirmId(client.id);
                        }}
                        className={`p-1 rounded transition-colors ${
                          selectedClient?.id === client.id
                            ? 'hover:bg-primary-foreground/20'
                            : 'hover:bg-muted'
                        }`}
                        title="Excluir cliente permanentemente"
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </button>
                    </div>
                  </div>
                </button>
              ))
              {hasMoreClients && (
                <div className="text-center py-3">
                  <p className="text-xs text-muted-foreground">Rolando para carregar mais...</p>
                </div>
              )}
              </>
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

      {/* Deadline Dialog */}
      <Dialog open={isDeadlineDialogOpen} onOpenChange={setIsDeadlineDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Definir Prazo em Massa</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Data do Prazo</label>
              <Input
                type="date"
                value={bulkDeadline}
                onChange={(e) => setBulkDeadline(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Equipe (opcional)</label>
              <select
                value={selectedTeamForDeadline || ""}
                onChange={(e) => setSelectedTeamForDeadline(e.target.value || undefined)}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                <option value="">Todas as equipes</option>
                {availableTeams.map(t => (
                  <option key={t.id} value={t.name}>{t.name}</option>
                ))}
              </select>
            </div>
            <Button onClick={handleBulkUpdateDeadline} className="w-full">
              Aplicar Prazo
            </Button>
          </div>
        </DialogContent>
      </Dialog>
      <AlertDialog open={!!deleteConfirmId} onOpenChange={(open) => !open && setDeleteConfirmId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir cliente permanentemente?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação não pode ser desfeita. Todos os dados relacionados a este cliente serão removidos permanentemente: cards, arquivos enviados, pagamentos e artes finalizadas.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteConfirmId && handleDeleteClient(deleteConfirmId)}
              disabled={isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Excluir Permanentemente
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Quick Create / Alteração Dialog */}
      <Dialog open={isQuickCreateOpen} onOpenChange={(open) => { setIsQuickCreateOpen(open); if (!open) { setQuickCreateClientId(""); setQuickCreateBrandKit(null); } }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Alteração</DialogTitle>
          </DialogHeader>
          {!quickCreateClientId ? (
            <QuickCreateClientPicker
              clients={clients.filter(c => c.active)}
              onSelect={async (id) => {
                setQuickCreateClientId(id);
                try {
                  const fullClient = await getClientWithBrandKit(id);
                  if (fullClient?.brand_kit) {
                    setQuickCreateBrandKit(fullClient.brand_kit);
                  }
                } catch (e) {
                  console.error("Error loading brand kit for QuickCreate:", e);
                }
              }}
            />
          ) : (
            <QuickCreate
              clientId={quickCreateClientId}
              clientName={clients.find(c => c.id === quickCreateClientId)?.company || clients.find(c => c.id === quickCreateClientId)?.name || ""}
              brandKit={quickCreateBrandKit}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Index;
