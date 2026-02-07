import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Upload, Image as ImageIcon, FileVideo, X, Download } from "lucide-react";
import { toast } from "sonner";
import { createCardUpload, getCardUploads, deleteCardUpload } from "@/lib/clientDatabase";

const downloadFile = async (url: string, fileName: string) => {
  try {
    const response = await fetch(url);
    const blob = await response.blob();
    const downloadUrl = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = downloadUrl;
    link.download = fileName;
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

  useEffect(() => {
    const loadUploads = async () => {
      try {
        const data = await getCardUploads(cardId);
        const mappedUploads: UploadedFile[] = data.map((upload: any) => ({
          id: upload.id,
          name: upload.file_name,
          url: upload.file_url,
          type: upload.upload_type as "material" | "final",
          fileType: upload.file_type.startsWith("video") ? "video" : "image",
          uploadedAt: upload.uploaded_at || new Date().toISOString(),
        }));
        setUploads(mappedUploads);
      } catch (error) {
        console.error("Error loading uploads:", error);
      }
    };

    if (isOpen) {
      loadUploads();
    }
  }, [cardId, isOpen]);

  const updateCover = (newUploads: UploadedFile[]) => {
    const finalUploads = newUploads.filter(u => u.type === "final");
    const firstFinalImage = finalUploads.find(u => u.fileType === "image");
    const firstFinalVideo = finalUploads.find(u => u.fileType === "video");
    
    if (firstFinalImage) {
      onCoverUpdate(firstFinalImage.url, false);
    } else if (firstFinalVideo) {
      onCoverUpdate(firstFinalVideo.url, true);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const file = files[0];
    const isVideo = file.type.startsWith("video/");
    const isImage = file.type.startsWith("image/");

    if (!isImage && !isVideo) {
      toast.error("Por favor, selecione uma imagem ou vídeo");
      return;
    }

    try {
      const reader = new FileReader();
      reader.onload = async () => {
        const uploadData = {
          card_id: cardId,
          file_url: reader.result as string,
          file_name: file.name,
          file_type: file.type,
          upload_type: "final" as const,
        };

        const savedUpload = await createCardUpload(uploadData);
        
        const newFile: UploadedFile = {
          id: savedUpload.id,
          name: savedUpload.file_name,
          url: savedUpload.file_url,
          type: "final",
          fileType: isVideo ? "video" : "image",
          uploadedAt: savedUpload.uploaded_at || new Date().toISOString(),
        };

        const newUploads = [...uploads, newFile];
        setUploads(newUploads);
        updateCover(newUploads);
        toast.success("Arte adicionada!");
      };
      reader.readAsDataURL(file);
    } catch (error) {
      console.error("Error uploading file:", error);
      toast.error("Erro ao fazer upload");
    }
  };

  const handleRemoveFile = async (id: string) => {
    try {
      await deleteCardUpload(id);
      const newUploads = uploads.filter(u => u.id !== id);
      setUploads(newUploads);
      updateCover(newUploads);
      toast.success("Arquivo removido!");
    } catch (error) {
      console.error("Error removing file:", error);
      toast.error("Erro ao remover arquivo");
    }
  };

  const finalUploads = uploads.filter(u => u.type === "final");

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{cardTitle}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
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
                onChange={handleFileUpload}
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
                  <video
                    src={file.url}
                    className="w-full h-32 object-cover rounded-lg"
                    muted
                  />
                )}
                {index === 0 && (
                  <div className="absolute top-2 left-2 bg-primary text-primary-foreground text-xs px-2 py-1 rounded">
                    Capa
                  </div>
                )}
                <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <Button
                    variant="secondary"
                    size="icon"
                    className="h-6 w-6"
                    onClick={() => downloadFile(file.url, file.name)}
                    title="Baixar"
                  >
                    <Download className="h-3 w-3" />
                  </Button>
                  <Button
                    variant="destructive"
                    size="icon"
                    className="h-6 w-6"
                    onClick={() => handleRemoveFile(file.id)}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground mt-1 truncate">{file.name}</p>
              </div>
            ))}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
