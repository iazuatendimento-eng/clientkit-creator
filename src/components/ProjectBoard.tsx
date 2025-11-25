import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
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
import { Badge } from "@/components/ui/badge";
import { Plus, Calendar, User, FileText, Trash2, Edit, Upload } from "lucide-react";
import { CardDetailModal } from "@/components/CardDetailModal";
import { toast } from "sonner";
import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  useDroppable,
} from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

interface ProjectBrief {
  id: string;
  clientName: string;
  title: string;
  description: string;
  deadline: string;
  status: "todo" | "in-progress" | "completed";
  brandKitId?: string;
  createdAt: string;
  type?: "art" | "video";
  coverImage?: string;
  coverVideo?: string;
}

interface ProjectBoardProps {
  brandKits: any[];
  onCreateProject: (brief: ProjectBrief, brandKitId: string) => void;
  clientName?: string;
}

interface SortableCardProps {
  brief: ProjectBrief;
  brandKit: any;
  columns: any[];
  onEdit: (brief: ProjectBrief) => void;
  onDelete: (id: string) => void;
  onStatusChange: (briefId: string, newStatus: string) => void;
  onCreateProject: (brief: ProjectBrief) => void;
}

const SortableCard = ({ brief, brandKit, columns, onEdit, onDelete, onStatusChange, onCreateProject }: SortableCardProps) => {
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [localCoverImage, setLocalCoverImage] = useState(brief.coverImage);
  const [localCoverVideo, setLocalCoverVideo] = useState(brief.coverVideo);
  
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: brief.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const handleCoverUpdate = (coverUrl: string, isVideo?: boolean) => {
    if (isVideo) {
      setLocalCoverVideo(coverUrl);
      setLocalCoverImage(undefined);
      brief.coverVideo = coverUrl;
      brief.coverImage = undefined;
    } else {
      setLocalCoverImage(coverUrl);
      setLocalCoverVideo(undefined);
      brief.coverImage = coverUrl;
      brief.coverVideo = undefined;
    }
  };

  return (
    <Card
      ref={setNodeRef}
      style={style}
      className="bg-gradient-card border-primary/20 hover:border-primary/40 transition-all duration-300 cursor-move overflow-hidden"
      {...attributes}
      {...listeners}
    >
      {/* Cover Media */}
      {localCoverVideo ? (
        <div className="w-full h-32 relative bg-muted">
          <video 
            src={localCoverVideo} 
            className="w-full h-full object-cover"
            autoPlay
            muted
            loop
            playsInline
          />
        </div>
      ) : localCoverImage ? (
        <div className="w-full h-32 relative bg-muted">
          <img 
            src={localCoverImage} 
            alt="Cover" 
            className="w-full h-full object-cover"
          />
        </div>
      ) : null}

      <CardHeader className="pb-2">
        <div className="flex justify-between items-start">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <User className="h-3 w-3 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">{brief.clientName}</span>
            </div>
            <h4 className="font-semibold text-sm">{brief.title}</h4>
          </div>
          <div className="flex gap-1">
            <Button
              variant="ghost"
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                onEdit(brief);
              }}
              className="h-6 w-6 p-0"
            >
              <Edit className="h-3 w-3" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                onDelete(brief.id);
              }}
              className="h-6 w-6 p-0 text-red-500 hover:text-red-700"
            >
              <Trash2 className="h-3 w-3" />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        <p className="text-xs text-muted-foreground mb-3 line-clamp-2">
          {brief.description}
        </p>
        
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-xs">
            <Calendar className="h-3 w-3" />
            <span>{new Date(brief.deadline).toLocaleDateString('pt-BR')}</span>
          </div>
          
          {brandKit && (
            <div className="flex items-center gap-2">
              <div className="flex gap-1">
                {brandKit.colors.slice(0, 3).map((color: string, index: number) => (
                  <div
                    key={index}
                    className="w-3 h-3 rounded-full border border-white/20"
                    style={{ backgroundColor: color }}
                  />
                ))}
              </div>
              <span className="text-xs text-muted-foreground">{brandKit.name}</span>
            </div>
          )}
          
          <div className="flex flex-col gap-2 mt-2">
            <Button
              variant="outline"
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                setIsDetailModalOpen(true);
              }}
              className="text-xs px-2 py-1 h-auto w-full"
            >
              <Upload className="h-3 w-3 mr-1" />
              Uploads
            </Button>
          </div>
        </div>
      </CardContent>
      
      <CardDetailModal
        isOpen={isDetailModalOpen}
        onClose={() => setIsDetailModalOpen(false)}
        cardId={brief.id}
        cardTitle={brief.title}
        onCoverUpdate={handleCoverUpdate}
      />
    </Card>
  );
};

const ProjectBoard = ({ brandKits, onCreateProject, clientName }: ProjectBoardProps) => {
  const [briefs, setBriefs] = useState<ProjectBrief[]>([
    {
      id: "1",
      clientName: clientName || "Cliente Exemplo",
      title: "Banner para Black Friday",
      description: "Criar banner promocional para campanha de Black Friday com 50% de desconto em todos os produtos.",
      deadline: "2024-11-25",
      status: "todo" as ProjectBrief["status"],
      brandKitId: brandKits[0]?.id,
      createdAt: "2024-11-01"
    },
    {
      id: "2",
      clientName: clientName || "Cliente Exemplo",
      title: "Cardápio Digital",
      description: "Desenvolver cardápio digital para aplicativo com fotos dos produtos e preços atualizados.",
      deadline: "2024-11-30",
      status: "in-progress" as ProjectBrief["status"],
      brandKitId: brandKits[0]?.id,
      createdAt: "2024-11-05"
    }
  ].filter(brief => brandKits.length > 0));

  const [newBrief, setNewBrief] = useState<Partial<ProjectBrief>>({});
  const [editingBrief, setEditingBrief] = useState<ProjectBrief | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [activeDragId, setActiveDragId] = useState<string | null>(null);
  const [multiTextInput, setMultiTextInput] = useState("");
  const [showSplitDialog, setShowSplitDialog] = useState(false);

  // Persist briefs locally per client to avoid data loss between refreshes
  useEffect(() => {
    const storageKey = `project-briefs-${clientName || 'default'}`;
    let saved = localStorage.getItem(storageKey);
    
    // If no data found, try to restore from global backup
    if (!saved) {
      try {
        const globalBackup = localStorage.getItem('all-project-briefs');
        if (globalBackup) {
          const allBriefs = JSON.parse(globalBackup);
          if (allBriefs[clientName || 'default']) {
            saved = JSON.stringify(allBriefs[clientName || 'default']);
            // Restore to individual storage
            localStorage.setItem(storageKey, saved);
          }
        }
      } catch {}
    }
    
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          setBriefs(parsed);
        }
      } catch {}
    }
  }, [clientName]);

  useEffect(() => {
    const storageKey = `project-briefs-${clientName || 'default'}`;
    localStorage.setItem(storageKey, JSON.stringify(briefs));
    
    // Also save to a global backup to prevent data loss on logout
    try {
      const globalBackup = localStorage.getItem('all-project-briefs') || '{}';
      const allBriefs = JSON.parse(globalBackup);
      allBriefs[clientName || 'default'] = briefs;
      localStorage.setItem('all-project-briefs', JSON.stringify(allBriefs));
    } catch {}
  }, [briefs, clientName]);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    })
  );

  const columns = [
    { id: "todo", title: "Para Fazer", color: "bg-yellow-500/20 border-yellow-500/30" },
    { id: "in-progress", title: "Em Progresso", color: "bg-blue-500/20 border-blue-500/30" },
    { id: "completed", title: "Concluído", color: "bg-green-500/20 border-green-500/30" }
  ];

  const ColumnDroppable = ({ id, children }: { id: string; children: React.ReactNode }) => {
    const { setNodeRef } = useDroppable({ id });
    return (
      <div ref={setNodeRef} data-droppable-id={id}>
        {children}
      </div>
    );
  };

  const handleDragStart = (event: DragStartEvent) => {
    setActiveDragId(event.active.id as string);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveDragId(null);

    if (!over) return;

    const activeId = active.id as string;
    const overId = over.id as string;

    const activeBrief = briefs.find(b => b.id === activeId);
    if (!activeBrief) return;

    // If dropped over another card, move to that card's column
    const overBrief = briefs.find(b => b.id === overId);
    if (overBrief) {
      handleStatusChange(activeId, overBrief.status);
      return;
    }

    // If dropped over a column, move to that column
    const targetColumn = columns.find(col => col.id === overId);
    if (targetColumn) {
      handleStatusChange(activeId, targetColumn.id);
    }
  };

  const handleSaveBrief = () => {
    const brief: ProjectBrief = {
      id: editingBrief?.id || Date.now().toString(),
      clientName: clientName || newBrief.clientName || "",
      title: newBrief.title || "",
      description: newBrief.description || "",
      deadline: newBrief.deadline || "",
      status: newBrief.status || "todo",
      brandKitId: newBrief.brandKitId,
      createdAt: editingBrief?.createdAt || new Date().toISOString().split('T')[0],
      type: newBrief.type || "art",
      coverImage: newBrief.coverImage
    };

    if (editingBrief) {
      setBriefs(briefs.map(b => b.id === editingBrief.id ? brief : b));
      toast.success("Briefing atualizado!");
    } else {
      setBriefs([...briefs, brief]);
      toast.success("Briefing criado!");
    }

    setNewBrief({});
    setEditingBrief(null);
    setIsDialogOpen(false);
  };

  const handleBulkAdd = () => {
    const paragraphs = multiTextInput
      .split("\n\n")
      .map((p) => p.trim())
      .filter((p) => p.length > 0);

    if (paragraphs.length === 0) {
      toast.error("Por favor, insira algum texto");
      return;
    }

    if (paragraphs.length > 1) {
      setShowSplitDialog(true);
    } else {
      createSingleBrief(paragraphs[0]);
    }
  };

  const createSingleBrief = (text: string) => {
    if (!newBrief.brandKitId && brandKits.length > 0) {
      newBrief.brandKitId = brandKits[0].id;
    }

    const brief: ProjectBrief = {
      id: Date.now().toString(),
      clientName: clientName || newBrief.clientName || "Cliente",
      title: text.substring(0, 50) + (text.length > 50 ? "..." : ""),
      description: text,
      deadline: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      status: "todo",
      brandKitId: newBrief.brandKitId,
      createdAt: new Date().toISOString().split('T')[0]
    };
    setBriefs([...briefs, brief]);
    setMultiTextInput("");
    setNewBrief({});
    setShowSplitDialog(false);
    setIsDialogOpen(false);
    toast.success("Card criado com sucesso!");
  };

  const createMultipleBriefs = () => {
    const paragraphs = multiTextInput
      .split("\n\n")
      .map((p) => p.trim())
      .filter((p) => p.length > 0);

    if (!newBrief.brandKitId && brandKits.length > 0) {
      newBrief.brandKitId = brandKits[0].id;
    }

    const newBriefs = paragraphs.map((text, index) => ({
      id: `${Date.now()}-${index}`,
      clientName: clientName || newBrief.clientName || "Cliente",
      title: text.substring(0, 50) + (text.length > 50 ? "..." : ""),
      description: text,
      deadline: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      status: "todo" as const,
      brandKitId: newBrief.brandKitId,
      createdAt: new Date().toISOString().split('T')[0]
    }));

    setBriefs([...briefs, ...newBriefs]);
    setMultiTextInput("");
    setNewBrief({});
    setShowSplitDialog(false);
    setIsDialogOpen(false);
    toast.success(`${newBriefs.length} cards criados com sucesso!`);
  };

  const handleDeleteBrief = (id: string) => {
    setBriefs(briefs.filter(b => b.id !== id));
    toast.success("Briefing removido!");
  };

  const handleStatusChange = (briefId: string, newStatus: string) => {
    setBriefs(briefs.map(b => 
      b.id === briefId ? { ...b, status: newStatus as ProjectBrief["status"] } : b
    ));
    toast.success("Status atualizado!");
  };

  const handleEditBrief = (brief: ProjectBrief) => {
    setEditingBrief(brief);
    setNewBrief(brief);
    setIsDialogOpen(true);
  };

  const handleCreateProjectFromBrief = (brief: ProjectBrief) => {
    if (brief.brandKitId) {
      onCreateProject(brief, brief.brandKitId);
    }
  };

  const getBrandKit = (brandKitId?: string) => {
    return brandKits.find(bk => bk.id === brandKitId);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-background/80 p-6">
      <div className="container mx-auto">
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-4xl font-bold gradient-text mb-2">
              {clientName ? `Projetos - ${clientName}` : "Board de Projetos"}
            </h1>
            <p className="text-muted-foreground">
              {clientName 
                ? `Organize os projetos de ${clientName}` 
                : "Organize os briefings e projetos dos seus clientes"
              }
            </p>
          </div>
          
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button variant="gradient" className="glow-effect">
                <Plus className="mr-2 h-4 w-4" />
                Novo Briefing
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>
                  {editingBrief ? "Editar Briefing" : "Novo Briefing"}
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                {!clientName && (
                  <div>
                    <label className="text-sm font-medium mb-1 block">Cliente</label>
                    <Input
                      placeholder="Nome do cliente"
                      value={newBrief.clientName || ""}
                      onChange={(e) => setNewBrief({...newBrief, clientName: e.target.value})}
                    />
                  </div>
                )}
                
                <div className="border-t pt-4">
                  <label className="text-sm font-medium mb-2 block">Adicionar Múltiplos Cards</label>
                  <p className="text-xs text-muted-foreground mb-2">
                    Cole vários textos separados por linha dupla (Enter duas vezes)
                  </p>
                  <Textarea
                    placeholder="Texto 1&#10;&#10;Texto 2&#10;&#10;Texto 3..."
                    rows={4}
                    value={multiTextInput}
                    onChange={(e) => setMultiTextInput(e.target.value)}
                  />
                  <Button onClick={handleBulkAdd} variant="outline" className="w-full mt-2">
                    Adicionar Cards
                  </Button>
                </div>

                <div className="border-t pt-4">
                  <label className="text-sm font-medium mb-2 block">Ou criar um único briefing</label>
                  <div className="space-y-3">
                    <div>
                      <label className="text-sm font-medium mb-1 block">Tipo</label>
                      <select
                        className="w-full p-2 border rounded-md bg-background"
                        value={newBrief.type || "art"}
                        onChange={(e) => setNewBrief({...newBrief, type: e.target.value as "art" | "video"})}
                      >
                        <option value="art">Arte</option>
                        <option value="video">Vídeo</option>
                      </select>
                    </div>
                    <div>
                      <label className="text-sm font-medium mb-1 block">Título do Projeto</label>
                      <Input
                        placeholder="Título do projeto"
                        value={newBrief.title || ""}
                        onChange={(e) => setNewBrief({...newBrief, title: e.target.value})}
                      />
                    </div>
                    <div>
                      <label className="text-sm font-medium mb-1 block">Descrição</label>
                      <Textarea
                        placeholder="Descreva o que precisa ser feito..."
                        rows={3}
                        value={newBrief.description || ""}
                        onChange={(e) => setNewBrief({...newBrief, description: e.target.value})}
                      />
                    </div>
                    <div>
                      <label className="text-sm font-medium mb-1 block">Prazo</label>
                      <Input
                        type="date"
                        value={newBrief.deadline || ""}
                        onChange={(e) => setNewBrief({...newBrief, deadline: e.target.value})}
                      />
                    </div>
                    <div>
                      <label className="text-sm font-medium mb-1 block">Kit de Marca</label>
                      <select
                        className="w-full p-2 border rounded-md bg-background"
                        value={newBrief.brandKitId || ""}
                        onChange={(e) => setNewBrief({...newBrief, brandKitId: e.target.value})}
                      >
                        <option value="">Selecione um kit de marca</option>
                        {brandKits.map(kit => (
                          <option key={kit.id} value={kit.id}>{kit.name}</option>
                        ))}
                      </select>
                    </div>
                    {newBrief.type === "art" && (
                      <div>
                        <label className="text-sm font-medium mb-1 block">Imagem de Capa</label>
                        <Input
                          type="file"
                          accept="image/*"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) {
                              const reader = new FileReader();
                              reader.onloadend = () => {
                                setNewBrief({...newBrief, coverImage: reader.result as string});
                              };
                              reader.readAsDataURL(file);
                            }
                          }}
                        />
                      </div>
                    )}
                    <Button onClick={handleSaveBrief} className="w-full">
                      {editingBrief ? "Salvar Alterações" : "Criar Briefing"}
                    </Button>
                  </div>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        <AlertDialog open={showSplitDialog} onOpenChange={setShowSplitDialog}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Múltiplos textos detectados</AlertDialogTitle>
              <AlertDialogDescription>
                Foram detectados {multiTextInput.split("\n\n").filter(p => p.trim().length > 0).length} textos separados. 
                Deseja criar um card único com todo o texto ou dividir em {multiTextInput.split("\n\n").filter(p => p.trim().length > 0).length} cards separados?
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel onClick={() => createSingleBrief(multiTextInput)}>
                Card Único
              </AlertDialogCancel>
              <AlertDialogAction onClick={createMultipleBriefs}>
                Dividir em {multiTextInput.split("\n\n").filter(p => p.trim().length > 0).length} Cards
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
        >
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {columns.map(column => {
              const columnBriefs = briefs.filter(b => b.status === column.id);
              return (
                <ColumnDroppable key={column.id} id={column.id}>
                  <div className="space-y-4">
                    <div className={`p-4 rounded-lg border ${column.color} cursor-pointer`}>
                      <h3 className="font-semibold text-center">{column.title}</h3>
                      <div className="text-center text-sm text-muted-foreground mt-1">
                        {columnBriefs.length} itens
                      </div>
                    </div>
                    
                    <SortableContext items={columnBriefs.map(b => b.id)} strategy={verticalListSortingStrategy}>
                      <div className="space-y-3">
                        {columnBriefs.map(brief => (
                          <SortableCard
                            key={brief.id}
                            brief={brief}
                            brandKit={getBrandKit(brief.brandKitId)}
                            columns={columns}
                            onEdit={handleEditBrief}
                            onDelete={handleDeleteBrief}
                            onStatusChange={handleStatusChange}
                            onCreateProject={handleCreateProjectFromBrief}
                          />
                        ))}
                      </div>
                    </SortableContext>
                  </div>
                </ColumnDroppable>
              );
            })}
          </div>

          <DragOverlay>
            {activeDragId ? (
              <Card className="bg-gradient-card border-primary/20 opacity-80 rotate-3">
                <CardHeader className="pb-2">
                  <h4 className="font-semibold text-sm">
                    {briefs.find(b => b.id === activeDragId)?.title}
                  </h4>
                </CardHeader>
              </Card>
            ) : null}
          </DragOverlay>
        </DndContext>
      </div>
    </div>
  );
};

export default ProjectBoard;
