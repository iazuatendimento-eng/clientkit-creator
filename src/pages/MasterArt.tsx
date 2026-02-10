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
    // Extract template from batch snapshot and open in BatchArtGenerator
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
