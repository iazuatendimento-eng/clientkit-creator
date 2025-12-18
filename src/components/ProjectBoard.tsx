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
import { Plus, Calendar, User, FileText, Trash2, Edit, Upload, Copy, Check, Download, Link2 } from "lucide-react";
import { CardDetailModal } from "@/components/CardDetailModal";
import { toast } from "sonner";
import { getProjectBriefsByClient, createProjectBrief, updateProjectBrief, deleteProjectBrief, getCardUploads } from "@/lib/clientDatabase";
import { useAuth } from "@/hooks/useAuth";
import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
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
  status: "todo" | "completed";
  brandKitId?: string;
  createdAt: string;
  type?: "art" | "video";
  coverImage?: string;
  coverVideo?: string;
  generatedCaption?: string;
  published?: boolean;
  artGenerationSelected?: boolean;
}

interface ProjectBoardProps {
  brandKits: any[];
  onCreateProject: (brief: ProjectBrief, brandKitId: string) => void;
  clientName?: string;
  clientId?: string;
  isPublicView?: boolean;
  isInactive?: boolean;
}

interface SortableCardProps {
  brief: ProjectBrief;
  brandKit: any;
  columns: any[];
  onEdit: (brief: ProjectBrief) => void;
  onDelete: (id: string) => void;
  onStatusChange: (briefId: string, newStatus: string) => void;
  onCreateProject: (brief: ProjectBrief) => void;
  onCoverUpdate: (briefId: string, coverUrl: string, isVideo?: boolean) => void;
  isPublicView?: boolean;
  isInactive?: boolean;
  isFirstInQueue?: boolean;
}

const SortableCard = ({ brief, brandKit, columns, onEdit, onDelete, onStatusChange, onCreateProject, onCoverUpdate, isPublicView, isInactive, isFirstInQueue }: SortableCardProps) => {
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [finalArtworks, setFinalArtworks] = useState<Array<{ id: string; name: string; url: string; fileType: string }>>([]);
  const [copiedLink, setCopiedLink] = useState(false);
  
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: brief.id, disabled: isPublicView || isInactive });

  // Load final artworks for public view
  useEffect(() => {
    if (isPublicView) {
      const loadFinalArtworks = async () => {
        try {
          const uploads = await getCardUploads(brief.id);
          const finals = uploads
            .filter((u: any) => u.upload_type === "final")
            .map((u: any) => ({
              id: u.id,
              name: u.file_name,
              url: u.file_url,
              fileType: u.file_type,
            }));
          setFinalArtworks(finals);
        } catch (error) {
          console.error("Error loading final artworks:", error);
        }
      };
      loadFinalArtworks();
    }
  }, [brief.id, isPublicView]);

  // Auto-open modal if URL hash matches this card
  useEffect(() => {
    if (window.location.hash === `#card-${brief.id}`) {
      setTimeout(() => {
        setIsDetailModalOpen(true);
      }, 500);
    }
  }, [brief.id]);

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const handleCoverUpdate = (coverUrl: string, isVideo?: boolean) => {
    onCoverUpdate(brief.id, coverUrl, isVideo);
  };

  const handleCopyCaption = () => {
    if (brief.generatedCaption) {
      navigator.clipboard.writeText(brief.generatedCaption);
      toast.success("Legenda copiada!");
    }
  };

  const handleDownload = async (url: string, filename: string) => {
    try {
      const res = await fetch(url);
      const blob = await res.blob();
      const downloadUrl = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = downloadUrl;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(downloadUrl);
      toast.success("Download iniciado!");
    } catch (error) {
      console.error("Error downloading file:", error);
      toast.error("Erro ao baixar arquivo");
    }
  };

  const handleCopyCardLink = () => {
    const cardUrl = `${window.location.origin}${window.location.pathname}#card-${brief.id}`;
    navigator.clipboard.writeText(cardUrl);
    setCopiedLink(true);
    toast.success("Link do card copiado!");
    setTimeout(() => setCopiedLink(false), 2000);
  };

  return (
    <Card
      ref={setNodeRef}
      style={style}
      id={`card-${brief.id}`}
      className={`bg-gradient-card border-primary/20 hover:border-primary/40 transition-all duration-300 overflow-hidden ${!isPublicView && !isInactive ? 'cursor-move' : ''}`}
      {...(!isPublicView && !isInactive ? attributes : {})}
      {...(!isPublicView && !isInactive ? listeners : {})}
    >
      {/* Cover Media */}
      {brief.coverVideo ? (
        <div className="w-full h-48 relative bg-muted flex items-center justify-center">
          <video 
            src={brief.coverVideo} 
            className="max-w-full max-h-full object-contain"
            autoPlay
            muted
            loop
            playsInline
          />
        </div>
      ) : brief.coverImage ? (
        <div className="w-full h-48 relative bg-muted flex items-center justify-center">
          <img 
            src={brief.coverImage} 
            alt="Cover" 
            className="max-w-full max-h-full object-contain"
          />
        </div>
      ) : null}

      <CardHeader className="pb-2">
        <div className="flex justify-between items-start">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <User className="h-3 w-3 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">{brief.clientName}</span>
              {brief.artGenerationSelected && (
                <Badge
                  variant="outline"
                  className="text-[11px] px-2 py-0.5 h-auto whitespace-nowrap bg-primary/10 text-primary border-primary/30"
                >
                  Na Fila
                </Badge>
              )}
              {isFirstInQueue && !brief.artGenerationSelected && (
                <Badge
                  variant="outline"
                  className="text-[11px] px-2 py-0.5 h-auto whitespace-nowrap bg-accent/10 text-accent-foreground border-accent/30"
                >
                  Próximo
                </Badge>
              )}
            </div>
            <h4 className="font-semibold text-sm text-left break-words whitespace-pre-wrap leading-relaxed">
              {(brief.description?.trim() ? brief.description : brief.title)}
            </h4>
          </div>
          {!isPublicView && (
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
          )}
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-xs">
            <Calendar className="h-3 w-3" />
            <span>{brief.deadline ? new Date(brief.deadline + 'T00:00:00').toLocaleDateString('pt-BR') : 'Sem prazo'}</span>
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
          
          {!isPublicView && (
            <div className="flex flex-col gap-2 mt-2">
              {(brief.coverImage || brief.coverVideo) && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (brief.coverVideo) {
                      handleDownload(brief.coverVideo, `${brief.clientName}-${brief.id}.mp4`);
                    } else if (brief.coverImage) {
                      handleDownload(brief.coverImage, `${brief.clientName}-${brief.id}.png`);
                    }
                  }}
                  className="text-xs px-2 py-1 h-auto w-full"
                >
                  <Download className="h-3 w-3 mr-1" />
                  {brief.coverVideo ? "Baixar MP4" : "Baixar Arte"}
                </Button>
              )}
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
          )}
          
          {isPublicView && (
            <div className="flex flex-col gap-2 mt-2">
              <Button
                variant="outline"
                size="sm"
                onClick={(e) => {
                  e.stopPropagation();
                  handleCopyCardLink();
                }}
                className="text-xs px-2 py-1 h-auto w-full"
              >
                {copiedLink ? <Check className="h-3 w-3 mr-1" /> : <Link2 className="h-3 w-3 mr-1" />}
                {copiedLink ? "Link Copiado!" : "Copiar Link do Card"}
              </Button>
              {brief.generatedCaption && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleCopyCaption();
                  }}
                  className="text-xs px-2 py-1 h-auto w-full"
                >
                  <Copy className="h-3 w-3 mr-1" />
                  Copiar Legenda
                </Button>
              )}
              {finalArtworks.length > 0 && (
                <>
                  {finalArtworks.length === 1 ? (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        const artwork = finalArtworks[0];
                        const isVideo = artwork.fileType.startsWith("video");
                        handleDownload(artwork.url, artwork.name);
                      }}
                      className="text-xs px-2 py-1 h-auto w-full"
                    >
                      <Download className="h-3 w-3 mr-1" />
                      Baixar {finalArtworks[0].fileType.startsWith("video") ? 'Vídeo' : 'Arte'}
                    </Button>
                  ) : (
                    <div className="space-y-1">
                      <p className="text-xs text-muted-foreground font-medium">Baixar Artes:</p>
                      {finalArtworks.map((artwork, index) => (
                        <Button
                          key={artwork.id}
                          variant="outline"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDownload(artwork.url, artwork.name);
                          }}
                          className="text-xs px-2 py-1 h-auto w-full"
                        >
                          <Download className="h-3 w-3 mr-1" />
                          {artwork.fileType.startsWith("video") ? 'Vídeo' : 'Arte'} {index + 1}
                        </Button>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          )}
          
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

const ProjectBoard = ({ brandKits, onCreateProject, clientName, clientId, isPublicView = false, isInactive = false }: ProjectBoardProps) => {
  const [briefs, setBriefs] = useState<ProjectBrief[]>([]);
  const { user } = useAuth();

  const [newBrief, setNewBrief] = useState<Partial<ProjectBrief>>({});
  const [editingBrief, setEditingBrief] = useState<ProjectBrief | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [activeDragId, setActiveDragId] = useState<string | null>(null);
  const [multiTextInput, setMultiTextInput] = useState("");
  const [showSplitDialog, setShowSplitDialog] = useState(false);
  const [captionCopied, setCaptionCopied] = useState(false);

  // Load briefs from Supabase
  useEffect(() => {
    const loadBriefs = async () => {
      if (!clientId) return;
      
      try {
        const data = await getProjectBriefsByClient(clientId);
        
        const mappedBriefs: ProjectBrief[] = data.map((brief: any) => ({
          id: brief.id,
          clientName: clientName || "",
          title: brief.title,
          description: brief.description || "",
          deadline: brief.deadline || "",
          status: brief.status || "todo",
          brandKitId: brief.brand_kit_id,
          createdAt: brief.created_at || new Date().toISOString(),
          type: brief.brief_type as "art" | "video",
          coverImage: brief.cover_image,
          coverVideo: brief.cover_video,
          generatedCaption: brief.generated_caption || "",
          published: brief.published || false,
          artGenerationSelected: brief.art_generation_selected || false,
        }));
        setBriefs(mappedBriefs);
      } catch (error) {
        console.error("Error loading briefs:", error);
        toast.error("Erro ao carregar cards. Verifique sua conexão.");
      }
    };

    loadBriefs();
    
    // Listen for bulk update events to reload briefs
    const handleBulkUpdate = () => {
      loadBriefs();
    };
    
    window.addEventListener("bulkBriefsUpdated", handleBulkUpdate);
    
    return () => {
      window.removeEventListener("bulkBriefsUpdated", handleBulkUpdate);
    };
  }, [clientId, clientName]);

  // Scroll to card if hash is present in URL after briefs are loaded
  useEffect(() => {
    if (briefs.length > 0 && window.location.hash) {
      const cardId = window.location.hash.substring(1);
      setTimeout(() => {
        const element = document.getElementById(cardId);
        if (element) {
          element.scrollIntoView({ behavior: 'smooth', block: 'center' });
          element.classList.add('ring-2', 'ring-primary', 'ring-offset-2');
          setTimeout(() => {
            element.classList.remove('ring-2', 'ring-primary', 'ring-offset-2');
          }, 3000);
        }
      }, 200);
    }
  }, [briefs]);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 3,
      },
    })
  );

  const columns = [
    { id: "todo", title: "Para Fazer", color: "bg-yellow-500/20 border-yellow-500/30" },
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

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveDragId(null);

    if (!over) return;

    const activeId = active.id as string;
    const overId = over.id as string;

    const activeBrief = briefs.find(b => b.id === activeId);
    if (!activeBrief) return;

    // Check if dropped over a column directly
    const targetColumn = columns.find(col => col.id === overId);
    if (targetColumn && activeBrief.status !== targetColumn.id) {
      await handleStatusChange(activeId, targetColumn.id);
      return;
    }

    // Check if dropped over another card
    const overBrief = briefs.find(b => b.id === overId);
    if (overBrief && activeBrief.status !== overBrief.status) {
      await handleStatusChange(activeId, overBrief.status);
      return;
    }

    // If same column, allow reordering (DnD Kit handles it automatically)
    if (activeId !== overId) {
      const oldIndex = briefs.findIndex(b => b.id === activeId);
      const newIndex = briefs.findIndex(b => b.id === overId);
      
      if (oldIndex !== -1 && newIndex !== -1) {
        const newBriefs = [...briefs];
        const [movedBrief] = newBriefs.splice(oldIndex, 1);
        newBriefs.splice(newIndex, 0, movedBrief);
        setBriefs(newBriefs);
      }
    }
  };

  const handleSaveBrief = async () => {
    if (!clientId) {
      toast.error("Cliente não identificado");
      return;
    }

    try {
      let generatedCaption = "";
      
      // Gerar legenda automaticamente ao criar novo card
      if (!editingBrief && newBrief.title) {
        try {
          toast.info("Gerando legenda...");
          const captionResponse = await fetch(
            `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-caption`,
            {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
              },
              body: JSON.stringify({ text: newBrief.title }),
            }
          );

          if (captionResponse.ok) {
            const captionData = await captionResponse.json();
            generatedCaption = captionData.caption;
          }
        } catch (captionError) {
          console.error("Erro ao gerar legenda:", captionError);
          // Continua mesmo se falhar a geração da legenda
        }
      }
      
      const briefData = {
        client_id: clientId,
        title: newBrief.title || "",
        description: newBrief.description || "",
        deadline: newBrief.deadline || null,
        status: newBrief.status || "todo",
        brand_kit_id: newBrief.brandKitId || null,
        brief_type: newBrief.type || "art",
        cover_image: newBrief.coverImage || null,
        generated_caption: editingBrief ? undefined : generatedCaption,
      };

      if (editingBrief) {
        await updateProjectBrief(editingBrief.id, briefData);
        toast.success("Briefing atualizado!");
      } else {
        await createProjectBrief(briefData);
        if (generatedCaption) {
          toast.success("Briefing criado com legenda!");
        } else {
          toast.success("Briefing criado!");
        }
      }

      // Reload briefs from Supabase to ensure sync
      const data = await getProjectBriefsByClient(clientId);
      
      const mappedBriefs: ProjectBrief[] = data.map((brief: any) => ({
        id: brief.id,
        clientName: clientName || "",
        title: brief.title,
        description: brief.description || "",
        deadline: brief.deadline || "",
        status: brief.status || "todo",
        brandKitId: brief.brand_kit_id,
        createdAt: brief.created_at || new Date().toISOString(),
        type: brief.brief_type as "art" | "video",
        coverImage: brief.cover_image,
        coverVideo: brief.cover_video,
        generatedCaption: brief.generated_caption || "",
        published: brief.published || false,
        artGenerationSelected: brief.art_generation_selected || false,
      }));
      setBriefs(mappedBriefs);

      setNewBrief({});
      setEditingBrief(null);
      setIsDialogOpen(false);
    } catch (error: any) {
      console.error("Erro detalhado ao salvar brief:", error);
      
      // Mostrar erro mais específico
      let errorMessage = "Erro ao salvar briefing";
      if (error?.message) {
        errorMessage += `: ${error.message}`;
      }
      if (error?.code === "PGRST301") {
        errorMessage = "Erro de autenticação. Por favor, faça login novamente.";
      }
      
      toast.error(errorMessage);
    }
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

  const createSingleBrief = async (text: string) => {
    if (!clientId) {
      toast.error("Cliente não identificado");
      return;
    }

    try {
      if (!newBrief.brandKitId && brandKits.length > 0) {
        newBrief.brandKitId = brandKits[0].id;
      }

      // Gerar legenda automaticamente
      let generatedCaption = "";
      try {
        toast.info("Gerando legenda...");
        const captionResponse = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-caption`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
            },
            body: JSON.stringify({ text }),
          }
        );

        if (captionResponse.ok) {
          const captionData = await captionResponse.json();
          generatedCaption = captionData.caption;
        }
      } catch (captionError) {
        console.error("Erro ao gerar legenda:", captionError);
      }

      const briefData = {
        client_id: clientId,
        title: text.substring(0, 50) + (text.length > 50 ? "..." : ""),
        description: text,
        deadline: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        status: "todo" as const,
        brand_kit_id: newBrief.brandKitId || null,
        generated_caption: generatedCaption,
      };

      await createProjectBrief(briefData);
      
      // Reload briefs from Supabase to ensure sync
      const data = await getProjectBriefsByClient(clientId);
      
      const mappedBriefs: ProjectBrief[] = data.map((brief: any) => ({
        id: brief.id,
        clientName: clientName || "",
        title: brief.title,
        description: brief.description || "",
        deadline: brief.deadline || "",
        status: brief.status || "todo",
        brandKitId: brief.brand_kit_id,
        createdAt: brief.created_at || new Date().toISOString(),
        type: brief.brief_type as "art" | "video",
        coverImage: brief.cover_image,
        coverVideo: brief.cover_video,
        generatedCaption: brief.generated_caption || "",
        published: brief.published || false,
        artGenerationSelected: brief.art_generation_selected || false,
      }));
      setBriefs(mappedBriefs);
      
      setMultiTextInput("");
      setNewBrief({});
      setShowSplitDialog(false);
      setIsDialogOpen(false);
      if (generatedCaption) {
        toast.success("Card criado com legenda!");
      } else {
        toast.success("Card criado!");
      }
    } catch (error: any) {
      console.error("Erro detalhado ao criar card:", error);
      
      let errorMessage = "Erro ao criar card";
      if (error?.message) {
        errorMessage += `: ${error.message}`;
      }
      if (error?.code === "PGRST301") {
        errorMessage = "Erro de autenticação. Por favor, faça login novamente.";
      }
      
      toast.error(errorMessage);
    }
  };

  const createMultipleBriefs = async () => {
    if (!clientId) {
      toast.error("Cliente não identificado");
      return;
    }

    try {
      const paragraphs = multiTextInput
        .split("\n\n")
        .map((p) => p.trim())
        .filter((p) => p.length > 0);

      toast.info("Criando cards e gerando legendas...");

      if (!newBrief.brandKitId && brandKits.length > 0) {
        newBrief.brandKitId = brandKits[0].id;
      }

      const createPromises = paragraphs.map(async (text) => {
        // Gerar legenda para cada card
        let generatedCaption = "";
        try {
          const captionResponse = await fetch(
            `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-caption`,
            {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
              },
              body: JSON.stringify({ text }),
            }
          );

          if (captionResponse.ok) {
            const captionData = await captionResponse.json();
            generatedCaption = captionData.caption;
          }
        } catch (captionError) {
          console.error("Erro ao gerar legenda:", captionError);
        }

        const briefData = {
          client_id: clientId,
          title: text.substring(0, 50) + (text.length > 50 ? "..." : ""),
          description: text,
          deadline: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
          status: "todo" as const,
          brand_kit_id: newBrief.brandKitId || null,
          generated_caption: generatedCaption,
        };
        return await createProjectBrief(briefData);
      });

      await Promise.all(createPromises);
      
      // Reload briefs from Supabase to ensure sync
      const data = await getProjectBriefsByClient(clientId);
      
      const mappedBriefs: ProjectBrief[] = data.map((brief: any) => ({
        id: brief.id,
        clientName: clientName || "",
        title: brief.title,
        description: brief.description || "",
        deadline: brief.deadline || "",
        status: brief.status || "todo",
        brandKitId: brief.brand_kit_id,
        createdAt: brief.created_at || new Date().toISOString(),
        type: brief.brief_type as "art" | "video",
        coverImage: brief.cover_image,
        coverVideo: brief.cover_video,
        generatedCaption: brief.generated_caption || "",
        published: brief.published || false,
        artGenerationSelected: brief.art_generation_selected || false,
      }));
      setBriefs(mappedBriefs);
      
      setMultiTextInput("");
      setNewBrief({});
      setShowSplitDialog(false);
      setIsDialogOpen(false);
      toast.success(`${paragraphs.length} cards criados com legendas!`);
    } catch (error: any) {
      console.error("Erro detalhado ao criar cards múltiplos:", error);
      
      let errorMessage = "Erro ao criar cards";
      if (error?.message) {
        errorMessage += `: ${error.message}`;
      }
      if (error?.code === "PGRST301") {
        errorMessage = "Erro de autenticação. Por favor, faça login novamente.";
      }
      
      toast.error(errorMessage);
    }
  };

  const handleDeleteBrief = async (id: string) => {
    if (!clientId) return;
    
    try {
      await deleteProjectBrief(id);
      
      // Reload briefs from Supabase to ensure sync
      const data = await getProjectBriefsByClient(clientId);
      const mappedBriefs: ProjectBrief[] = data.map((brief: any) => ({
        id: brief.id,
        clientName: clientName || "",
        title: brief.title,
        description: brief.description || "",
        deadline: brief.deadline || "",
        status: brief.status || "todo",
        brandKitId: brief.brand_kit_id,
        createdAt: brief.created_at || new Date().toISOString(),
        type: brief.brief_type as "art" | "video",
        coverImage: brief.cover_image,
        coverVideo: brief.cover_video,
        generatedCaption: brief.generated_caption || "",
        published: brief.published || false,
      }));
      setBriefs(mappedBriefs);
      
      toast.success("Briefing removido!");
    } catch (error) {
      console.error("Error deleting brief:", error);
      toast.error("Erro ao remover briefing");
    }
  };

  const handleStatusChange = async (briefId: string, newStatus: string) => {
    if (!clientId) return;
    
    try {
      await updateProjectBrief(briefId, { status: newStatus as "todo" | "completed" });
      
      // Reload briefs from Supabase to ensure sync
      const data = await getProjectBriefsByClient(clientId);
      const mappedBriefs: ProjectBrief[] = data.map((brief: any) => ({
        id: brief.id,
        clientName: clientName || "",
        title: brief.title,
        description: brief.description || "",
        deadline: brief.deadline || "",
        status: brief.status || "todo",
        brandKitId: brief.brand_kit_id,
        createdAt: brief.created_at || new Date().toISOString(),
        type: brief.brief_type as "art" | "video",
        coverImage: brief.cover_image,
        coverVideo: brief.cover_video,
        generatedCaption: brief.generated_caption || "",
        published: brief.published || false,
      }));
      setBriefs(mappedBriefs);
      
      toast.success("Status atualizado!");
    } catch (error) {
      console.error("Error updating status:", error);
      toast.error("Erro ao atualizar status");
    }
  };


  const handleEditBrief = (brief: ProjectBrief) => {
    setEditingBrief(brief);
    setNewBrief(brief);
    setCaptionCopied(false);
    setIsDialogOpen(true);
  };

  const handleCopyCaption = async () => {
    const captionToUse = editingBrief?.generatedCaption;
    if (!captionToUse) return;
    
    try {
      await navigator.clipboard.writeText(captionToUse);
      setCaptionCopied(true);
      toast.success("Legenda copiada!");
      setTimeout(() => setCaptionCopied(false), 2000);
    } catch (error) {
      toast.error("Erro ao copiar legenda");
    }
  };

  const handleCreateProjectFromBrief = (brief: ProjectBrief) => {
    if (brief.brandKitId) {
      onCreateProject(brief, brief.brandKitId);
    }
  };

  const handleBriefCoverUpdate = async (briefId: string, coverUrl: string, isVideo?: boolean) => {
    if (!clientId) return;
    
    try {
      const updateData = isVideo 
        ? { cover_video: coverUrl, cover_image: null }
        : { cover_image: coverUrl, cover_video: null };
      
      await updateProjectBrief(briefId, updateData);
      
      // Reload briefs from Supabase to ensure cover is updated
      const data = await getProjectBriefsByClient(clientId);
      const mappedBriefs: ProjectBrief[] = data.map((brief: any) => ({
        id: brief.id,
        clientName: clientName || "",
        title: brief.title,
        description: brief.description || "",
        deadline: brief.deadline || "",
        status: brief.status || "todo",
        brandKitId: brief.brand_kit_id,
        createdAt: brief.created_at || new Date().toISOString(),
        type: brief.brief_type as "art" | "video",
        coverImage: brief.cover_image,
        coverVideo: brief.cover_video,
        generatedCaption: brief.generated_caption || "",
        published: brief.published || false,
      }));
      setBriefs(mappedBriefs);
      
      toast.success("Capa atualizada!");
    } catch (error) {
      console.error("Error updating cover:", error);
      toast.error("Erro ao atualizar capa");
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
          
          {!isPublicView && (
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
                        <label className="text-sm font-medium mb-1 block">Título do Projeto</label>
                        <Input
                          placeholder="Título do projeto"
                          value={newBrief.title || ""}
                          onChange={(e) => setNewBrief({...newBrief, title: e.target.value})}
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
                      
                      {editingBrief && editingBrief.generatedCaption && (
                        <div className="border-t pt-4">
                          <label className="text-sm font-medium mb-2 block">Legenda para Redes Sociais</label>
                          <div className="space-y-2">
                            <div className="relative">
                              <Textarea
                                value={editingBrief.generatedCaption}
                                readOnly
                                rows={6}
                                className="pr-10 text-sm bg-muted/50"
                              />
                              <Button
                                onClick={handleCopyCaption}
                                variant="ghost"
                                size="sm"
                                className="absolute top-2 right-2 h-7 w-7 p-0"
                              >
                                {captionCopied ? (
                                  <Check className="h-3 w-3 text-green-500" />
                                ) : (
                                  <Copy className="h-3 w-3" />
                                )}
                              </Button>
                            </div>
                            <p className="text-xs text-muted-foreground">
                              Esta legenda foi gerada automaticamente ao criar o card. Clique no ícone para copiar.
                            </p>
                          </div>
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
          )}
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
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
          >
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {columns.map(column => {
              let columnBriefs = briefs.filter(b => b.status === column.id);
              
              // Sort completed column by deadline descending (most recent deadline first)
              if (column.id === "completed") {
                columnBriefs = [...columnBriefs].sort((a, b) => {
                  if (!a.deadline && !b.deadline) return 0;
                  if (!a.deadline) return 1;
                  if (!b.deadline) return -1;
                  return new Date(b.deadline).getTime() - new Date(a.deadline).getTime();
                });
              }
              
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
                        {columnBriefs.map((brief, index) => (
                          <SortableCard
                            key={brief.id}
                            brief={brief}
                            brandKit={getBrandKit(brief.brandKitId)}
                            columns={columns}
                            onEdit={handleEditBrief}
                            onDelete={handleDeleteBrief}
                            onStatusChange={handleStatusChange}
                            onCreateProject={handleCreateProjectFromBrief}
                            onCoverUpdate={handleBriefCoverUpdate}
                            isPublicView={isPublicView}
                            isInactive={isInactive}
                            isFirstInQueue={column.id === "todo" && index === 0}
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
