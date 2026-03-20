import { useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { MasterArtEditor } from "@/components/MasterArtEditor";
import { BatchArtGenerator } from "@/components/BatchArtGenerator";
import { BatchHistory } from "@/components/BatchHistory";
import { BatchGeneration } from "@/lib/batchHistory";
import { useToast } from "@/hooks/use-toast";
import { Loader2 } from "lucide-react";

interface MasterTemplate {
  id: string;
  name: string;
  elements: any[];
  width: number;
  height: number;
  backgroundColor: string;
}

type TeamFilter = string | undefined;

const MasterArt = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [view, setView] = useState<"editor" | "batch" | "history">("editor");
  const [template, setTemplate] = useState<MasterTemplate | null>(null);
  const [teamFilter, setTeamFilter] = useState<TeamFilter>(undefined);
  const [editingBatch, setEditingBatch] = useState<BatchGeneration | null>(null);

  // Multi-team background generation state
  const [teamQueue, setTeamQueue] = useState<string[]>([]);
  const [currentTeamIndex, setCurrentTeamIndex] = useState(0);
  const [isMultiTeamMode, setIsMultiTeamMode] = useState(false);
  const [bgGenTemplate, setBgGenTemplate] = useState<MasterTemplate | null>(null);
  const [bgGenTeamFilter, setBgGenTeamFilter] = useState<string | undefined>(undefined);
  const [bgGenKey, setBgGenKey] = useState(0);

  const handleGenerateBatch = (newTemplate: MasterTemplate, filter: TeamFilter) => {
    setTemplate(newTemplate);
    setTeamFilter(filter);
    setEditingBatch(null);
    setView("batch");
  };

  const handleGenerateAllTeams = async (newTemplate: MasterTemplate) => {
    const { data: teams } = await supabase
      .from("teams")
      .select("name")
      .order("name");

    if (!teams || teams.length === 0) {
      toast({ title: "Nenhuma equipe encontrada", variant: "destructive" });
      return;
    }

    const teamNames = teams.map((t) => t.name).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

    // Start background generation - stay on editor screen
    setIsMultiTeamMode(true);
    setTeamQueue(teamNames);
    setCurrentTeamIndex(0);
    setBgGenTemplate(newTemplate);
    setBgGenTeamFilter(teamNames[0]);
    setBgGenKey(Date.now());

    toast({
      title: `Gerando artes para ${teamNames.length} equipes`,
      description: `Equipe 1/${teamNames.length}: ${teamNames[0]}`,
    });
  };

  const handleBgGenComplete = useCallback(() => {
    setCurrentTeamIndex((prev) => {
      const nextIndex = prev + 1;
      setTeamQueue((queue) => {
        if (nextIndex < queue.length) {
          setBgGenTeamFilter(queue[nextIndex]);
          setBgGenKey(Date.now());
          toast({
            title: `Equipe ${nextIndex + 1}/${queue.length}: ${queue[nextIndex]}`,
            description: `${queue.length - nextIndex - 1} restante(s)`,
          });
        } else {
          // All done
          setIsMultiTeamMode(false);
          setBgGenTemplate(null);
          setBgGenTeamFilter(undefined);
          toast({
            title: "Todas as equipes geradas!",
            description: `${queue.length} equipes processadas. Veja no histórico.`,
          });
        }
        return queue;
      });
      return nextIndex;
    });
  }, [toast]);

  const handleBackToEditor = () => {
    setView("editor");
  };

  const handleOpenHistory = () => {
    setView("history");
  };

  const handleEditBatch = (batch: BatchGeneration) => {
    const snap = batch.template_snapshot as any;
    const batchTemplate: MasterTemplate = {
      id: snap.id || batch.id,
      name: snap.name || "Template",
      elements: snap.elements || [],
      width: snap.width || 1080,
      height: snap.height || 1080,
      backgroundColor: snap.backgroundColor || snap.background_color || "#ffffff",
    };
    setTemplate(batchTemplate);
    setTeamFilter(snap.teamFilter || undefined);
    setEditingBatch(batch);
    setView("batch");
  };

  if (view === "history") {
    return (
      <BatchHistory
        onBack={handleBackToEditor}
        onEditBatch={handleEditBatch}
        filterType="art"
      />
    );
  }

  if (view === "batch" && template) {
    return (
      <BatchArtGenerator
        template={template}
        initialTeamFilter={teamFilter}
        initialBatch={editingBatch || undefined}
        onBack={handleBackToEditor}
        onComplete={() => navigate("/")}
      />
    );
  }

  return (
    <>
      <MasterArtEditor
        onBack={() => navigate("/")}
        onGenerateBatch={handleGenerateBatch}
        onGenerateAllTeams={handleGenerateAllTeams}
        onOpenHistory={handleOpenHistory}
      />

      {/* Background generation overlay */}
      {isMultiTeamMode && (
        <div className="fixed bottom-4 right-4 z-50 bg-card border border-border rounded-lg shadow-lg px-4 py-3 flex items-center gap-3 max-w-sm">
          <Loader2 className="h-5 w-5 animate-spin text-primary shrink-0" />
          <div className="text-sm">
            <p className="font-medium">Gerando artes...</p>
            <p className="text-muted-foreground">
              Equipe {Math.min(currentTeamIndex + 1, teamQueue.length)}/{teamQueue.length}: {teamQueue[Math.min(currentTeamIndex, teamQueue.length - 1)]}
            </p>
          </div>
        </div>
      )}

      {/* Hidden offscreen BatchArtGenerator for background generation */}
      {isMultiTeamMode && bgGenTemplate && bgGenTeamFilter && (
        <div className="fixed -left-[9999px] top-0 w-[1080px] h-[1080px] overflow-hidden pointer-events-none" aria-hidden="true">
          <BatchArtGenerator
            key={`bg-${bgGenTeamFilter}-${bgGenKey}`}
            template={bgGenTemplate}
            initialTeamFilter={bgGenTeamFilter}
            onBack={() => {}}
            onComplete={handleBgGenComplete}
            autoAdvance
          />
        </div>
      )}
    </>
  );
};

export default MasterArt;
