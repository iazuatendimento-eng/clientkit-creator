import { useState, useEffect, useMemo } from "react";
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
import { useToast } from "@/hooks/use-toast";
import { getBatchGenerations, getBatchById, deleteBatch, BatchGeneration } from "@/lib/batchHistory";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

interface BatchHistoryProps {
  onBack: () => void;
  onEditBatch: (batch: BatchGeneration) => void;
  filterType?: "art" | "video";
}

export const BatchHistory = ({ onBack, onEditBatch, filterType }: BatchHistoryProps) => {
  const [batches, setBatches] = useState<BatchGeneration[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadingEditId, setLoadingEditId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const { toast } = useToast();

  useEffect(() => {
    loadBatches();
  }, []);

  const loadBatches = async () => {
    setIsLoading(true);
    // Only fetch video batches
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

  const handleEdit = (batch: BatchGeneration) => {
    // Pass lightweight batch immediately — the generator will fetch items lazily
    onEditBatch(batch);
  };

  const handleDelete = async (id: string) => {
    setDeletingId(id);
    const success = await deleteBatch(id);
    if (success) {
      setBatches((prev) => prev.filter((b) => b.id !== id));
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
                className="bg-card border rounded-lg p-4 flex gap-4"
              >
                {/* Icon */}
                <div className="flex items-center shrink-0">
                  <div className="w-12 h-12 bg-muted rounded-lg flex items-center justify-center">
                    <Film className="h-6 w-6 text-muted-foreground" />
                  </div>
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <Badge variant="secondary">
                      <Film className="mr-1 h-3 w-3" />
                      Vídeo
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
                      >
                        {deletingId === batch.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Trash2 className="h-4 w-4 text-destructive" />
                        )}
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Excluir lote?</AlertDialogTitle>
                        <AlertDialogDescription>
                          Esta ação não pode ser desfeita. O histórico deste lote
                          será removido permanentemente.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                        <AlertDialogAction
                          onClick={() => handleDelete(batch.id)}
                          className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        >
                          Excluir
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              </div>
              );
            })}

          </div>
        )}
      </ScrollArea>
    </div>
  );
};
