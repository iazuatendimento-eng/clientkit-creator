import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, Upload, Search, Film, Check } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { searchVideos, type SearchVideo } from "@/lib/imageSearch";

interface VideoSwapModalProps {
  isOpen: boolean;
  onClose: () => void;
  cardId: string;
  cardTitle: string;
  onVideoSwapped: (videoUrl: string) => void;
}

export function VideoSwapModal({ isOpen, onClose, cardId, cardTitle, onVideoSwapped }: VideoSwapModalProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [translatedSearchQuery, setTranslatedSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchVideo[]>([]);
  const [searching, setSearching] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [selectedVideo, setSelectedVideo] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [searchPage, setSearchPage] = useState(1);
  const [isLoadingMore, setIsLoadingMore] = useState(false);

  const handleSearch = async () => {
    if (!searchQuery.trim()) return;
    setSearching(true);
    setSearchPage(1);
    try {
      const { translateSearchQuery } = await import("@/lib/translateSearch");
      const translated = await translateSearchQuery(searchQuery);
      setTranslatedSearchQuery(translated);
      const results = await searchVideos(translated, 6, 1);
      setSearchResults(results);
      if (results.length === 0) toast.info("Nenhum vídeo encontrado. Tente outro termo.");
    } catch {
      toast.error("Erro ao buscar vídeos");
    } finally {
      setSearching(false);
    }
  };

  const handleLoadMore = async () => {
    if (!searchQuery.trim()) return;
    const nextPage = searchPage + 1;
    setIsLoadingMore(true);
    try {
      const results = await searchVideos(translatedSearchQuery || searchQuery, 6, nextPage);
      if (results.length > 0) {
        setSearchResults(prev => [...prev, ...results]);
        setSearchPage(nextPage);
      } else {
        toast.info("Sem mais resultados");
      }
    } catch {
      toast.error("Erro ao carregar mais vídeos");
    } finally {
      setIsLoadingMore(false);
    }
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("video/")) {
      toast.error("Selecione um arquivo de vídeo");
      return;
    }
    setUploading(true);
    try {
      const ext = file.name.split(".").pop();
      const path = `${cardId}/${Date.now()}-swap.${ext}`;
      const { error } = await supabase.storage.from("card-uploads").upload(path, file, { contentType: file.type });
      if (error) throw error;
      const { data: urlData } = supabase.storage.from("card-uploads").getPublicUrl(path);
      const videoUrl = urlData.publicUrl;
      
      // Save directly
      await saveVideo(videoUrl);
    } catch (err) {
      console.error("Upload error:", err);
      toast.error("Erro ao enviar vídeo");
    } finally {
      setUploading(false);
    }
  };

  const saveVideo = async (videoUrl: string) => {
    setSaving(true);
    try {
      const { error } = await supabase
        .from("project_briefs")
        .update({ cover_video: videoUrl })
        .eq("id", cardId);
      if (error) throw error;
      onVideoSwapped(videoUrl);
      toast.success("Vídeo atualizado! ✓");
      onClose();
    } catch (err) {
      console.error("Save error:", err);
      toast.error("Erro ao salvar vídeo");
    } finally {
      setSaving(false);
    }
  };

  const handleSelectFromBank = (video: SearchVideo) => {
    setSelectedVideo(video.videoUrl);
  };

  const handleConfirmSelection = () => {
    if (selectedVideo) saveVideo(selectedVideo);
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-sm">
            <Film className="h-4 w-4" />
            Trocar Vídeo
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Upload own video */}
          <div>
            <label htmlFor={`swap-upload-${cardId}`} className={`cursor-pointer block ${uploading ? "pointer-events-none opacity-50" : ""}`}>
              <div className="border-2 border-dashed border-muted-foreground/30 rounded-lg p-4 text-center hover:border-primary/50 transition-colors">
                {uploading ? (
                  <div className="flex items-center justify-center gap-2">
                    <Loader2 className="h-5 w-5 animate-spin text-primary" />
                    <span className="text-sm text-muted-foreground">Enviando vídeo...</span>
                  </div>
                ) : (
                  <div className="flex items-center justify-center gap-2">
                    <Upload className="h-5 w-5 text-muted-foreground" />
                    <span className="text-sm text-muted-foreground">Enviar meu vídeo</span>
                  </div>
                )}
              </div>
              <input
                id={`swap-upload-${cardId}`}
                type="file"
                accept="video/*"
                className="hidden"
                onChange={handleUpload}
                disabled={uploading}
              />
            </label>
          </div>

          {/* Divider */}
          <div className="flex items-center gap-2">
            <div className="flex-1 h-px bg-border" />
            <span className="text-xs text-muted-foreground">ou buscar no banco</span>
            <div className="flex-1 h-px bg-border" />
          </div>

          {/* Search from bank */}
          <div className="flex gap-2">
            <Input
              placeholder="Buscar vídeos..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSearch()}
              className="text-sm"
            />
            <Button size="sm" onClick={handleSearch} disabled={searching} className="px-3">
              {searching ? <Loader2 className="h-4 w-4 animate-spin" /> : "Buscar"}
            </Button>
          </div>

          {/* Results grid */}
          {searchResults.length > 0 && (
            <div className="space-y-2">
              <ScrollArea className="h-[220px]">
                <div className="grid grid-cols-2 gap-2 pr-2">
                  {searchResults.map((video) => (
                    <div
                      key={video.id}
                      onClick={() => handleSelectFromBank(video)}
                      className={`relative cursor-pointer rounded-lg overflow-hidden border-2 transition-all ${
                        selectedVideo === video.videoUrl
                          ? "border-primary ring-2 ring-primary/30"
                          : "border-transparent hover:border-muted-foreground/30"
                      }`}
                    >
                      <video
                        src={video.videoUrl}
                        poster={video.image}
                        className="w-full h-28 object-cover"
                        muted
                        playsInline
                        onMouseEnter={(e) => e.currentTarget.play()}
                        onMouseLeave={(e) => { e.currentTarget.pause(); e.currentTarget.currentTime = 0; }}
                      />
                      {selectedVideo === video.videoUrl && (
                        <div className="absolute top-1 right-1 bg-primary text-primary-foreground rounded-full p-1">
                          <Check className="h-3 w-3" />
                        </div>
                      )}
                      <div className="absolute bottom-0 left-0 right-0 bg-black/60 px-1.5 py-0.5">
                        <span className="text-[10px] text-white">{video.source}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>

              <Button
                variant="outline"
                size="sm"
                className="w-full"
                onClick={handleLoadMore}
                disabled={isLoadingMore}
              >
                {isLoadingMore && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                Carregar Mais
              </Button>

              {selectedVideo && (
                <Button
                  onClick={handleConfirmSelection}
                  disabled={saving}
                  className="w-full gap-2"
                >
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                  Usar este vídeo
                </Button>
              )}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
