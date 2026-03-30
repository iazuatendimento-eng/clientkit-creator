import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Film, Palette, Upload, Loader2, Sparkles, Wand2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { createProjectBrief } from "@/lib/clientDatabase";
import { VideoGeneratorModal } from "@/components/VideoGeneratorModal";
import { ArtGeneratorModal } from "@/components/ArtGeneratorModal";
import { useVideoPregenerate } from "@/hooks/useVideoPregenerate";
import { TemplateSelector } from "@/components/TemplateSelector";

interface QuickCreateProps {
  clientId: string;
  clientName: string;
  brandKit: any;
  initialText?: string;
  initialType?: "video" | "art";
  initialTemplateId?: string;
  existingCardId?: string;
  isClientPortal?: boolean;
}

export const QuickCreate = ({ clientId, clientName, brandKit, initialText, initialType, initialTemplateId, existingCardId, isClientPortal }: QuickCreateProps) => {
  const [text, setText] = useState(initialText || "");
  const [type, setType] = useState<"video" | "art">(initialType || "video");
  const [uploading, setUploading] = useState(false);
  const [uploadedFiles, setUploadedFiles] = useState<{ name: string; url: string; fileType: string }[]>([]);
  const [creating, setCreating] = useState(false);
  const [createdCardId, setCreatedCardId] = useState<string | null>(null);
  const [isVideoGenOpen, setIsVideoGenOpen] = useState(false);
  const [isArtGenOpen, setIsArtGenOpen] = useState(false);
  const [showTemplateSelector, setShowTemplateSelector] = useState(false);
  const [selectedTemplateIndex, setSelectedTemplateIndex] = useState(0);
  const [modalClosed, setModalClosed] = useState(false);
  const [hasText, setHasText] = useState<boolean | null>(initialText ? true : null);
  const [aiTopic, setAiTopic] = useState("");
  const [postFormat, setPostFormat] = useState<"single" | "carousel">("single");
  const [generatingText, setGeneratingText] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const autoTriggeredRef = useRef(false);

  // Pregenerate video data when a card is ready
  const { preloadedData } = useVideoPregenerate(
    createdCardId || "",
    text,
    text.split("\n")[0] || clientName,
    brandKit,
    clientName,
    selectedTemplateIndex,
    !!createdCardId && type === "video"
  );

  // Auto-trigger generation when coming from a card (template + text already known)
  // If no template is saved, show template selector immediately
  useEffect(() => {
    if (autoTriggeredRef.current) return;
    
    if (initialText && initialTemplateId) {
      autoTriggeredRef.current = true;
      (async () => {
        const table = (initialType || type) === "art" ? "master_templates" : "master_video_templates";
        const { data } = await supabase
          .from(table)
          .select("id")
          .eq("deleted", false)
          .order("created_at", { ascending: true });

        if (data) {
          const idx = data.findIndex((t: any) => t.id === initialTemplateId);
          if (idx >= 0) {
            handleTemplateSelected(idx);
            return;
          }
        }
        // Fallback: show selector if template not found
        setShowTemplateSelector(true);
      })();
    } else if (initialText && !initialTemplateId && initialType) {
      // Card has text and type but no template — ask user to pick one
      autoTriggeredRef.current = true;
      setShowTemplateSelector(true);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    setUploading(true);
    try {
      for (const file of Array.from(files)) {
        const ext = file.name.split(".").pop();
        const path = `quick-create/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
        const { error } = await supabase.storage.from("card-uploads").upload(path, file);
        if (error) throw error;
        const { data: urlData } = supabase.storage.from("card-uploads").getPublicUrl(path);
        setUploadedFiles(prev => [...prev, { name: file.name, url: urlData.publicUrl, fileType: file.type }]);
      }
      toast.success("Upload concluído!");
    } catch (err: any) {
      console.error("Upload error:", err);
      toast.error("Erro no upload");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleGenerateAIText = async () => {
    if (!aiTopic.trim()) return;
    setGeneratingText(true);
    try {
      // Fetch client context for better generation
      let briefing = "";
      let narrationType = "";
      try {
        const { data } = await supabase
          .from("client_data")
          .select("briefing, narration_type")
          .eq("name", clientName)
          .maybeSingle();
        briefing = data?.briefing || "";
        narrationType = data?.narration_type || "";
      } catch { /* ignore */ }

      const { data, error } = await supabase.functions.invoke("generate-post-text", {
        body: {
          topic: aiTopic,
          postType: postFormat,
          clientName,
          briefing,
          narrationType,
        },
      });

      if (error) throw error;
      const generated = data?.text?.trim();
      if (!generated) throw new Error("Texto vazio");

      setText(generated);
      toast.success("Texto gerado com sucesso!");
    } catch (err: any) {
      console.error("AI text generation error:", err);
      toast.error("Erro ao gerar texto. Tente novamente.");
    } finally {
      setGeneratingText(false);
    }
  };

  const handleCreate = async () => {
    if (!text.trim()) {
      toast.error("Cole o texto primeiro!");
      return;
    }

    // If we already know the template (coming from a card), skip the selector
    if (initialTemplateId) {
      // Resolve the index from the DB
      const table = type === "art" ? "master_templates" : "master_video_templates";
      const { data } = await supabase
        .from(table)
        .select("id")
        .eq("deleted", false)
        .order("created_at", { ascending: true });

      if (data) {
        const idx = data.findIndex((t: any) => t.id === initialTemplateId);
        if (idx >= 0) {
          handleTemplateSelected(idx);
          return;
        }
      }
    }

    setShowTemplateSelector(true);
  };

  const handleTemplateSelected = async (index: number) => {
    setSelectedTemplateIndex(index);
    setShowTemplateSelector(false);
    setCreating(true);
    try {
      let cardId = existingCardId;

      if (!cardId) {
        const title = text.split("\n")[0].slice(0, 100) || "Criação Rápida";
        const today = new Date().toISOString().split("T")[0];

        // Create a temporary card (will be deleted after modal closes)
        const brief = await createProjectBrief({
          client_id: clientId,
          title,
          description: text,
          deadline: today,
          status: "todo",
          brand_kit_id: brandKit?.id || undefined,
        });

        // Upload materials as card_uploads (parallel)
        if (uploadedFiles.length > 0) {
          await Promise.all(uploadedFiles.map(file =>
            supabase.from("card_uploads").insert({
              card_id: brief.id,
              file_name: file.name,
              file_url: file.url,
              file_type: file.fileType,
              upload_type: "material",
            })
          ));
        }

        cardId = brief.id;
      }

      setCreatedCardId(cardId);

      if (type === "video") {
        setIsVideoGenOpen(true);
      } else {
        setIsArtGenOpen(true);
      }
    } catch (err: any) {
      console.error("Create error:", err);
      toast.error("Erro ao criar card");
    } finally {
      setCreating(false);
    }
  };

  const handleModalClose = async () => {
    // Only delete temporary cards (not existing ones from "Alterar")
    if (createdCardId && !existingCardId) {
      try {
        await supabase.from("card_uploads").delete().eq("card_id", createdCardId);
        await supabase.from("project_briefs").delete().eq("id", createdCardId);
      } catch (err) {
        console.error("Cleanup error:", err);
      }
    }
    setIsVideoGenOpen(false);
    setIsArtGenOpen(false);
    setShowTemplateSelector(false);
    setText("");
    setUploadedFiles([]);
    setCreatedCardId(null);
    setSelectedTemplateIndex(0);
    setModalClosed(true);
  };

  // When auto-triggering from a card, show loading instead of the form
  if (initialTemplateId && initialText && !isVideoGenOpen && !isArtGenOpen && !showTemplateSelector && !modalClosed) {
    return (
      <div className="flex flex-col items-center justify-center py-12 gap-3">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground">Preparando geração...</p>
      </div>
    );
  }

  if (showTemplateSelector) {
    return (
      <div className="max-w-2xl mx-auto space-y-6">
        <div className="text-center space-y-2">
          <h2 className="text-2xl font-bold flex items-center justify-center gap-2">
            <Sparkles className="h-6 w-6 text-primary" />
            Escolher Template
          </h2>
          <p className="text-muted-foreground text-sm">
            Visualize e selecione o template para {type === "video" ? "vídeo" : "arte"}.
          </p>
        </div>
        <TemplateSelector
          type={type}
          onSelect={handleTemplateSelected}
          onBack={() => setShowTemplateSelector(false)}
          initialTemplateId={initialTemplateId}
        />
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="text-center space-y-2">
        <h2 className="text-2xl font-bold flex items-center justify-center gap-2">
          <Sparkles className="h-6 w-6 text-primary" />
          Criar Rápido
        </h2>
        <p className="text-muted-foreground text-sm">
          Cole o texto, escolha o tipo e gere em segundos.
        </p>
      </div>

      {/* Step 1: Has text? */}
      {hasText === null && (
        <div className="space-y-3">
          <Label className="text-sm font-medium">Você já tem o texto pronto?</Label>
          <div className="flex gap-3">
            <Button
              variant="outline"
              className="flex-1 h-12"
              onClick={() => setHasText(true)}
            >
              ✅ Sim, já tenho
            </Button>
            <Button
              variant="outline"
              className="flex-1 h-12"
              onClick={() => setHasText(false)}
            >
              <Wand2 className="h-4 w-4 mr-2" />
              Não, gerar com IA
            </Button>
          </div>
        </div>
      )}

      {/* AI Text Generation */}
      {hasText === false && !text && (
        <div className="space-y-4 p-4 border rounded-lg bg-muted/30">
          <div className="flex items-center gap-2 text-sm font-medium">
            <Wand2 className="h-4 w-4 text-primary" />
            Gerar texto com IA
          </div>

          <div className="space-y-2">
            <Label className="text-xs">Qual o assunto/tema?</Label>
            <Input
              value={aiTopic}
              onChange={(e) => setAiTopic(e.target.value)}
              placeholder="Ex: promoção de limpeza, dica de saúde, agendamento..."
              className="text-sm"
            />
          </div>

          <div className="space-y-2">
            <Label className="text-xs">Formato</Label>
            <RadioGroup
              value={postFormat}
              onValueChange={(v) => setPostFormat(v as "single" | "carousel")}
              className="flex flex-col gap-2"
            >
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="single" id="fmt-single" />
                <Label htmlFor="fmt-single" className="text-sm cursor-pointer">
                  Post Único / Vídeo 20s (~6 palavras)
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="carousel" id="fmt-carousel" />
                <Label htmlFor="fmt-carousel" className="text-sm cursor-pointer">
                  Carrossel / Vídeo 1min (6 páginas separadas por ;)
                </Label>
              </div>
            </RadioGroup>
          </div>

          <div className="flex gap-2">
            <Button
              onClick={handleGenerateAIText}
              disabled={!aiTopic.trim() || generatingText}
              className="flex-1 gap-2"
            >
              {generatingText ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Wand2 className="h-4 w-4" />
              )}
              {generatingText ? "Gerando..." : "Gerar Texto"}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => { setHasText(null); setAiTopic(""); }}
            >
              Voltar
            </Button>
          </div>
        </div>
      )}

      {/* Text Input (shown when user has text OR after AI generated) */}
      {(hasText === true || (hasText === false && text)) && (
        <>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-sm font-medium">Texto do Conteúdo</Label>
              {hasText === false && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-xs gap-1"
                  onClick={() => { setText(""); setAiTopic(""); }}
                >
                  <Wand2 className="h-3 w-3" />
                  Gerar outro
                </Button>
              )}
            </div>
            <Textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Cole aqui o texto do briefing, legenda ou conteúdo..."
              className="min-h-[160px] text-sm resize-y"
            />
            {hasText === null ? null : !initialText && (
              <Button
                variant="ghost"
                size="sm"
                className="text-xs"
                onClick={() => { setHasText(null); setText(""); setAiTopic(""); }}
              >
                ← Voltar
              </Button>
            )}
          </div>

          {/* Type Selection */}
          <div className="space-y-2">
            <Label className="text-sm font-medium">Tipo de Entrega</Label>
            <RadioGroup
              value={type}
              onValueChange={(v) => setType(v as "video" | "art")}
              className="flex gap-4"
            >
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="video" id="type-video" />
                <Label htmlFor="type-video" className="flex items-center gap-1.5 cursor-pointer">
                  <Film className="h-4 w-4" />
                  Vídeo
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="art" id="type-art" />
                <Label htmlFor="type-art" className="flex items-center gap-1.5 cursor-pointer">
                  <Palette className="h-4 w-4" />
                  Arte
                </Label>
              </div>
            </RadioGroup>
          </div>

          {/* Create Button */}
          <Button
            onClick={handleCreate}
            disabled={creating || !text.trim()}
            className="w-full h-12 text-base font-semibold gap-2"
          >
            {creating ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : type === "video" ? (
              <Film className="h-5 w-5" />
            ) : (
              <Palette className="h-5 w-5" />
            )}
            {creating ? "Criando..." : `Gerar ${type === "video" ? "Vídeo" : "Arte"}`}
          </Button>
        </>
      )}

      {/* Modals */}
      {createdCardId && (
        <>
          <VideoGeneratorModal
            isOpen={isVideoGenOpen}
            onClose={handleModalClose}
            cardId={createdCardId}
            cardTitle={text.split("\n")[0] || clientName}
            cardText={text}
            brandKit={brandKit}
            clientName={clientName}
            cardIndex={selectedTemplateIndex}
            preloadedData={preloadedData}
            clientId={clientId}
            hideEmail={isClientPortal}
          />
          <ArtGeneratorModal
            isOpen={isArtGenOpen}
            onClose={handleModalClose}
            cardId={createdCardId}
            cardTitle={text.split("\n")[0] || clientName}
            cardText={text}
            brandKit={brandKit}
            clientName={clientName}
            cardIndex={selectedTemplateIndex}
            clientId={clientId}
            hideEmail={isClientPortal}
          />
        </>
      )}
    </div>
  );
};
