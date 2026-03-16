import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { MasterVideoEditor } from "@/components/MasterVideoEditor";
import { BatchVideoGenerator } from "@/components/BatchVideoGenerator";
import { BatchHistory } from "@/components/BatchHistory";
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
  audioUrl1?: string;
  audioUrl2?: string;
}

const MasterVideo = () => {
  const navigate = useNavigate();
  const [view, setView] = useState<"editor" | "batch" | "history">("editor");
  const [template, setTemplate] = useState<VideoTemplate | null>(null);
  const [editingBatch, setEditingBatch] = useState<BatchGeneration | null>(null);
  const [teamFilter, setTeamFilter] = useState<string | undefined>(undefined);

  const handleGenerateBatch = (newTemplate: VideoTemplate, newTeamFilter?: string) => {
    setTemplate(newTemplate);
    setTeamFilter(newTeamFilter);
    setEditingBatch(null);
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
        })
        .catch(() => {});
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
      <BatchVideoGenerator
        template={template}
        initialTeamFilter={teamFilter}
        initialBatch={editingBatch || undefined}
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
