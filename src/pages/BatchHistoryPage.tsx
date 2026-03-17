import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { BatchHistory } from "@/components/BatchHistory";
import { BatchVideoGenerator } from "@/components/BatchVideoGenerator";
import { BatchArtGenerator } from "@/components/BatchArtGenerator";
import { BatchGeneration } from "@/lib/batchHistory";
import { supabase } from "@/integrations/supabase/client";

const BatchHistoryPage = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [view, setView] = useState<"list" | "edit">("list");
  const [selectedBatch, setSelectedBatch] = useState<BatchGeneration | null>(null);
  const [resolvedTemplate, setResolvedTemplate] = useState<any>(null);

  const handleEditBatch = async (batch: BatchGeneration) => {
    setSelectedBatch(batch);

    const snap = batch.template_snapshot as any;
    let audioUrl1 = snap.audioUrl1 || snap.audio_url_1 || undefined;
    let audioUrl2 = snap.audioUrl2 || snap.audio_url_2 || undefined;

    // If no audio in snapshot, try to load from the master video template
    if (!audioUrl1 && !audioUrl2 && snap.id) {
      try {
        const { data } = await supabase
          .from("master_video_templates")
          .select("*")
          .eq("id", snap.id)
          .maybeSingle();
        if (data) {
          const masterSnap = data as any;
          audioUrl1 = masterSnap.audio_url_1 || masterSnap.audioUrl1 || undefined;
          audioUrl2 = masterSnap.audio_url_2 || masterSnap.audioUrl2 || undefined;
        }
      } catch (e) {
        console.error("Failed to load master template audio:", e);
      }
    }

    const isArt = batch.type === "art";
    const contentElements = isArt
      ? (snap.elements || snap.contentElements || snap.content_elements || [])
      : (snap.contentElements || snap.content_elements || []);
    const signatureElements = isArt
      ? (snap.elements || snap.signatureElements || snap.signature_elements || [])
      : (snap.signatureElements || snap.signature_elements || []);

    setResolvedTemplate({
      id: snap.id || batch.id,
      name: snap.name || "Template",
      contentElements,
      signatureElements,
      // For art templates, also set 'elements' so BatchArtGenerator can use it
      ...(isArt ? { elements: snap.elements || contentElements } : {}),
      width: snap.width || 1080,
      height: snap.height || (isArt ? 1350 : 1920),
      backgroundColor: snap.backgroundColor || snap.background_color || "#ffffff",
      pageDuration: snap.pageDuration || snap.page_duration || 3,
      audioUrl1,
      audioUrl2,
      teamFilter: snap.teamFilter || undefined,
    });
    setView("edit");
  };

  const handleBack = () => {
    if (view === "edit") {
      setView("list");
      setSelectedBatch(null);
      setResolvedTemplate(null);
    } else {
      navigate("/");
    }
  };

  const handleSaved = () => {
    setView("list");
    setSelectedBatch(null);
    setResolvedTemplate(null);
  };

  if (view === "edit" && selectedBatch && resolvedTemplate) {
    if (selectedBatch.type === "art") {
      return (
        <BatchArtGenerator
          template={resolvedTemplate}
          initialBatch={selectedBatch}
          initialTeamFilter={resolvedTemplate.teamFilter}
          onBack={handleBack}
          onComplete={handleSaved}
        />
      );
    }
    return (
      <BatchVideoGenerator
        template={resolvedTemplate}
        initialBatch={selectedBatch}
        onBack={handleBack}
        onComplete={handleSaved}
      />
    );
  }

  const filterType = searchParams.get("type") as "art" | "video" | undefined;

  return <BatchHistory onBack={() => navigate("/")} onEditBatch={handleEditBatch} filterType={filterType || undefined} />;
};

export default BatchHistoryPage;
