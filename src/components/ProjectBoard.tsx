import { useState, useEffect, useCallback } from "react";
import { reencodeForWhatsApp } from "@/lib/videoEncoder";
import { useVideoPregenerate } from "@/hooks/useVideoPregenerate";
import { supabase } from "@/integrations/supabase/client";
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
import { Plus, Calendar, User, FileText, Trash2, Edit, Upload, Download, Link2, Eye, Volume2, VolumeX, Film, Loader2, Clock, CheckCircle, Palette, Mail, Sparkles } from "lucide-react";
import { QuickCreate } from "@/components/QuickCreate";
import { CardDetailModal } from "@/components/CardDetailModal";
import { VideoGeneratorModal } from "@/components/VideoGeneratorModal";
import { ArtGeneratorModal } from "@/components/ArtGeneratorModal";
import { VideoSwapModal } from "@/components/VideoSwapModal";
import { toast } from "sonner";
import { getProjectBriefsByClient, createProjectBrief, updateProjectBrief, deleteProjectBrief, getCardUploads, updateBriefsSortOrder, createCardUpload } from "@/lib/clientDatabase";
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

// Helper component to detect URLs and render them as clickable links
const LinkifyText = ({ text }: { text: string }) => {
  const parts = text.split(/(https?:\/\/[^\s]+)/g);
  
  return (
    <>
      {parts.map((part, index) => {
        if (/^https?:\/\//.test(part)) {
          return (
            <a
              key={index}
              href={part}
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary underline hover:text-primary/80 break-all"
              onClick={(e) => e.stopPropagation()}
            >
              {part}
            </a>
          );
        }
        return <span key={index}>{part}</span>;
      })}
    </>
  );
};

// Countdown timer for generated video expiry
// Helper: daily video limit (resets at 8 AM local time)
function getDailyWindowKey(): string {
  const now = new Date();
  const ref = new Date(now);
  if (ref.getHours() < 8) ref.setDate(ref.getDate() - 1);
  return `${ref.getFullYear()}-${String(ref.getMonth() + 1).padStart(2, "0")}-${String(ref.getDate()).padStart(2, "0")}`;
}
function hasUsedDailyVideo(clientId: string): boolean {
  try {
    return localStorage.getItem(`daily-video-${clientId}`) === getDailyWindowKey();
  } catch { return false; }
}
function markDailyVideoUsed(clientId: string) {
  try { localStorage.setItem(`daily-video-${clientId}`, getDailyWindowKey()); } catch { /* */ }
}

const VideoCountdown = ({ expiresAt }: { expiresAt: string }) => {
  const [remaining, setRemaining] = useState("");

  useEffect(() => {
    const update = () => {
      const diff = new Date(expiresAt).getTime() - Date.now();
      if (diff <= 0) { setRemaining("Expirado"); return; }
      const h = Math.floor(diff / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      setRemaining(`Tem ${h}h e ${m}min restantes para baixar`);
    };
    update();
    const interval = setInterval(update, 60000);
    return () => clearInterval(interval);
  }, [expiresAt]);

  return <span>{remaining}</span>;
};

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
  generatedVideoUrl?: string;
  generatedVideoExpiresAt?: string;
  generatedArtUrl?: string;
  generatedArtExpiresAt?: string;
  completionType?: string;
  completionTemplateName?: string;
}

interface ProjectBoardProps {
  brandKits: any[];
  onCreateProject: (brief: ProjectBrief, brandKitId: string) => void;
  clientName?: string;
  clientId?: string;
  isPublicView?: boolean;
  isInactive?: boolean;
  onBack?: () => void;
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
  cardIndex?: number;
  clientId?: string;
}

const SortableCard = ({ brief, brandKit, columns, onEdit, onDelete, onStatusChange, onCreateProject, onCoverUpdate, isPublicView, isInactive, isFirstInQueue, cardIndex = 0, clientId }: SortableCardProps) => {
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [isVideoGenOpen, setIsVideoGenOpen] = useState(false);
  const [isArtGenOpen, setIsArtGenOpen] = useState(false);
  const [isVideoSwapOpen, setIsVideoSwapOpen] = useState(false);
  const [finalArtworks, setFinalArtworks] = useState<Array<{ id: string; name: string; url: string; fileType: string }>>([]);
  // copiedLink state removed - not used in public view
  const [isDismissing, setIsDismissing] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [isArtDismissing, setIsArtDismissing] = useState(false);
  const [artDismissed, setArtDismissed] = useState(false);
  const [isEditingText, setIsEditingText] = useState(false);
  const [editText, setEditText] = useState(brief.title || "");
  const [savingText, setSavingText] = useState(false);
  const [usedDailyVideo, setUsedDailyVideo] = useState(false);
  const [isFileDragOver, setIsFileDragOver] = useState(false);
  const [isUploadingDrop, setIsUploadingDrop] = useState(false);

  const handleFileDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsFileDragOver(false);

    const droppedFiles = Array.from(e.dataTransfer.files).filter(f =>
      f.type.startsWith("image/") || f.type.startsWith("video/")
    );
    if (droppedFiles.length === 0) return;

    setIsUploadingDrop(true);
    let uploadedCount = 0;

    for (const file of droppedFiles) {
      try {
        const fileExt = file.name.split('.').pop();
        const filePath = `${brief.id}/${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;

        const { error: storageError } = await supabase.storage
          .from("card-uploads")
          .upload(filePath, file, { contentType: file.type, upsert: false });

        if (storageError) {
          console.error("Storage upload error:", storageError);
          continue;
        }

        const { data: publicUrlData } = supabase.storage
          .from("card-uploads")
          .getPublicUrl(filePath);

        await createCardUpload({
          card_id: brief.id,
          file_url: publicUrlData.publicUrl,
          file_name: file.name,
          file_type: file.type,
          upload_type: "material",
        });
        uploadedCount++;
      } catch (err) {
        console.error("Drop upload error:", err);
      }
    }

    setIsUploadingDrop(false);
    if (uploadedCount > 0) {
      toast.success(`${uploadedCount} arquivo(s) adicionado(s) aos materiais!`);
    }
  };

  const handleFileDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer.types.includes("Files")) {
      setIsFileDragOver(true);
    }
  };

  const handleFileDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsFileDragOver(false);
  };
  const [isSendingEmail, setIsSendingEmail] = useState(false);

  // Pre-generate video in background so modal opens instantly
  const { preloadedData, isPreloading } = useVideoPregenerate(
    brief.id,
    brief.description || brief.title,
    brief.title,
    brandKit,
    brief.clientName,
    cardIndex,
    true
  );
  
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: brief.id, disabled: isPublicView || isInactive });

  // Load final artworks lazily - only when modal opens (avoids N+1 queries on mount)
  useEffect(() => {
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
  }, [brief.id]);

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


  const getMimeType = (name: string): string => {
    const ext = name.split('.').pop()?.toLowerCase();
    if (ext === 'mp4' || ext === 'mpg' || ext === 'mpeg') return 'video/mp4';
    if (ext === 'mov') return 'video/quicktime';
    if (ext === 'webm') return 'video/webm';
    if (ext === 'png') return 'image/png';
    if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg';
    if (ext === 'webp') return 'image/webp';
    return 'application/octet-stream';
  };

  const handleDownload = async (url: string, filename: string, stripAudio?: boolean) => {
    const isIOS = /iPhone|iPad|iPod/i.test(navigator.userAgent);
    const isVideo = /\.(mp4|mpg|mpeg|mov|webm)$/i.test(filename) || getMimeType(filename).startsWith('video/');

    // Ensure filename has proper extension for videos
    if (!filename.match(/\.\w+$/)) {
      filename = filename + '.mp4';
    }

    toast.loading(isVideo ? "Preparando vídeo..." : "Baixando arquivo...", { id: "download-loading" });

    try {
      // Fetch the original file
      const res = await fetch(url, { mode: 'cors', cache: "no-cache" });
      if (!res.ok) {
        // Fallback: try through proxy
        const proxyUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/download-file?url=${encodeURIComponent(url)}&name=${encodeURIComponent(filename)}`;
        const proxyRes = await fetch(proxyUrl, { cache: "no-cache" });
        if (!proxyRes.ok) throw new Error("Fetch failed: " + proxyRes.status);
        var arrayBuffer = await proxyRes.arrayBuffer();
      } else {
        var arrayBuffer = await res.arrayBuffer();
      }

      const mimeType = getMimeType(filename);
      console.log("[Download]", filename, "MIME:", mimeType, "Size:", arrayBuffer.byteLength);
      let blob = new Blob([arrayBuffer], { type: mimeType });

      // For videos: re-encode through FFmpeg for WhatsApp compatibility (desktop only)
      const isMobileDownload = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
      if (isVideo) {
        if (isMobileDownload) {
          // On mobile, skip FFmpeg — it stalls. Use original blob directly.
          console.log("[Download] Mobile: skipping FFmpeg re-encode");
          blob = new Blob([blob], { type: "video/mp4" });
          filename = filename.replace(/\.[^.]+$/, '') + '.mp4';
        } else {
          try {
            toast.loading("Processando vídeo...", { id: "download-loading" });
            blob = await reencodeForWhatsApp(blob, (p) => {
              if (p < 0.3) toast.loading("Carregando conversor...", { id: "download-loading" });
              else if (p < 0.85) toast.loading("Convertendo vídeo...", { id: "download-loading" });
              else toast.loading("Finalizando...", { id: "download-loading" });
            }, { stripAudio: !!stripAudio });
            filename = filename.replace(/\.[^.]+$/, '') + '.mp4';
            console.log("[Download] Re-encoded for WhatsApp, size:", blob.size);
          } catch (encErr) {
            console.error("[Download] FFmpeg re-encode failed:", encErr);
          }
        }
      }

      toast.dismiss("download-loading");

      // iOS: use Web Share API
      if (isIOS && navigator.share && navigator.canShare) {
        let shareFilename = filename;
        if (mimeType.startsWith('video/') && !shareFilename.toLowerCase().endsWith('.mp4')) {
          shareFilename = shareFilename.replace(/\.\w+$/, '.mp4');
        }

        const file = new File([blob], shareFilename, { type: mimeType });
        const shareData = { files: [file] };
        
        if (navigator.canShare(shareData)) {
          try {
            await navigator.share(shareData);
            toast.success("Salvo!");
            return;
          } catch (shareError: any) {
            console.error("Share error:", shareError);
            if (shareError?.name === 'AbortError') return;
          }
        }
      }

      // Android & Desktop: direct blob download
      const downloadUrl = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = downloadUrl;
      link.download = filename;
      link.style.display = "none";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      toast.success(isVideo ? "Vídeo baixado! ✓" : "Download iniciado!");
      setTimeout(() => window.URL.revokeObjectURL(downloadUrl), 30000);
    } catch (error) {
      toast.dismiss("download-loading");
      console.error("Download error:", error);
      window.open(url, '_blank');
      toast.info("Segure o arquivo para salvar 📲");
    }
  };

  const handleView = (url: string) => {
    window.open(url, '_blank');
  };

  const handleSendEmail = async (mediaUrl: string, mediaType: "art" | "video", videoCoverUrl?: string) => {
    if (!clientId) return;
    setIsSendingEmail(true);
    try {
      const { data: clientData } = await supabase
        .from("client_data")
        .select("email, email_2, email_3")
        .eq("id", clientId)
        .single();
      if (!clientData) throw new Error("Cliente não encontrado");
      const emails = [clientData.email, clientData.email_2, clientData.email_3].filter(Boolean);
      if (emails.length === 0) throw new Error("Nenhum e-mail cadastrado");

      const { data, error } = await supabase.functions.invoke("send-media-email", {
        body: {
          emails,
          subject: `${mediaType === "video" ? "Vídeo" : "Arte"} - ${brief.clientName}`,
          mediaUrl,
          mediaType,
          clientName: brief.clientName,
          cardText: brief.description || brief.title,
          videoCoverUrl: mediaType === "video" ? (videoCoverUrl || brief.coverImage || undefined) : undefined,
        },
      });
      if (error) throw error;
      toast.success(data?.message || "E-mail enviado!");
    } catch (err: any) {
      console.error("Erro ao enviar e-mail:", err);
      toast.error(err?.message || "Erro ao enviar e-mail");
    } finally {
      setIsSendingEmail(false);
    }
  };

  const handleSendCardEmail = async () => {
    if (!clientId) return;
    setIsSendingEmail(true);
    try {
      const { data: clientData } = await supabase
        .from("client_data")
        .select("email, email_2, email_3")
        .eq("id", clientId)
        .single();
      if (!clientData) throw new Error("Cliente não encontrado");
      const emails = [clientData.email, clientData.email_2, clientData.email_3].filter(Boolean);
      if (emails.length === 0) throw new Error("Nenhum e-mail cadastrado");

      // Determine media to send: final artworks first, then cover fallback
      let mediaUrls: string[] = [];
      let mediaType: "art" | "video" = "art";
      
      if (finalArtworks.length > 0) {
        mediaUrls = finalArtworks.map(a => a.url);
        mediaType = finalArtworks.some(a => a.fileType.startsWith("video")) ? "video" : "art";
      } else if (brief.coverVideo) {
        mediaUrls = [brief.coverVideo];
        mediaType = "video";
      } else if (brief.coverImage) {
        mediaUrls = [brief.coverImage];
        mediaType = "art";
      }

      if (mediaUrls.length === 0) {
        toast.error("Nenhum arquivo para enviar");
        return;
      }

      const videoCoverUrls = mediaType === "video"
        ? finalArtworks
            .filter((item) => !item.fileType.startsWith("video"))
            .map((item) => item.url)
            .filter(Boolean)
        : [];

      const { data, error } = await supabase.functions.invoke("send-media-email", {
        body: {
          emails,
          subject: `${mediaType === "video" ? "Vídeo" : "Arte"} - ${brief.clientName}`,
          mediaUrls,
          mediaType,
          clientName: brief.clientName,
          cardText: brief.description || brief.title,
          videoCoverUrl: mediaType === "video" ? (videoCoverUrls[0] || brief.coverImage || undefined) : undefined,
          videoCoverUrls: mediaType === "video" ? videoCoverUrls : undefined,
        },
      });
      if (error) throw error;
      toast.success(data?.message || "E-mail enviado!");
    } catch (err: any) {
      console.error("Erro ao enviar e-mail:", err);
      toast.error(err?.message || "Erro ao enviar e-mail");
    } finally {
      setIsSendingEmail(false);
    }
  };

  // copy link functionality removed from public view

  return (
    <Card
      ref={setNodeRef}
      style={style}
      id={`card-${brief.id}`}
      className={`${isPublicView ? 'bg-card border-border/40 rounded-xl shadow-lg' : 'bg-gradient-card border-primary/20'} hover:border-primary/40 transition-all duration-300 overflow-hidden ${!isPublicView && !isInactive ? 'cursor-move' : ''} ${isFileDragOver ? 'ring-2 ring-primary border-primary bg-primary/5' : ''} ${isUploadingDrop ? 'opacity-70 pointer-events-none' : ''}`}
      {...(!isPublicView && !isInactive ? attributes : {})}
      {...(!isPublicView && !isInactive ? listeners : {})}
      onDragOver={!isPublicView ? handleFileDragOver : undefined}
      onDragLeave={!isPublicView ? handleFileDragLeave : undefined}
      onDrop={!isPublicView ? handleFileDrop : undefined}
    >
      {isFileDragOver && (
        <div className="bg-primary/10 border-b border-primary/30 px-3 py-2 text-center text-xs font-medium text-primary">
          Solte para adicionar aos materiais
        </div>
      )}
      {isUploadingDrop && (
        <div className="bg-muted/50 border-b border-border px-3 py-2 text-center text-xs font-medium text-muted-foreground flex items-center justify-center gap-2">
          <Loader2 className="h-3 w-3 animate-spin" />
          Enviando...
        </div>
      )}
      {/* Cover media removed - text-only cards */}

      <CardHeader className={`${isPublicView ? 'p-3 pb-2' : 'pb-2'} overflow-hidden`}>
        <div className="flex justify-between items-start">
          <div className="space-y-1 min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              {brief.artGenerationSelected && (
                <Badge
                  variant="outline"
                  className="text-[11px] px-2 py-0.5 h-auto bg-primary/10 text-primary border-primary/30"
                >
                  Na Fila
                </Badge>
              )}
            </div>
            {isFirstInQueue && !brief.artGenerationSelected && (
              <Badge
                variant="outline"
                className="text-[11px] px-2 py-0.5 h-auto bg-accent/10 text-accent-foreground border-accent/30 w-fit"
              >
                Próximo
              </Badge>
            )}
            {isPublicView && !isPublicView && isEditingText ? (
              null
            ) : (
              <h4 className={`font-semibold ${isPublicView ? 'text-base' : 'text-sm'} text-left break-words whitespace-pre-wrap leading-relaxed flex-1`}>
                {(brief.title?.trim() ? brief.title : brief.description)}
              </h4>
            )}
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
      <CardContent className={`pt-0 ${isPublicView ? 'p-3 pt-0' : ''} overflow-hidden`}>
        <div className="space-y-2 min-w-0">
          {(isPublicView || brief.status === "completed") && (
            <div className={`flex items-center gap-2 ${isPublicView ? 'text-sm' : 'text-xs'}`}>
              <Calendar className="h-3 w-3" />
              <span>{brief.deadline ? new Date(brief.deadline + 'T00:00:00').toLocaleDateString('pt-BR') : 'Sem prazo'}</span>
            </div>
          )}
          {brief.completionType && (
            <div className="flex items-center gap-1.5 flex-wrap">
              <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-auto bg-primary/10 text-primary border-primary/30">
                {brief.completionType}
              </Badge>
              {brief.completionTemplateName && (
                <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-auto bg-muted text-muted-foreground border-border">
                  {brief.completionTemplateName}
                </Badge>
              )}
            </div>
          )}
          
          {!isPublicView && (
            <div className="flex flex-col gap-2 mt-2">
              {finalArtworks.length > 0 ? (
                <>
                  {finalArtworks.length === 1 ? (
                    finalArtworks[0].fileType.startsWith("video") ? (
                      <div className="grid grid-cols-2 gap-1">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={(e) => { e.stopPropagation(); handleDownload(finalArtworks[0].url, finalArtworks[0].name, false); }}
                          className="text-[11px] px-1.5 py-1 h-auto min-w-0"
                        >
                          <Volume2 className="h-3 w-3 shrink-0 mr-0.5" />
                          <span>Baixar Com Áudio</span>
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={(e) => { e.stopPropagation(); handleDownload(finalArtworks[0].url, finalArtworks[0].name, true); }}
                          className="text-[11px] px-1.5 py-1 h-auto min-w-0"
                        >
                          <VolumeX className="h-3 w-3 shrink-0 mr-0.5" />
                          <span>Baixar Sem Áudio</span>
                        </Button>
                      </div>
                    ) : (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={(e) => { e.stopPropagation(); handleDownload(finalArtworks[0].url, finalArtworks[0].name); }}
                        className="text-xs px-2 py-1 h-auto w-full"
                      >
                        <Download className="h-3 w-3 mr-1" />
                        Baixar Arte
                      </Button>
                    )
                  ) : (
                    <div className="space-y-1">
                      <p className="text-xs text-muted-foreground font-medium">Baixar:</p>
                      {finalArtworks.map((artwork, index) => (
                        artwork.fileType.startsWith("video") ? (
                          <div key={artwork.id} className="grid grid-cols-2 gap-1">
                            <Button variant="outline" size="sm" onClick={(e) => { e.stopPropagation(); handleDownload(artwork.url, artwork.name, false); }} className="text-[11px] px-1.5 py-1 h-auto min-w-0">
                              <Volume2 className="h-3 w-3 shrink-0 mr-0.5" />
                              <span>Vídeo {index + 1}</span>
                            </Button>
                            <Button variant="outline" size="sm" onClick={(e) => { e.stopPropagation(); handleDownload(artwork.url, artwork.name, true); }} className="text-[11px] px-1.5 py-1 h-auto min-w-0">
                              <VolumeX className="h-3 w-3 shrink-0 mr-0.5" />
                              <span>S/ Áudio</span>
                            </Button>
                          </div>
                        ) : (
                          <Button key={artwork.id} variant="outline" size="sm" onClick={(e) => { e.stopPropagation(); handleDownload(artwork.url, artwork.name); }} className="text-xs px-2 py-1 h-auto w-full">
                            <Download className="h-3 w-3 mr-1" />
                            Arte {index + 1}
                          </Button>
                        )
                      ))}
                    </div>
                  )}
                </>
              ) : (brief.coverImage || brief.coverVideo) && (
                brief.coverVideo ? (
                  <div className="grid grid-cols-2 gap-1">
                    <Button variant="outline" size="sm" onClick={(e) => { e.stopPropagation(); handleDownload(brief.coverVideo!, `${brief.clientName}-${brief.id}.mp4`, false); }} className="text-[11px] px-1.5 py-1 h-auto min-w-0">
                      <Volume2 className="h-3 w-3 shrink-0 mr-0.5" />
                      <span>Baixar Com Áudio</span>
                    </Button>
                    <Button variant="outline" size="sm" onClick={(e) => { e.stopPropagation(); handleDownload(brief.coverVideo!, `${brief.clientName}-${brief.id}.mp4`, true); }} className="text-[11px] px-1.5 py-1 h-auto min-w-0">
                      <VolumeX className="h-3 w-3 shrink-0 mr-0.5" />
                      <span>Baixar Sem Áudio</span>
                    </Button>
                  </div>
                ) : (
                  <Button variant="outline" size="sm" onClick={(e) => { e.stopPropagation(); handleDownload(brief.coverImage!, `${brief.clientName}-${brief.id}.png`); }} className="text-xs px-2 py-1 h-auto w-full">
                    <Download className="h-3 w-3 mr-1" />
                    Baixar Arte
                  </Button>
                )
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
                Arquivos
              </Button>
              {clientId && (finalArtworks.length > 0 || brief.coverImage || brief.coverVideo) && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={(e) => { e.stopPropagation(); handleSendCardEmail(); }}
                  disabled={isSendingEmail}
                  className="text-xs px-2 py-1 h-auto w-full"
                >
                  {isSendingEmail ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Mail className="h-3 w-3 mr-1" />}
                  Enviar por E-mail
                </Button>
              )}
              {/* Generated video with Já Baixei + Enviar por E-mail */}
              {!dismissed && brief.generatedVideoUrl && brief.generatedVideoExpiresAt && new Date(brief.generatedVideoExpiresAt) > new Date() && (
                <div className="border border-primary/20 rounded-lg overflow-hidden bg-primary/5">
                  <div className="w-full bg-black flex justify-center">
                    <video src={brief.generatedVideoUrl} className="w-full max-h-40 object-contain" autoPlay muted loop playsInline />
                  </div>
                  <div className="p-2 space-y-1.5 min-w-0 overflow-hidden">
                    <div className="flex items-center justify-center gap-1 py-1 px-2 bg-destructive/15 border border-destructive/30 rounded-md overflow-hidden">
                      <span className="text-[11px] font-semibold text-destructive">
                        <VideoCountdown expiresAt={brief.generatedVideoExpiresAt} />
                      </span>
                    </div>
                    <Button size="sm" onClick={async (e) => { e.stopPropagation(); await onStatusChange(brief.id, "completed"); handleDownload(brief.generatedVideoUrl!, `${brief.clientName}-video.mp4`, false); }} className="h-auto py-1.5 text-xs font-medium rounded-md w-full overflow-hidden">
                      <span>Baixar Com Áudio</span>
                    </Button>
                    <Button variant="outline" size="sm" onClick={async (e) => { e.stopPropagation(); await onStatusChange(brief.id, "completed"); handleDownload(brief.generatedVideoUrl!, `${brief.clientName}-video.mp4`, true); }} className="h-auto py-1.5 text-xs font-medium rounded-md w-full overflow-hidden">
                      <span>Baixar Sem Áudio</span>
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={async (e) => {
                        e.stopPropagation();
                        setIsDismissing(true);
                        try {
                          const url = brief.generatedVideoUrl!;
                          const pathMatch = url.match(/card-uploads\/(.+)$/);
                          if (pathMatch) await supabase.storage.from("card-uploads").remove([pathMatch[1]]);
                          await supabase.from("project_briefs").update({ generated_video_url: null, generated_video_expires_at: null }).eq("id", brief.id);
                          setDismissed(true);
                          onStatusChange(brief.id, "completed");
                          toast.success("Vídeo removido!");
                        } catch { toast.error("Erro ao remover"); }
                        setIsDismissing(false);
                      }}
                      disabled={isDismissing}
                      className="w-full h-7 text-[11px] text-muted-foreground hover:text-foreground overflow-hidden"
                    >
                      {isDismissing ? <Loader2 className="h-3 w-3 shrink-0 animate-spin" /> : <CheckCircle className="h-3 w-3 shrink-0" />}
                      <span className="ml-1">Já Baixei</span>
                    </Button>
                    {clientId && (
                      <Button variant="outline" size="sm" onClick={(e) => { e.stopPropagation(); handleSendEmail(brief.generatedVideoUrl!, "video"); }} disabled={isSendingEmail} className="w-full h-7 text-[11px] overflow-hidden">
                        {isSendingEmail ? <Loader2 className="h-3 w-3 shrink-0 animate-spin" /> : <Mail className="h-3 w-3 shrink-0" />}
                        <span className="ml-1">Enviar por E-mail</span>
                      </Button>
                    )}
                  </div>
                </div>
              )}
              {/* Generated art with Já Baixei + Enviar por E-mail */}
              {!artDismissed && brief.generatedArtUrl && brief.generatedArtExpiresAt && new Date(brief.generatedArtExpiresAt) > new Date() && (
                <div className="border border-primary/20 rounded-lg overflow-hidden bg-primary/5">
                  <div className="w-full bg-black flex justify-center">
                    <img src={brief.generatedArtUrl} className="w-full max-h-40 object-contain" alt="Arte gerada" />
                  </div>
                  <div className="p-2 space-y-1.5 min-w-0 overflow-hidden">
                    <div className="flex items-center justify-center gap-1 py-1 px-2 bg-destructive/15 border border-destructive/30 rounded-md overflow-hidden">
                      <span className="text-[11px] font-semibold text-destructive">
                        <VideoCountdown expiresAt={brief.generatedArtExpiresAt} />
                      </span>
                    </div>
                    <Button size="sm" onClick={async (e) => { e.stopPropagation(); await onStatusChange(brief.id, "completed"); handleDownload(brief.generatedArtUrl!, `${brief.clientName}-arte.png`); }} className="h-auto py-1.5 text-xs font-medium rounded-md w-full overflow-hidden">
                      <Download className="h-3.5 w-3.5 mr-1" />
                      <span>Baixar Arte</span>
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={async (e) => {
                        e.stopPropagation();
                        setIsArtDismissing(true);
                        try {
                          const url = brief.generatedArtUrl!;
                          const pathMatch = url.match(/card-uploads\/(.+)$/);
                          if (pathMatch) await supabase.storage.from("card-uploads").remove([pathMatch[1]]);
                          await supabase.from("project_briefs").update({ generated_art_url: null, generated_art_expires_at: null }).eq("id", brief.id);
                          setArtDismissed(true);
                          onStatusChange(brief.id, "completed");
                          toast.success("Arte removida!");
                        } catch { toast.error("Erro ao remover"); }
                        setIsArtDismissing(false);
                      }}
                      disabled={isArtDismissing}
                      className="w-full h-7 text-[11px] text-muted-foreground hover:text-foreground overflow-hidden"
                    >
                      {isArtDismissing ? <Loader2 className="h-3 w-3 shrink-0 animate-spin" /> : <CheckCircle className="h-3 w-3 shrink-0" />}
                      <span className="ml-1">Já Baixei</span>
                    </Button>
                    {clientId && (
                      <Button variant="outline" size="sm" onClick={(e) => { e.stopPropagation(); handleSendEmail(brief.generatedArtUrl!, "art"); }} disabled={isSendingEmail} className="w-full h-7 text-[11px] overflow-hidden">
                        {isSendingEmail ? <Loader2 className="h-3 w-3 shrink-0 animate-spin" /> : <Mail className="h-3 w-3 shrink-0" />}
                        <span className="ml-1">Enviar por E-mail</span>
                      </Button>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
          
          {isPublicView && (() => {
            const today = new Date().toISOString().split('T')[0];
            const isDeadlineReached = brief.deadline ? brief.deadline <= today : false;
            return (
            <div className="flex flex-col gap-3 mt-3 min-w-0 overflow-hidden">
              {/* Show art download only on the card's deadline day */}
              {isDeadlineReached && (brief.coverImage || brief.coverVideo) && (
                brief.coverVideo ? (
                  <div className="grid grid-cols-2 gap-2">
                    <Button variant="outline" size="sm" onClick={async (e) => { e.stopPropagation(); await onStatusChange(brief.id, "completed"); handleDownload(brief.coverVideo!, `${brief.clientName}-${brief.id}.mp4`, false); }} className="text-xs px-2 py-2 h-auto min-w-0">
                      <Volume2 className="h-3.5 w-3.5 shrink-0 mr-1" />
                      <span>Baixar Com Áudio</span>
                    </Button>
                    <Button variant="outline" size="sm" onClick={async (e) => { e.stopPropagation(); await onStatusChange(brief.id, "completed"); handleDownload(brief.coverVideo!, `${brief.clientName}-${brief.id}.mp4`, true); }} className="text-xs px-2 py-2 h-auto min-w-0">
                      <VolumeX className="h-3.5 w-3.5 shrink-0 mr-1" />
                      <span>Baixar Sem Áudio</span>
                    </Button>
                  </div>
                ) : (
                  <Button variant="outline" size="sm" onClick={async (e) => { e.stopPropagation(); await onStatusChange(brief.id, "completed"); handleDownload(brief.coverImage!, `${brief.clientName}-${brief.id}.png`); }} className="text-xs px-2 py-1 h-auto w-full">
                    <Download className="h-3 w-3 mr-1" />
                    Baixar Arte
                  </Button>
                )
              )}
              {/* Show saved video download with countdown if available */}
              {!dismissed && brief.generatedVideoUrl && brief.generatedVideoExpiresAt && new Date(brief.generatedVideoExpiresAt) > new Date() && (
                <div className="border border-primary/20 rounded-xl overflow-hidden bg-primary/5">
                  {/* Video preview */}
                  <div className="w-full bg-black flex justify-center">
                    <video
                      src={brief.generatedVideoUrl}
                      className="w-full max-h-64 object-contain"
                      autoPlay
                      muted
                      loop
                      playsInline
                    />
                  </div>
                  <div className="p-3 space-y-2.5 min-w-0 overflow-hidden">
                    <div className="flex items-center justify-center gap-1 py-1.5 px-2 bg-destructive/15 border border-destructive/30 rounded-lg overflow-hidden">
                      <span className="text-xs font-semibold text-destructive">
                        <VideoCountdown expiresAt={brief.generatedVideoExpiresAt} />
                      </span>
                    </div>
                    <div className="flex flex-col gap-2.5 min-w-0">
                      <Button onClick={async (e) => { e.stopPropagation(); await onStatusChange(brief.id, "completed"); handleDownload(brief.generatedVideoUrl!, `${brief.clientName}-video.mp4`, false); }} className="h-auto py-2.5 text-sm font-medium rounded-lg w-full overflow-hidden">
                        <span>Baixar Com Áudio</span>
                      </Button>
                      <Button variant="outline" onClick={async (e) => { e.stopPropagation(); await onStatusChange(brief.id, "completed"); handleDownload(brief.generatedVideoUrl!, `${brief.clientName}-video.mp4`, true); }} className="h-auto py-2.5 text-sm font-medium rounded-lg w-full overflow-hidden">
                        <span>Baixar Sem Áudio</span>
                      </Button>
                    </div>
                    <Button
                      variant="ghost"
                      onClick={async (e) => {
                        e.stopPropagation();
                        setIsDismissing(true);
                        try {
                          // Delete from storage
                          const url = brief.generatedVideoUrl!;
                          const pathMatch = url.match(/card-uploads\/(.+)$/);
                          if (pathMatch) {
                            await supabase.storage.from("card-uploads").remove([pathMatch[1]]);
                          }
                          // Clear from DB
                          await supabase
                            .from("project_briefs")
                            .update({ generated_video_url: null, generated_video_expires_at: null })
                            .eq("id", brief.id);
                          setDismissed(true);
                          onStatusChange(brief.id, "completed");
                          toast.success("Vídeo removido!");
                        } catch {
                          toast.error("Erro ao remover");
                        }
                        setIsDismissing(false);
                      }}
                      disabled={isDismissing}
                      className="w-full h-9 text-xs text-muted-foreground hover:text-foreground overflow-hidden"
                    >
                       {isDismissing ? <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" /> : <CheckCircle className="h-3.5 w-3.5 shrink-0" />}
                       <span>Já Baixei</span>
                     </Button>
                    {clientId && (
                      <Button
                        variant="outline"
                        onClick={(e) => { e.stopPropagation(); handleSendEmail(brief.generatedVideoUrl!, "video"); }}
                        disabled={isSendingEmail}
                        className="w-full h-9 text-xs overflow-hidden"
                      >
                        {isSendingEmail ? <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" /> : <Mail className="h-3.5 w-3.5 shrink-0" />}
                        <span className="ml-1">Enviar por E-mail</span>
                      </Button>
                    )}
                  </div>
                </div>
              )}
              {/* Show saved art download with countdown if available */}
              {!artDismissed && brief.generatedArtUrl && brief.generatedArtExpiresAt && new Date(brief.generatedArtExpiresAt) > new Date() && (
                <div className="border border-primary/20 rounded-xl overflow-hidden bg-primary/5">
                  {/* Art preview */}
                  <div className="w-full bg-black flex justify-center">
                    <img
                      src={brief.generatedArtUrl}
                      className="w-full max-h-64 object-contain"
                      alt="Arte gerada"
                    />
                  </div>
                  <div className="p-3 space-y-2.5 min-w-0 overflow-hidden">
                    <div className="flex items-center justify-center gap-1 py-1.5 px-2 bg-destructive/15 border border-destructive/30 rounded-lg overflow-hidden">
                      <span className="text-xs font-semibold text-destructive">
                        <VideoCountdown expiresAt={brief.generatedArtExpiresAt} />
                      </span>
                    </div>
                    <Button onClick={async (e) => { e.stopPropagation(); await onStatusChange(brief.id, "completed"); handleDownload(brief.generatedArtUrl!, `${brief.clientName}-arte.png`); }} className="h-auto py-2.5 text-sm font-medium rounded-lg w-full overflow-hidden">
                      <Download className="h-4 w-4 mr-2" />
                      <span>Baixar Arte</span>
                    </Button>
                    <Button
                      variant="ghost"
                      onClick={async (e) => {
                        e.stopPropagation();
                        setIsArtDismissing(true);
                        try {
                          const url = brief.generatedArtUrl!;
                          const pathMatch = url.match(/card-uploads\/(.+)$/);
                          if (pathMatch) {
                            await supabase.storage.from("card-uploads").remove([pathMatch[1]]);
                          }
                          await supabase
                            .from("project_briefs")
                            .update({ generated_art_url: null, generated_art_expires_at: null })
                            .eq("id", brief.id);
                          setArtDismissed(true);
                          onStatusChange(brief.id, "completed");
                          toast.success("Arte removida!");
                        } catch {
                          toast.error("Erro ao remover");
                        }
                        setIsArtDismissing(false);
                      }}
                      disabled={isArtDismissing}
                      className="w-full h-9 text-xs text-muted-foreground hover:text-foreground overflow-hidden"
                    >
                       {isArtDismissing ? <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" /> : <CheckCircle className="h-3.5 w-3.5 shrink-0" />}
                       <span>Já Baixei</span>
                     </Button>
                    {clientId && (
                      <Button
                        variant="outline"
                        onClick={(e) => { e.stopPropagation(); handleSendEmail(brief.generatedArtUrl!, "art"); }}
                        disabled={isSendingEmail}
                        className="w-full h-9 text-xs overflow-hidden"
                      >
                        {isSendingEmail ? <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" /> : <Mail className="h-3.5 w-3.5 shrink-0" />}
                        <span className="ml-1">Enviar por E-mail</span>
                      </Button>
                    )}
                  </div>
                </div>
              )}
            </div>
            );
          })()}
          
        </div>
      </CardContent>
      
      <CardDetailModal
        isOpen={isDetailModalOpen}
        onClose={() => setIsDetailModalOpen(false)}
        cardId={brief.id}
        cardTitle={brief.title}
        onCoverUpdate={handleCoverUpdate}
      />
      <VideoGeneratorModal
        isOpen={isVideoGenOpen}
        onClose={() => setIsVideoGenOpen(false)}
        cardId={brief.id}
        cardTitle={brief.title}
        cardText={brief.description || brief.title}
        brandKit={brandKit}
        clientName={brief.clientName}
        cardIndex={cardIndex}
        preloadedData={preloadedData}
        clientId={clientId}
        onExported={() => {
          onStatusChange(brief.id, "completed");
          if (clientId) { markDailyVideoUsed(clientId); setUsedDailyVideo(true); }
        }}
      />
      <ArtGeneratorModal
        isOpen={isArtGenOpen}
        onClose={() => setIsArtGenOpen(false)}
        cardId={brief.id}
        cardTitle={brief.title}
        cardText={brief.description || brief.title}
        brandKit={brandKit}
        clientName={brief.clientName}
        cardIndex={cardIndex}
        clientId={clientId}
        onExported={() => {
          onStatusChange(brief.id, "completed");
        }}
      />
      <VideoSwapModal
        isOpen={isVideoSwapOpen}
        onClose={() => setIsVideoSwapOpen(false)}
        cardId={brief.id}
        cardTitle={brief.title}
        onVideoSwapped={(videoUrl) => {
          onCoverUpdate(brief.id, videoUrl, true);
        }}
      />
    </Card>
  );
};

const ProjectBoard = ({ brandKits, onCreateProject, clientName, clientId, isPublicView = false, isInactive = false, onBack }: ProjectBoardProps) => {
  const [briefs, setBriefs] = useState<ProjectBrief[]>([]);
  const { user } = useAuth();

  const [newBrief, setNewBrief] = useState<Partial<ProjectBrief>>({});
  const [editingBrief, setEditingBrief] = useState<ProjectBrief | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [activeDragId, setActiveDragId] = useState<string | null>(null);
  const [isQuickCreateOpen, setIsQuickCreateOpen] = useState(false);
  const [multiTextInput, setMultiTextInput] = useState("");
  const [showSplitDialog, setShowSplitDialog] = useState(false); // kept for compatibility
  
  const [visibleCount, setVisibleCount] = useState<Record<string, number>>({});
  const [clientInfo, setClientInfo] = useState<{ briefing?: string; image_type?: string; narration_type?: string; particularity_type?: string } | null>(null);

  // Load client info for briefing column
  useEffect(() => {
    if (!clientId || isPublicView) return;
    supabase
      .from("client_data")
      .select("briefing, image_type, narration_type, particularity_type")
      .eq("id", clientId)
      .single()
      .then(({ data }) => {
        if (data) setClientInfo(data);
      });
  }, [clientId, isPublicView]);

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
          generatedVideoUrl: (brief as any).generated_video_url || undefined,
          generatedVideoExpiresAt: (brief as any).generated_video_expires_at || undefined,
          generatedArtUrl: (brief as any).generated_art_url || undefined,
          generatedArtExpiresAt: (brief as any).generated_art_expires_at || undefined,
          completionType: (brief as any).completion_type || undefined,
          completionTemplateName: (brief as any).completion_template_name || undefined,
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
    { id: "todo", title: "A Fazer", color: "bg-yellow-500/20 border-yellow-500/30" },
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

    // If same column, allow reordering and persist
    if (activeId !== overId) {
      const sameStatusBriefs = briefs.filter(b => b.status === activeBrief.status);
      const oldIndex = sameStatusBriefs.findIndex(b => b.id === activeId);
      const newIndex = sameStatusBriefs.findIndex(b => b.id === overId);
      
      if (oldIndex !== -1 && newIndex !== -1) {
        // Reorder within same status group
        const reordered = [...sameStatusBriefs];
        const [movedBrief] = reordered.splice(oldIndex, 1);
        reordered.splice(newIndex, 0, movedBrief);
        
        // Rebuild full briefs array maintaining other status groups
        const otherBriefs = briefs.filter(b => b.status !== activeBrief.status);
        const newBriefs = [...otherBriefs, ...reordered];
        setBriefs(newBriefs);
        
        // Persist sort order to database
        try {
          const reorderedIds = reordered.map(b => b.id);
          await updateBriefsSortOrder(reorderedIds);
        } catch (error) {
          console.error("Error saving sort order:", error);
          toast.error("Erro ao salvar a nova ordem dos cards");
        }
      }
    }
  };

  const handleSaveBrief = async () => {
    if (!clientId) {
      toast.error("Cliente não identificado");
      return;
    }

    try {
      const briefData = {
        client_id: clientId,
        title: newBrief.title || "",
        description: newBrief.title || "",
        deadline: newBrief.deadline || null,
        status: newBrief.status || "todo",
        brand_kit_id: newBrief.brandKitId || null,
        brief_type: newBrief.type || "art",
        cover_image: newBrief.coverImage || null,
      };

      if (editingBrief) {
        await updateProjectBrief(editingBrief.id, briefData);
        toast.success("Briefing atualizado!");
      } else {
        await createProjectBrief(briefData);
        toast.success("Briefing criado!");
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
        generatedVideoUrl: (brief as any).generated_video_url || undefined,
        generatedVideoExpiresAt: (brief as any).generated_video_expires_at || undefined,
        generatedArtUrl: (brief as any).generated_art_url || undefined,
        generatedArtExpiresAt: (brief as any).generated_art_expires_at || undefined,
        completionType: (brief as any).completion_type || undefined,
        completionTemplateName: (brief as any).completion_template_name || undefined,
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

  const handleBulkAdd = async () => {
    if (!clientId) {
      toast.error("Cliente não identificado");
      return;
    }

    const rawInput = multiTextInput;
    console.log("[handleBulkAdd] Raw input length:", rawInput.length);
    
    const paragraphs = rawInput
      .split(/\r\n|\r|\n|\u2028|\u2029/)
      .map((p) => p.trim())
      .filter((p) => p.length > 0);

    console.log("[handleBulkAdd] Paragraphs detected:", paragraphs.length);

    if (paragraphs.length === 0) {
      toast.error("Por favor, insira algum texto");
      return;
    }

    // Create cards directly - no confirmation dialog
    if (paragraphs.length === 1) {
      createSingleBrief(paragraphs[0]);
    } else {
      // Multiple paragraphs - create all cards FIRST (fast), then generate captions in background
      toast.info(`Criando ${paragraphs.length} cards...`);

      if (!newBrief.brandKitId && brandKits.length > 0) {
        newBrief.brandKitId = brandKits[0].id;
      }

      // STEP 1: Create all cards immediately without captions
      const createdIds: string[] = [];
      let failedCount = 0;

      for (let index = 0; index < paragraphs.length; index++) {
        const text = paragraphs[index];
        
        try {
          const deadlineDate = new Date();
          deadlineDate.setDate(deadlineDate.getDate() + index);

          const result = await createProjectBrief({
            client_id: clientId,
            title: text,
            description: text,
            deadline: deadlineDate.toISOString().split('T')[0],
            status: "todo" as const,
            brand_kit_id: newBrief.brandKitId || null,
            generated_caption: "",
            sort_order: index + 1,
          });
          createdIds.push(result.id);
        } catch (cardError) {
          console.error(`Erro ao criar card ${index + 1}:`, cardError);
          failedCount++;
        }
      }

      // Reload briefs immediately to show all cards
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
        generatedVideoUrl: (brief as any).generated_video_url || undefined,
        generatedVideoExpiresAt: (brief as any).generated_video_expires_at || undefined,
        generatedArtUrl: (brief as any).generated_art_url || undefined,
        generatedArtExpiresAt: (brief as any).generated_art_expires_at || undefined,
        completionType: (brief as any).completion_type || undefined,
        completionTemplateName: (brief as any).completion_template_name || undefined,
      }));
      setBriefs(mappedBriefs);

      setMultiTextInput("");
      setNewBrief({});
      setIsDialogOpen(false);
      
      if (failedCount > 0) {
        toast.warning(`${createdIds.length} cards criados, ${failedCount} falharam.`);
      } else {
        toast.success(`${createdIds.length} cards criados!`);
      }
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

      const briefData = {
        client_id: clientId,
        title: text,
        description: text,
        deadline: new Date().toISOString().split('T')[0],
        status: "todo" as const,
        brand_kit_id: newBrief.brandKitId || null,
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
        generatedVideoUrl: (brief as any).generated_video_url || undefined,
        generatedVideoExpiresAt: (brief as any).generated_video_expires_at || undefined,
        generatedArtUrl: (brief as any).generated_art_url || undefined,
        generatedArtExpiresAt: (brief as any).generated_art_expires_at || undefined,
        completionType: (brief as any).completion_type || undefined,
        completionTemplateName: (brief as any).completion_template_name || undefined,
      }));
      setBriefs(mappedBriefs);

      setMultiTextInput("");
      setNewBrief({});
      setShowSplitDialog(false);
      setIsDialogOpen(false);
      toast.success("Card criado!");
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

  // createMultipleBriefs removed - logic moved into handleBulkAdd

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
        generatedVideoUrl: (brief as any).generated_video_url || undefined,
        generatedVideoExpiresAt: (brief as any).generated_video_expires_at || undefined,
        generatedArtUrl: (brief as any).generated_art_url || undefined,
        generatedArtExpiresAt: (brief as any).generated_art_expires_at || undefined,
        completionType: (brief as any).completion_type || undefined,
        completionTemplateName: (brief as any).completion_template_name || undefined,
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

      // When moving to completed, delete material uploads
      if (newStatus === "completed") {
        const { deleteCardUploadsByCardId } = await import("@/lib/clientDatabase");
        await deleteCardUploadsByCardId(briefId);
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
        generatedVideoUrl: (brief as any).generated_video_url || undefined,
        generatedVideoExpiresAt: (brief as any).generated_video_expires_at || undefined,
        generatedArtUrl: (brief as any).generated_art_url || undefined,
        generatedArtExpiresAt: (brief as any).generated_art_expires_at || undefined,
        completionType: (brief as any).completion_type || undefined,
        completionTemplateName: (brief as any).completion_template_name || undefined,
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
    setIsDialogOpen(true);
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
        generatedVideoUrl: (brief as any).generated_video_url || undefined,
        generatedVideoExpiresAt: (brief as any).generated_video_expires_at || undefined,
        generatedArtUrl: (brief as any).generated_art_url || undefined,
        generatedArtExpiresAt: (brief as any).generated_art_expires_at || undefined,
        completionType: (brief as any).completion_type || undefined,
        completionTemplateName: (brief as any).completion_template_name || undefined,
      }));
      setBriefs(mappedBriefs);

      toast.success("Capa atualizada!");
    } catch (error) {
      console.error("Error updating cover:", error);
      toast.error("Erro ao atualizar capa");
    }
  };

  const getBrandKit = (brandKitId?: string) => {
    return brandKits.find(bk => bk.id === brandKitId) || (brandKits.length > 0 ? brandKits[0] : undefined);
  };

  return (
    <div className={`min-h-screen bg-gradient-to-br from-background via-background to-background/80 ${isPublicView ? 'p-0' : 'p-6'}`}>
      <div className={isPublicView ? 'w-full' : 'container mx-auto'}>
        {!isPublicView && (
          <div className="flex justify-between items-center mb-8">
            <div>
              <h1 className="text-4xl font-bold gradient-text mb-2">
                {clientName || "Board de Projetos"}
              </h1>
            </div>
          
            <div className="flex items-center gap-2">
              <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                <DialogTrigger asChild>
                  <Button variant="gradient" className="glow-effect">
                    <Plus className="mr-2 h-4 w-4" />
                    Texto
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto">
                <DialogHeader className="sticky top-0 bg-background z-10 pb-4">
                  <DialogTitle>
                    {editingBrief ? "Editar Briefing" : "Novo Briefing"}
                  </DialogTitle>
                </DialogHeader>
                <div className="space-y-4 pb-4">
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
                      Cole vários textos, um por linha (cada linha vira um card)
                    </p>
                    <Textarea
                      placeholder="Texto 1&#10;Texto 2&#10;Texto 3..."
                      rows={4}
                      value={multiTextInput}
                      onChange={(e) => setMultiTextInput(e.target.value)}
                    />
                    <Button onClick={handleBulkAdd} variant="outline" className="w-full mt-2">
                      Adicionar Cards
                    </Button>
                  </div>

                  {editingBrief && (
                  <div className="border-t pt-4">
                    <div className="space-y-3">
                      <div>
                        <label className="text-sm font-medium mb-1 block">Título do Projeto</label>
                        <textarea
                          className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 resize-y"
                          placeholder="Título do projeto"
                          value={newBrief.title || ""}
                          onChange={(e) => setNewBrief({...newBrief, title: e.target.value})}
                          rows={4}
                          style={{ wordBreak: "break-word" }}
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
                      
                      
                      <Button onClick={handleSaveBrief} className="w-full">
                        Salvar Alterações
                      </Button>
                    </div>
                  </div>
                  )}
                </div>
              </DialogContent>
            </Dialog>
            </div>
          </div>
        )}

        {/* Split dialog removed - cards are created directly */}

          <DndContext
            sensors={sensors}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
          >
          <div className={`grid ${isPublicView ? 'grid-cols-1 sm:grid-cols-2 gap-4' : 'gap-3 sm:gap-4 grid-cols-1 md:grid-cols-3 lg:grid-cols-3'}`}>
            {/* Briefing Column - only in admin view */}
            {!isPublicView && clientInfo && (clientInfo.briefing || clientInfo.image_type || clientInfo.narration_type || clientInfo.particularity_type) && (
              <div className="space-y-4 min-w-0">
                <div className="p-4 rounded-lg border bg-blue-500/20 border-blue-500/30">
                  <h3 className="font-semibold text-center">Briefing</h3>
                  <div className="text-center text-sm text-muted-foreground mt-1">
                    Cliente
                  </div>
                </div>
                <div className="space-y-3">
                  {clientInfo.image_type && (
                    <Card className="bg-gradient-card border-primary/20">
                      <CardContent className="p-3">
                        <p className="text-xs font-semibold text-muted-foreground mb-0.5">Tipo de Imagem</p>
                        <p className="text-sm whitespace-pre-wrap break-words">{clientInfo.image_type}</p>
                      </CardContent>
                    </Card>
                  )}
                  {clientInfo.narration_type && (
                    <Card className="bg-gradient-card border-primary/20">
                      <CardContent className="p-3">
                        <p className="text-xs font-semibold text-muted-foreground mb-0.5">Narração</p>
                        <p className="text-sm whitespace-pre-wrap break-words">{clientInfo.narration_type}</p>
                      </CardContent>
                    </Card>
                  )}
                  {clientInfo.particularity_type && (
                    <Card className="bg-gradient-card border-primary/20">
                      <CardContent className="p-3">
                        <p className="text-xs font-semibold text-muted-foreground mb-0.5">Particularidade</p>
                        <p className="text-sm whitespace-pre-wrap break-words">{clientInfo.particularity_type}</p>
                      </CardContent>
                    </Card>
                  )}
                  {clientInfo.briefing && (
                    <Card className="bg-gradient-card border-primary/20">
                      <CardContent className="p-3">
                        <p className="text-xs font-semibold text-muted-foreground mb-0.5">Briefing</p>
                        <p className="text-sm whitespace-pre-wrap break-words">{clientInfo.briefing}</p>
                      </CardContent>
                    </Card>
                  )}
                </div>
              </div>
            )}
            {columns.map(column => {
              let columnBriefs = briefs.filter(b => b.status === column.id);
              
              // Sort completed column: most recent deadline first
              if (column.id === "completed") {
                columnBriefs = [...columnBriefs].sort((a, b) => {
                  const dateA = a.deadline ? new Date(a.deadline).getTime() : (a.createdAt ? new Date(a.createdAt).getTime() : 0);
                  const dateB = b.deadline ? new Date(b.deadline).getTime() : (b.createdAt ? new Date(b.createdAt).getTime() : 0);
                  return dateB - dateA;
                });
              }

              const PUBLIC_PAGE_SIZE = 6;
              const currentVisible = visibleCount[column.id] || PUBLIC_PAGE_SIZE;
              const visibleBriefs = isPublicView ? columnBriefs.slice(0, currentVisible) : columnBriefs;
              const hasMore = isPublicView && columnBriefs.length > currentVisible;
              
              return (
                <ColumnDroppable key={column.id} id={column.id}>
                  <div className={`${isPublicView ? 'space-y-2' : 'space-y-4'} min-w-0`}>
                    {isPublicView ? (
                      <div className={`py-3 px-4 rounded-lg border ${column.color}`}>
                        <h3 className="font-semibold text-center text-sm">{column.title}</h3>
                        <div className="text-center text-xs text-muted-foreground mt-0.5">
                          {columnBriefs.length} itens
                        </div>
                      </div>
                    ) : (
                      <div className={`p-4 rounded-lg border ${column.color} cursor-pointer`}>
                        <h3 className="font-semibold text-center">{column.title}</h3>
                        <div className="text-center text-sm text-muted-foreground mt-1">
                          {columnBriefs.length} itens
                        </div>
                      </div>
                    )}
                    
                    <SortableContext items={visibleBriefs.map(b => b.id)} strategy={verticalListSortingStrategy}>
                      <div className={isPublicView ? 'space-y-3' : 'space-y-3'}>
                        {visibleBriefs.map((brief, index) => (
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
                            cardIndex={briefs.indexOf(brief)}
                            clientId={clientId}
                          />
                        ))}
                      </div>
                    </SortableContext>
                    {hasMore && (
                      <div className="flex justify-center pt-2">
                        <Button
                          variant="outline"
                          size="sm"
                          className="w-full py-2.5 text-sm"
                          onClick={() => setVisibleCount(prev => ({
                            ...prev,
                            [column.id]: (prev[column.id] || PUBLIC_PAGE_SIZE) + PUBLIC_PAGE_SIZE
                          }))}
                        >
                          Carregar Mais ({columnBriefs.length - currentVisible} restantes)
                        </Button>
                      </div>
                    )}
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
