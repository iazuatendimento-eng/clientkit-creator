import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { ArrowLeft, Download, Loader2, CheckCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import JSZip from "jszip";

const TABLES = [
  "client_data",
  "client_payments",
  "client_uploads",
  "clients",
  "project_briefs",
  "card_uploads",
  "artworks",
  "batch_generations",
  "master_templates",
  "master_video_templates",
  "profiles",
  "teams",
] as const;

function arrayToCsv(data: any[]): string {
  if (data.length === 0) return "";
  const headers = Object.keys(data[0]);
  const rows = data.map((row) =>
    headers
      .map((h) => {
        const val = row[h];
        const str = val === null || val === undefined ? "" : typeof val === "object" ? JSON.stringify(val) : String(val);
        return `"${str.replace(/"/g, '""')}"`;
      })
      .join(",")
  );
  return [headers.join(","), ...rows].join("\n");
}

async function fetchAllRows(table: string) {
  const PAGE = 1000;
  let all: any[] = [];
  let from = 0;
  while (true) {
    const { data, error } = await (supabase.from(table as any) as any)
      .select("*")
      .range(from, from + PAGE - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    all = all.concat(data);
    if (data.length < PAGE) break;
    from += PAGE;
  }
  return all;
}

const ExportDatabase = () => {
  const navigate = useNavigate();
  const [exporting, setExporting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [currentTable, setCurrentTable] = useState("");
  const [done, setDone] = useState(false);

  const handleExport = async () => {
    setExporting(true);
    setDone(false);
    setProgress(0);

    try {
      const zip = new JSZip();

      for (let i = 0; i < TABLES.length; i++) {
        const table = TABLES[i];
        setCurrentTable(table);
        setProgress(Math.round(((i) / TABLES.length) * 100));

        const rows = await fetchAllRows(table);
        const csv = rows.length > 0 ? arrayToCsv(rows) : "// tabela vazia";
        zip.file(`${table}.csv`, csv);
      }

      setProgress(100);
      setCurrentTable("Gerando arquivo...");

      const blob = await zip.generateAsync({ type: "blob" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `backup_database_${new Date().toISOString().slice(0, 10)}.zip`;
      a.click();
      URL.revokeObjectURL(url);
      setDone(true);
    } catch (err) {
      console.error("Export error:", err);
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="container mx-auto max-w-xl">
        <div className="flex items-center gap-4 mb-8">
          <Button variant="outline" onClick={() => navigate("/")}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Voltar
          </Button>
          <h1 className="text-2xl font-bold">Exportar Banco de Dados</h1>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Backup completo em ZIP</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Exporta todas as {TABLES.length} tabelas como arquivos CSV dentro de um .zip.
            </p>

            {exporting && (
              <div className="space-y-2">
                <Progress value={progress} />
                <p className="text-xs text-muted-foreground">Exportando: {currentTable}</p>
              </div>
            )}

            {done && (
              <div className="flex items-center gap-2 text-green-500 text-sm">
                <CheckCircle className="h-4 w-4" />
                Download concluído!
              </div>
            )}

            <Button
              onClick={handleExport}
              disabled={exporting}
              className="w-full"
              size="lg"
            >
              {exporting ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Download className="mr-2 h-4 w-4" />
              )}
              {exporting ? "Exportando..." : "Baixar Backup ZIP"}
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default ExportDatabase;
