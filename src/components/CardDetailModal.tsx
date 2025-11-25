import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Upload, Image as ImageIcon, FileVideo, X } from "lucide-react";
import { toast } from "sonner";

interface UploadedFile {
  id: string;
  name: string;
  url: string;
  type: "material" | "final";
  fileType: "image" | "video";
  uploadedAt: string;
}

interface CardDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  cardId: string;
  cardTitle: string;
  onCoverUpdate: (coverUrl: string, isVideo?: boolean) => void;
}

export const CardDetailModal = ({ isOpen, onClose, cardId, cardTitle, onCoverUpdate }: CardDetailModalProps) => {
  const [uploads, setUploads] = useState<UploadedFile[]>([]);
  const storageKey = `card-uploads-${cardId}`;

  useEffect(() => {
    const saved = localStorage.getItem(storageKey);
    if (saved) {
      try {
        setUploads(JSON.parse(saved));
      } catch {}
    }
  }, [storageKey]);

  const saveUploads = (newUploads: UploadedFile[]) => {
    setUploads(newUploads);
    localStorage.setItem(storageKey, JSON.stringify(newUploads));
    
    // Update cover with first final art (prioritize images, then videos)
    const firstFinalImage = newUploads.find(u => u.type === "final" && u.fileType === "image");
    const firstFinalVideo = newUploads.find(u => u.type === "final" && u.fileType === "video");
    
    if (firstFinalImage) {
      onCoverUpdate(firstFinalImage.url, false);
    } else if (firstFinalVideo) {
      onCoverUpdate(firstFinalVideo.url, true);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>, type: "material" | "final") => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const file = files[0];
    const isVideo = file.type.startsWith("video/");
    const isImage = file.type.startsWith("image/");

    if (!isImage && !isVideo) {
      toast.error("Por favor, selecione uma imagem ou vídeo");
      return;
    }

    // Convert to base64 for storage
    const reader = new FileReader();
    reader.onload = () => {
      const newFile: UploadedFile = {
        id: Date.now().toString(),
        name: file.name,
        url: reader.result as string,
        type,
        fileType: isVideo ? "video" : "image",
        uploadedAt: new Date().toISOString(),
      };

      const newUploads = [...uploads, newFile];
      saveUploads(newUploads);
      toast.success(`${type === "material" ? "Material" : "Arte"} adicionado!`);
    };
    reader.readAsDataURL(file);
  };

  const handleRemoveFile = (id: string) => {
    const newUploads = uploads.filter(u => u.id !== id);
    saveUploads(newUploads);
    toast.success("Arquivo removido!");
  };

  const materialUploads = uploads.filter(u => u.type === "material");
  const finalUploads = uploads.filter(u => u.type === "final");

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{cardTitle}</DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="materials" className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="materials">
              <Upload className="mr-2 h-4 w-4" />
              Materiais ({materialUploads.length})
            </TabsTrigger>
            <TabsTrigger value="final">
              <ImageIcon className="mr-2 h-4 w-4" />
              Artes Prontas ({finalUploads.length})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="materials" className="space-y-4">
            <div>
              <label htmlFor="material-upload" className="cursor-pointer">
                <div className="border-2 border-dashed border-primary/40 rounded-lg p-8 text-center hover:border-primary/60 transition-colors">
                  <Upload className="mx-auto h-12 w-12 text-muted-foreground mb-2" />
                  <p className="text-sm text-muted-foreground">
                    Clique para fazer upload de materiais
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Imagens ou vídeos para usar na criação
                  </p>
                </div>
                <input
                  id="material-upload"
                  type="file"
                  accept="image/*,video/*"
                  className="hidden"
                  onChange={(e) => handleFileUpload(e, "material")}
                />
              </label>
            </div>

            <div className="grid grid-cols-3 gap-4">
              {materialUploads.map((file) => (
                <div key={file.id} className="relative group">
                  {file.fileType === "image" ? (
                    <img
                      src={file.url}
                      alt={file.name}
                      className="w-full h-32 object-cover rounded-lg"
                    />
                  ) : (
                    <div className="w-full h-32 bg-muted rounded-lg flex items-center justify-center">
                      <FileVideo className="h-8 w-8 text-muted-foreground" />
                    </div>
                  )}
                  <Button
                    variant="destructive"
                    size="icon"
                    className="absolute top-2 right-2 h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
                    onClick={() => handleRemoveFile(file.id)}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                  <p className="text-xs text-muted-foreground mt-1 truncate">{file.name}</p>
                </div>
              ))}
            </div>
          </TabsContent>

          <TabsContent value="final" className="space-y-4">
            <div>
              <label htmlFor="final-upload" className="cursor-pointer">
                <div className="border-2 border-dashed border-primary/40 rounded-lg p-8 text-center hover:border-primary/60 transition-colors">
                  <ImageIcon className="mx-auto h-12 w-12 text-muted-foreground mb-2" />
                  <p className="text-sm text-muted-foreground">
                    Clique para fazer upload de artes prontas
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Primeira imagem será a capa do card
                  </p>
                </div>
                <input
                  id="final-upload"
                  type="file"
                  accept="image/*,video/*"
                  className="hidden"
                  onChange={(e) => handleFileUpload(e, "final")}
                />
              </label>
            </div>

            <div className="grid grid-cols-3 gap-4">
              {finalUploads.map((file, index) => (
                <div key={file.id} className="relative group">
                  {file.fileType === "image" ? (
                    <img
                      src={file.url}
                      alt={file.name}
                      className="w-full h-32 object-cover rounded-lg"
                    />
                  ) : (
                    <div className="w-full h-32 bg-muted rounded-lg flex items-center justify-center">
                      <FileVideo className="h-8 w-8 text-muted-foreground" />
                    </div>
                  )}
                  {index === 0 && (
                    <div className="absolute top-2 left-2 bg-primary text-primary-foreground text-xs px-2 py-1 rounded">
                      Capa
                    </div>
                  )}
                  <Button
                    variant="destructive"
                    size="icon"
                    className="absolute top-2 right-2 h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
                    onClick={() => handleRemoveFile(file.id)}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                  <p className="text-xs text-muted-foreground mt-1 truncate">{file.name}</p>
                </div>
              ))}
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
};
