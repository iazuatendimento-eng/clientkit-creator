import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ArrowLeft, Upload, FileSpreadsheet, Send, X, CheckCircle, AlertCircle, Loader2 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

interface CsvRow {
  clientName: string;
  fileName: string;
  emails: string[];
  bodyText: string;
  status: "pending" | "sending" | "sent" | "error";
  errorMsg?: string;
}

const SendMedia = () => {
  const navigate = useNavigate();
  const [csvRows, setCsvRows] = useState<CsvRow[]>([]);
  const [uploadedFiles, setUploadedFiles] = useState<File[]>([]);
  const [isSending, setIsSending] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const csvInputRef = useRef<HTMLInputElement>(null);

  const parseCsv = (text: string) => {
    const lines = text.split("\n").map(l => l.trim()).filter(Boolean);
    const rows: CsvRow[] = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      // Skip header if it looks like one
      if (i === 0 && (line.toLowerCase().includes("cliente") || line.toLowerCase().includes("client") || line.toLowerCase().includes("nome"))) {
        continue;
      }
      // Support comma or semicolon separator
      const sep = line.includes(";") ? ";" : ",";
      const parts = line.split(sep).map(p => p.trim().replace(/^"|"$/g, ""));
      if (parts.length >= 3) {
        const emailList = [parts[2], parts[3], parts[4]]
          .filter(p => p && p.includes("@"));
        // bodyText is the first part after the emails that doesn't look like an email
        const remaining = parts.slice(2);
        const bodyParts = remaining.filter(p => !p.includes("@"));
        rows.push({
          clientName: parts[0],
          fileName: parts[1],
          emails: emailList.length > 0 ? emailList : [parts[2]],
          bodyText: bodyParts[0] || "",
          status: "pending",
        });
      }
    }
    return rows;
  };

  const handleCsvUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      const rows = parseCsv(text);
      if (rows.length === 0) {
        toast.error("CSV vazio ou formato inválido. Use: nome cliente, nome arquivo, e-mail, texto");
        return;
      }
      setCsvRows(rows);
      toast.success(`${rows.length} linha(s) carregada(s) do CSV`);
    };
    reader.readAsText(file);
    if (csvInputRef.current) csvInputRef.current.value = "";
  };

  const handleFilesUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    setUploadedFiles(prev => [...prev, ...files]);
    toast.success(`${files.length} arquivo(s) adicionado(s)`);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const removeFile = (index: number) => {
    setUploadedFiles(prev => prev.filter((_, i) => i !== index));
  };

  const findFile = (fileName: string): File | undefined => {
    // Try exact match first, then partial
    return uploadedFiles.find(f => f.name === fileName)
      || uploadedFiles.find(f => f.name.toLowerCase() === fileName.toLowerCase())
      || uploadedFiles.find(f => f.name.toLowerCase().includes(fileName.toLowerCase()));
  };

  const uploadToStorage = async (file: File, clientName: string): Promise<string> => {
    const safeName = clientName.replace(/[^a-zA-Z0-9]/g, "_");
    const path = `send-media/${safeName}/${Date.now()}_${file.name}`;
    const { error } = await supabase.storage.from("card-uploads").upload(path, file);
    if (error) throw error;
    const { data } = supabase.storage.from("card-uploads").getPublicUrl(path);
    return data.publicUrl;
  };

  const handleSendAll = async () => {
    if (csvRows.length === 0) {
      toast.error("Carregue um CSV primeiro");
      return;
    }

    // Check all files exist
    const missing = csvRows.filter(r => !findFile(r.fileName));
    if (missing.length > 0) {
      toast.error(`Arquivos não encontrados: ${missing.map(m => m.fileName).join(", ")}`);
      return;
    }

    setIsSending(true);

    // Group rows by email+clientName so carousel PNGs go in one email
    const groups = new Map<string, number[]>();
    csvRows.forEach((row, i) => {
      const key = `${row.emails[0]}|||${row.clientName}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(i);
    });

    const updated = [...csvRows];

    for (const [, indices] of groups) {
      // Mark all rows in group as sending
      for (const i of indices) {
        updated[i] = { ...updated[i], status: "sending" };
      }
      setCsvRows([...updated]);

      try {
        // Upload all files in the group
        const mediaUrls: string[] = [];
        let hasVideo = false;
        for (const i of indices) {
          const file = findFile(updated[i].fileName)!;
          const publicUrl = await uploadToStorage(file, updated[i].clientName);
          mediaUrls.push(publicUrl);
          if (file.type.startsWith("video/")) hasVideo = true;
        }

        const firstRow = updated[indices[0]];
        const bodyText = indices.map(i => updated[i].bodyText).filter(Boolean).join("\n");

        const { data, error } = await supabase.functions.invoke("send-media-email", {
          body: {
            emails: [firstRow.email],
            subject: `Arte - ${firstRow.clientName}`,
            mediaUrls,
            mediaType: hasVideo ? "video" : "image",
            clientName: firstRow.clientName,
            cardText: bodyText || undefined,
          },
        });

        if (error) throw error;
        if (data && !data.success) throw new Error(data.error || "Erro no envio");

        for (const i of indices) {
          updated[i] = { ...updated[i], status: "sent" };
        }
      } catch (err: any) {
        for (const i of indices) {
          updated[i] = { ...updated[i], status: "error", errorMsg: err.message };
        }
      }
      setCsvRows([...updated]);
    }

    const sent = updated.filter(r => r.status === "sent").length;
    const errors = updated.filter(r => r.status === "error").length;
    toast.success(`Envio concluído: ${sent} enviado(s), ${errors} erro(s)`);
    setIsSending(false);
  };

  const statusIcon = (status: CsvRow["status"]) => {
    switch (status) {
      case "pending": return <div className="w-3 h-3 rounded-full bg-muted-foreground/40" />;
      case "sending": return <Loader2 className="w-4 h-4 animate-spin text-primary" />;
      case "sent": return <CheckCircle className="w-4 h-4 text-green-500" />;
      case "error": return <AlertCircle className="w-4 h-4 text-destructive" />;
    }
  };

  return (
    <div className="min-h-screen bg-background p-4 md:p-8">
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate("/")}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <h1 className="text-2xl font-bold">Enviar Mídias</h1>
        </div>

        <div className="grid md:grid-cols-2 gap-4">
          {/* CSV Upload */}
          <Card className="border-primary/20">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <FileSpreadsheet className="h-5 w-5" />
                1. Carregar CSV
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Formato: <code className="bg-muted px-1 rounded">nome cliente, nome arquivo, e-mail, texto</code>
              </p>
              <Button asChild variant="outline" className="w-full">
                <label className="cursor-pointer">
                  <Upload className="mr-2 h-4 w-4" />
                  Selecionar CSV
                  <input
                    ref={csvInputRef}
                    type="file"
                    accept=".csv,.txt"
                    className="hidden"
                    onChange={handleCsvUpload}
                  />
                </label>
              </Button>
              {csvRows.length > 0 && (
                <p className="text-sm text-primary font-medium">{csvRows.length} linha(s) carregada(s)</p>
              )}
            </CardContent>
          </Card>

          {/* Files Upload */}
          <Card className="border-primary/20">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Upload className="h-5 w-5" />
                2. Upload dos Arquivos
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Faça upload das artes/vídeos referenciados no CSV
              </p>
              <Button asChild variant="outline" className="w-full">
                <label className="cursor-pointer">
                  <Upload className="mr-2 h-4 w-4" />
                  Adicionar Arquivos
                  <input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    accept="image/*,video/*"
                    className="hidden"
                    onChange={handleFilesUpload}
                  />
                </label>
              </Button>
              {uploadedFiles.length > 0 && (
                <div className="space-y-1 max-h-32 overflow-y-auto">
                  {uploadedFiles.map((f, i) => (
                    <div key={i} className="flex items-center justify-between text-sm bg-muted rounded px-2 py-1">
                      <span className="truncate flex-1">{f.name}</span>
                      <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => removeFile(i)}>
                        <X className="h-3 w-3" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Preview Table */}
        {csvRows.length > 0 && (
          <Card className="border-primary/20">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Lista de Envios</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="text-left py-2 px-2">Status</th>
                      <th className="text-left py-2 px-2">Cliente</th>
                      <th className="text-left py-2 px-2">Arquivo</th>
                      <th className="text-left py-2 px-2">E-mail</th>
                      <th className="text-left py-2 px-2">Texto</th>
                      <th className="text-left py-2 px-2">Arquivo OK?</th>
                    </tr>
                  </thead>
                  <tbody>
                    {csvRows.map((row, i) => {
                      const fileFound = !!findFile(row.fileName);
                      return (
                        <tr key={i} className="border-b border-border/50">
                          <td className="py-2 px-2">{statusIcon(row.status)}</td>
                          <td className="py-2 px-2">{row.clientName}</td>
                          <td className="py-2 px-2 font-mono text-xs">{row.fileName}</td>
                          <td className="py-2 px-2">{row.email}</td>
                          <td className="py-2 px-2 text-xs max-w-[200px] truncate" title={row.bodyText}>{row.bodyText || "—"}</td>
                          <td className="py-2 px-2">
                            {fileFound ? (
                              <CheckCircle className="w-4 h-4 text-green-500" />
                            ) : (
                              <AlertCircle className="w-4 h-4 text-destructive" />
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div className="mt-4 flex justify-end">
                <Button
                  onClick={handleSendAll}
                  disabled={isSending}
                  className="gap-2"
                >
                  {isSending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  Enviar Todos
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
};

export default SendMedia;
