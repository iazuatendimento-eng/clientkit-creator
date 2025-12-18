import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { BatchHistory } from "@/components/BatchHistory";
import { BatchHistoryEditor } from "@/components/BatchHistoryEditor";
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
    return (
      <BatchHistoryEditor
        batch={selectedBatch}
        onBack={handleBack}
        onSaved={handleSaved}
      />
    );
  }

  return <BatchHistory onBack={() => navigate("/")} onEditBatch={handleEditBatch} />;
};

export default BatchHistoryPage;
