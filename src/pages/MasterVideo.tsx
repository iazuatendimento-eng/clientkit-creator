import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { MasterVideoEditor } from "@/components/MasterVideoEditor";
import { BatchVideoGenerator } from "@/components/BatchVideoGenerator";
import { BatchHistory } from "@/components/BatchHistory";
import { BatchHistoryEditor } from "@/components/BatchHistoryEditor";
import { BatchGeneration } from "@/lib/batchHistory";

interface VideoTemplate {
  id: string;
  name: string;
  contentElements: any[];
  signatureElements: any[];
  width: number;
  height: number;
  backgroundColor: string;
  pageDuration: number; // in seconds
}

const MasterVideo = () => {
  const navigate = useNavigate();
  const [view, setView] = useState<"editor" | "batch" | "history" | "history-edit">("editor");
  const [template, setTemplate] = useState<VideoTemplate | null>(null);
  const [editingBatch, setEditingBatch] = useState<BatchGeneration | null>(null);
  const [teamFilter, setTeamFilter] = useState<string | undefined>(undefined);

  const handleGenerateBatch = (newTemplate: VideoTemplate, newTeamFilter?: string) => {
    setTemplate(newTemplate);
    setTeamFilter(newTeamFilter);
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
        filterType="video"
      />
    );
  }

  if (view === "batch" && template) {
    return (
      <BatchVideoGenerator
        template={template}
        initialTeamFilter={teamFilter}
        onBack={handleBackToEditor}
        onComplete={handleComplete}
      />
    );
  }

  return (
    <MasterVideoEditor
      onBack={() => navigate("/")}
      onGenerateBatch={handleGenerateBatch}
      onOpenHistory={handleOpenHistory}
    />
  );
};

export default MasterVideo;
