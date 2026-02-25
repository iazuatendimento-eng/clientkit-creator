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
import { Plus, Calendar, User, FileText, Trash2, Edit, Upload, Copy, Check, Download, Link2, Eye, Volume2, VolumeX, Film, Loader2, Clock, CheckCircle } from "lucide-react";
import { CardDetailModal } from "@/components/CardDetailModal";
import { VideoGeneratorModal } from "@/components/VideoGeneratorModal";
import { VideoSwapModal } from "@/components/VideoSwapModal";
import { toast } from "sonner";
import { getProjectBriefsByClient, createProjectBrief, updateProjectBrief, deleteProjectBrief, getCardUploads, updateBriefsSortOrder } from "@/lib/clientDatabase";
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
  cardIndex?: number;
  clientId?: string;
}

const SortableCard = ({ brief, brandKit, columns, onEdit, onDelete, onStatusChange, onCreateProject, onCoverUpdate, isPublicView, isInactive, isFirstInQueue, cardIndex = 0, clientId }: SortableCardProps) => {
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [isVideoGenOpen, setIsVideoGenOpen] = useState(false);
  const [isVideoSwapOpen, setIsVideoSwapOpen] = useState(false);
  const [finalArtworks, setFinalArtworks] = useState<Array<{ id: string; name: string; url: string; fileType: string }>>([]);
  const [copiedLink, setCopiedLink] = useState(false);
  const [isDismissing, setIsDismissing] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [isEditingText, setIsEditingText] = useState(false);
  const [editText, setEditText] = useState(brief.title || "");
  const [savingText, setSavingText] = useState(false);
  const [usedDailyVideo, setUsedDailyVideo] = useState(false);

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
    if (!isDetailModalOpen) return;
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
  }, [brief.id, isDetailModalOpen]);

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
      className={`${isPublicView ? 'bg-card border-border/40 rounded-xl shadow-lg' : 'bg-gradient-card border-primary/20'} hover:border-primary/40 transition-all duration-300 overflow-hidden ${!isPublicView && !isInactive ? 'cursor-move' : ''}`}
      {...(!isPublicView && !isInactive ? attributes : {})}
      {...(!isPublicView && !isInactive ? listeners : {})}
    >
      {/* Cover Media - use brief cover fields, fallback to last final upload */}
      {(() => {
        const lastFinal = finalArtworks.length > 0 ? finalArtworks[finalArtworks.length - 1] : null;
        const coverVideo = brief.coverVideo || (lastFinal && lastFinal.fileType.startsWith("video") ? lastFinal.url : null);
        const coverImage = !coverVideo ? (brief.coverImage || (lastFinal && !lastFinal.fileType.startsWith("video") ? lastFinal.url : null)) : null;
        
        if (coverVideo) {
          return (
            <div className="w-full h-48 relative bg-muted flex items-center justify-center">
              <video 
                src={coverVideo} 
                className="max-w-full max-h-full object-contain"
                autoPlay
                muted
                loop
                playsInline
              />
            </div>
          );
        }
        if (coverImage) {
          return (
            <div className="w-full h-48 relative bg-muted flex items-center justify-center">
              <img 
                src={coverImage} 
                alt="Cover" 
                className="max-w-full max-h-full object-contain"
              />
            </div>
          );
        }
        return null;
      })()}

      <CardHeader className={`${isPublicView ? 'p-1.5 pb-1' : 'pb-2'} overflow-hidden`}>
        <div className="flex justify-between items-start">
          <div className="space-y-1 min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <User className="h-3 w-3 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">{brief.clientName}</span>
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
              <div className="flex items-start gap-1.5">
                <h4 className="font-semibold text-sm text-left break-words whitespace-pre-wrap leading-relaxed flex-1">
                  {(brief.title?.trim() ? brief.title : brief.description)}
                </h4>
                {!isPublicView && brief.status !== "completed" && !isFirstInQueue && (
                  <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); setEditText(brief.title); setIsEditingText(true); }} className="h-6 w-6 p-0 shrink-0">
                    <Edit className="h-3 w-3" />
                  </Button>
                )}
              </div>
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
      <CardContent className={`pt-0 ${isPublicView ? 'p-1.5 pt-0' : ''} overflow-hidden`}>
        <div className="space-y-2 min-w-0">
          <div className="flex items-center gap-2 text-xs">
            <Calendar className="h-3 w-3" />
            <span>{brief.deadline ? new Date(brief.deadline + 'T00:00:00').toLocaleDateString('pt-BR') : 'Sem prazo'}</span>
          </div>
          
          {brandKit && !isPublicView && (
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
                Uploads
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={(e) => {
                  e.stopPropagation();
                  setIsVideoGenOpen(true);
                }}
                className="text-xs px-2 py-1 h-auto w-full"
              >
                <Film className="h-3 w-3 mr-1" />
                Baixar Vídeo Feito
              </Button>
            </div>
          )}
          
          {isPublicView && (() => {
            const today = new Date().toISOString().split('T')[0];
            const isDeadlineReached = brief.deadline ? brief.deadline <= today : false;
            console.log(`[PublicView] Card "${brief.title?.substring(0,30)}" deadline="${brief.deadline}" today="${today}" reached=${isDeadlineReached} status="${brief.status}"`);
            return (
            <div className="flex flex-col gap-3 mt-3 min-w-0 overflow-hidden">
              {/* Show art download only on the card's deadline day */}
              {isDeadlineReached && (brief.coverImage || brief.coverVideo) && (
                brief.coverVideo ? (
                  <div className="grid grid-cols-2 gap-1">
                    <Button variant="outline" size="sm" onClick={async (e) => { e.stopPropagation(); await handleDownload(brief.coverVideo!, `${brief.clientName}-${brief.id}.mp4`, false); onStatusChange(brief.id, "completed"); }} className="text-[11px] px-1.5 py-1 h-auto min-w-0">
                      <Volume2 className="h-3 w-3 shrink-0 mr-0.5" />
                      <span>Baixar Com Áudio</span>
                    </Button>
                    <Button variant="outline" size="sm" onClick={async (e) => { e.stopPropagation(); await handleDownload(brief.coverVideo!, `${brief.clientName}-${brief.id}.mp4`, true); onStatusChange(brief.id, "completed"); }} className="text-[11px] px-1.5 py-1 h-auto min-w-0">
                      <VolumeX className="h-3 w-3 shrink-0 mr-0.5" />
                      <span>Baixar Sem Áudio</span>
                    </Button>
                  </div>
                ) : (
                  <Button variant="outline" size="sm" onClick={async (e) => { e.stopPropagation(); await handleDownload(brief.coverImage!, `${brief.clientName}-${brief.id}.png`); onStatusChange(brief.id, "completed"); }} className="text-xs px-2 py-1 h-auto w-full">
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
                    <div className="flex items-center justify-center gap-1 py-1 px-1.5 bg-destructive/15 border border-destructive/30 rounded-lg overflow-hidden">
                      <span className="text-[10px] font-semibold text-destructive">
                        <VideoCountdown expiresAt={brief.generatedVideoExpiresAt} />
                      </span>
                    </div>
                    <div className="flex flex-col gap-2 min-w-0">
                      <Button onClick={async (e) => { e.stopPropagation(); await handleDownload(brief.generatedVideoUrl!, `${brief.clientName}-video.mp4`, false); onStatusChange(brief.id, "completed"); }} className="h-auto py-2 text-xs font-medium rounded-lg w-full overflow-hidden">
                        <span>Baixar Com Áudio</span>
                      </Button>
                      <Button variant="outline" onClick={async (e) => { e.stopPropagation(); await handleDownload(brief.generatedVideoUrl!, `${brief.clientName}-video.mp4`, true); onStatusChange(brief.id, "completed"); }} className="h-auto py-2 text-xs font-medium rounded-lg w-full overflow-hidden">
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
                  </div>
                </div>
              )}
              {brief.status !== "completed" && isDeadlineReached && (() => {
                const alreadyUsed = clientId ? (hasUsedDailyVideo(clientId) || usedDailyVideo) : false;
                if (alreadyUsed) return null;
                return (
                  <Button
                    variant="outline"
                    onClick={(e) => {
                      e.stopPropagation();
                      setIsVideoGenOpen(true);
                    }}
                    className="h-auto py-3 text-xs font-medium w-full rounded-xl border-primary/30 hover:bg-primary/10 hover:border-primary/50 transition-all overflow-hidden"
                    disabled={isPreloading}
                  >
                    {isPreloading ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <Film className="h-4 w-4 mr-2" />
                    )}
                    <span>{isPreloading ? "Preparando..." : "Baixar Vídeo Feito"}</span>
                  </Button>
                );
              })()}
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
        onExported={() => {
          onStatusChange(brief.id, "completed");
          if (clientId) { markDailyVideoUsed(clientId); setUsedDailyVideo(true); }
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

const ProjectBoard = ({ brandKits, onCreateProject, clientName, clientId, isPublicView = false, isInactive = false }: ProjectBoardProps) => {
  const [briefs, setBriefs] = useState<ProjectBrief[]>([]);
  const { user } = useAuth();

  const [newBrief, setNewBrief] = useState<Partial<ProjectBrief>>({});
  const [editingBrief, setEditingBrief] = useState<ProjectBrief | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [activeDragId, setActiveDragId] = useState<string | null>(null);
  const [multiTextInput, setMultiTextInput] = useState("");
  const [showSplitDialog, setShowSplitDialog] = useState(false); // kept for compatibility
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
          generatedVideoUrl: (brief as any).generated_video_url || undefined,
          generatedVideoExpiresAt: (brief as any).generated_video_expires_at || undefined,
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
    { id: "todo", title: "Vídeos para Baixar", color: "bg-yellow-500/20 border-yellow-500/30" },
    { id: "completed", title: "Vídeos Baixados", color: "bg-green-500/20 border-green-500/30" }
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
        generatedVideoUrl: (brief as any).generated_video_url || undefined,
        generatedVideoExpiresAt: (brief as any).generated_video_expires_at || undefined,
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
      }));
      setBriefs(mappedBriefs);
      
      setMultiTextInput("");
      setNewBrief({});
      setIsDialogOpen(false);
      
      if (failedCount > 0) {
        toast.warning(`${createdIds.length} cards criados, ${failedCount} falharam.`);
      } else {
        toast.success(`${createdIds.length} cards criados! Gerando legendas em background...`);
      }

      // STEP 2: Generate captions in background (non-blocking)
      for (const brief of data) {
        if (brief.generated_caption) continue; // Skip if already has caption
        try {
          const captionResponse = await fetch(
            `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-caption`,
            {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
              },
              body: JSON.stringify({ text: brief.title }),
            }
          );

          if (captionResponse.ok) {
            const captionData = await captionResponse.json();
            await updateProjectBrief(brief.id, { generated_caption: captionData.caption });
          }
        } catch (err) {
          console.error(`Erro ao gerar legenda para ${brief.id}:`, err);
        }
      }
      
      // Reload one more time to get captions
      const updatedData = await getProjectBriefsByClient(clientId);
      const updatedBriefs: ProjectBrief[] = updatedData.map((brief: any) => ({
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
      }));
      setBriefs(updatedBriefs);
      toast.success("Legendas geradas com sucesso!");
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
        title: text,
        description: text,
        deadline: new Date().toISOString().split('T')[0],
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
        generatedVideoUrl: (brief as any).generated_video_url || undefined,
        generatedVideoExpiresAt: (brief as any).generated_video_expires_at || undefined,
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
        generatedVideoUrl: (brief as any).generated_video_url || undefined,
        generatedVideoExpiresAt: (brief as any).generated_video_expires_at || undefined,
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
        generatedVideoUrl: (brief as any).generated_video_url || undefined,
        generatedVideoExpiresAt: (brief as any).generated_video_expires_at || undefined,
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

                  <div className="border-t pt-4">
                    <label className="text-sm font-medium mb-2 block">Ou criar um único briefing</label>
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
          </div>
        )}

        {/* Split dialog removed - cards are created directly */}

          <DndContext
            sensors={sensors}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
          >
          <div className={`grid ${isPublicView ? 'grid-cols-2 gap-3' : 'gap-3 sm:gap-4 grid-cols-1 md:grid-cols-2 lg:grid-cols-3'}`}>
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
                  <div className={`${isPublicView ? 'space-y-2' : 'space-y-4'} min-w-0`}>
                    {isPublicView ? (
                      <div className={`py-2 px-3 rounded-lg border ${column.color}`}>
                        <h3 className="font-semibold text-center text-xs">{column.title}</h3>
                        <div className="text-center text-[10px] text-muted-foreground">
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
                    
                    <SortableContext items={columnBriefs.map(b => b.id)} strategy={verticalListSortingStrategy}>
                      <div className={isPublicView ? 'space-y-2' : 'space-y-3'}>
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
                            cardIndex={briefs.indexOf(brief)}
                            clientId={clientId}
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
