import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { BatchHistory } from "@/components/BatchHistory";
import { BatchVideoGenerator } from "@/components/BatchVideoGenerator";
import { BatchGeneration } from "@/lib/batchHistory";

const BatchHistoryPage = () => {
  const navigate = useNavigate();
  const [view, setView] = useState<"list" | "edit">("list");
  const [selectedBatch, setSelectedBatch] = useState<BatchGeneration | null>(null);

  const handleEditBatch = (batch: BatchGeneration) => {
    setSelectedBatch(batch);
    setView("edit");
  };

  const handleBack = () => {
    if (view === "edit") {
      setView("list");
      setSelectedBatch(null);
    } else {
      navigate("/");
    }
  };

  const handleSaved = () => {
    setView("list");
    setSelectedBatch(null);
  };

  if (view === "edit" && selectedBatch) {
    const snap = selectedBatch.template_snapshot as any;
    const template = {
      ...snap,
      audioUrl1: snap.audioUrl1 || snap.audio_url_1 || undefined,
      audioUrl2: snap.audioUrl2 || snap.audio_url_2 || undefined,
    };
    return (
      <BatchVideoGenerator
        template={template}
        initialBatch={selectedBatch}
        onBack={handleBack}
        onComplete={handleSaved}
      />
    );
  }

  return <BatchHistory onBack={() => navigate("/")} onEditBatch={handleEditBatch} />;
};

export default BatchHistoryPage;
