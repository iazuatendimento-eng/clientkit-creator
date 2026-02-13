import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Image as ImageIcon, FileVideo, X, Download, Loader2, FolderOpen, Clock } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";
import { createCardUpload, getCardUploads, deleteCardUpload } from "@/lib/clientDatabase";
import { supabase } from "@/integrations/supabase/client";

const getMimeFromName = (name: string): string => {
  const ext = name.split('.').pop()?.toLowerCase();
  if (ext === 'mp4' || ext === 'mpg' || ext === 'mpeg') return 'video/mp4';
  if (ext === 'mov') return 'video/quicktime';
  if (ext === 'webm') return 'video/webm';
  if (ext === 'png') return 'image/png';
  if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg';
  if (ext === 'webp') return 'image/webp';
  if (ext === 'gif') return 'image/gif';
  return 'application/octet-stream';
};

const downloadFile = async (url: string, fileName: string) => {
  try {
    toast.loading("Preparando arquivo...", { id: "download-prep" });
    
    // Force original format by adding ?download param to Supabase Storage URL
    const downloadUrl = url.includes('supabase') 
      ? `${url}?download=${encodeURIComponent(fileName)}`
      : url;
    
    const link = document.createElement('a');
    link.href = downloadUrl;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.dismiss("download-prep");
    toast.success("Download concluído!");
  } catch (error) {
    toast.dismiss("download-prep");
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
  const [uploadingMaterial, setUploadingMaterial] = useState(false);
  const [uploadingFinal, setUploadingFinal] = useState(false);

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
        // Don't call onCoverUpdate here - it causes the parent to re-render and close the modal
      } catch (error) {
        console.error("Error loading uploads:", error);
      }
    };

    if (isOpen) {
      loadUploads();
    }
  }, [cardId, isOpen]);

  const updateCover = (newUploads: UploadedFile[]) => {
    const finalUps = newUploads.filter(u => u.type === "final");
    if (finalUps.length === 0) return;
    // Last uploaded final file is the cover
    const sorted = [...finalUps].sort((a, b) => new Date(a.uploadedAt).getTime() - new Date(b.uploadedAt).getTime());
    const lastFinal = sorted[sorted.length - 1];
    const isVideo = lastFinal.fileType === "video";
    onCoverUpdate(lastFinal.url, isVideo);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>, uploadType: "material" | "final") => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const file = files[0];
    const isVideo = file.type.startsWith("video/");
    const isImage = file.type.startsWith("image/");

    if (!isImage && !isVideo) {
      toast.error("Por favor, selecione uma imagem ou vídeo");
      return;
    }

    const setLoading = uploadType === "material" ? setUploadingMaterial : setUploadingFinal;
    setLoading(true);

    try {
      const fileExt = file.name.split('.').pop();
      const filePath = `${cardId}/${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;

      const { error: storageError } = await supabase.storage
        .from("card-uploads")
        .upload(filePath, file, {
          contentType: file.type,
          upsert: false,
        });

      if (storageError) {
        console.error("Storage upload error:", storageError);
        toast.error("Erro ao fazer upload do arquivo");
        setLoading(false);
        return;
      }

      const { data: publicUrlData } = supabase.storage
        .from("card-uploads")
        .getPublicUrl(filePath);

      const publicUrl = publicUrlData.publicUrl;

      const uploadData = {
        card_id: cardId,
        file_url: publicUrl,
        file_name: file.name,
        file_type: file.type,
        upload_type: uploadType,
      };

      const savedUpload = await createCardUpload(uploadData);

      const newFile: UploadedFile = {
        id: savedUpload.id,
        name: savedUpload.file_name,
        url: savedUpload.file_url,
        type: uploadType,
        fileType: isVideo ? "video" : "image",
        uploadedAt: savedUpload.uploaded_at || new Date().toISOString(),
      };

      const newUploads = [...uploads, newFile];
      setUploads(newUploads);
      if (uploadType === "final") {
        updateCover(newUploads);
      }
      toast.success(uploadType === "material" ? "Material adicionado!" : "Arte finalizada adicionada!");
    } catch (error) {
      console.error("Error uploading file:", error);
      toast.error("Erro ao fazer upload");
    } finally {
      setLoading(false);
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

  const materialUploads = uploads.filter(u => u.type === "material");
  const finalUploads = uploads.filter(u => u.type === "final");

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{cardTitle}</DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* Materiais Section */}
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-muted-foreground flex items-center gap-2">
              <FolderOpen className="h-4 w-4" />
              Materiais
            </h3>
            <label htmlFor="material-upload" className={`cursor-pointer block ${uploadingMaterial ? 'pointer-events-none opacity-50' : ''}`}>
              <div className="border-2 border-dashed border-muted-foreground/30 rounded-lg p-6 text-center hover:border-muted-foreground/50 transition-colors">
                {uploadingMaterial ? (
                  <>
                    <Loader2 className="mx-auto h-8 w-8 text-muted-foreground animate-spin mb-2" />
                    <p className="text-sm text-muted-foreground">Enviando material...</p>
                  </>
                ) : (
                  <>
                    <FolderOpen className="mx-auto h-8 w-8 text-muted-foreground mb-2" />
                    <p className="text-sm text-muted-foreground">Clique para fazer upload de materiais de referência</p>
                    <p className="text-xs text-muted-foreground mt-1">Esses arquivos não aparecerão na miniatura do card</p>
                  </>
                )}
              </div>
              <input
                id="material-upload"
                type="file"
                accept="image/*,video/*"
                className="hidden"
                onChange={(e) => handleFileUpload(e, "material")}
                disabled={uploadingMaterial}
              />
            </label>

            {materialUploads.length > 0 && (
              <div className="grid grid-cols-3 gap-3">
                {materialUploads.map((file) => (
                  <div key={file.id} className="relative group">
                    {file.fileType === "image" ? (
                      <img src={file.url} alt={file.name} className="w-full h-28 object-cover rounded-lg opacity-80" />
                    ) : (
                      <video src={file.url} className="w-full h-28 object-cover rounded-lg opacity-80" muted />
                    )}
                    <div className="absolute top-1 right-1 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <Button variant="secondary" size="icon" className="h-6 w-6" onClick={() => downloadFile(file.url, file.name)} title="Baixar">
                        <Download className="h-3 w-3" />
                      </Button>
                      <Button variant="destructive" size="icon" className="h-6 w-6" onClick={() => handleRemoveFile(file.id)}>
                        <X className="h-3 w-3" />
                      </Button>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1 truncate">{file.name}</p>
                    <p className="text-xs text-muted-foreground flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {format(new Date(file.uploadedAt), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Finalizados Section */}
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-primary flex items-center gap-2">
              <ImageIcon className="h-4 w-4" />
              Finalizados
            </h3>
            <label htmlFor="final-upload" className={`cursor-pointer block ${uploadingFinal ? 'pointer-events-none opacity-50' : ''}`}>
              <div className="border-2 border-dashed border-primary/40 rounded-lg p-6 text-center hover:border-primary/60 transition-colors">
                {uploadingFinal ? (
                  <>
                    <Loader2 className="mx-auto h-8 w-8 text-primary animate-spin mb-2" />
                    <p className="text-sm text-muted-foreground">Enviando arte finalizada...</p>
                  </>
                ) : (
                  <>
                    <ImageIcon className="mx-auto h-8 w-8 text-muted-foreground mb-2" />
                    <p className="text-sm text-muted-foreground">Clique para fazer upload de artes finalizadas</p>
                    <p className="text-xs text-muted-foreground mt-1">Último upload será a capa do card</p>
                  </>
                )}
              </div>
              <input
                id="final-upload"
                type="file"
                accept="image/*,video/*"
                className="hidden"
                onChange={(e) => handleFileUpload(e, "final")}
                disabled={uploadingFinal}
              />
            </label>

            {finalUploads.length > 0 && (
              <div className="grid grid-cols-3 gap-3">
                {finalUploads.map((file, index) => {
                  const isLast = index === finalUploads.length - 1;
                  return (
                  <div key={file.id} className="relative group">
                    {file.fileType === "image" ? (
                      <img src={file.url} alt={file.name} className="w-full h-28 object-cover rounded-lg" />
                    ) : (
                      <video src={file.url} className="w-full h-28 object-cover rounded-lg" muted />
                    )}
                    {isLast && (
                      <div className="absolute top-1 left-1 bg-primary text-primary-foreground text-xs px-2 py-0.5 rounded">
                        Capa
                      </div>
                    )}
                    <div className="absolute top-1 right-1 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <Button variant="secondary" size="icon" className="h-6 w-6" onClick={() => downloadFile(file.url, file.name)} title="Baixar">
                        <Download className="h-3 w-3" />
                      </Button>
                      <Button variant="destructive" size="icon" className="h-6 w-6" onClick={() => handleRemoveFile(file.id)}>
                        <X className="h-3 w-3" />
                      </Button>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1 truncate">{file.name}</p>
                    <p className="text-xs text-muted-foreground flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {format(new Date(file.uploadedAt), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                    </p>
                  </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
