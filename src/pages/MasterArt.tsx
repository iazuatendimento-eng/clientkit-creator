import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { MasterArtEditor } from "@/components/MasterArtEditor";
import { BatchArtGenerator } from "@/components/BatchArtGenerator";
import { BatchHistory } from "@/components/BatchHistory";
import { BatchHistoryEditor } from "@/components/BatchHistoryEditor";
import { BatchGeneration } from "@/lib/batchHistory";
import { useToast } from "@/hooks/use-toast";

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
  const [view, setView] = useState<"editor" | "batch" | "history" | "history-edit">("editor");
  const [template, setTemplate] = useState<MasterTemplate | null>(null);
  const [teamFilter, setTeamFilter] = useState<TeamFilter>(undefined);
  const [editingBatch, setEditingBatch] = useState<BatchGeneration | null>(null);

  // Multi-team queue state
  const [teamQueue, setTeamQueue] = useState<string[]>([]);
  const [currentTeamIndex, setCurrentTeamIndex] = useState(0);
  const [isMultiTeamMode, setIsMultiTeamMode] = useState(false);

  const handleGenerateBatch = (newTemplate: MasterTemplate, filter: TeamFilter) => {
    setTemplate(newTemplate);
    setTeamFilter(filter);
    setIsMultiTeamMode(false);
    setTeamQueue([]);
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

    setTemplate(newTemplate);
    setTeamQueue(teamNames);
    setCurrentTeamIndex(0);
    setTeamFilter(teamNames[0]);
    setEditingBatch(null);
    setIsMultiTeamMode(true);
    setView("batch");

    toast({
      title: `Gerando para ${teamNames.length} equipes`,
      description: `Equipe 1/${teamNames.length}: ${teamNames[0]}`,
    });
  };

  const handleBackToEditor = () => {
    setView("editor");
    setIsMultiTeamMode(false);
    setTeamQueue([]);
  };

  const handleComplete = () => {
    if (isMultiTeamMode && currentTeamIndex < teamQueue.length - 1) {
      const nextIndex = currentTeamIndex + 1;
      setCurrentTeamIndex(nextIndex);
      setTeamFilter(teamQueue[nextIndex]);
      setEditingBatch(null);
      setView("editor");
      setTimeout(() => {
        setView("batch");
        toast({
          title: `Equipe ${nextIndex + 1}/${teamQueue.length}: ${teamQueue[nextIndex]}`,
          description: `${teamQueue.length - nextIndex - 1} restante(s)`,
        });
      }, 100);
    } else {
      setIsMultiTeamMode(false);
      setTeamQueue([]);
      navigate("/");
    }
  };

  const handleBatchBack = () => {
    if (isMultiTeamMode && currentTeamIndex < teamQueue.length - 1) {
      const nextIndex = currentTeamIndex + 1;
      setCurrentTeamIndex(nextIndex);
      setTeamFilter(teamQueue[nextIndex]);
      setEditingBatch(null);
      setView("editor");
      setTimeout(() => {
        setView("batch");
        toast({
          title: `Equipe ${nextIndex + 1}/${teamQueue.length}: ${teamQueue[nextIndex]}`,
          description: `${teamQueue.length - nextIndex - 1} restante(s)`,
        });
      }, 100);
    } else {
      handleBackToEditor();
    }
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
    setIsMultiTeamMode(false);
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
      <div className="relative">
        {isMultiTeamMode && (
          <div className="bg-primary/10 border-b border-primary/20 px-4 py-2 flex items-center justify-between text-sm">
            <span className="font-medium">
              Equipe {currentTeamIndex + 1} de {teamQueue.length}: <strong>{teamQueue[currentTeamIndex]}</strong>
            </span>
            <span className="text-muted-foreground">
              {teamQueue.length - currentTeamIndex - 1} restante(s)
            </span>
          </div>
        )}
        <BatchArtGenerator
          key={`${teamFilter}-${currentTeamIndex}`}
          template={template}
          initialTeamFilter={teamFilter}
          initialBatch={editingBatch || undefined}
          onBack={handleBatchBack}
          onComplete={handleComplete}
        />
      </div>
    );
  }

  return (
    <MasterArtEditor
      onBack={() => navigate("/")}
      onGenerateBatch={handleGenerateBatch}
      onGenerateAllTeams={handleGenerateAllTeams}
      onOpenHistory={handleOpenHistory}
    />
  );
};

export default MasterArt;
