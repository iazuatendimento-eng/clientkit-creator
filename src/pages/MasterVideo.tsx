import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { MasterVideoEditor } from "@/components/MasterVideoEditor";
import { BatchVideoGenerator } from "@/components/BatchVideoGenerator";

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
  const [view, setView] = useState<"editor" | "batch">("editor");
  const [template, setTemplate] = useState<VideoTemplate | null>(null);

  const handleGenerateBatch = (newTemplate: VideoTemplate) => {
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
      <BatchVideoGenerator
        template={template}
        onBack={handleBackToEditor}
        onComplete={handleComplete}
      />
    );
  }

  return (
    <MasterVideoEditor
      onBack={() => navigate("/")}
      onGenerateBatch={handleGenerateBatch}
    />
  );
};

export default MasterVideo;
