import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Upload, FileImage, Video, X, File } from "lucide-react";
import { toast } from "sonner";

export interface UploadedFile {
  id: string;
  name: string;
  type: "material" | "final";
  fileType: "image" | "video" | "other";
  url: string;
  uploadedAt: string;
}

interface FileUploadProps {
  projectId: string;
  onUploadComplete: (files: UploadedFile[]) => void;
  existingFiles?: UploadedFile[];
}

export const FileUpload = ({ projectId, onUploadComplete, existingFiles = [] }: FileUploadProps) => {
  const [files, setFiles] = useState<UploadedFile[]>(existingFiles);
  const [activeTab, setActiveTab] = useState<"material" | "final">("material");

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>, category: "material" | "final") => {
    const selectedFiles = Array.from(e.target.files || []);
    
    if (selectedFiles.length === 0) return;

    const newFiles: UploadedFile[] = [];

    for (const file of selectedFiles) {
      // Create a local URL for the file
      const url = URL.createObjectURL(file);
      
      let fileType: "image" | "video" | "other" = "other";
      if (file.type.startsWith("image/")) fileType = "image";
      else if (file.type.startsWith("video/")) fileType = "video";

      const uploadedFile: UploadedFile = {
        id: `${Date.now()}-${Math.random()}`,
        name: file.name,
        type: category,
        fileType,
        url,
        uploadedAt: new Date().toISOString(),
      };

      newFiles.push(uploadedFile);
    }

    const updatedFiles = [...files, ...newFiles];
    setFiles(updatedFiles);
    onUploadComplete(updatedFiles);
    
    // Save to localStorage
    localStorage.setItem(`uploads-${projectId}`, JSON.stringify(updatedFiles));
    
    toast.success(`${newFiles.length} arquivo(s) enviado(s)!`);
  };

  const handleRemoveFile = (fileId: string) => {
    const updatedFiles = files.filter(f => f.id !== fileId);
    setFiles(updatedFiles);
    onUploadComplete(updatedFiles);
    localStorage.setItem(`uploads-${projectId}`, JSON.stringify(updatedFiles));
    toast.success("Arquivo removido!");
  };

  const renderFilePreview = (file: UploadedFile) => {
    if (file.fileType === "image") {
      return (
        <img src={file.url} alt={file.name} className="w-full h-full object-cover" />
      );
    } else if (file.fileType === "video") {
      return (
        <div className="w-full h-full flex items-center justify-center bg-primary/10">
          <Video className="h-12 w-12 text-primary" />
        </div>
      );
    } else {
      return (
        <div className="w-full h-full flex items-center justify-center bg-muted">
          <File className="h-12 w-12 text-muted-foreground" />
        </div>
      );
    }
  };

  const materialFiles = files.filter(f => f.type === "material");
  const finalFiles = files.filter(f => f.type === "final");

  return (
    <Card className="bg-gradient-card border-primary/20">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Upload className="h-5 w-5" />
          Upload de Arquivos
        </CardTitle>
      </CardHeader>
      <CardContent>
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "material" | "final")}>
          <TabsList className="grid w-full grid-cols-2 mb-4">
            <TabsTrigger value="material">
              Materiais ({materialFiles.length})
            </TabsTrigger>
            <TabsTrigger value="final">
              Artes Prontas ({finalFiles.length})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="material" className="space-y-4">
            <div className="text-sm text-muted-foreground mb-3">
              Faça upload de materiais para criar a arte (logos, fotos, ícones, etc.)
            </div>
            
            <Button asChild variant="outline" className="w-full">
              <label className="cursor-pointer">
                <Upload className="mr-2 h-4 w-4" />
                Adicionar Materiais
                <input
                  type="file"
                  multiple
                  accept="image/*,video/*"
                  className="hidden"
                  onChange={(e) => handleFileSelect(e, "material")}
                />
              </label>
            </Button>

            <div className="grid grid-cols-3 gap-3">
              {materialFiles.map(file => (
                <div key={file.id} className="relative group">
                  <div className="aspect-square rounded-lg overflow-hidden border border-border">
                    {renderFilePreview(file)}
                  </div>
                  <Button
                    variant="destructive"
                    size="sm"
                    className="absolute top-1 right-1 h-6 w-6 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
                    onClick={() => handleRemoveFile(file.id)}
                  >
                    <X className="h-3 w-3" />
                  </Button>
                  <p className="text-xs text-center mt-1 truncate">{file.name}</p>
                </div>
              ))}
            </div>
          </TabsContent>

          <TabsContent value="final" className="space-y-4">
            <div className="text-sm text-muted-foreground mb-3">
              Faça upload de artes e vídeos prontos
            </div>
            
            <Button asChild variant="outline" className="w-full">
              <label className="cursor-pointer">
                <Upload className="mr-2 h-4 w-4" />
                Adicionar Artes Prontas
                <input
                  type="file"
                  multiple
                  accept="image/*,video/*"
                  className="hidden"
                  onChange={(e) => handleFileSelect(e, "final")}
                />
              </label>
            </Button>

            <div className="grid grid-cols-3 gap-3">
              {finalFiles.map(file => (
                <div key={file.id} className="relative group">
                  <div className="aspect-square rounded-lg overflow-hidden border border-border">
                    {renderFilePreview(file)}
                  </div>
                  <Button
                    variant="destructive"
                    size="sm"
                    className="absolute top-1 right-1 h-6 w-6 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
                    onClick={() => handleRemoveFile(file.id)}
                  >
                    <X className="h-3 w-3" />
                  </Button>
                  <p className="text-xs text-center mt-1 truncate">{file.name}</p>
                </div>
              ))}
            </div>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
};
