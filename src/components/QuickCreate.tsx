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
  const [usageLimit, setUsageLimit] = useState(30);
  const [usageUsed, setUsageUsed] = useState(0);
  const [usageLoaded, setUsageLoaded] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const autoTriggeredRef = useRef(false);

  // Load usage data
  useEffect(() => {
    const loadUsage = async () => {
      try {
        const { data } = await supabase
          .from("client_data")
          .select("monthly_material_limit, monthly_material_used, material_usage_reset_at")
          .eq("id", clientId)
          .maybeSingle();
        if (data) {
          // Check if we need to reset (new month)
          const resetAt = new Date(data.material_usage_reset_at);
          const now = new Date();
          const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
          
          if (resetAt < currentMonthStart) {
            // Reset usage for new month
            await supabase
              .from("client_data")
              .update({ monthly_material_used: 0, material_usage_reset_at: currentMonthStart.toISOString() })
              .eq("id", clientId);
            setUsageUsed(0);
          } else {
            setUsageUsed(data.monthly_material_used || 0);
          }
          setUsageLimit(data.monthly_material_limit || 30);
        }
      } catch { /* ignore */ }
      setUsageLoaded(true);
    };
    loadUsage();
  }, [clientId]);

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
      let generated = data?.text?.trim();
      if (!generated) throw new Error("Texto vazio");

      // Enforce max 6 pages (5 semicolons) even from AI
      const parts = generated.split(";").map((s: string) => s.trim()).filter((s: string) => s.length > 0);
      if (parts.length > 6) {
        generated = parts.slice(0, 6).join("; ");
      }

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
    if (usageUsed >= usageLimit) {
      toast.error(`Limite mensal atingido! (${usageUsed}/${usageLimit} materiais)`);
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

      // Increment usage
      try {
        const newUsed = usageUsed + 1;
        await supabase
          .from("client_data")
          .update({ monthly_material_used: newUsed })
          .eq("id", clientId);
        setUsageUsed(newUsed);
      } catch { /* ignore */ }

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
    <div className="max-w-lg mx-auto space-y-6 px-4">
      {/* Header */}
      <div className="text-center space-y-1 pt-2">
        <h2 className="text-xl font-bold flex items-center justify-center gap-2">
          <Sparkles className="h-5 w-5 text-primary" />
          Criar Conteúdo
        </h2>
      </div>

      {/* Usage Bar */}
      {usageLoaded && (
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">Materiais este mês</span>
            <span className={`font-bold ${usageUsed >= usageLimit ? "text-destructive" : "text-primary"}`}>
              {usageUsed} de {usageLimit}
            </span>
          </div>
          <div className="w-full h-2.5 bg-muted rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-500 ${
                usageUsed >= usageLimit ? "bg-destructive" : usageUsed >= usageLimit * 0.8 ? "bg-yellow-500" : "bg-primary"
              }`}
              style={{ width: `${Math.min((usageUsed / usageLimit) * 100, 100)}%` }}
            />
          </div>
          {usageUsed >= usageLimit && (
            <p className="text-xs text-destructive font-medium text-center">
              ⚠️ Limite mensal atingido! Renova no próximo mês.
            </p>
          )}
        </div>
      )}

      {/* Step 1: Has text? — big friendly cards */}
      {hasText === null && (
        <div className="space-y-3">
          <p className="text-center text-sm text-muted-foreground font-medium">
            Como você quer começar?
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <button
              onClick={() => setHasText(true)}
              className="flex flex-col items-center gap-3 p-6 rounded-xl border-2 border-border bg-card hover:border-primary hover:bg-primary/5 transition-all text-center group"
            >
              <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center group-hover:bg-primary/20 transition-colors">
                <Palette className="h-6 w-6 text-primary" />
              </div>
              <div>
                <p className="font-semibold text-sm">Já tenho o texto</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Colar ou digitar o texto do post
                </p>
              </div>
            </button>
            <button
              onClick={() => setHasText(false)}
              className="flex flex-col items-center gap-3 p-6 rounded-xl border-2 border-border bg-card hover:border-primary hover:bg-primary/5 transition-all text-center group"
            >
              <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center group-hover:bg-primary/20 transition-colors">
                <Wand2 className="h-6 w-6 text-primary" />
              </div>
              <div>
                <p className="font-semibold text-sm">A IA cria pra mim</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Diga o assunto e a IA escreve o texto
                </p>
              </div>
            </button>
          </div>
        </div>
      )}

      {/* AI Text Generation */}
      {hasText === false && !text && (
        <div className="space-y-5 p-5 rounded-xl border-2 border-primary/20 bg-primary/5">
          <div className="flex items-center gap-2 font-semibold text-sm">
            <Wand2 className="h-5 w-5 text-primary" />
            Gerar texto com IA
          </div>

          <div className="space-y-1.5">
            <Label className="text-sm font-medium">Qual o assunto do post?</Label>
            <Input
              value={aiTopic}
              onChange={(e) => setAiTopic(e.target.value)}
              placeholder="Ex: promoção de limpeza, dica de saúde..."
              className="text-sm h-11"
            />
          </div>

          <div className="space-y-2">
            <Label className="text-sm font-medium">Formato</Label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <button
                onClick={() => setPostFormat("single")}
                className={`flex items-center gap-3 p-3 rounded-lg border-2 transition-all text-left ${
                  postFormat === "single"
                    ? "border-primary bg-primary/10"
                    : "border-border bg-card hover:border-muted-foreground/30"
                }`}
              >
                <Film className="h-5 w-5 text-primary shrink-0" />
                <div>
                  <p className="text-sm font-medium">Post Único</p>
                  <p className="text-xs text-muted-foreground">1 página / vídeo 20s</p>
                </div>
              </button>
              <button
                onClick={() => setPostFormat("carousel")}
                className={`flex items-center gap-3 p-3 rounded-lg border-2 transition-all text-left ${
                  postFormat === "carousel"
                    ? "border-primary bg-primary/10"
                    : "border-border bg-card hover:border-muted-foreground/30"
                }`}
              >
                <Sparkles className="h-5 w-5 text-primary shrink-0" />
                <div>
                  <p className="text-sm font-medium">Carrossel</p>
                  <p className="text-xs text-muted-foreground">6 páginas / vídeo 1min</p>
                </div>
              </button>
            </div>
          </div>

          <div className="flex gap-2 pt-1">
            <Button
              onClick={handleGenerateAIText}
              disabled={!aiTopic.trim() || generatingText}
              className="flex-1 h-11 gap-2 text-sm font-semibold"
            >
              {generatingText ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Wand2 className="h-4 w-4" />
              )}
              {generatingText ? "Gerando..." : "Gerar Texto"}
            </Button>
            <Button
              variant="outline"
              onClick={() => { setHasText(null); setAiTopic(""); }}
              className="h-11"
            >
              Voltar
            </Button>
          </div>
        </div>
      )}

      {/* Text Input (shown when user has text OR after AI generated) */}
      {(hasText === true || (hasText === false && text)) && (
        <div className="space-y-5">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-sm font-medium">
                {hasText === false ? "✨ Texto gerado — edite se quiser:" : "Texto do Conteúdo"}
              </Label>
              {hasText === false && (
                <Button
                  variant="outline"
                  size="sm"
                  className="text-xs gap-1.5 h-7"
                  onClick={() => { setText(""); setAiTopic(""); }}
                >
                  <Wand2 className="h-3 w-3" />
                  Gerar outro
                </Button>
              )}
            </div>
            <Textarea
              value={text}
              onChange={(e) => {
                let val = e.target.value;
                const semicolons = (val.match(/;/g) || []).length;
                if (semicolons > 5) {
                  let count = 0;
                  val = val.replace(/;/g, (match) => {
                    count++;
                    return count <= 5 ? match : "";
                  });
                  toast.error("Máximo 6 páginas!");
                }
                setText(val);
              }}
              placeholder={`Cole ou digite o texto aqui...\n\nUse ; para separar páginas do carrossel\nExemplo: Frase 1; Frase 2; Frase 3`}
              className="min-h-[140px] text-sm resize-y"
            />
            <div className="flex items-center justify-between">
              {text.includes(";") ? (
                <p className="text-xs font-medium text-primary">
                  📄 {(text.match(/;/g) || []).length + 1} de 6 páginas
                </p>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Dica: use <span className="font-mono font-bold">;</span> para dividir em páginas
                </p>
              )}
              {!initialText && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-xs h-7"
                  onClick={() => { setHasText(null); setText(""); setAiTopic(""); }}
                >
                  ← Voltar
                </Button>
              )}
            </div>
          </div>

          {/* Type Selection — big visual buttons */}
          <div className="space-y-2">
            <Label className="text-sm font-medium">O que você quer gerar?</Label>
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => setType("video")}
                className={`flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all ${
                  type === "video"
                    ? "border-primary bg-primary/10 shadow-sm"
                    : "border-border bg-card hover:border-muted-foreground/30"
                }`}
              >
                <Film className={`h-8 w-8 ${type === "video" ? "text-primary" : "text-muted-foreground"}`} />
                <span className="text-sm font-semibold">Vídeo</span>
              </button>
              <button
                onClick={() => setType("art")}
                className={`flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all ${
                  type === "art"
                    ? "border-primary bg-primary/10 shadow-sm"
                    : "border-border bg-card hover:border-muted-foreground/30"
                }`}
              >
                <Palette className={`h-8 w-8 ${type === "art" ? "text-primary" : "text-muted-foreground"}`} />
                <span className="text-sm font-semibold">Arte</span>
              </button>
            </div>
          </div>

          {/* Create Button */}
          <Button
            onClick={handleCreate}
            disabled={creating || !text.trim()}
            className="w-full h-14 text-base font-bold gap-2 rounded-xl shadow-md"
            size="lg"
          >
            {creating ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              <Sparkles className="h-5 w-5" />
            )}
            {creating ? "Preparando..." : `Gerar ${type === "video" ? "Vídeo" : "Arte"}`}
          </Button>
        </div>
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
            skipSave
          />
        </>
      )}
    </div>
  );
};
