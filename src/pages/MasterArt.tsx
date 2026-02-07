import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { MasterArtEditor } from "@/components/MasterArtEditor";
import { BatchArtGenerator } from "@/components/BatchArtGenerator";
import { BatchHistory } from "@/components/BatchHistory";
import { BatchHistoryEditor } from "@/components/BatchHistoryEditor";
import { BatchGeneration } from "@/lib/batchHistory";

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
  const [view, setView] = useState<"editor" | "batch" | "history" | "history-edit">("editor");
  const [template, setTemplate] = useState<MasterTemplate | null>(null);
  const [teamFilter, setTeamFilter] = useState<TeamFilter>(undefined);
  const [editingBatch, setEditingBatch] = useState<BatchGeneration | null>(null);

  const handleGenerateBatch = (newTemplate: MasterTemplate, filter: TeamFilter) => {
    setTemplate(newTemplate);
    setTeamFilter(filter);
    setView("batch");
  };

  const handleBackToEditor = () => {
    setView("editor");
  };

  const handleComplete = () => {
    navigate("/");
  };

  const handleOpenHistory = () => {
    setView("history");
  };

  const handleEditBatch = (batch: BatchGeneration) => {
    setEditingBatch(batch);
    setView("history-edit");
  };

  if (view === "history-edit" && editingBatch) {
    return (
      <BatchHistoryEditor
        batch={editingBatch}
        onBack={() => setView("history")}
        onSaved={handleComplete}
      />
    );
  }

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
        onBack={handleBackToEditor}
        onComplete={handleComplete}
      />
    );
  }

  return (
    <MasterArtEditor
      onBack={() => navigate("/")}
      onGenerateBatch={handleGenerateBatch}
      onOpenHistory={handleOpenHistory}
    />
  );
};

export default MasterArt;
