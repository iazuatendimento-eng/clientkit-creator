import { useState, useEffect } from "react";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { Database, Trash2, Loader2, HardDrive } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

// Estimated average row sizes in KB
const TABLE_AVG_SIZES: Record<string, number> = {
  batch_generations: 50,
  project_briefs: 2,
  client_data: 3,
  card_uploads: 1,
  client_uploads: 1,
  artworks: 5,
  master_templates: 10,
  master_video_templates: 10,
  client_payments: 0.5,
  profiles: 0.5,
  teams: 0.3,
};

const MAX_MB = 500;

const STORAGE_FOLDERS = ["artes", "videos"];

export const DatabaseUsageBar = () => {
  const [usageMB, setUsageMB] = useState<number | null>(null);
  const [breakdown, setBreakdown] = useState<{ table: string; count: number; mb: number }[]>([]);
  const [storageFiles, setStorageFiles] = useState<number>(0);
  const [isCleaning, setIsCleaning] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const { toast } = useToast();

  useEffect(() => {
    const fetchUsage = async () => {
      const tables = Object.keys(TABLE_AVG_SIZES);
      const results: { table: string; count: number; mb: number }[] = [];

      // Fetch DB counts + storage file counts in parallel
      const dbPromises = tables.map(async (table) => {
        try {
          const { count, error } = await supabase
            .from(table as any)
            .select("*", { count: "exact", head: true });
          if (error) return { table, count: 0 };
          return { table, count: count || 0 };
        } catch {
          return { table, count: 0 };
        }
      });

      const storagePromises = STORAGE_FOLDERS.map(async (folder) => {
        try {
          const { data } = await supabase.storage.from("card-uploads").list(folder, { limit: 1000 });
          return data?.length || 0;
        } catch {
          return 0;
        }
      });

      const [counts, storageCounts] = await Promise.all([
        Promise.all(dbPromises),
        Promise.all(storagePromises),
      ]);

      setStorageFiles(storageCounts.reduce((a, b) => a + b, 0));

      let totalKB = 0;
      for (const { table, count } of counts) {
        const avgKB = TABLE_AVG_SIZES[table] || 1;
        const tableKB = count * avgKB;
        totalKB += tableKB;
        results.push({ table, count, mb: parseFloat((tableKB / 1024).toFixed(2)) });
      }

      results.sort((a, b) => b.mb - a.mb);
      setBreakdown(results);
      setUsageMB(parseFloat((totalKB / 1024).toFixed(1)));
    };

    fetchUsage();
  }, [refreshKey]);

  const handleCleanStorage = async () => {
    if (!confirm("Tem certeza que deseja apagar TODOS os arquivos de artes e vídeos do Storage? Esta ação não pode ser desfeita.")) {
      return;
    }

    setIsCleaning(true);
    let totalDeleted = 0;

    try {
      for (const folder of STORAGE_FOLDERS) {
        // List all files in folder (paginate)
        let offset = 0;
        const batchSize = 100;
        let hasMore = true;

        while (hasMore) {
          const { data: files, error } = await supabase.storage
            .from("card-uploads")
            .list(folder, { limit: batchSize, offset });

          if (error || !files || files.length === 0) {
            hasMore = false;
            break;
          }

          const paths = files.map((f) => `${folder}/${f.name}`);
          const { error: removeError } = await supabase.storage
            .from("card-uploads")
            .remove(paths);

          if (removeError) {
            console.error(`Error removing files from ${folder}:`, removeError);
          } else {
            totalDeleted += paths.length;
          }

          if (files.length < batchSize) {
            hasMore = false;
          }
          // Don't increment offset since we're deleting files
        }
      }

      // Also clear card_uploads records and cover fields
      await supabase.from("card_uploads").delete().neq("id", "00000000-0000-0000-0000-000000000000");
      
      // Clear cover_image and cover_video from project_briefs
      await supabase
        .from("project_briefs")
        .update({ cover_image: null, cover_video: null, generated_art_url: null, generated_video_url: null })
        .neq("id", "00000000-0000-0000-0000-000000000000");

      toast({
        title: "Storage limpo!",
        description: `${totalDeleted} arquivos removidos do Storage.`,
      });

      setRefreshKey((k) => k + 1);
    } catch (error) {
      console.error("Error cleaning storage:", error);
      toast({ title: "Erro ao limpar storage", variant: "destructive" });
    } finally {
      setIsCleaning(false);
    }
  };

  if (usageMB === null) return null;

  const percentage = Math.min((usageMB / MAX_MB) * 100, 100);
  const color = percentage > 80 ? "text-destructive" : percentage > 50 ? "text-yellow-500" : "text-green-500";

  return (
    <div className="bg-card border rounded-lg p-3 space-y-2">
      <div className="flex items-center justify-between text-sm">
        <div className="flex items-center gap-2">
          <Database className="h-4 w-4 text-muted-foreground" />
          <span className="font-medium">Uso do Banco</span>
        </div>
        <div className="flex items-center gap-3">
          <span className={`font-semibold ${color}`}>
            ~{usageMB} MB / {MAX_MB} MB
          </span>
          {storageFiles > 0 && (
            <Button
              variant="destructive"
              size="sm"
              className="h-7 text-xs"
              onClick={handleCleanStorage}
              disabled={isCleaning}
            >
              {isCleaning ? (
                <Loader2 className="mr-1 h-3 w-3 animate-spin" />
              ) : (
                <Trash2 className="mr-1 h-3 w-3" />
              )}
              Limpar Storage ({storageFiles} arquivos)
            </Button>
          )}
        </div>
      </div>
      <Progress value={percentage} className="h-2" />
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        {breakdown.filter(b => b.count > 0).slice(0, 5).map(b => (
          <span key={b.table}>
            {b.table.replace(/_/g, " ")}: {b.count} ({b.mb}MB)
          </span>
        ))}
        {storageFiles > 0 && (
          <span className="flex items-center gap-1">
            <HardDrive className="h-3 w-3" />
            storage: {storageFiles} arquivos
          </span>
        )}
      </div>
    </div>
  );
};
