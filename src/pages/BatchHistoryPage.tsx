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

    const snap = (batch.template_snapshot || {}) as any;
    const isArt = batch.type === "art";

    const pickArray = (...candidates: any[]): any[] => {
      for (const candidate of candidates) {
        if (Array.isArray(candidate)) return candidate;
      }
      return [];
    };

    let masterSnap: any = null;

    // Video batches antigos podem não ter assinatura no snapshot.
    // Hidratamos do template mestre quando necessário.
    if (!isArt && snap.id) {
      try {
        const { data } = await supabase
          .from("master_video_templates")
          .select("id, name, content_elements, signature_elements, width, height, background_color, page_duration, audio_url_1, audio_url_2")
          .eq("id", snap.id)
          .maybeSingle();

        if (data) masterSnap = data;
      } catch (e) {
        console.error("Failed to load master template fallback:", e);
      }
    }

    const snapContent = isArt
      ? pickArray(snap.elements, snap.contentElements, snap.content_elements)
      : pickArray(snap.contentElements, snap.content_elements, snap.elements);
    const snapSignature = isArt
      ? pickArray(snap.elements, snap.signatureElements, snap.signature_elements)
      : pickArray(snap.signatureElements, snap.signature_elements);

    const masterContent = pickArray(masterSnap?.content_elements, masterSnap?.contentElements);
    const masterSignature = pickArray(masterSnap?.signature_elements, masterSnap?.signatureElements);

    const contentElements = snapContent.length > 0 ? snapContent : masterContent;
    const signatureElements = isArt
      ? pickArray(snap.elements, snap.signatureElements, snap.signature_elements, contentElements)
      : (snapSignature.length > 0 ? snapSignature : masterSignature);

    const audioUrl1 =
      snap.audioUrl1 ||
      snap.audio_url_1 ||
      masterSnap?.audio_url_1 ||
      masterSnap?.audioUrl1 ||
      undefined;
    const audioUrl2 =
      snap.audioUrl2 ||
      snap.audio_url_2 ||
      masterSnap?.audio_url_2 ||
      masterSnap?.audioUrl2 ||
      undefined;

    setResolvedTemplate({
      id: snap.id || masterSnap?.id || batch.id,
      name: snap.name || masterSnap?.name || "Template",
      contentElements,
      signatureElements,
      // For art templates, also set 'elements' so BatchArtGenerator can use it
      ...(isArt ? { elements: snap.elements || contentElements } : {}),
      width: snap.width || masterSnap?.width || 1080,
      height: snap.height || masterSnap?.height || (isArt ? 1350 : 1920),
      backgroundColor: snap.backgroundColor || snap.background_color || masterSnap?.background_color || "#ffffff",
      pageDuration: snap.pageDuration || snap.page_duration || masterSnap?.page_duration || 3,
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
        initialTeamFilter={resolvedTemplate.teamFilter}
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
