import { useState, useEffect, useMemo, useRef } from "react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  ArrowLeft,
  Trash2,
  Edit,
  Film,
  Image as ImageIcon,
  Loader2,
  Calendar,
  Search,
  Users,
  MessageSquareWarning,
  Send,
  CheckCircle,
  XCircle,
  Clock,
  Mail,
} from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { getBatchGenerations, getBatchById, deleteBatch, deleteBatchItem, BatchGeneration, BatchItem } from "@/lib/batchHistory";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

interface BatchHistoryProps {
  onBack: () => void;
  onEditBatch: (batch: BatchGeneration) => void | Promise<void>;
  filterType?: "art" | "video";
}

type TeamSendStatus = "pending" | "sending" | "sent" | "error";

interface TeamSendInfo {
  teamName: string;
  batchIds: string[]; // ALL batches for this team
  status: TeamSendStatus;
  errorMsg?: string;
  itemCount: number;
}

export const BatchHistory = ({ onBack, onEditBatch, filterType }: BatchHistoryProps) => {
  const [batches, setBatches] = useState<BatchGeneration[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadingEditId, setLoadingEditId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedBatchId, setExpandedBatchId] = useState<string | null>(null);
  const [expandedItems, setExpandedItems] = useState<BatchItem[]>([]);
  const [loadingItems, setLoadingItems] = useState(false);
  const [deletingItemIdx, setDeletingItemIdx] = useState<number | null>(null);

  // Send All Teams state
  const [showSendAllDialog, setShowSendAllDialog] = useState(false);
  const [sendSubject, setSendSubject] = useState("");
  const [teamSendList, setTeamSendList] = useState<TeamSendInfo[]>([]);
  const [isSendingAll, setIsSendingAll] = useState(false);
  const [sendingTeamSingle, setSendingTeamSingle] = useState<string | null>(null);
  const cancelRef = useRef(false);

  const { toast } = useToast();

  useEffect(() => {
    loadBatches();
  }, []);

  const loadBatches = async () => {
    setIsLoading(true);
    const data = await getBatchGenerations(filterType || "video");
    setBatches(data);
    setIsLoading(false);
  };

  const filteredBatches = useMemo(() => {
    if (!searchQuery.trim()) return batches;
    const q = searchQuery.toLowerCase();
    return batches.filter((batch) => {
      const snap = batch.template_snapshot as any;
      const teamName = snap?.teamFilter || "";
      const templateName = snap?.name || "";
      const dateStr = format(new Date(batch.created_at), "dd/MM/yyyy", { locale: ptBR });
      return (
        teamName.toLowerCase().includes(q) ||
        templateName.toLowerCase().includes(q) ||
        dateStr.includes(q)
      );
    });
  }, [batches, searchQuery]);

  // Get all unique teams from batches
  const teamBatches = useMemo(() => {
    const map = new Map<string, BatchGeneration[]>();
    for (const batch of batches) {
      const snap = batch.template_snapshot as any;
      const team = snap?.teamFilter || "Sem equipe";
      if (!map.has(team)) map.set(team, []);
      map.get(team)!.push(batch);
    }
    return map;
  }, [batches]);

  const handleToggleExpand = async (batchId: string) => {
    if (expandedBatchId === batchId) {
      setExpandedBatchId(null);
      setExpandedItems([]);
      return;
    }
    setExpandedBatchId(batchId);
    setLoadingItems(true);
    const batch = await getBatchById(batchId);
    setExpandedItems(batch?.items || []);
    setLoadingItems(false);
  };

  const handleDeleteItem = async (batchId: string, itemIndex: number) => {
    setDeletingItemIdx(itemIndex);
    const result = await deleteBatchItem(batchId, itemIndex);
    if (result.deleted) {
      if (result.batchEmpty) {
        setBatches((prev) => prev.filter((b) => b.id !== batchId));
        setExpandedBatchId(null);
        setExpandedItems([]);
        toast({ title: "Lote removido (estava vazio)" });
      } else {
        setExpandedItems((prev) => prev.filter((_, i) => i !== itemIndex));
        toast({ title: "Item removido do lote" });
      }
    } else {
      toast({ title: "Erro ao remover item", variant: "destructive" });
    }
    setDeletingItemIdx(null);
  };

  const handleEdit = async (batch: BatchGeneration) => {
    setLoadingEditId(batch.id);
    try {
      await onEditBatch(batch);
    } finally {
      setLoadingEditId(null);
    }
  };

  const handleDelete = async (id: string) => {
    setDeletingId(id);
    const success = await deleteBatch(id);
    if (success) {
      setBatches((prev) => prev.filter((b) => b.id !== id));
      if (expandedBatchId === id) {
        setExpandedBatchId(null);
        setExpandedItems([]);
      }
      toast({
        title: "Lote excluído",
        description: "O lote foi removido com sucesso.",
      });
    } else {
      toast({
        title: "Erro ao excluir",
        variant: "destructive",
      });
    }
    setDeletingId(null);
  };

  // ─── Send All Teams logic ─────────────────────────────────────────

  const openSendAllDialog = () => {
    const list: TeamSendInfo[] = [];
    for (const [teamName, teamBatchList] of teamBatches) {
      // Use the most recent batch for each team
      const latestBatch = teamBatchList[0]; // already sorted by created_at desc
      list.push({
        teamName,
        batchId: latestBatch.id,
        status: "pending",
        itemCount: 0, // will be loaded when sending
      });
    }
    // Sort by team name naturally
    list.sort((a, b) => a.teamName.localeCompare(b.teamName, undefined, { numeric: true }));
    setTeamSendList(list);
    setSendSubject("");
    cancelRef.current = false;
    setShowSendAllDialog(true);
  };

  const sendBatchEmail = async (
    batchId: string,
    subject: string,
    mediaType: "image" | "video"
  ): Promise<{ success: boolean; error?: string }> => {
    const batch = await getBatchById(batchId);
    if (!batch || !batch.items.length) {
      return { success: false, error: "Lote vazio" };
    }

    // Only send approved items
    const approvedItems = batch.items.filter(
      (item: any) => item.status === "approved"
    );
    if (approvedItems.length === 0) {
      // If no approval system, send all
      const itemsToSend = batch.items;
      return await sendItemsAsEmails(itemsToSend, subject, mediaType);
    }
    return await sendItemsAsEmails(approvedItems, subject, mediaType);
  };

  const sendItemsAsEmails = async (
    items: BatchItem[],
    subject: string,
    mediaType: "image" | "video"
  ): Promise<{ success: boolean; error?: string }> => {
    // Group items by clientId (carousel pages go in same email)
    const byClient = new Map<string, BatchItem[]>();
    for (const item of items) {
      const key = item.clientId;
      if (!byClient.has(key)) byClient.set(key, []);
      byClient.get(key)!.push(item);
    }

    for (const [clientId, clientItems] of byClient) {
      // Get client emails from DB
      const { data: client } = await supabase
        .from("client_data")
        .select("email, email_2, email_3, name, company")
        .eq("id", clientId)
        .maybeSingle();

      if (!client) continue;

      const emails = [client.email, client.email_2, client.email_3].filter(
        (e): e is string => !!e && e.includes("@")
      );

      if (emails.length === 0) continue;

      // Collect all file URLs (art images or video previews)
      const mediaUrls: string[] = [];
      for (const item of clientItems) {
        if (item.files && item.files.length > 0) {
          mediaUrls.push(...item.files.filter((f) => f && f.startsWith("http")));
        }
      }

      if (mediaUrls.length === 0) continue;

      const { error } = await supabase.functions.invoke("send-media-email", {
        body: {
          emails,
          subject: `${subject} - ${client.company || client.name}`,
          mediaUrls,
          mediaType,
          clientName: client.company || client.name,
        },
      });

      if (error) {
        return { success: false, error: error.message };
      }
    }

    return { success: true };
  };

  const handleSendAllTeams = async () => {
    if (!sendSubject.trim()) {
      toast({ title: "Digite o título do e-mail", variant: "destructive" });
      return;
    }

    setIsSendingAll(true);
    cancelRef.current = false;
    const mediaType = filterType === "video" ? "video" : "image";

    const updatedList = [...teamSendList];

    for (let i = 0; i < updatedList.length; i++) {
      if (cancelRef.current) break;
      if (updatedList[i].status === "sent") continue; // skip already sent

      updatedList[i] = { ...updatedList[i], status: "sending" };
      setTeamSendList([...updatedList]);

      const result = await sendBatchEmail(
        updatedList[i].batchId,
        sendSubject.trim(),
        mediaType as "image" | "video"
      );

      if (result.success) {
        updatedList[i] = { ...updatedList[i], status: "sent" };
      } else {
        updatedList[i] = {
          ...updatedList[i],
          status: "error",
          errorMsg: result.error,
        };
      }
      setTeamSendList([...updatedList]);
    }

    setIsSendingAll(false);

    const sentCount = updatedList.filter((t) => t.status === "sent").length;
    const errorCount = updatedList.filter((t) => t.status === "error").length;

    toast({
      title: `Envio concluído`,
      description: `${sentCount} equipe(s) enviada(s)${errorCount > 0 ? `, ${errorCount} com erro` : ""}`,
    });
  };

  const handleSendSingleTeam = async (index: number) => {
    if (!sendSubject.trim()) {
      toast({ title: "Digite o título do e-mail", variant: "destructive" });
      return;
    }

    const team = teamSendList[index];
    setSendingTeamSingle(team.teamName);
    const mediaType = filterType === "video" ? "video" : "image";

    const updatedList = [...teamSendList];
    updatedList[index] = { ...updatedList[index], status: "sending" };
    setTeamSendList(updatedList);

    const result = await sendBatchEmail(team.batchId, sendSubject.trim(), mediaType as "image" | "video");

    if (result.success) {
      updatedList[index] = { ...updatedList[index], status: "sent" };
    } else {
      updatedList[index] = { ...updatedList[index], status: "error", errorMsg: result.error };
    }
    setTeamSendList([...updatedList]);
    setSendingTeamSingle(null);
  };

  const statusIcon = (status: TeamSendStatus) => {
    switch (status) {
      case "pending":
        return <Clock className="h-4 w-4 text-muted-foreground" />;
      case "sending":
        return <Loader2 className="h-4 w-4 animate-spin text-primary" />;
      case "sent":
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case "error":
        return <XCircle className="h-4 w-4 text-destructive" />;
    }
  };

  // ─── Render ───────────────────────────────────────────────────────

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <div className="border-b bg-card px-4 py-3 flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button variant="outline" onClick={onBack}>
              <ArrowLeft className="mr-2 h-4 w-4" />
              Voltar
            </Button>
            <div>
              <h1 className="text-lg font-semibold">Histórico de {filterType === "art" ? "Artes" : "Vídeos"} em Lote</h1>
              <p className="text-sm text-muted-foreground">
                {filteredBatches.length} de {batches.length} lote(s)
              </p>
            </div>
          </div>
          {batches.length > 0 && (
            <Button onClick={openSendAllDialog} className="gap-2">
              <Mail className="h-4 w-4" />
              Enviar Todas Equipes
            </Button>
          )}
        </div>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por equipe, template ou data..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>
      </div>

      {/* Content */}
      <ScrollArea className="flex-1 px-4 py-4">
        {filteredBatches.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <p>{searchQuery ? "Nenhum resultado encontrado." : "Nenhum lote encontrado."}</p>
            <p className="text-sm mt-2">
              {searchQuery ? "Tente outro termo de busca." : "Gere vídeos em lote para ver o histórico aqui."}
            </p>
          </div>
        ) : (
          <div className="grid gap-4">
            {filteredBatches.map((batch) => {
              const snap = batch.template_snapshot as any;
              const teamName = snap?.teamFilter;
              const hasUnresolvedNotes = snap?.hasUnresolvedNotes === true;
              return (
              <div
                key={batch.id}
                className="bg-card border rounded-lg overflow-hidden"
              >
                <div className="p-4 flex gap-4">
                  {/* Icon */}
                  <div className="flex items-center shrink-0">
                    <div className="w-12 h-12 bg-muted rounded-lg flex items-center justify-center">
                      {batch.type === "art" ? <ImageIcon className="h-6 w-6 text-muted-foreground" /> : <Film className="h-6 w-6 text-muted-foreground" />}
                    </div>
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <Badge variant="secondary">
                        {batch.type === "art" ? <ImageIcon className="mr-1 h-3 w-3" /> : <Film className="mr-1 h-3 w-3" />}
                        {batch.type === "art" ? "Arte" : "Vídeo"}
                      </Badge>
                      {teamName && (
                        <Badge variant="outline" className="text-xs">
                          <Users className="mr-1 h-3 w-3" />
                          {teamName}
                        </Badge>
                      )}
                      {hasUnresolvedNotes && (
                        <Badge variant="destructive" className="text-xs">
                          <MessageSquareWarning className="mr-1 h-3 w-3" />
                          Anotações
                        </Badge>
                      )}
                      <span className="text-sm text-muted-foreground flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        {format(new Date(batch.created_at), "dd/MM/yyyy 'às' HH:mm", {
                          locale: ptBR,
                        })}
                      </span>
                    </div>

                    <p className="text-sm font-medium">
                      Template: {(batch.template_snapshot as any)?.name || "Sem nome"}
                    </p>
                  </div>

                  {/* Actions */}
                  <div className="flex gap-2 shrink-0">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleEdit(batch)}
                      disabled={loadingEditId === batch.id}
                    >
                      {loadingEditId === batch.id ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <Edit className="mr-2 h-4 w-4" />
                      )}
                      Editar
                    </Button>

                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={deletingId === batch.id}
                          className="text-destructive hover:text-destructive"
                        >
                          {deletingId === batch.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Trash2 className="h-4 w-4" />
                          )}
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Excluir lote?</AlertDialogTitle>
                          <AlertDialogDescription>
                            Isso vai apagar permanentemente este lote do banco de dados. Essa ação não pode ser desfeita.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancelar</AlertDialogCancel>
                          <AlertDialogAction onClick={() => handleDelete(batch.id)}>
                            Excluir
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </div>

                {/* Expanded items list */}
                {expandedBatchId === batch.id && (
                  <div className="border-t bg-muted/30 px-4 py-3">
                    {loadingItems ? (
                      <div className="flex items-center justify-center py-4">
                        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                      </div>
                    ) : expandedItems.length === 0 ? (
                      <p className="text-sm text-muted-foreground text-center py-2">Nenhum item neste lote.</p>
                    ) : (
                      <div className="grid gap-2">
                        {expandedItems.map((item, idx) => (
                          <div key={`${item.cardId}-${item.pageIndex ?? 0}-${idx}`} className="flex items-center gap-3 bg-card rounded-md p-2 border">
                            {/* Thumbnail */}
                            <div className="w-10 h-10 rounded bg-muted overflow-hidden shrink-0">
                              {item.files?.[0] ? (
                                <img src={item.files[0]} alt={item.clientName} className="w-full h-full object-cover" />
                              ) : (
                                <div className="w-full h-full flex items-center justify-center">
                                  <ImageIcon className="h-4 w-4 text-muted-foreground" />
                                </div>
                              )}
                            </div>
                            {/* Info */}
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium truncate">{item.company || item.clientName}</p>
                              <p className="text-xs text-muted-foreground truncate">{item.cardText}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
              );
            })}

          </div>
        )}
      </ScrollArea>

      {/* Send All Teams Dialog */}
      <Dialog open={showSendAllDialog} onOpenChange={(open) => {
        if (!isSendingAll) setShowSendAllDialog(open);
      }}>
        <DialogContent className="max-w-lg max-h-[80vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Mail className="h-5 w-5" />
              Enviar para Todas as Equipes
            </DialogTitle>
            <DialogDescription>
              Envie os e-mails de {filterType === "art" ? "artes" : "vídeos"} para todas as equipes de uma vez.
              Um único título será usado para todos.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 flex-1 overflow-hidden flex flex-col">
            {/* Subject input */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Título do E-mail</label>
              <Input
                placeholder="Ex: Post Março 2026"
                value={sendSubject}
                onChange={(e) => setSendSubject(e.target.value)}
                disabled={isSendingAll}
              />
            </div>

            {/* Team list */}
            <div className="text-sm font-medium">
              {teamSendList.length} equipe(s) • {teamSendList.filter(t => t.status === "sent").length} enviada(s)
            </div>
            <ScrollArea className="flex-1 min-h-0 max-h-[40vh]">
              <div className="space-y-2 pr-2">
                {teamSendList.map((team, idx) => (
                  <div
                    key={team.teamName}
                    className="flex items-center gap-3 p-3 rounded-lg border bg-card"
                  >
                    {statusIcon(team.status)}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{team.teamName}</p>
                      {team.status === "error" && team.errorMsg && (
                        <p className="text-xs text-destructive truncate">{team.errorMsg}</p>
                      )}
                    </div>
                    {team.status !== "sent" && team.status !== "sending" && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleSendSingleTeam(idx)}
                        disabled={isSendingAll || sendingTeamSingle !== null || !sendSubject.trim()}
                        className="shrink-0"
                      >
                        {sendingTeamSingle === team.teamName ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Send className="h-4 w-4" />
                        )}
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            </ScrollArea>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            {isSendingAll ? (
              <Button
                variant="destructive"
                onClick={() => { cancelRef.current = true; }}
              >
                Cancelar Envio
              </Button>
            ) : (
              <>
                <Button
                  variant="outline"
                  onClick={() => setShowSendAllDialog(false)}
                >
                  Fechar
                </Button>
                <Button
                  onClick={handleSendAllTeams}
                  disabled={!sendSubject.trim() || teamSendList.every(t => t.status === "sent")}
                  className="gap-2"
                >
                  <Send className="h-4 w-4" />
                  Enviar Todas ({teamSendList.filter(t => t.status !== "sent").length})
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
