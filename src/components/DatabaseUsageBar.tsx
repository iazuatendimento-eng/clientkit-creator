import { useState, useEffect } from "react";
import { Progress } from "@/components/ui/progress";
import { Database } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

// Estimated average row sizes in KB
const TABLE_AVG_SIZES: Record<string, number> = {
  batch_generations: 50,   // JSONB heavy
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

const MAX_MB = 500; // Limit reference in MB

export const DatabaseUsageBar = () => {
  const [usageMB, setUsageMB] = useState<number | null>(null);
  const [breakdown, setBreakdown] = useState<{ table: string; count: number; mb: number }[]>([]);

  useEffect(() => {
    const fetchUsage = async () => {
      const tables = Object.keys(TABLE_AVG_SIZES);
      const results: { table: string; count: number; mb: number }[] = [];

      // Fetch counts in parallel
      const promises = tables.map(async (table) => {
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

      const counts = await Promise.all(promises);

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
  }, []);

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
        <span className={`font-semibold ${color}`}>
          ~{usageMB} MB / {MAX_MB} MB
        </span>
      </div>
      <Progress value={percentage} className="h-2" />
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        {breakdown.filter(b => b.count > 0).slice(0, 5).map(b => (
          <span key={b.table}>
            {b.table.replace(/_/g, " ")}: {b.count} ({b.mb}MB)
          </span>
        ))}
      </div>
    </div>
  );
};
