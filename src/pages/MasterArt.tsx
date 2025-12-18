import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { MasterArtEditor } from "@/components/MasterArtEditor";
import { BatchArtGenerator } from "@/components/BatchArtGenerator";

interface MasterTemplate {
  id: string;
  name: string;
  elements: any[];
  width: number;
  height: number;
  backgroundColor: string;
}

const MasterArt = () => {
  const navigate = useNavigate();
  const [view, setView] = useState<"editor" | "batch">("editor");
  const [template, setTemplate] = useState<MasterTemplate | null>(null);

  const handleGenerateBatch = (newTemplate: MasterTemplate) => {
    setTemplate(newTemplate);
    setView("batch");
  };

  const handleBackToEditor = () => {
    setView("editor");
  };

  const handleComplete = () => {
    navigate("/");
  };

  if (view === "batch" && template) {
    return (
      <BatchArtGenerator
        template={template}
        onBack={handleBackToEditor}
        onComplete={handleComplete}
      />
    );
  }

  return (
    <MasterArtEditor
      onBack={() => navigate("/")}
      onGenerateBatch={handleGenerateBatch}
    />
  );
};

export default MasterArt;
