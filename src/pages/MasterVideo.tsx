import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { MasterVideoEditor } from "@/components/MasterVideoEditor";
import { BatchVideoGenerator } from "@/components/BatchVideoGenerator";
import { BatchHistory } from "@/components/BatchHistory";
import { BatchGeneration } from "@/lib/batchHistory";
import { useToast } from "@/hooks/use-toast";

interface VideoTemplate {
  id: string;
  name: string;
  contentElements: any[];
  signatureElements: any[];
  width: number;
  height: number;
  backgroundColor: string;
  pageDuration: number;
  audioUrl1?: string;
  audioUrl2?: string;
}

const MasterVideo = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [view, setView] = useState<"editor" | "batch" | "history">("editor");
  const [template, setTemplate] = useState<VideoTemplate | null>(null);
  const [editingBatch, setEditingBatch] = useState<BatchGeneration | null>(null);
  const [teamFilter, setTeamFilter] = useState<string | undefined>(undefined);

  // Multi-team queue state
  const [teamQueue, setTeamQueue] = useState<string[]>([]);
  const [currentTeamIndex, setCurrentTeamIndex] = useState(0);
  const [isMultiTeamMode, setIsMultiTeamMode] = useState(false);

  const handleGenerateBatch = (newTemplate: VideoTemplate, newTeamFilter?: string) => {
    setTemplate(newTemplate);
    setTeamFilter(newTeamFilter);
    setEditingBatch(null);
    setIsMultiTeamMode(false);
    setTeamQueue([]);
    setView("batch");
  };

  const handleGenerateAllTeams = async (newTemplate: VideoTemplate) => {
    // Fetch all teams
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
      // Move to next team
      const nextIndex = currentTeamIndex + 1;
      setCurrentTeamIndex(nextIndex);
      setTeamFilter(teamQueue[nextIndex]);
      setEditingBatch(null);
      // Force re-mount of BatchVideoGenerator by toggling view
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
      // In multi-team mode, "Voltar" saves current and moves to next team
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
    const audioUrl1 = snap.audioUrl1 || snap.audio_url_1 || undefined;
    const audioUrl2 = snap.audioUrl2 || snap.audio_url_2 || undefined;

    const batchTemplate: VideoTemplate = {
      id: snap.id || batch.id,
      name: snap.name || "Template",
      contentElements: snap.contentElements || snap.content_elements || [],
      signatureElements: snap.signatureElements || snap.signature_elements || [],
      width: snap.width || 1080,
      height: snap.height || 1920,
      backgroundColor: snap.backgroundColor || snap.background_color || "#ffffff",
      pageDuration: snap.pageDuration || snap.page_duration || 3,
      audioUrl1,
      audioUrl2,
    };
    setTemplate(batchTemplate);
    setTeamFilter(snap.teamFilter || undefined);
    setEditingBatch(batch);
    setIsMultiTeamMode(false);
    setView("batch");

    // Load audio from master template asynchronously if missing
    if (!audioUrl1 && !audioUrl2 && snap.id) {
      supabase
        .from("master_video_templates")
        .select("audio_url_1, audio_url_2")
        .eq("id", snap.id)
        .maybeSingle()
        .then(({ data }) => {
          if (data) {
            setTemplate((prev) =>
              prev
                ? {
                    ...prev,
                    audioUrl1: (data as any).audio_url_1 || prev.audioUrl1,
                    audioUrl2: (data as any).audio_url_2 || prev.audioUrl2,
                  }
                : prev
            );
          }
        });
    }
  };

  if (view === "history") {
    return (
      <BatchHistory
        onBack={handleBackToEditor}
        onEditBatch={handleEditBatch}
        filterType="video"
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
        <BatchVideoGenerator
          key={`${teamFilter}-${currentTeamIndex}`}
          template={template}
          initialTeamFilter={teamFilter}
          initialBatch={editingBatch || undefined}
          onBack={handleBatchBack}
          onComplete={handleComplete}
          autoAdvance={isMultiTeamMode}
        />
      </div>
    );
  }

  return (
    <MasterVideoEditor
      onBack={() => navigate("/")}
      onGenerateBatch={handleGenerateBatch}
      onGenerateAllTeams={handleGenerateAllTeams}
      onOpenHistory={handleOpenHistory}
    />
  );
};

export default MasterVideo;
