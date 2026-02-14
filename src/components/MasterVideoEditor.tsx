import { useState, useEffect, useRef, useCallback } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { drawNewShape } from "@/lib/canvasShapes";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ArrowLeft,
  Square,
  Circle,
  Type,
  Image as ImageIcon,
  Trash2,
  Copy,
  Save,
  Play,
  Layers,
  ChevronUp,
  ChevronDown,
  Search,
  Loader2,
  User,
  Phone,
  Sparkles,
  FileVideo,
  Film,
  FolderOpen,
  Triangle,
  Minus,
  Star,
  Diamond,
  Hexagon,
  Pentagon,
  Move,
  History,
  Scissors,
  Pencil,
  Plus,
  Palette,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { searchImages, SearchImage } from "@/lib/imageSearch";
import { supabase } from "@/integrations/supabase/client";
import { removeBackground } from "@/lib/backgroundRemoval";

interface CanvasElement {
  id: string;
  type: "rect" | "circle" | "text" | "image" | "logo" | "contact" | "mascot" | "triangle" | "line" | "star" | "diamond" | "hexagon" | "pentagon" | "wave" | "blob" | "arch" | "arrow" | "badge" | "ribbon" | "polkaDots" | "dotsGrid" | "confetti" | "splatter" | "zigzag" | "spiral" | "heart" | "cross" | "cloud" | "speechBubble" | "lightning" | "shield" | "crescent";
  x: number;
  y: number;
  width: number;
  height: number;
  name?: string; // Custom layer name
  color?: string;
  text?: string;
  fontSize?: number;
  textAlign?: "left" | "center" | "right";
  lineHeight?: number; // multiplier e.g. 1.2
  imageUrl?: string;
  placeholder?: boolean;
  rotation?: number;
  colorRole?: "background" | "text" | "accessory1" | "accessory2";
  opacity?: number; // 0-100
  borderRadius?: number;
  borderWidth?: number;
  borderColor?: string;
  borderColorRole?: "background" | "text" | "accessory1" | "accessory2";
  shadowBlur?: number;
  shadowColor?: string;
  shadowOffsetX?: number;
  shadowOffsetY?: number;
  clipShape?: "rect" | "circle" | "triangle" | "diamond" | "hexagon" | "pentagon" | "star";
  gradient?: {
    type: "linear" | "radial";
    color1: string;
    color2: string;
    opacity1?: number; // 0-100
    opacity2?: number; // 0-100
    angle?: number;
    fadeMode?: boolean; // Single color to transparent mode
    color1Role?: "background" | "text" | "accessory1" | "accessory2";
    color2Role?: "background" | "text" | "accessory1" | "accessory2";
  };
  animated?: boolean; // Whether this layer participates in video animations (default true)
  animationType?: string; // Specific animation for this element
  animDuration?: number; // Animation duration in seconds
  animLoop?: boolean; // Whether animation loops continuously
}

interface VideoTemplate {
  id: string;
  name: string;
  contentElements: CanvasElement[];
  signatureElements: CanvasElement[];
  width: number;
  height: number;
  backgroundColor: string;
  pageDuration: number;
  audioUrl1?: string;
  audioUrl2?: string;
}

interface SavedVideoTemplate {
  id: string;
  name: string;
  content_elements: CanvasElement[];
  signature_elements: CanvasElement[];
  width: number;
  height: number;
  background_color: string;
  page_duration: number;
  created_at: string;
  updated_at: string;
}

type TeamFilter = string | undefined;

interface MasterVideoEditorProps {
  onBack: () => void;
  onGenerateBatch: (template: VideoTemplate, teamFilter: TeamFilter) => void;
  onOpenHistory?: () => void;
}

export const MasterVideoEditor = ({ onBack, onGenerateBatch, onOpenHistory }: MasterVideoEditorProps) => {
  const [currentPage, setCurrentPage] = useState<"content" | "signature">("content");
  const [contentElements, setContentElements] = useState<CanvasElement[]>([]);
  const [signatureElements, setSignatureElements] = useState<CanvasElement[]>([]);
  const [selectedElement, setSelectedElement] = useState<string | null>(null);
  const [selectedTool, setSelectedTool] = useState<string>("select");
  const [currentColor, setCurrentColor] = useState("#3B82F6");
  const [backgroundColor, setBackgroundColor] = useState("#1a1a2e");
  const [templateName, setTemplateName] = useState("Novo Template de Vídeo");
  const [pageDuration, setPageDuration] = useState(10);
  const [audioUrl1, setAudioUrl1] = useState<string>("");
  const [audioUrl2, setAudioUrl2] = useState<string>("");
  
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchImage[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  
  // Template save/load state
  const [savedTemplates, setSavedTemplates] = useState<SavedVideoTemplate[]>([]);
  const [currentTemplateId, setCurrentTemplateId] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isRemovingBg, setIsRemovingBg] = useState(false);
  const [removeBgProgress, setRemoveBgProgress] = useState("");
  
  // Layer renaming state
  const [editingLayerId, setEditingLayerId] = useState<string | null>(null);
  const [editingLayerName, setEditingLayerName] = useState("");
  
  // Team filter state
  const [selectedTeamFilter, setSelectedTeamFilter] = useState<TeamFilter>(undefined);
  const [availableTeams, setAvailableTeams] = useState<{ id: string; name: string }[]>([]);
  const [animatingElementId, setAnimatingElementId] = useState<string | null>(null);
  const [animKey, setAnimKey] = useState(0);
  const animSnapshotsRef = useRef<Record<string, string>>({});
  const animBoundsRef = useRef<Record<string, { x: number; y: number; w: number; h: number }>>({});

  // Helper: draw element in isolation on offscreen canvas for snapshot
  const drawSingleElementRef = useRef<((ctx: CanvasRenderingContext2D, el: CanvasElement) => void) | null>(null);

  const startAnimation = useCallback((elId: string) => {
    const currentEls = currentPage === "content" ? contentElements : signatureElements;
    const targetEls = elId === "__all__"
      ? currentEls.filter(e => e.animationType && e.animationType !== "none")
      : currentEls.filter(e => e.id === elId && e.animationType && e.animationType !== "none");

    if (targetEls.length === 0) return;

    const drawFn = drawSingleElementRef.current;
    if (!drawFn) return;

    const snaps: Record<string, string> = {};
    const bounds: Record<string, { x: number; y: number; w: number; h: number }> = {};

    for (const el of targetEls) {
      // Calculate rotated bounding box to capture full element including rotation
      const rot = (el.rotation || 0) * Math.PI / 180;
      const cx = el.x + el.width / 2;
      const cy = el.y + el.height / 2;
      const hw = el.width / 2;
      const hh = el.height / 2;
      // 4 corners rotated around center
      const corners = [
        { x: cx + hw * Math.cos(rot) - hh * Math.sin(rot), y: cy + hw * Math.sin(rot) + hh * Math.cos(rot) },
        { x: cx - hw * Math.cos(rot) - hh * Math.sin(rot), y: cy - hw * Math.sin(rot) + hh * Math.cos(rot) },
        { x: cx + hw * Math.cos(rot) + hh * Math.sin(rot), y: cy + hw * Math.sin(rot) - hh * Math.cos(rot) },
        { x: cx - hw * Math.cos(rot) + hh * Math.sin(rot), y: cy - hw * Math.sin(rot) - hh * Math.cos(rot) },
      ];
      const minX = Math.min(...corners.map(c => c.x));
      const minY = Math.min(...corners.map(c => c.y));
      const maxX = Math.max(...corners.map(c => c.x));
      const maxY = Math.max(...corners.map(c => c.y));

      const pad = (el.borderWidth || 0) + (el.shadowBlur || 0) + 10;
      const extraMargin = 200;
      const offW = CANVAS_WIDTH + extraMargin * 2;
      const offH = CANVAS_HEIGHT + extraMargin * 2;
      const off = document.createElement("canvas");
      off.width = offW;
      off.height = offH;
      const octx = off.getContext("2d");
      if (!octx) continue;

      octx.translate(extraMargin, extraMargin);
      drawFn(octx, el);

      // Use rotated bounding box for crop
      const sx = Math.max(0, Math.floor(minX - pad) + extraMargin);
      const sy = Math.max(0, Math.floor(minY - pad) + extraMargin);
      const ex2 = Math.min(offW, Math.ceil(maxX + pad) + extraMargin);
      const ey2 = Math.min(offH, Math.ceil(maxY + pad) + extraMargin);
      const sw = ex2 - sx;
      const sh = ey2 - sy;

      if (sw > 0 && sh > 0) {
        const crop = document.createElement("canvas");
        crop.width = sw;
        crop.height = sh;
        const cctx = crop.getContext("2d");
        if (cctx) {
          cctx.drawImage(off, sx, sy, sw, sh, 0, 0, sw, sh);
          snaps[el.id] = crop.toDataURL();
          bounds[el.id] = { x: sx - extraMargin, y: sy - extraMargin, w: sw, h: sh };
        }
      }
    }

    animSnapshotsRef.current = snaps;
    animBoundsRef.current = bounds;
    setAnimatingElementId(elId);
    setAnimKey(k => k + 1);
  }, [currentPage, contentElements, signatureElements]);


  useEffect(() => {
    supabase.from("teams").select("*").order("created_at", { ascending: true }).then(({ data }) => {
      if (data) setAvailableTeams(data);
    });
  }, []);
  
  // Drag and resize state
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [isResizing, setIsResizing] = useState(false);
  const [resizeHandle, setResizeHandle] = useState<string | null>(null);
  const [resizeStart, setResizeStart] = useState({ x: 0, y: 0, width: 0, height: 0, elX: 0, elY: 0 });
  const [cursorStyle, setCursorStyle] = useState("crosshair");

  const getDefaultLayerName = (el: CanvasElement) => {
    const typeNames: Record<string, string> = {
      rect: "Retângulo",
      circle: "Círculo",
      text: el.text?.substring(0, 20) || "Texto",
      image: "Imagem",
      logo: "Logo",
      contact: "Contato",
      mascot: "Mascote",
      triangle: "Triângulo",
      line: "Linha",
      star: "Estrela",
      diamond: "Losango",
      hexagon: "Hexágono",
      pentagon: "Pentágono",
    };
    return el.name || typeNames[el.type] || el.type;
  };

  const startEditingLayerName = (el: CanvasElement) => {
    setEditingLayerId(el.id);
    setEditingLayerName(el.name || getDefaultLayerName(el));
  };

  const saveLayerName = () => {
    if (!editingLayerId) return;
    setElements(elements.map(el => 
      el.id === editingLayerId ? { ...el, name: editingLayerName.trim() || undefined } : el
    ));
    setEditingLayerId(null);
    setEditingLayerName("");
  };
  
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const canvasWrapperRef = useRef<HTMLDivElement>(null);
  const leftSidebarRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();

  // Animation preview state - captures actual element snapshot
  const [animPreview, setAnimPreview] = useState<{
    type: string;
    x: number;
    y: number;
    width: number;
    height: number;
    imageDataUrl: string;
    key: number;
    loop: boolean;
  } | null>(null);
  const animPreviewTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const triggerAnimPreview = (el: CanvasElement, animType: string, loop?: boolean) => {
    if (!animType || animType === "none") {
      setAnimPreview(null);
      return;
    }
    // Capture the element region from the canvas
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Get image data of the element area from the full-res canvas
    const sx = Math.max(0, Math.floor(el.x));
    const sy = Math.max(0, Math.floor(el.y));
    const sw = Math.min(Math.ceil(el.width), CANVAS_WIDTH - sx);
    const sh = Math.min(Math.ceil(el.height), CANVAS_HEIGHT - sy);
    
    try {
      const imgData = ctx.getImageData(sx, sy, sw, sh);
      const tmpCanvas = document.createElement("canvas");
      tmpCanvas.width = sw;
      tmpCanvas.height = sh;
      const tmpCtx = tmpCanvas.getContext("2d")!;
      tmpCtx.putImageData(imgData, 0, 0);
      const dataUrl = tmpCanvas.toDataURL();

      if (animPreviewTimerRef.current) clearTimeout(animPreviewTimerRef.current);

      setAnimPreview({
        type: animType,
        x: el.x * SCALE,
        y: el.y * SCALE,
        width: el.width * SCALE,
        height: el.height * SCALE,
        imageDataUrl: dataUrl,
        key: Date.now(),
        loop: !!loop,
      });

      if (!loop) {
        animPreviewTimerRef.current = setTimeout(() => setAnimPreview(null), 2500);
      }
    } catch (e) {
      console.error("Failed to capture element for preview", e);
    }
  };

  const stopAnimPreview = () => {
    if (animPreviewTimerRef.current) clearTimeout(animPreviewTimerRef.current);
    setAnimPreview(null);
  };

  // Handle background removal for selected image
  const handleRemoveBackground = async () => {
    const selectedEl = elements.find((el) => el.id === selectedElement);
    if (!selectedEl || !selectedEl.imageUrl) return;

    setIsRemovingBg(true);
    setRemoveBgProgress("Iniciando...");
    
    try {
      const newImageUrl = await removeBackground(selectedEl.imageUrl, setRemoveBgProgress);
      updateSelectedElement({ imageUrl: newImageUrl });
      toast({
        title: "Fundo removido!",
        description: "A imagem foi processada com sucesso.",
      });
    } catch (error) {
      console.error('Error removing background:', error);
      toast({
        title: "Erro ao remover fundo",
        description: "Não foi possível processar a imagem. Tente outra imagem.",
        variant: "destructive",
      });
    } finally {
      setIsRemovingBg(false);
      setRemoveBgProgress("");
    }
  };

  // Canvas dimensions for vertical video (9:16 aspect ratio)
  const CANVAS_WIDTH = 1080;
  const CANVAS_HEIGHT = 1920;
  const SCALE = 0.28; // Scale for display

  const elements = currentPage === "content" ? contentElements : signatureElements;
  const setElements = currentPage === "content" ? setContentElements : setSignatureElements;

  // Auto-clear animation after duration (for non-looping)
  useEffect(() => {
    if (!animatingElementId) return;
    const animEls = elements.filter((el) => {
      if (animatingElementId === "__all__") return el.animationType && el.animationType !== "none";
      return el.id === animatingElementId && el.animationType && el.animationType !== "none";
    });
    const allLoop = animEls.length > 0 && animEls.every((el) => el.animLoop);
    if (allLoop) return;
    const maxDur = Math.max(...animEls.map((el) => el.animDuration || 0.8), 1);
    const timer = setTimeout(() => setAnimatingElementId(null), maxDur * 1000 + 200);
    return () => clearTimeout(timer);
  }, [animatingElementId, animKey, elements]);

  const tools = [
    { id: "select", icon: Move, label: "Mover" },
    { id: "rect", icon: Square, label: "Retângulo" },
    { id: "circle", icon: Circle, label: "Círculo" },
    { id: "triangle", icon: Triangle, label: "Triângulo" },
    { id: "diamond", icon: Diamond, label: "Losango" },
    { id: "hexagon", icon: Hexagon, label: "Hexágono" },
    { id: "pentagon", icon: Pentagon, label: "Pentágono" },
    { id: "star", icon: Star, label: "Estrela" },
    { id: "line", icon: Minus, label: "Linha" },
    { id: "polkaDots", icon: Circle, label: "Bolinhas" },
    { id: "dotsGrid", icon: Circle, label: "Pontos" },
    { id: "confetti", icon: Sparkles, label: "Confetti" },
    { id: "splatter", icon: Circle, label: "Splash" },
    { id: "zigzag", icon: Minus, label: "Zigzag" },
    { id: "spiral", icon: Circle, label: "Espiral" },
    { id: "text", icon: Type, label: "Texto" },
    { id: "image", icon: ImageIcon, label: "Imagem" },
  ];

  // Load saved templates on mount
  useEffect(() => {
    loadTemplates();
  }, []);

  const loadTemplates = async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('master_video_templates')
        .select('*')
        .order('updated_at', { ascending: false });

      if (error) throw error;
      const templates = (data || []).map(t => ({
        ...t,
        content_elements: t.content_elements as unknown as CanvasElement[],
        signature_elements: t.signature_elements as unknown as CanvasElement[],
      }));
      setSavedTemplates(templates as SavedVideoTemplate[]);
    } catch (error) {
      console.error('Error loading video templates:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const saveTemplate = async () => {
    setIsSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toast({
          title: "Erro",
          description: "Você precisa estar logado para salvar templates.",
          variant: "destructive",
        });
        return;
      }

      const templateData = {
        name: templateName,
        content_elements: JSON.parse(JSON.stringify(contentElements)),
        signature_elements: JSON.parse(JSON.stringify(signatureElements)),
        width: CANVAS_WIDTH,
        height: CANVAS_HEIGHT,
        background_color: backgroundColor,
        page_duration: pageDuration,
        audio_url_1: audioUrl1 || null,
        audio_url_2: audioUrl2 || null,
        created_by: user.id,
      };

      if (currentTemplateId) {
        const { error } = await supabase
          .from('master_video_templates')
          .update(templateData)
          .eq('id', currentTemplateId);

        if (error) throw error;
        toast({
          title: "Template atualizado!",
          description: "Suas alterações foram salvas.",
        });
      } else {
        const { data, error } = await supabase
          .from('master_video_templates')
          .insert(templateData)
          .select()
          .single();

        if (error) throw error;
        setCurrentTemplateId(data.id);
        toast({
          title: "Template salvo!",
          description: "Seu template de vídeo foi criado com sucesso.",
        });
      }

      loadTemplates();
    } catch (error) {
      console.error('Error saving video template:', error);
      toast({
        title: "Erro ao salvar",
        description: "Não foi possível salvar o template.",
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const loadTemplate = async (templateId: string) => {
    try {
      const { data, error } = await supabase
        .from('master_video_templates')
        .select('*')
        .eq('id', templateId)
        .single();

      if (error) throw error;
      
      setCurrentTemplateId(data.id);
      setTemplateName(data.name);
      setContentElements(data.content_elements as unknown as CanvasElement[]);
      setSignatureElements(data.signature_elements as unknown as CanvasElement[]);
      setBackgroundColor(data.background_color);
      setPageDuration(data.page_duration);
      setAudioUrl1((data as any).audio_url_1 || "");
      setAudioUrl2((data as any).audio_url_2 || "");
      
      toast({
        title: "Template carregado!",
        description: `"${data.name}" foi carregado com sucesso.`,
      });
    } catch (error) {
      console.error('Error loading video template:', error);
      toast({
        title: "Erro ao carregar",
        description: "Não foi possível carregar o template.",
        variant: "destructive",
      });
    }
  };

  const newTemplate = () => {
    setCurrentTemplateId(null);
    setTemplateName("Novo Template de Vídeo");
    setContentElements([]);
    setSignatureElements([]);
    setBackgroundColor("#1a1a2e");
    setPageDuration(10);
    setAudioUrl1("");
    setAudioUrl2("");
    setSelectedElement(null);
  };

  const placeholders = [
    { id: "logo", icon: User, label: "Logo", type: "logo" as const },
    { id: "contact", icon: Phone, label: "Contato", type: "contact" as const },
    { id: "mascot", icon: Sparkles, label: "Mascote", type: "mascot" as const },
  ];

  // Draw canvas
  useEffect(() => {
    drawCanvas();
  }, [elements, selectedElement, backgroundColor, currentPage, animatingElementId, animKey]);

  // Draw a single element on a given context (for snapshot isolation)
  const drawSingleElement = useCallback((ctx: CanvasRenderingContext2D, el: CanvasElement) => {
    ctx.save();
    if (el.rotation) {
      const cx = el.x + el.width / 2;
      const cy = el.y + el.height / 2;
      ctx.translate(cx, cy);
      ctx.rotate((el.rotation * Math.PI) / 180);
      ctx.translate(-cx, -cy);
    }
    ctx.globalAlpha = (el.opacity ?? 100) / 100;
    if (el.shadowBlur && el.shadowBlur > 0) {
      ctx.shadowBlur = el.shadowBlur;
      ctx.shadowColor = el.shadowColor || "rgba(0,0,0,0.5)";
      ctx.shadowOffsetX = el.shadowOffsetX || 0;
      ctx.shadowOffsetY = el.shadowOffsetY || 0;
    }
    // Fill style
    let fillStyle: string | CanvasGradient = el.color || "#3B82F6";
    if (el.gradient) {
      const hexToRgba = (hex: string, opacity: number) => {
        const r = parseInt(hex.slice(1, 3), 16);
        const g = parseInt(hex.slice(3, 5), 16);
        const b = parseInt(hex.slice(5, 7), 16);
        return `rgba(${r},${g},${b},${opacity / 100})`;
      };
      let gradient;
      if (el.gradient.type === "linear") {
        const angle = (el.gradient.angle || 0) * Math.PI / 180;
        const cx = el.x + el.width / 2;
        const cy = el.y + el.height / 2;
        const dx = Math.cos(angle) * el.width / 2;
        const dy = Math.sin(angle) * el.height / 2;
        gradient = ctx.createLinearGradient(cx - dx, cy - dy, cx + dx, cy + dy);
      } else {
        gradient = ctx.createRadialGradient(
          el.x + el.width / 2, el.y + el.height / 2, 0,
          el.x + el.width / 2, el.y + el.height / 2, Math.max(el.width, el.height) / 2
        );
      }
      gradient.addColorStop(0, hexToRgba(el.gradient.color1, el.gradient.opacity1 ?? 100));
      gradient.addColorStop(1, hexToRgba(el.gradient.color2, el.gradient.opacity2 ?? 100));
      fillStyle = gradient;
    }
    ctx.fillStyle = fillStyle;

    const drawBorderSingle = () => {
      if (el.borderWidth && el.borderWidth > 0) {
        ctx.globalAlpha = 1;
        ctx.strokeStyle = el.borderColor || "#000000";
        ctx.lineWidth = el.borderWidth;
        ctx.stroke();
        ctx.globalAlpha = (el.opacity ?? 100) / 100;
      }
    };

    if (el.type === "rect") {
      const radius = el.borderRadius || 0;
      if (radius > 0) {
        ctx.beginPath();
        ctx.roundRect(el.x, el.y, el.width, el.height, radius);
        ctx.fill();
        drawBorderSingle();
      } else {
        ctx.fillRect(el.x, el.y, el.width, el.height);
        if (el.borderWidth && el.borderWidth > 0) {
          ctx.globalAlpha = 1;
          ctx.strokeStyle = el.borderColor || "#000000";
          ctx.lineWidth = el.borderWidth;
          ctx.strokeRect(el.x, el.y, el.width, el.height);
        }
      }
    } else if (el.type === "circle") {
      ctx.beginPath();
      ctx.ellipse(el.x + el.width / 2, el.y + el.height / 2, el.width / 2, el.height / 2, 0, 0, Math.PI * 2);
      ctx.fill();
      drawBorderSingle();
    } else if (el.type === "triangle") {
      ctx.beginPath();
      ctx.moveTo(el.x + el.width / 2, el.y);
      ctx.lineTo(el.x + el.width, el.y + el.height);
      ctx.lineTo(el.x, el.y + el.height);
      ctx.closePath();
      ctx.fill();
      drawBorderSingle();
    } else if (el.type === "diamond") {
      ctx.beginPath();
      ctx.moveTo(el.x + el.width / 2, el.y);
      ctx.lineTo(el.x + el.width, el.y + el.height / 2);
      ctx.lineTo(el.x + el.width / 2, el.y + el.height);
      ctx.lineTo(el.x, el.y + el.height / 2);
      ctx.closePath();
      ctx.fill();
      drawBorderSingle();
    } else if (el.type === "hexagon") {
      const cx = el.x + el.width / 2;
      const cy = el.y + el.height / 2;
      const r = Math.min(el.width, el.height) / 2;
      ctx.beginPath();
      for (let i = 0; i < 6; i++) {
        const angle = (Math.PI / 3) * i - Math.PI / 2;
        if (i === 0) ctx.moveTo(cx + r * Math.cos(angle), cy + r * Math.sin(angle));
        else ctx.lineTo(cx + r * Math.cos(angle), cy + r * Math.sin(angle));
      }
      ctx.closePath();
      ctx.fill();
      drawBorderSingle();
    } else if (el.type === "pentagon") {
      const cx = el.x + el.width / 2;
      const cy = el.y + el.height / 2;
      const r = Math.min(el.width, el.height) / 2;
      ctx.beginPath();
      for (let i = 0; i < 5; i++) {
        const angle = (Math.PI * 2 / 5) * i - Math.PI / 2;
        if (i === 0) ctx.moveTo(cx + r * Math.cos(angle), cy + r * Math.sin(angle));
        else ctx.lineTo(cx + r * Math.cos(angle), cy + r * Math.sin(angle));
      }
      ctx.closePath();
      ctx.fill();
      drawBorderSingle();
    } else if (el.type === "star") {
      const cx = el.x + el.width / 2;
      const cy = el.y + el.height / 2;
      const outerR = Math.min(el.width, el.height) / 2;
      const innerR = outerR * 0.4;
      ctx.beginPath();
      for (let i = 0; i < 10; i++) {
        const angle = (Math.PI / 5) * i - Math.PI / 2;
        const r = i % 2 === 0 ? outerR : innerR;
        if (i === 0) ctx.moveTo(cx + r * Math.cos(angle), cy + r * Math.sin(angle));
        else ctx.lineTo(cx + r * Math.cos(angle), cy + r * Math.sin(angle));
      }
      ctx.closePath();
      ctx.fill();
      drawBorderSingle();
    } else if (el.type === "line") {
      ctx.strokeStyle = el.color || "#3B82F6";
      ctx.lineWidth = el.height || 4;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(el.x, el.y + el.height / 2);
      ctx.lineTo(el.x + el.width, el.y + el.height / 2);
      ctx.stroke();
    } else if (el.type === "zigzag") {
      ctx.strokeStyle = el.color || "#3B82F6";
      ctx.lineWidth = 4;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      const peaks = 8;
      const peakWidth = el.width / peaks;
      ctx.beginPath();
      ctx.moveTo(el.x, el.y + el.height / 2);
      for (let i = 0; i <= peaks; i++) {
        ctx.lineTo(el.x + i * peakWidth, el.y + (i % 2 === 0 ? el.height : 0));
      }
      ctx.stroke();
    } else if (el.type === "spiral") {
      ctx.strokeStyle = el.color || "#3B82F6";
      ctx.lineWidth = 4;
      ctx.lineCap = "round";
      const cx = el.x + el.width / 2;
      const cy = el.y + el.height / 2;
      const maxRadius = Math.min(el.width, el.height) / 2;
      ctx.beginPath();
      for (let i = 0; i <= 100; i++) {
        const t = (i / 100) * 3 * Math.PI * 2;
        const r = (i / 100) * maxRadius;
        if (i === 0) ctx.moveTo(cx + r * Math.cos(t), cy + r * Math.sin(t));
        else ctx.lineTo(cx + r * Math.cos(t), cy + r * Math.sin(t));
      }
      ctx.stroke();
    } else if (el.type === "text") {
      ctx.fillStyle = el.color || "#ffffff";
      const fontSize = el.fontSize || 48;
      ctx.font = `${fontSize}px Arial`;
      ctx.textAlign = el.textAlign || "left";
      const lh = (el.lineHeight || 1.3) * fontSize;
      const text = el.text || "Texto";
      const words = text.split(" ");
      let line = "";
      let drawX = (el.textAlign || "left") === "center" ? el.x + el.width / 2 : (el.textAlign || "left") === "right" ? el.x + el.width : el.x;
      let y = el.y + fontSize;
      for (let i = 0; i < words.length; i++) {
        const testLine = line + words[i] + " ";
        if (ctx.measureText(testLine).width > el.width && i > 0) {
          ctx.fillText(line.trim(), drawX, y);
          line = words[i] + " ";
          y += lh;
        } else {
          line = testLine;
        }
      }
      ctx.fillText(line.trim(), drawX, y);
      ctx.textAlign = "left";
    } else if (el.type === "contact") {
      ctx.fillStyle = el.color || "#10B981";
      const fontSize = el.fontSize || 48;
      ctx.font = `${fontSize}px Arial`;
      ctx.textAlign = el.textAlign || "left";
      const lh = (el.lineHeight || 1.3) * fontSize;
      const text = el.text || "Contato";
      let drawX = (el.textAlign || "left") === "center" ? el.x + el.width / 2 : (el.textAlign || "left") === "right" ? el.x + el.width : el.x;
      ctx.fillText(text, drawX, el.y + fontSize);
      ctx.textAlign = "left";
    } else if (el.type === "polkaDots") {
      const dotRadius = Math.min(el.width, el.height) * 0.08;
      const spacing = dotRadius * 3;
      const cols = Math.floor(el.width / spacing);
      const rows = Math.floor(el.height / spacing);
      const offsetX = (el.width - (cols - 1) * spacing) / 2;
      const offsetY = (el.height - (rows - 1) * spacing) / 2;
      ctx.fillStyle = el.color || "#3B82F6";
      for (let row = 0; row < rows; row++) {
        for (let col = 0; col < cols; col++) {
          ctx.beginPath();
          ctx.arc(el.x + offsetX + col * spacing, el.y + offsetY + row * spacing, dotRadius, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    } else if (el.type === "dotsGrid" || el.type === "confetti" || el.type === "splatter") {
      // These use seeded random - draw as rect placeholder for snapshot
      ctx.fillStyle = el.color || "#3B82F6";
      const seed = el.x + el.y;
      const random = (i: number) => { const x = Math.sin(seed + i * 9.999) * 10000; return x - Math.floor(x); };
      if (el.type === "dotsGrid") {
        for (let i = 0; i < 25; i++) {
          ctx.beginPath();
          ctx.arc(el.x + random(i * 2) * el.width, el.y + random(i * 2 + 1) * el.height, 3 + random(i * 3) * 12, 0, Math.PI * 2);
          ctx.fill();
        }
      } else if (el.type === "confetti") {
        const colors = [el.color || "#3B82F6", "#f59e0b", "#3b82f6", "#10b981", "#8b5cf6"];
        for (let i = 0; i < 30; i++) {
          ctx.fillStyle = colors[Math.floor(random(i * 5) * colors.length)];
          const size = 5 + random(i * 3) * 15;
          ctx.save();
          ctx.translate(el.x + random(i * 2) * el.width, el.y + random(i * 2 + 1) * el.height);
          ctx.rotate(random(i * 4) * Math.PI * 2);
          ctx.fillRect(-size / 2, -size / 4, size, size / 2);
          ctx.restore();
        }
      } else {
        const cx = el.x + el.width / 2;
        const cy = el.y + el.height / 2;
        const mainRadius = Math.min(el.width, el.height) * 0.3;
        ctx.beginPath();
        ctx.arc(cx, cy, mainRadius, 0, Math.PI * 2);
        ctx.fill();
        for (let i = 0; i < 20; i++) {
          const angle = random(i) * Math.PI * 2;
          const distance = mainRadius + random(i + 20) * mainRadius * 1.5;
          ctx.beginPath();
          ctx.arc(cx + Math.cos(angle) * distance, cy + Math.sin(angle) * distance, 3 + random(i + 40) * 10, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    } else if (el.type === "logo") {
      ctx.fillStyle = "rgba(59, 130, 246, 0.3)";
      ctx.fillRect(el.x, el.y, el.width, el.height);
      ctx.strokeStyle = "#3B82F6";
      ctx.lineWidth = 3;
      ctx.strokeRect(el.x, el.y, el.width, el.height);
      ctx.fillStyle = "#3B82F6";
      ctx.font = "bold 32px Arial";
      ctx.textAlign = "center";
      ctx.fillText("LOGO", el.x + el.width / 2, el.y + el.height / 2 + 12);
    } else if (el.type === "mascot") {
      ctx.fillStyle = "rgba(245, 158, 11, 0.3)";
      ctx.fillRect(el.x, el.y, el.width, el.height);
      ctx.strokeStyle = "#F59E0B";
      ctx.lineWidth = 3;
      ctx.strokeRect(el.x, el.y, el.width, el.height);
      ctx.fillStyle = "#F59E0B";
      ctx.font = "bold 32px Arial";
      ctx.textAlign = "center";
      ctx.fillText("MASCOTE", el.x + el.width / 2, el.y + el.height / 2 + 12);
    } else if (el.type === "image") {
      // Image placeholder with visible reference
      ctx.fillStyle = "rgba(139, 92, 246, 0.15)";
      const shape = el.clipShape || "rect";
      if (shape === "circle") {
        ctx.beginPath();
        ctx.ellipse(el.x + el.width / 2, el.y + el.height / 2, el.width / 2, el.height / 2, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = "rgba(139, 92, 246, 0.6)";
        ctx.lineWidth = 3;
        ctx.setLineDash([10, 6]);
        ctx.stroke();
        ctx.setLineDash([]);
      } else {
        ctx.fillRect(el.x, el.y, el.width, el.height);
        ctx.strokeStyle = "rgba(139, 92, 246, 0.6)";
        ctx.lineWidth = 3;
        ctx.setLineDash([10, 6]);
        ctx.strokeRect(el.x, el.y, el.width, el.height);
        ctx.setLineDash([]);
      }
      // Draw image icon and label
      ctx.fillStyle = "rgba(139, 92, 246, 0.7)";
      ctx.font = "bold 28px Arial";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      const iconSize = Math.min(el.width, el.height) * 0.15;
      const centerX = el.x + el.width / 2;
      const centerY = el.y + el.height / 2;
      // Simple mountain/image icon
      ctx.beginPath();
      ctx.moveTo(centerX - iconSize, centerY + iconSize * 0.3);
      ctx.lineTo(centerX - iconSize * 0.3, centerY - iconSize * 0.5);
      ctx.lineTo(centerX + iconSize * 0.1, centerY + iconSize * 0.1);
      ctx.lineTo(centerX + iconSize * 0.4, centerY - iconSize * 0.2);
      ctx.lineTo(centerX + iconSize, centerY + iconSize * 0.3);
      ctx.closePath();
      ctx.fill();
      ctx.fillText("IMAGEM", centerX, centerY + iconSize + 20);
    } else {
      drawNewShape(ctx, el.type, el.x, el.y, el.width, el.height, ctx.fillStyle as string);
    }
    ctx.restore();
  }, []);
  drawSingleElementRef.current = drawSingleElement;

  const drawCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d")!;
    ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    // Draw background
    ctx.fillStyle = backgroundColor;
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    // Draw page indicator
    ctx.fillStyle = "rgba(255,255,255,0.1)";
    ctx.font = "bold 48px Arial";
    ctx.textAlign = "center";
    ctx.fillText(
      currentPage === "content" ? "PÁGINA DE CONTEÚDO" : "PÁGINA DE ASSINATURA",
      CANVAS_WIDTH / 2,
      100
    );

    // Helper to apply common styles
    const applyStyles = (el: CanvasElement) => {
      // Opacity
      ctx.globalAlpha = (el.opacity ?? 100) / 100;

      // Shadow
      if (el.shadowBlur && el.shadowBlur > 0) {
        ctx.shadowBlur = el.shadowBlur;
        ctx.shadowColor = el.shadowColor || "rgba(0,0,0,0.5)";
        ctx.shadowOffsetX = el.shadowOffsetX || 0;
        ctx.shadowOffsetY = el.shadowOffsetY || 0;
      }

      // Get fill style (gradient or solid)
      if (el.gradient) {
        let gradient;
        if (el.gradient.type === "linear") {
          const angle = (el.gradient.angle || 0) * Math.PI / 180;
          const cx = el.x + el.width / 2;
          const cy = el.y + el.height / 2;
          const dx = Math.cos(angle) * el.width / 2;
          const dy = Math.sin(angle) * el.height / 2;
          gradient = ctx.createLinearGradient(cx - dx, cy - dy, cx + dx, cy + dy);
        } else {
          gradient = ctx.createRadialGradient(
            el.x + el.width / 2, el.y + el.height / 2, 0,
            el.x + el.width / 2, el.y + el.height / 2, Math.max(el.width, el.height) / 2
          );
        }
        // Convert hex to rgba with opacity
        const hexToRgba = (hex: string, opacity: number) => {
          const r = parseInt(hex.slice(1, 3), 16);
          const g = parseInt(hex.slice(3, 5), 16);
          const b = parseInt(hex.slice(5, 7), 16);
          return `rgba(${r}, ${g}, ${b}, ${opacity / 100})`;
        };
        gradient.addColorStop(0, hexToRgba(el.gradient.color1, el.gradient.opacity1 ?? 100));
        gradient.addColorStop(1, hexToRgba(el.gradient.color2, el.gradient.opacity2 ?? 100));
        return gradient;
      }
      return el.color || currentColor;
    };

    // Helper to draw border (always at full opacity)
    const drawBorder = (el: CanvasElement) => {
      if (el.borderWidth && el.borderWidth > 0) {
        ctx.globalAlpha = 1; // Borders are always fully opaque
        ctx.strokeStyle = el.borderColor || "#000000";
        ctx.lineWidth = el.borderWidth;
        ctx.stroke();
        ctx.globalAlpha = (el.opacity ?? 100) / 100; // Restore element opacity
      }
    };

    // Draw elements — skip animating ones (they show via snapshot overlay)
    elements.forEach((el) => {
      if (animatingElementId) {
        const isAnimating = animatingElementId === "__all__"
          ? (el.animationType && el.animationType !== "none")
          : (el.id === animatingElementId && el.animationType && el.animationType !== "none");
        if (isAnimating) return;
      }
      ctx.save();
      
      // Apply rotation
      if (el.rotation) {
        const cx = el.x + el.width / 2;
        const cy = el.y + el.height / 2;
        ctx.translate(cx, cy);
        ctx.rotate((el.rotation * Math.PI) / 180);
        ctx.translate(-cx, -cy);
      }
      
      const fillStyle = applyStyles(el);
      ctx.fillStyle = fillStyle;

      if (el.type === "rect") {
        const radius = el.borderRadius || 0;
        if (radius > 0) {
          ctx.beginPath();
          ctx.roundRect(el.x, el.y, el.width, el.height, radius);
          ctx.fill();
          drawBorder(el);
        } else {
          ctx.fillRect(el.x, el.y, el.width, el.height);
          if (el.borderWidth && el.borderWidth > 0) {
            ctx.globalAlpha = 1;
            ctx.strokeStyle = el.borderColor || "#000000";
            ctx.lineWidth = el.borderWidth;
            ctx.strokeRect(el.x, el.y, el.width, el.height);
            ctx.globalAlpha = (el.opacity ?? 100) / 100;
          }
        }
      } else if (el.type === "circle") {
        ctx.beginPath();
        ctx.ellipse(
          el.x + el.width / 2,
          el.y + el.height / 2,
          el.width / 2,
          el.height / 2,
          0,
          0,
          Math.PI * 2
        );
        ctx.fill();
        drawBorder(el);
      } else if (el.type === "triangle") {
        ctx.beginPath();
        ctx.moveTo(el.x + el.width / 2, el.y);
        ctx.lineTo(el.x + el.width, el.y + el.height);
        ctx.lineTo(el.x, el.y + el.height);
        ctx.closePath();
        ctx.fill();
        drawBorder(el);
      } else if (el.type === "diamond") {
        ctx.beginPath();
        ctx.moveTo(el.x + el.width / 2, el.y);
        ctx.lineTo(el.x + el.width, el.y + el.height / 2);
        ctx.lineTo(el.x + el.width / 2, el.y + el.height);
        ctx.lineTo(el.x, el.y + el.height / 2);
        ctx.closePath();
        ctx.fill();
        drawBorder(el);
      } else if (el.type === "hexagon") {
        const cx = el.x + el.width / 2;
        const cy = el.y + el.height / 2;
        const r = Math.min(el.width, el.height) / 2;
        ctx.beginPath();
        for (let i = 0; i < 6; i++) {
          const angle = (Math.PI / 3) * i - Math.PI / 2;
          const px = cx + r * Math.cos(angle);
          const py = cy + r * Math.sin(angle);
          if (i === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
        ctx.closePath();
        ctx.fill();
        drawBorder(el);
      } else if (el.type === "pentagon") {
        const cx = el.x + el.width / 2;
        const cy = el.y + el.height / 2;
        const r = Math.min(el.width, el.height) / 2;
        ctx.beginPath();
        for (let i = 0; i < 5; i++) {
          const angle = (Math.PI * 2 / 5) * i - Math.PI / 2;
          const px = cx + r * Math.cos(angle);
          const py = cy + r * Math.sin(angle);
          if (i === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
        ctx.closePath();
        ctx.fill();
        drawBorder(el);
      } else if (el.type === "star") {
        const cx = el.x + el.width / 2;
        const cy = el.y + el.height / 2;
        const outerR = Math.min(el.width, el.height) / 2;
        const innerR = outerR * 0.4;
        ctx.beginPath();
        for (let i = 0; i < 10; i++) {
          const angle = (Math.PI / 5) * i - Math.PI / 2;
          const r = i % 2 === 0 ? outerR : innerR;
          const px = cx + r * Math.cos(angle);
          const py = cy + r * Math.sin(angle);
          if (i === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
        ctx.closePath();
        ctx.fill();
        drawBorder(el);
      } else if (el.type === "line") {
        ctx.strokeStyle = el.color || currentColor;
        ctx.lineWidth = el.height || 4;
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(el.x, el.y + el.height / 2);
        ctx.lineTo(el.x + el.width, el.y + el.height / 2);
        ctx.stroke();
      } else if (el.type === "polkaDots") {
        // Polka dots pattern
        const color = el.color || currentColor;
        const dotRadius = Math.min(el.width, el.height) * 0.08;
        const spacing = dotRadius * 3;
        const cols = Math.floor(el.width / spacing);
        const rows = Math.floor(el.height / spacing);
        const offsetX = (el.width - (cols - 1) * spacing) / 2;
        const offsetY = (el.height - (rows - 1) * spacing) / 2;
        
        ctx.fillStyle = color;
        for (let row = 0; row < rows; row++) {
          for (let col = 0; col < cols; col++) {
            const cx = el.x + offsetX + col * spacing;
            const cy = el.y + offsetY + row * spacing;
            ctx.beginPath();
            ctx.arc(cx, cy, dotRadius, 0, Math.PI * 2);
            ctx.fill();
          }
        }
      } else if (el.type === "dotsGrid") {
        // Scattered dots pattern
        const color = el.color || currentColor;
        const dotCount = 25;
        ctx.fillStyle = color;
        
        const seed = el.x + el.y;
        const random = (i: number) => {
          const x = Math.sin(seed + i * 9.999) * 10000;
          return x - Math.floor(x);
        };
        
        for (let i = 0; i < dotCount; i++) {
          const cx = el.x + random(i * 2) * el.width;
          const cy = el.y + random(i * 2 + 1) * el.height;
          const radius = 3 + random(i * 3) * 12;
          ctx.beginPath();
          ctx.arc(cx, cy, radius, 0, Math.PI * 2);
          ctx.fill();
        }
      } else if (el.type === "confetti") {
        // Confetti scattered shapes
        const colors = [el.color || currentColor, "#f59e0b", "#3b82f6", "#10b981", "#8b5cf6"];
        const shapeCount = 30;
        
        const seed = el.x + el.y;
        const random = (i: number) => {
          const x = Math.sin(seed + i * 9.999) * 10000;
          return x - Math.floor(x);
        };
        
        for (let i = 0; i < shapeCount; i++) {
          const cx = el.x + random(i * 2) * el.width;
          const cy = el.y + random(i * 2 + 1) * el.height;
          const size = 5 + random(i * 3) * 15;
          const rotation = random(i * 4) * Math.PI * 2;
          ctx.fillStyle = colors[Math.floor(random(i * 5) * colors.length)];
          
          ctx.save();
          ctx.translate(cx, cy);
          ctx.rotate(rotation);
          
          const shapeType = Math.floor(random(i * 6) * 3);
          if (shapeType === 0) {
            ctx.fillRect(-size / 2, -size / 4, size, size / 2);
          } else if (shapeType === 1) {
            ctx.beginPath();
            ctx.arc(0, 0, size / 3, 0, Math.PI * 2);
            ctx.fill();
          } else {
            ctx.beginPath();
            ctx.moveTo(0, -size / 2);
            ctx.lineTo(size / 2, size / 2);
            ctx.lineTo(-size / 2, size / 2);
            ctx.closePath();
            ctx.fill();
          }
          ctx.restore();
        }
      } else if (el.type === "splatter") {
        // Paint splatter effect
        const color = el.color || currentColor;
        ctx.fillStyle = color;
        
        const seed = el.x + el.y;
        const random = (i: number) => {
          const x = Math.sin(seed + i * 9.999) * 10000;
          return x - Math.floor(x);
        };
        
        const cx = el.x + el.width / 2;
        const cy = el.y + el.height / 2;
        const mainRadius = Math.min(el.width, el.height) * 0.3;
        
        ctx.beginPath();
        ctx.arc(cx, cy, mainRadius, 0, Math.PI * 2);
        ctx.fill();
        
        for (let i = 0; i < 20; i++) {
          const angle = random(i) * Math.PI * 2;
          const distance = mainRadius + random(i + 20) * mainRadius * 1.5;
          const dx = cx + Math.cos(angle) * distance;
          const dy = cy + Math.sin(angle) * distance;
          const dropRadius = 3 + random(i + 40) * 10;
          
          ctx.beginPath();
          ctx.arc(dx, dy, dropRadius, 0, Math.PI * 2);
          ctx.fill();
        }
      } else if (el.type === "zigzag") {
        // Zigzag line pattern
        const color = el.color || currentColor;
        ctx.strokeStyle = color;
        ctx.lineWidth = 4;
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        
        const peaks = 8;
        const peakWidth = el.width / peaks;
        
        ctx.beginPath();
        ctx.moveTo(el.x, el.y + el.height / 2);
        
        for (let i = 0; i <= peaks; i++) {
          const x = el.x + i * peakWidth;
          const y = el.y + (i % 2 === 0 ? el.height : 0);
          ctx.lineTo(x, y);
        }
        ctx.stroke();
      } else if (el.type === "spiral") {
        // Spiral decorative element
        const color = el.color || currentColor;
        ctx.strokeStyle = color;
        ctx.lineWidth = 4;
        ctx.lineCap = "round";
        
        const cx = el.x + el.width / 2;
        const cy = el.y + el.height / 2;
        const maxRadius = Math.min(el.width, el.height) / 2;
        const turns = 3;
        const points = 100;
        
        ctx.beginPath();
        for (let i = 0; i <= points; i++) {
          const t = (i / points) * turns * Math.PI * 2;
          const r = (i / points) * maxRadius;
          const x = cx + r * Math.cos(t);
          const y = cy + r * Math.sin(t);
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
      } else if (drawNewShape(ctx, el.type, el.x, el.y, el.width, el.height, ctx.fillStyle as string)) {
        // New shape drawn by helper
      } else if (el.type === "text") {
        ctx.fillStyle = el.color || "#ffffff";
        const fontSize = el.fontSize || 48;
        ctx.font = `${fontSize}px Arial`;
        const align = el.textAlign || "left";
        ctx.textAlign = align;
        const lh = (el.lineHeight || 1.3) * fontSize;
        const text = el.text || "Texto";
        const words = text.split(" ");
        let line = "";
        let drawX = align === "center" ? el.x + el.width / 2 : align === "right" ? el.x + el.width : el.x;
        let y = el.y + fontSize;
        const maxWidth = el.width || 800;
        for (let i = 0; i < words.length; i++) {
          const testLine = line + words[i] + " ";
          const metrics = ctx.measureText(testLine);
          if (metrics.width > maxWidth && i > 0) {
            ctx.fillText(line.trim(), drawX, y);
            line = words[i] + " ";
            y += lh;
          } else {
            line = testLine;
          }
        }
        ctx.fillText(line.trim(), drawX, y);
        ctx.textAlign = "left";
        // Draw image placeholder with clip shape
        const shape = el.clipShape || "rect";
        ctx.fillStyle = "rgba(139, 92, 246, 0.3)";
        
        if (shape === "circle") {
          ctx.beginPath();
          ctx.ellipse(el.x + el.width / 2, el.y + el.height / 2, el.width / 2, el.height / 2, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = "#8B5CF6";
          ctx.lineWidth = 3;
          ctx.setLineDash([10, 5]);
          ctx.stroke();
          ctx.setLineDash([]);
        } else if (shape === "triangle") {
          ctx.beginPath();
          ctx.moveTo(el.x + el.width / 2, el.y);
          ctx.lineTo(el.x + el.width, el.y + el.height);
          ctx.lineTo(el.x, el.y + el.height);
          ctx.closePath();
          ctx.fill();
          ctx.strokeStyle = "#8B5CF6";
          ctx.lineWidth = 3;
          ctx.setLineDash([10, 5]);
          ctx.stroke();
          ctx.setLineDash([]);
        } else if (shape === "diamond") {
          ctx.beginPath();
          ctx.moveTo(el.x + el.width / 2, el.y);
          ctx.lineTo(el.x + el.width, el.y + el.height / 2);
          ctx.lineTo(el.x + el.width / 2, el.y + el.height);
          ctx.lineTo(el.x, el.y + el.height / 2);
          ctx.closePath();
          ctx.fill();
          ctx.strokeStyle = "#8B5CF6";
          ctx.lineWidth = 3;
          ctx.setLineDash([10, 5]);
          ctx.stroke();
          ctx.setLineDash([]);
        } else if (shape === "hexagon") {
          const cx = el.x + el.width / 2;
          const cy = el.y + el.height / 2;
          const r = Math.min(el.width, el.height) / 2;
          ctx.beginPath();
          for (let i = 0; i < 6; i++) {
            const angle = (Math.PI / 3) * i - Math.PI / 2;
            const px = cx + r * Math.cos(angle);
            const py = cy + r * Math.sin(angle);
            if (i === 0) ctx.moveTo(px, py);
            else ctx.lineTo(px, py);
          }
          ctx.closePath();
          ctx.fill();
          ctx.strokeStyle = "#8B5CF6";
          ctx.lineWidth = 3;
          ctx.setLineDash([10, 5]);
          ctx.stroke();
          ctx.setLineDash([]);
        } else if (shape === "pentagon") {
          const cx = el.x + el.width / 2;
          const cy = el.y + el.height / 2;
          const r = Math.min(el.width, el.height) / 2;
          ctx.beginPath();
          for (let i = 0; i < 5; i++) {
            const angle = (Math.PI * 2 / 5) * i - Math.PI / 2;
            const px = cx + r * Math.cos(angle);
            const py = cy + r * Math.sin(angle);
            if (i === 0) ctx.moveTo(px, py);
            else ctx.lineTo(px, py);
          }
          ctx.closePath();
          ctx.fill();
          ctx.strokeStyle = "#8B5CF6";
          ctx.lineWidth = 3;
          ctx.setLineDash([10, 5]);
          ctx.stroke();
          ctx.setLineDash([]);
        } else if (shape === "star") {
          const cx = el.x + el.width / 2;
          const cy = el.y + el.height / 2;
          const outerR = Math.min(el.width, el.height) / 2;
          const innerR = outerR * 0.4;
          ctx.beginPath();
          for (let i = 0; i < 10; i++) {
            const angle = (Math.PI / 5) * i - Math.PI / 2;
            const r = i % 2 === 0 ? outerR : innerR;
            const px = cx + r * Math.cos(angle);
            const py = cy + r * Math.sin(angle);
            if (i === 0) ctx.moveTo(px, py);
            else ctx.lineTo(px, py);
          }
          ctx.closePath();
          ctx.fill();
          ctx.strokeStyle = "#8B5CF6";
          ctx.lineWidth = 3;
          ctx.setLineDash([10, 5]);
          ctx.stroke();
          ctx.setLineDash([]);
        } else {
          // Default rect
          ctx.fillRect(el.x, el.y, el.width, el.height);
          ctx.strokeStyle = "#8B5CF6";
          ctx.lineWidth = 3;
          ctx.setLineDash([10, 5]);
          ctx.strokeRect(el.x, el.y, el.width, el.height);
          ctx.setLineDash([]);
        }
        
        ctx.fillStyle = "#8B5CF6";
        ctx.font = "bold 36px Arial";
        ctx.textAlign = "center";
        const shapeLabel = shape === "rect" ? "📷 IMAGEM" : `📷 ${shape.toUpperCase()}`;
        ctx.fillText(shapeLabel, el.x + el.width / 2, el.y + el.height / 2);
      } else if (el.type === "logo") {
        ctx.fillStyle = "rgba(59, 130, 246, 0.3)";
        ctx.fillRect(el.x, el.y, el.width, el.height);
        ctx.strokeStyle = "#3B82F6";
        ctx.lineWidth = 3;
        ctx.strokeRect(el.x, el.y, el.width, el.height);
        ctx.fillStyle = "#3B82F6";
        ctx.font = "bold 32px Arial";
        ctx.textAlign = "center";
        ctx.fillText("LOGO", el.x + el.width / 2, el.y + el.height / 2 + 12);
      } else if (el.type === "contact") {
        ctx.fillStyle = "rgba(16, 185, 129, 0.3)";
        ctx.fillRect(el.x, el.y, el.width, el.height);
        ctx.strokeStyle = "#10B981";
        ctx.lineWidth = 3;
        ctx.strokeRect(el.x, el.y, el.width, el.height);
        ctx.fillStyle = "#10B981";
        ctx.font = "bold 32px Arial";
        ctx.textAlign = "center";
        ctx.fillText("CONTATO", el.x + el.width / 2, el.y + el.height / 2 + 12);
      } else if (el.type === "mascot") {
        ctx.fillStyle = "rgba(245, 158, 11, 0.3)";
        ctx.fillRect(el.x, el.y, el.width, el.height);
        ctx.strokeStyle = "#F59E0B";
        ctx.lineWidth = 3;
        ctx.strokeRect(el.x, el.y, el.width, el.height);
        ctx.fillStyle = "#F59E0B";
        ctx.font = "bold 32px Arial";
        ctx.textAlign = "center";
        ctx.fillText("MASCOTE", el.x + el.width / 2, el.y + el.height / 2 + 12);
      }

      ctx.restore();

      // Draw selection with handles
      if (el.id === selectedElement) {
        ctx.strokeStyle = "#ffffff";
        ctx.lineWidth = 3;
        ctx.setLineDash([8, 4]);
        ctx.strokeRect(el.x - 4, el.y - 4, el.width + 8, el.height + 8);
        ctx.setLineDash([]);

        // Draw resize handles
        const handleSize = 24;
        ctx.fillStyle = "#3b82f6";
        ctx.strokeStyle = "#ffffff";
        ctx.lineWidth = 2;
        const corners = [
          { x: el.x - handleSize / 2, y: el.y - handleSize / 2 },
          { x: el.x + el.width - handleSize / 2, y: el.y - handleSize / 2 },
          { x: el.x - handleSize / 2, y: el.y + el.height - handleSize / 2 },
          { x: el.x + el.width - handleSize / 2, y: el.y + el.height - handleSize / 2 },
        ];
        corners.forEach((c) => {
          ctx.fillRect(c.x, c.y, handleSize, handleSize);
          ctx.strokeRect(c.x, c.y, handleSize, handleSize);
        });
      }
    });
  }, [elements, selectedElement, backgroundColor, currentPage, currentColor, animatingElementId]);

  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const x = (e.clientX - rect.left) / SCALE;
    const y = (e.clientY - rect.top) / SCALE;

    if (selectedTool === "select") {
      const clicked = [...elements].reverse().find(
        (el) => x >= el.x && x <= el.x + el.width && y >= el.y && y <= el.y + el.height
      );
      setSelectedElement(clicked?.id || null);
    } else {
      addElement(selectedTool, x, y);
    }
  };

  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (selectedTool !== "select" || !selectedElement) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const x = (e.clientX - rect.left) / SCALE;
    const y = (e.clientY - rect.top) / SCALE;

    const element = elements.find((el) => el.id === selectedElement);
    if (!element) return;

    const handleSize = 30;
    const handles = [
      { id: 'nw', x: element.x, y: element.y },
      { id: 'ne', x: element.x + element.width, y: element.y },
      { id: 'sw', x: element.x, y: element.y + element.height },
      { id: 'se', x: element.x + element.width, y: element.y + element.height },
    ];

    // Check if clicking on a resize handle
    for (const handle of handles) {
      if (Math.abs(x - handle.x) < handleSize && Math.abs(y - handle.y) < handleSize) {
        setIsResizing(true);
        setResizeHandle(handle.id);
        setResizeStart({ 
          x, 
          y, 
          width: element.width, 
          height: element.height,
          elX: element.x,
          elY: element.y
        });
        return;
      }
    }

    // Otherwise, start dragging
    if (x >= element.x && x <= element.x + element.width && y >= element.y && y <= element.y + element.height) {
      setIsDragging(true);
      setDragOffset({ x: x - element.x, y: y - element.y });
    }
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const x = (e.clientX - rect.left) / SCALE;
    const y = (e.clientY - rect.top) / SCALE;

    // Update cursor
    if (selectedTool === "select" && selectedElement) {
      const element = elements.find((el) => el.id === selectedElement);
      if (element) {
        const handleSize = 30;
        const handles = [
          { id: 'nw', x: element.x, y: element.y, cursor: 'nwse-resize' },
          { id: 'ne', x: element.x + element.width, y: element.y, cursor: 'nesw-resize' },
          { id: 'sw', x: element.x, y: element.y + element.height, cursor: 'nesw-resize' },
          { id: 'se', x: element.x + element.width, y: element.y + element.height, cursor: 'nwse-resize' },
        ];
        
        let newCursor = "crosshair";
        for (const handle of handles) {
          if (Math.abs(x - handle.x) < handleSize && Math.abs(y - handle.y) < handleSize) {
            newCursor = handle.cursor;
            break;
          }
        }
        if (newCursor === "crosshair" && x >= element.x && x <= element.x + element.width && y >= element.y && y <= element.y + element.height) {
          newCursor = "move";
        }
        setCursorStyle(newCursor);
      }
    }

    if (!selectedElement) return;

    if (isResizing && resizeHandle) {
      const deltaX = x - resizeStart.x;
      const deltaY = y - resizeStart.y;
      
      let newWidth = resizeStart.width;
      let newHeight = resizeStart.height;
      let newX = resizeStart.elX;
      let newY = resizeStart.elY;

      if (resizeHandle === 'se') {
        newWidth = Math.max(50, resizeStart.width + deltaX);
        newHeight = Math.max(50, resizeStart.height + deltaY);
      } else if (resizeHandle === 'sw') {
        newWidth = Math.max(50, resizeStart.width - deltaX);
        newHeight = Math.max(50, resizeStart.height + deltaY);
        newX = resizeStart.elX + (resizeStart.width - newWidth);
      } else if (resizeHandle === 'ne') {
        newWidth = Math.max(50, resizeStart.width + deltaX);
        newHeight = Math.max(50, resizeStart.height - deltaY);
        newY = resizeStart.elY + (resizeStart.height - newHeight);
      } else if (resizeHandle === 'nw') {
        newWidth = Math.max(50, resizeStart.width - deltaX);
        newHeight = Math.max(50, resizeStart.height - deltaY);
        newX = resizeStart.elX + (resizeStart.width - newWidth);
        newY = resizeStart.elY + (resizeStart.height - newHeight);
      }

      setElements(
        elements.map((el) =>
          el.id === selectedElement
            ? { ...el, x: newX, y: newY, width: newWidth, height: newHeight }
            : el
        )
      );
      return;
    }

    if (isDragging) {
      setElements(
        elements.map((el) =>
          el.id === selectedElement
            ? { ...el, x: x - dragOffset.x, y: y - dragOffset.y }
            : el
        )
      );
    }
  };

  const handleMouseUp = () => {
    setIsDragging(false);
    setIsResizing(false);
    setResizeHandle(null);
  };

  const addElement = (type: string, x: number, y: number) => {
    let width = 200;
    let height = 200;
    
    if (type === "text") {
      width = 600;
      height = 80;
    } else if (type === "line") {
      width = 300;
      height = 8;
    } else if (type === "zigzag") {
      width = 300;
      height = 80;
    } else if (type === "polkaDots" || type === "dotsGrid" || type === "confetti" || type === "splatter") {
      width = 250;
      height = 250;
    } else if (type === "spiral") {
      width = 150;
      height = 150;
    }
    
    const newElement: CanvasElement = {
      id: `${type}-${Date.now()}`,
      type: type as CanvasElement["type"],
      x: x - width / 2,
      y: y - height / 2,
      width,
      height,
      color: type === "text" ? "#ffffff" : currentColor,
      text: type === "text" ? "Texto do Card" : undefined,
      fontSize: type === "text" ? 48 : undefined,
      placeholder: type === "image",
    };

    setElements([...elements, newElement]);
    setSelectedElement(newElement.id);
    setSelectedTool("select");
  };

  const addPlaceholder = (type: "logo" | "contact" | "mascot") => {
    const newElement: CanvasElement = {
      id: `${type}-${Date.now()}`,
      type,
      x: CANVAS_WIDTH / 2 - 150,
      y: CANVAS_HEIGHT / 2 - 100,
      width: 300,
      height: 200,
    };

    setElements([...elements, newElement]);
    setSelectedElement(newElement.id);
  };

  const updateSelectedElement = (updates: Partial<CanvasElement>) => {
    if (!selectedElement) return;
    setElements(
      elements.map((el) => (el.id === selectedElement ? { ...el, ...updates } : el))
    );
  };

  const deleteSelectedElement = () => {
    if (!selectedElement) return;
    setElements(elements.filter((el) => el.id !== selectedElement));
    setSelectedElement(null);
  };

  const duplicateSelectedElement = () => {
    if (!selectedElement) return;
    const el = elements.find((e) => e.id === selectedElement);
    if (!el) return;

    const newElement = {
      ...el,
      id: `${el.type}-${Date.now()}`,
      x: el.x + 30,
      y: el.y + 30,
    };

    setElements([...elements, newElement]);
    setSelectedElement(newElement.id);
  };

  const handleSearchImages = async () => {
    if (!searchQuery.trim()) return;
    setIsSearching(true);
    try {
      const images = await searchImages(searchQuery, 12);
      setSearchResults(images);
    } catch (error) {
      toast({
        title: "Erro ao buscar imagens",
        variant: "destructive",
      });
    } finally {
      setIsSearching(false);
    }
  };

  const handleGenerateBatch = () => {
    const template: VideoTemplate = {
      id: `template-${Date.now()}`,
      name: templateName,
      contentElements,
      signatureElements,
      width: CANVAS_WIDTH,
      height: CANVAS_HEIGHT,
      backgroundColor,
      pageDuration,
      audioUrl1: audioUrl1 || undefined,
      audioUrl2: audioUrl2 || undefined,
    };

    onGenerateBatch(template, selectedTeamFilter);
  };

  const handleAudioUpload = async (slot: 1 | 2, file: File) => {
    try {
      // Sanitize filename: remove special chars, keep extension
      const ext = file.name.split(".").pop()?.toLowerCase() || "mp3";
      const safeName = `audio-${slot}-${Date.now()}.${ext}`;
      const contentType = file.type || (ext === "m4a" ? "audio/mp4" : ext === "mp3" ? "audio/mpeg" : "audio/mpeg");
      const { data, error } = await supabase.storage.from("card-uploads").upload(safeName, file, {
        contentType,
        upsert: true,
      });
      if (error) throw error;
      const { data: urlData } = supabase.storage.from("card-uploads").getPublicUrl(data.path);
      if (slot === 1) setAudioUrl1(urlData.publicUrl);
      else setAudioUrl2(urlData.publicUrl);
      toast({ title: `Áudio ${slot} carregado!` });
    } catch (error: any) {
      console.error("Error uploading audio:", error);
      toast({ title: "Erro ao carregar áudio", description: error?.message || "", variant: "destructive" });
    }
  };

  const selectedEl = elements.find((el) => el.id === selectedElement);

  return (
    <div className="h-screen bg-background flex overflow-hidden">
      {/* Left Sidebar - Tools */}
      <div className="w-72 border-r bg-card flex flex-col h-full">
        <div className="p-4 border-b">
          <Button variant="outline" onClick={onBack} className="w-full">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Voltar
          </Button>
        </div>

        <div ref={leftSidebarRef} className="flex-1 overflow-y-auto">
          <div className="p-3 space-y-3">
            {/* Template Load/Save */}
            <div className="space-y-1">
              <div className="flex gap-2">
                <Select
                  value={currentTemplateId || ""}
                  onValueChange={(value) => value && loadTemplate(value)}
                >
                  <SelectTrigger className="flex-1 h-8 text-xs">
                    <SelectValue placeholder="Selecionar template" />
                  </SelectTrigger>
                  <SelectContent>
                    {savedTemplates.map((t) => (
                      <SelectItem key={t.id} value={t.id}>
                        {t.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button variant="outline" size="icon" className="h-8 w-8" onClick={newTemplate}>
                  <FolderOpen className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>

            {/* Template Name */}
            <div className="space-y-1">
              <div className="flex gap-2">
                <Input
                  value={templateName}
                  onChange={(e) => setTemplateName(e.target.value)}
                  placeholder="Nome do template"
                  className="flex-1 h-8 text-xs"
                />
                <Button 
                  variant="outline" 
                  size="icon" 
                  className="h-8 w-8"
                  onClick={saveTemplate}
                  disabled={isSaving}
                >
                  {isSaving ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Save className="h-3.5 w-3.5" />
                  )}
                </Button>
              </div>
              <p className="text-[10px] text-muted-foreground">
                {currentTemplateId ? "Atualizar existente" : "Salvar novo"}
              </p>
            </div>

            {/* Page Selector + Duration - inline */}
            <div className="flex items-center gap-2">
              <Button
                variant={currentPage === "content" ? "default" : "outline"}
                onClick={() => setCurrentPage("content")}
                size="sm"
                className="text-xs h-7 flex-1"
              >
                <Film className="mr-1 h-3 w-3" />
                Conteúdo
              </Button>
              <Button
                variant={currentPage === "signature" ? "default" : "outline"}
                onClick={() => setCurrentPage("signature")}
                size="sm"
                className="text-xs h-7 flex-1"
              >
                <User className="mr-1 h-3 w-3" />
                Assinatura
              </Button>
            </div>

            <div className="space-y-1">
              <Label className="text-xs">Duração: {pageDuration}s/página</Label>
              <Slider
                value={[pageDuration]}
                onValueChange={(v) => setPageDuration(v[0])}
                min={3}
                max={30}
                step={1}
              />
            </div>

            {/* Tools */}
            <div className="space-y-1">
              <Label className="text-xs">Ferramentas</Label>
              <div className="grid grid-cols-4 gap-1">
                {tools.map((tool) => (
                  <Button
                    key={tool.id}
                    variant={selectedTool === tool.id ? "default" : "outline"}
                    size="sm"
                    onClick={() => setSelectedTool(tool.id)}
                    className="flex flex-col h-12 text-[10px] px-1"
                  >
                    <tool.icon className="h-3.5 w-3.5 mb-0.5" />
                    {tool.label}
                  </Button>
                ))}
              </div>
            </div>

            {/* Placeholders */}
            <div className="space-y-1">
              <Label className="text-xs">Elementos de Marca</Label>
              <div className="grid grid-cols-3 gap-1">
                {placeholders.map((p) => (
                  <Button
                    key={p.id}
                    variant="outline"
                    size="sm"
                    onClick={() => addPlaceholder(p.type)}
                    className="flex flex-col h-12 text-[10px] px-1"
                  >
                    <p.icon className="h-3.5 w-3.5 mb-0.5" />
                    {p.label}
                  </Button>
                ))}
              </div>
            </div>

            {/* Colors - inline */}
            <div className="flex gap-2">
              <div className="flex-1 space-y-1">
                <Label className="text-[10px]">Cor Fundo</Label>
                <div className="flex gap-1">
                  <Input type="color" value={backgroundColor} onChange={(e) => setBackgroundColor(e.target.value)} className="w-8 h-7 p-0.5" />
                  <Input value={backgroundColor} onChange={(e) => setBackgroundColor(e.target.value)} className="flex-1 h-7 text-[10px]" />
                </div>
              </div>
              <div className="flex-1 space-y-1">
                <Label className="text-[10px]">Cor Elemento</Label>
                <div className="flex gap-1">
                  <Input type="color" value={currentColor} onChange={(e) => setCurrentColor(e.target.value)} className="w-8 h-7 p-0.5" />
                  <Input value={currentColor} onChange={(e) => setCurrentColor(e.target.value)} className="flex-1 h-7 text-[10px]" />
                </div>
              </div>
            </div>

            {/* Element Properties */}
            {selectedEl && (
              <div className="space-y-3 p-3 border rounded-lg bg-muted/50">
                <div className="flex justify-between items-center">
                  <Label className="text-sm font-medium">Propriedades</Label>
                  <div className="flex gap-1">
                    <Button variant="ghost" size="sm" onClick={duplicateSelectedElement}>
                      <Copy className="h-3 w-3" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={deleteSelectedElement}
                      className="text-destructive"
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label className="text-xs">X</Label>
                    <Input
                      type="number"
                      value={Math.round(selectedEl.x)}
                      onChange={(e) => updateSelectedElement({ x: Number(e.target.value) })}
                      className="h-8"
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Y</Label>
                    <Input
                      type="number"
                      value={Math.round(selectedEl.y)}
                      onChange={(e) => updateSelectedElement({ y: Number(e.target.value) })}
                      className="h-8"
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Largura</Label>
                    <Input
                      type="number"
                      value={Math.round(selectedEl.width)}
                      onChange={(e) => updateSelectedElement({ width: Number(e.target.value) })}
                      className="h-8"
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Altura</Label>
                    <Input
                      type="number"
                      value={Math.round(selectedEl.height)}
                      onChange={(e) => updateSelectedElement({ height: Number(e.target.value) })}
                      className="h-8"
                    />
                  </div>
                </div>

                {/* Rotation */}
                <div>
                  <Label className="text-xs">Rotação: {selectedEl.rotation || 0}°</Label>
                  <Slider
                    value={[selectedEl.rotation || 0]}
                    onValueChange={([v]) => updateSelectedElement({ rotation: v })}
                    min={-180}
                    max={180}
                    step={1}
                  />
                </div>

                {/* Clip Shape for image placeholders */}
                {selectedEl.type === "image" && selectedEl.placeholder && (
                  <div>
                    <Label className="text-xs">Formato da Foto</Label>
                    <Select
                      value={selectedEl.clipShape || "rect"}
                      onValueChange={(v) => updateSelectedElement({ clipShape: v as any })}
                    >
                      <SelectTrigger className="h-8">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="rect">Retângulo</SelectItem>
                        <SelectItem value="circle">Círculo</SelectItem>
                        <SelectItem value="triangle">Triângulo</SelectItem>
                        <SelectItem value="diamond">Losango</SelectItem>
                        <SelectItem value="hexagon">Hexágono</SelectItem>
                        <SelectItem value="pentagon">Pentágono</SelectItem>
                        <SelectItem value="star">Estrela</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {selectedEl.type === "text" && (
                  <>
                    <div>
                      <Label className="text-xs">Texto</Label>
                      <Input
                        value={selectedEl.text || ""}
                        onChange={(e) => updateSelectedElement({ text: e.target.value })}
                        className="h-8"
                      />
                    </div>
                    <div>
                      <Label className="text-xs">Tamanho da Fonte</Label>
                      <Slider
                        value={[selectedEl.fontSize || 48]}
                        onValueChange={(v) => updateSelectedElement({ fontSize: v[0] })}
                        min={12}
                        max={200}
                      />
                    </div>
                    <div>
                      <Label className="text-xs">Alinhamento</Label>
                      <Select
                        value={selectedEl.textAlign || "left"}
                        onValueChange={(v) => updateSelectedElement({ textAlign: v as "left" | "center" | "right" })}
                      >
                        <SelectTrigger className="h-8">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="left">Esquerda</SelectItem>
                          <SelectItem value="center">Centralizado</SelectItem>
                          <SelectItem value="right">Direita</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label className="text-xs">Altura da Linha: {(selectedEl.lineHeight || 1.3).toFixed(1)}x</Label>
                      <Slider
                        value={[((selectedEl.lineHeight || 1.3) * 10)]}
                        onValueChange={(v) => updateSelectedElement({ lineHeight: v[0] / 10 })}
                        min={8}
                        max={30}
                        step={1}
                      />
                    </div>
                  </>
                )}

                {(selectedEl.type === "rect" ||
                  selectedEl.type === "circle" ||
                  selectedEl.type === "triangle" ||
                  selectedEl.type === "diamond" ||
                  selectedEl.type === "hexagon" ||
                  selectedEl.type === "pentagon" ||
                  selectedEl.type === "star" ||
                  selectedEl.type === "polkaDots" ||
                  selectedEl.type === "dotsGrid" ||
                  selectedEl.type === "confetti" ||
                  selectedEl.type === "splatter" ||
                  selectedEl.type === "zigzag" ||
                  selectedEl.type === "spiral") && (
                  <div>
                    <Label className="text-xs">Papel da Cor</Label>
                    <Select
                      value={selectedEl.colorRole || "none"}
                      onValueChange={(v) => updateSelectedElement({ colorRole: v === "none" ? undefined : v as any })}
                    >
                      <SelectTrigger className="h-8">
                        <SelectValue placeholder="Cor fixa" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Cor fixa</SelectItem>
                        <SelectItem value="background">Fundo (Cor 1)</SelectItem>
                        <SelectItem value="text">Texto (Cor 2)</SelectItem>
                        <SelectItem value="accessory1">Acessório 1 (Cor 3)</SelectItem>
                        <SelectItem value="accessory2">Acessório 2 (Cor 4)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {(selectedEl.type === "rect" ||
                  selectedEl.type === "circle" ||
                  selectedEl.type === "text" ||
                  selectedEl.type === "triangle" ||
                  selectedEl.type === "diamond" ||
                  selectedEl.type === "hexagon" ||
                  selectedEl.type === "pentagon" ||
                  selectedEl.type === "star" ||
                  selectedEl.type === "line" ||
                  selectedEl.type === "polkaDots" ||
                  selectedEl.type === "dotsGrid" ||
                  selectedEl.type === "confetti" ||
                  selectedEl.type === "splatter" ||
                  selectedEl.type === "zigzag" ||
                  selectedEl.type === "spiral") && (
                  <div>
                    <Label className="text-xs">Cor {selectedEl.colorRole ? "(preview)" : ""}</Label>
                    <div className="flex gap-2">
                      <Input
                        type="color"
                        value={selectedEl.color || "#000000"}
                        onChange={(e) => updateSelectedElement({ color: e.target.value })}
                        className="w-10 h-8 p-1"
                      />
                      <Input
                        value={selectedEl.color || "#000000"}
                        onChange={(e) => updateSelectedElement({ color: e.target.value })}
                        className="flex-1 h-8"
                      />
                    </div>
                  </div>
                )}

                {/* Remove Background for images */}
                {(selectedEl.type === "image" || ["logo", "mascot"].includes(selectedEl.type)) && selectedEl.imageUrl && (
                  <div className="p-3 bg-primary/10 rounded-md space-y-2">
                    <Label className="text-xs font-medium flex items-center gap-2">
                      <Scissors className="h-4 w-4" />
                      Remover Fundo
                    </Label>
                    <Button
                      size="sm"
                      className="w-full"
                      onClick={handleRemoveBackground}
                      disabled={isRemovingBg}
                    >
                      {isRemovingBg ? (
                        <>
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          {removeBgProgress || "Processando..."}
                        </>
                      ) : (
                        <>
                          <Scissors className="h-4 w-4 mr-2" />
                          Recortar Fundo
                        </>
                      )}
                    </Button>
                    <p className="text-[10px] text-muted-foreground">
                      Remove o fundo da imagem automaticamente usando IA
                    </p>
                  </div>
                )}

                {/* Border Radius for rect - MOVED UP for visibility */}
                {selectedEl.type === "rect" && (
                  <div className="p-2 bg-primary/10 rounded-md">
                    <Label className="text-xs font-medium">Arredondamento: {selectedEl.borderRadius || 0}px</Label>
                    <Slider
                      value={[selectedEl.borderRadius || 0]}
                      onValueChange={([v]) => updateSelectedElement({ borderRadius: v })}
                      min={0}
                      max={200}
                      step={1}
                    />
                  </div>
                )}

                {/* Opacity */}
                <div>
                  <Label className="text-xs">Opacidade: {selectedEl.opacity ?? 100}%</Label>
                  <Slider
                    value={[selectedEl.opacity ?? 100]}
                    onValueChange={([v]) => updateSelectedElement({ opacity: v })}
                    min={0}
                    max={100}
                    step={1}
                  />
                </div>

                {/* Border */}
                {(["rect", "circle", "triangle", "diamond", "hexagon", "pentagon", "star", "image", "line", "heart", "cross", "cloud", "speechBubble", "lightning", "shield", "crescent"].includes(selectedEl.type)) && (
                  <div className="space-y-2">
                    <Label className="text-xs font-medium">Borda</Label>
                    <div className="flex gap-2">
                      <div className="flex-1">
                        <Label className="text-[10px] text-muted-foreground">Espessura</Label>
                        <Slider
                          value={[selectedEl.borderWidth || 0]}
                          onValueChange={([v]) => updateSelectedElement({ borderWidth: v })}
                          min={0}
                          max={20}
                          step={1}
                        />
                      </div>
                    </div>
                    {(selectedEl.borderWidth || 0) > 0 && (
                      <>
                        <div>
                          <Label className="text-[10px] text-muted-foreground">Papel da Cor da Borda</Label>
                          <Select
                            value={selectedEl.borderColorRole || "none"}
                            onValueChange={(v) => updateSelectedElement({ borderColorRole: v === "none" ? undefined : v as any })}
                          >
                            <SelectTrigger className="h-8">
                              <SelectValue placeholder="Cor fixa" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="none">Cor fixa (não muda)</SelectItem>
                              <SelectItem value="background">Fundo (Cor 1)</SelectItem>
                              <SelectItem value="text">Texto (Cor 2)</SelectItem>
                              <SelectItem value="accessory1">Acessório 1 (Cor 3)</SelectItem>
                              <SelectItem value="accessory2">Acessório 2 (Cor 4)</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div>
                          <Label className="text-[10px] text-muted-foreground">Cor da Borda {selectedEl.borderColorRole ? "(preview)" : ""}</Label>
                          <div className="flex gap-2">
                            <Input
                              type="color"
                              value={selectedEl.borderColor || "#000000"}
                              onChange={(e) => updateSelectedElement({ borderColor: e.target.value })}
                              className="w-10 h-8 p-1"
                            />
                            <Input
                              value={selectedEl.borderColor || "#000000"}
                              onChange={(e) => updateSelectedElement({ borderColor: e.target.value })}
                              className="flex-1 h-8 text-xs"
                            />
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                )}

                {/* Shadow */}
                <div className="space-y-2">
                  <Label className="text-xs font-medium">Sombra</Label>
                  <div>
                    <Label className="text-[10px] text-muted-foreground">Desfoque: {selectedEl.shadowBlur || 0}px</Label>
                    <Slider
                      value={[selectedEl.shadowBlur || 0]}
                      onValueChange={([v]) => updateSelectedElement({ shadowBlur: v })}
                      min={0}
                      max={50}
                      step={1}
                    />
                  </div>
                  {(selectedEl.shadowBlur || 0) > 0 && (
                    <>
                      <div className="flex gap-2">
                        <Input
                          type="color"
                          value={selectedEl.shadowColor || "#000000"}
                          onChange={(e) => updateSelectedElement({ shadowColor: e.target.value })}
                          className="w-10 h-8 p-1"
                        />
                        <div className="flex-1 grid grid-cols-2 gap-1">
                          <div>
                            <Label className="text-[10px] text-muted-foreground">X</Label>
                            <Input
                              type="number"
                              value={selectedEl.shadowOffsetX || 0}
                              onChange={(e) => updateSelectedElement({ shadowOffsetX: Number(e.target.value) })}
                              className="h-7 text-xs"
                            />
                          </div>
                          <div>
                            <Label className="text-[10px] text-muted-foreground">Y</Label>
                            <Input
                              type="number"
                              value={selectedEl.shadowOffsetY || 0}
                              onChange={(e) => updateSelectedElement({ shadowOffsetY: Number(e.target.value) })}
                              className="h-7 text-xs"
                            />
                          </div>
                        </div>
                      </div>
                    </>
                  )}
                </div>

                {/* Gradient */}
                {(["rect", "circle", "triangle", "diamond", "hexagon", "pentagon", "star"].includes(selectedEl.type)) && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label className="text-xs font-medium">Gradiente</Label>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 text-xs"
                        onClick={() => updateSelectedElement({ 
                          gradient: selectedEl.gradient 
                            ? undefined 
                            : { type: "linear", color1: selectedEl.color || "#3b82f6", color2: "#8b5cf6", angle: 45, fadeMode: false }
                        })}
                      >
                        {selectedEl.gradient ? "Remover" : "Adicionar"}
                      </Button>
                    </div>
                    {selectedEl.gradient && (
                      <div className="space-y-3">
                        <Select
                          value={selectedEl.gradient.type}
                          onValueChange={(v) => updateSelectedElement({ 
                            gradient: { ...selectedEl.gradient!, type: v as "linear" | "radial" }
                          })}
                        >
                          <SelectTrigger className="h-8">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="linear">Linear</SelectItem>
                            <SelectItem value="radial">Radial</SelectItem>
                          </SelectContent>
                        </Select>

                        {/* Fade Mode Toggle */}
                        <div className="flex items-center justify-between p-2 bg-muted/30 rounded">
                          <Label className="text-[10px] text-muted-foreground">Modo Transparência</Label>
                          <Button
                            variant={selectedEl.gradient.fadeMode ? "default" : "outline"}
                            size="sm"
                            className="h-6 text-xs"
                            onClick={() => {
                              const fadeMode = !selectedEl.gradient?.fadeMode;
                              updateSelectedElement({ 
                                gradient: { 
                                  ...selectedEl.gradient!, 
                                  fadeMode,
                                  // When enabling fade mode, set color2 same as color1 and opacity2 to 0
                                  ...(fadeMode ? { color2: selectedEl.gradient!.color1, opacity1: 100, opacity2: 0 } : {})
                                }
                              });
                            }}
                          >
                            {selectedEl.gradient.fadeMode ? "Ativado" : "Desativado"}
                          </Button>
                        </div>

                        {selectedEl.gradient.fadeMode ? (
                          /* Fade Mode - Single color to transparent */
                          <div className="space-y-3">
                            <div className="space-y-1 p-2 bg-muted/30 rounded">
                              <div className="flex items-center gap-2">
                                {!selectedEl.gradient.color1Role ? (
                                  <Input
                                    type="color"
                                    value={selectedEl.gradient.color1}
                                    onChange={(e) => updateSelectedElement({ 
                                      gradient: { ...selectedEl.gradient!, color1: e.target.value, color2: e.target.value }
                                    })}
                                    className="w-10 h-8 p-1"
                                  />
                                ) : (
                                  <div className="w-10 h-8 rounded border border-primary/30 bg-primary/20 flex items-center justify-center" title="Cor definida pelo Kit de Marca">
                                    <Palette className="h-4 w-4 text-primary" />
                                  </div>
                                )}
                                <Label className="text-[10px] text-muted-foreground flex-1">
                                  {selectedEl.gradient.color1Role 
                                    ? `Kit: ${selectedEl.gradient.color1Role === "background" ? "Fundo" : selectedEl.gradient.color1Role === "text" ? "Texto" : selectedEl.gradient.color1Role === "accessory1" ? "Acessório 1" : "Acessório 2"}`
                                    : "Cor fixa"}
                                </Label>
                              </div>
                              <Select
                                value={selectedEl.gradient.color1Role || "none"}
                                onValueChange={(v) => updateSelectedElement({ 
                                  gradient: { ...selectedEl.gradient!, color1Role: v === "none" ? undefined : v as any, color2Role: v === "none" ? undefined : v as any }
                                })}
                              >
                                <SelectTrigger className="h-7">
                                  <SelectValue placeholder="Cor fixa" />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="none">Cor fixa (não muda)</SelectItem>
                                  <SelectItem value="background">Fundo (Cor 1)</SelectItem>
                                  <SelectItem value="text">Texto (Cor 2)</SelectItem>
                                  <SelectItem value="accessory1">Acessório 1 (Cor 3)</SelectItem>
                                  <SelectItem value="accessory2">Acessório 2 (Cor 4)</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                            
                            <div className="p-2 bg-muted/30 rounded space-y-2">
                              <Label className="text-[10px] text-muted-foreground">Direção da Transparência</Label>
                              <div className="grid grid-cols-4 gap-1">
                                {[
                                  { label: "↓", angle: 90, title: "Opaco em cima → Transparente embaixo" },
                                  { label: "↑", angle: 270, title: "Opaco embaixo → Transparente em cima" },
                                  { label: "→", angle: 0, title: "Opaco esquerda → Transparente direita" },
                                  { label: "←", angle: 180, title: "Opaco direita → Transparente esquerda" },
                                  { label: "↘", angle: 135, title: "Diagonal ↘" },
                                  { label: "↗", angle: 315, title: "Diagonal ↗" },
                                  { label: "↙", angle: 225, title: "Diagonal ↙" },
                                  { label: "↖", angle: 45, title: "Diagonal ↖" },
                                ].map((dir) => (
                                  <Button
                                    key={dir.angle}
                                    variant={(selectedEl.gradient?.angle || 0) === dir.angle ? "default" : "outline"}
                                    size="sm"
                                    className="h-7 text-xs px-1"
                                    title={dir.title}
                                    onClick={() => updateSelectedElement({ 
                                      gradient: { ...selectedEl.gradient!, angle: dir.angle, opacity1: 100, opacity2: 0 }
                                    })}
                                  >
                                    {dir.label}
                                  </Button>
                                ))}
                              </div>
                            </div>
                          </div>
                        ) : (
                          /* Normal Mode - Two colors */
                          <>
                            {/* Color 1 with opacity */}
                            <div className="space-y-1 p-2 bg-muted/30 rounded">
                              <div className="flex items-center gap-2">
                                {!selectedEl.gradient.color1Role ? (
                                  <Input
                                    type="color"
                                    value={selectedEl.gradient.color1}
                                    onChange={(e) => updateSelectedElement({ 
                                      gradient: { ...selectedEl.gradient!, color1: e.target.value }
                                    })}
                                    className="w-10 h-8 p-1"
                                  />
                                ) : (
                                  <div className="w-10 h-8 rounded border border-primary/30 bg-primary/20 flex items-center justify-center" title="Cor definida pelo Kit de Marca">
                                    <Palette className="h-4 w-4 text-primary" />
                                  </div>
                                )}
                                <Label className="text-[10px] text-muted-foreground flex-1">
                                  {selectedEl.gradient.color1Role 
                                    ? `Kit: ${selectedEl.gradient.color1Role === "background" ? "Fundo" : selectedEl.gradient.color1Role === "text" ? "Texto" : selectedEl.gradient.color1Role === "accessory1" ? "Acessório 1" : "Acessório 2"}`
                                    : "Cor 1"}
                                </Label>
                              </div>
                              <Select
                                value={selectedEl.gradient.color1Role || "none"}
                                onValueChange={(v) => updateSelectedElement({ 
                                  gradient: { ...selectedEl.gradient!, color1Role: v === "none" ? undefined : v as any }
                                })}
                              >
                                <SelectTrigger className="h-7">
                                  <SelectValue placeholder="Cor fixa" />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="none">Cor fixa (não muda)</SelectItem>
                                  <SelectItem value="background">Fundo (Cor 1)</SelectItem>
                                  <SelectItem value="text">Texto (Cor 2)</SelectItem>
                                  <SelectItem value="accessory1">Acessório 1 (Cor 3)</SelectItem>
                                  <SelectItem value="accessory2">Acessório 2 (Cor 4)</SelectItem>
                                </SelectContent>
                              </Select>
                              <div>
                                <Label className="text-[10px] text-muted-foreground">
                                  Transparência: {100 - (selectedEl.gradient.opacity1 ?? 100)}%
                                </Label>
                                <Slider
                                  value={[selectedEl.gradient.opacity1 ?? 100]}
                                  onValueChange={([v]) => updateSelectedElement({ 
                                    gradient: { ...selectedEl.gradient!, opacity1: v }
                                  })}
                                  min={0}
                                  max={100}
                                  step={5}
                                />
                              </div>
                            </div>
                            
                            {/* Color 2 with opacity */}
                            <div className="space-y-1 p-2 bg-muted/30 rounded">
                              <div className="flex items-center gap-2">
                                {!selectedEl.gradient.color2Role ? (
                                  <Input
                                    type="color"
                                    value={selectedEl.gradient.color2}
                                    onChange={(e) => updateSelectedElement({ 
                                      gradient: { ...selectedEl.gradient!, color2: e.target.value }
                                    })}
                                    className="w-10 h-8 p-1"
                                  />
                                ) : (
                                  <div className="w-10 h-8 rounded border border-primary/30 bg-primary/20 flex items-center justify-center" title="Cor definida pelo Kit de Marca">
                                    <Palette className="h-4 w-4 text-primary" />
                                  </div>
                                )}
                                <Label className="text-[10px] text-muted-foreground flex-1">
                                  {selectedEl.gradient.color2Role 
                                    ? `Kit: ${selectedEl.gradient.color2Role === "background" ? "Fundo" : selectedEl.gradient.color2Role === "text" ? "Texto" : selectedEl.gradient.color2Role === "accessory1" ? "Acessório 1" : "Acessório 2"}`
                                    : "Cor 2"}
                                </Label>
                              </div>
                              <Select
                                value={selectedEl.gradient.color2Role || "none"}
                                onValueChange={(v) => updateSelectedElement({ 
                                  gradient: { ...selectedEl.gradient!, color2Role: v === "none" ? undefined : v as any }
                                })}
                              >
                                <SelectTrigger className="h-7">
                                  <SelectValue placeholder="Cor fixa" />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="none">Cor fixa (não muda)</SelectItem>
                                  <SelectItem value="background">Fundo (Cor 1)</SelectItem>
                                  <SelectItem value="text">Texto (Cor 2)</SelectItem>
                                  <SelectItem value="accessory1">Acessório 1 (Cor 3)</SelectItem>
                                  <SelectItem value="accessory2">Acessório 2 (Cor 4)</SelectItem>
                                </SelectContent>
                              </Select>
                              <div>
                                <Label className="text-[10px] text-muted-foreground">
                                  Transparência: {100 - (selectedEl.gradient.opacity2 ?? 100)}%
                                </Label>
                                <Slider
                                  value={[selectedEl.gradient.opacity2 ?? 100]}
                                  onValueChange={([v]) => updateSelectedElement({ 
                                    gradient: { ...selectedEl.gradient!, opacity2: v }
                                  })}
                                  min={0}
                                  max={100}
                                  step={5}
                                />
                              </div>
                            </div>
                          </>
                        )}
                        
                        {/* Angle for linear gradient */}
                        {selectedEl.gradient.type === "linear" && (
                          <div className="space-y-2">
                            <Label className="text-[10px] text-muted-foreground">Direção do Gradiente</Label>
                            <div className="grid grid-cols-4 gap-1">
                              {[
                                { label: "↓", angle: 90, title: "Cima → Baixo" },
                                { label: "↑", angle: 270, title: "Baixo → Cima" },
                                { label: "→", angle: 0, title: "Esquerda → Direita" },
                                { label: "←", angle: 180, title: "Direita → Esquerda" },
                                { label: "↘", angle: 135, title: "Diagonal ↘" },
                                { label: "↗", angle: 315, title: "Diagonal ↗" },
                                { label: "↙", angle: 225, title: "Diagonal ↙" },
                                { label: "↖", angle: 45, title: "Diagonal ↖" },
                              ].map((dir) => (
                                <Button
                                  key={dir.angle}
                                  variant={(selectedEl.gradient?.angle || 0) === dir.angle ? "default" : "outline"}
                                  size="sm"
                                  className="h-7 text-xs px-1"
                                  title={dir.title}
                                  onClick={() => updateSelectedElement({ 
                                    gradient: { ...selectedEl.gradient!, angle: dir.angle }
                                  })}
                                >
                                  {dir.label}
                                </Button>
                              ))}
                            </div>
                            <div>
                              <Label className="text-[10px] text-muted-foreground">Ângulo personalizado: {selectedEl.gradient.angle || 0}°</Label>
                              <Slider
                                value={[selectedEl.gradient.angle || 0]}
                                onValueChange={([v]) => updateSelectedElement({ 
                                  gradient: { ...selectedEl.gradient!, angle: v }
                                })}
                                min={0}
                                max={360}
                                step={5}
                              />
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Audio Upload Section */}
        <div className="p-3 border-t space-y-2">
          <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">🎵 Áudios de Fundo</Label>
          {[1, 2].map((slot) => {
            const url = slot === 1 ? audioUrl1 : audioUrl2;
            const setUrl = slot === 1 ? setAudioUrl1 : setAudioUrl2;
            return (
              <div key={slot} className="space-y-1">
                <div className="flex items-center justify-between">
                  <Label className="text-xs">Áudio {slot}</Label>
                  {url && (
                    <Button variant="ghost" size="sm" className="h-5 px-1 text-[10px] text-destructive" onClick={() => setUrl("")}>
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  )}
                </div>
                {url ? (
                  <audio src={url} controls className="w-full h-8" style={{ maxHeight: 32 }} />
                ) : (
                  <label className="flex items-center justify-center h-8 border border-dashed border-border rounded cursor-pointer hover:bg-muted/50 transition-colors">
                    <span className="text-xs text-muted-foreground">Clique para enviar</span>
                    <input
                      type="file"
                      accept="audio/*"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) handleAudioUpload(slot as 1 | 2, file);
                        e.target.value = "";
                      }}
                    />
                  </label>
                )}
              </div>
            );
          })}
        </div>

        {/* Generate Button */}
        <div className="p-4 border-t space-y-2">
          {onOpenHistory && (
            <Button variant="outline" className="w-full" onClick={onOpenHistory}>
              <History className="mr-2 h-4 w-4" />
              Histórico de Vídeos
            </Button>
          )}
          
          {/* Team Filter Selector */}
          <Select 
            value={selectedTeamFilter || "all"} 
            onValueChange={(value) => setSelectedTeamFilter(value === "all" ? undefined : value)}
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Equipe..." />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os Clientes</SelectItem>
              {availableTeams.map((team) => (
                <SelectItem key={team.id} value={team.name}>{team.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          
          <div className="flex gap-2">
            <Button
              variant="outline"
              className="flex-1"
              onClick={() => {
                // Play all animated elements on canvas
                startAnimation("__all__");
              }}
            >
              <Play className="mr-1 h-4 w-4" />
              Play Geral
            </Button>
            <Button className="flex-1 bg-gradient-primary" onClick={handleGenerateBatch}>
              <Play className="mr-1 h-4 w-4" />
              Gerar Lote
            </Button>
          </div>
        </div>
      </div>

      {/* Canvas Area */}
      <div className="flex-1 flex items-center justify-center bg-muted/30 p-8 overflow-auto">
        <div ref={canvasWrapperRef} className="relative shadow-2xl rounded-lg">
          <canvas
            ref={canvasRef}
            width={CANVAS_WIDTH}
            height={CANVAS_HEIGHT}
            style={{
              width: CANVAS_WIDTH * SCALE,
              height: CANVAS_HEIGHT * SCALE,
              cursor: cursorStyle,
              borderRadius: '0.5rem',
            }}
            onClick={handleCanvasClick}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
          />
          {/* Inline animation overlay — uses canvas snapshots for pixel-perfect fidelity */}
          {animatingElementId && (
            <div
              className="absolute inset-0 pointer-events-none"
              style={{ borderRadius: '0.5rem' }}
            >
              {elements
                .filter((el) => {
                  if (animatingElementId === "__all__") return el.animationType && el.animationType !== "none";
                  return el.id === animatingElementId && el.animationType && el.animationType !== "none";
                })
                .map((el) => {
                  const isLoop = el.animLoop;
                  const duration = el.animDuration || 0.8;
                  const animClass = `anim-preview-${el.animationType}`;
                  const snap = animSnapshotsRef.current[el.id];
                  const b = animBoundsRef.current[el.id];
                  if (!snap || !b) return null;

                  return (
                    <div
                      key={`anim-${el.id}-${animKey}`}
                      className={animClass}
                      style={{
                        position: "absolute",
                        left: b.x * SCALE,
                        top: b.y * SCALE,
                        width: b.w * SCALE,
                        height: b.h * SCALE,
                        animationDuration: `${duration}s`,
                        animationIterationCount: isLoop ? "infinite" : undefined,
                        animationDirection: isLoop ? "alternate" : undefined,
                        pointerEvents: "none",
                      }}
                    >
                      <img
                        src={snap}
                        alt=""
                        style={{ display: "block", width: "100%", height: "100%" }}
                      />
                    </div>
                  );
                })}
            </div>
          )}
        </div>
      </div>

      {/* Right Sidebar - Images */}
      <div className="w-72 border-l bg-card flex flex-col h-full">
        <div className="p-4 border-b">
          <h3 className="font-semibold flex items-center gap-2">
            <FileVideo className="h-4 w-4" />
            Template de Vídeo
          </h3>
          <p className="text-xs text-muted-foreground mt-1">1080x1920 • {pageDuration}s/página</p>
        </div>

        <Tabs defaultValue="images" className="flex-1 flex flex-col">
          <TabsList className="mx-4 mt-2">
            <TabsTrigger value="images" className="flex-1">Imagens</TabsTrigger>
            <TabsTrigger value="layers" className="flex-1">Camadas</TabsTrigger>
          </TabsList>

          <TabsContent value="images" className="flex-1 p-4">
            <div className="space-y-3">
              <div className="flex gap-2">
                <Input
                  placeholder="Buscar imagens..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleSearchImages()}
                />
                <Button size="icon" onClick={handleSearchImages} disabled={isSearching}>
                  {isSearching ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Search className="h-4 w-4" />
                  )}
                </Button>
              </div>

              <ScrollArea className="h-[500px]">
                <div className="grid grid-cols-2 gap-2">
                  {searchResults.map((img) => (
                    <div
                      key={img.id}
                      className="aspect-[9/16] rounded-md overflow-hidden cursor-pointer hover:ring-2 ring-primary transition-all"
                      onClick={() => {
                        const newElement: CanvasElement = {
                          id: `image-${Date.now()}`,
                          type: "image",
                          x: CANVAS_WIDTH / 2 - 200,
                          y: CANVAS_HEIGHT / 2 - 300,
                          width: 400,
                          height: 600,
                          imageUrl: img.urls.regular,
                          placeholder: true,
                        };
                        setElements([...elements, newElement]);
                        setSelectedElement(newElement.id);
                      }}
                    >
                      <img
                        src={img.urls.thumb}
                        alt=""
                        className="w-full h-full object-cover"
                      />
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </div>
          </TabsContent>

          <TabsContent value="layers" className="flex-1 p-4">
            <ScrollArea className="h-[500px]">
              <div className="space-y-2">
                {[...elements].reverse().map((el, reversedIndex) => {
                  const actualIndex = elements.length - 1 - reversedIndex;
                  const isFirst = actualIndex === elements.length - 1;
                  const isLast = actualIndex === 0;
                  const isEditing = editingLayerId === el.id;
                  const isSelected = selectedElement === el.id;
                  const isAnimated = el.animated !== false;

                  const getAnimOptions = (type: string) => {
                    if (type === "logo" || type === "mascot") {
                      return [
                        { value: "none", label: "Nenhuma" },
                        { value: "fade-in", label: "Fade In" },
                        { value: "slide-up", label: "Subir" },
                        { value: "slide-down", label: "Descer" },
                        { value: "slide-left", label: "← Esquerda" },
                        { value: "slide-right", label: "→ Direita" },
                        { value: "scale-in", label: "Escalar" },
                        { value: "bounce-in", label: "Quicar" },
                        { value: "spin-in", label: "Girar" },
                        { value: "flip-in", label: "Virar" },
                        { value: "swing", label: "Balançar" },
                      ];
                    }
                    if (type === "text" || type === "contact") {
                      return [
                        { value: "none", label: "Nenhuma" },
                        { value: "fade-in", label: "Fade In" },
                        { value: "slide-up", label: "Subir" },
                        { value: "slide-down", label: "Descer" },
                        { value: "slide-left", label: "← Esquerda" },
                        { value: "slide-right", label: "→ Direita" },
                        { value: "scale-in", label: "Escalar" },
                        { value: "typewriter", label: "Máquina" },
                        { value: "bounce-in", label: "Quicar" },
                        { value: "rotate-in", label: "Rotacionar" },
                        { value: "blur-in", label: "Desfoque" },
                        { value: "drop-in", label: "Cair" },
                        { value: "swing-in", label: "Balançar" },
                        { value: "elastic-in", label: "Elástico" },
                        { value: "flip-in", label: "Virar" },
                      ];
                    }
                    return [
                      { value: "none", label: "Nenhuma" },
                      { value: "fade-in", label: "Fade In" },
                      { value: "scale-in", label: "Escalar" },
                      { value: "slide-up", label: "Subir" },
                      { value: "slide-down", label: "Descer" },
                      { value: "bounce-in", label: "Quicar" },
                    ];
                  };

                  const animOptions = getAnimOptions(el.type);

                  return (
                    <div key={el.id} className="space-y-0">
                      <div
                        className={`p-2 rounded-t border cursor-pointer flex items-center gap-2 ${
                          isSelected ? "border-primary bg-primary/10" : "border-border"
                        } ${!isAnimated || !isSelected ? "rounded-b" : ""}`}
                        onClick={() => {
                          // Preserve left sidebar scroll position
                          const sidebar = leftSidebarRef.current;
                          const scrollTop = sidebar?.scrollTop || 0;
                          setSelectedElement(el.id);
                          if (sidebar) {
                            requestAnimationFrame(() => {
                              sidebar.scrollTop = scrollTop;
                            });
                          }
                        }}
                      >
                        <Checkbox
                          checked={isAnimated}
                          onCheckedChange={(checked) => {
                            const newElements = [...elements];
                            const idx = elements.findIndex((e) => e.id === el.id);
                            if (idx >= 0) {
                              newElements[idx] = { ...newElements[idx], animated: !!checked };
                              setElements(newElements);
                            }
                          }}
                          onClick={(e) => e.stopPropagation()}
                          className="shrink-0"
                          title="Anima este elemento no vídeo"
                        />
                        <div className="flex items-center gap-2 flex-1 min-w-0">
                          {el.type === "rect" && <Square className="h-4 w-4 shrink-0" />}
                          {el.type === "circle" && <Circle className="h-4 w-4 shrink-0" />}
                          {el.type === "text" && <Type className="h-4 w-4 shrink-0" />}
                          {el.type === "image" && <ImageIcon className="h-4 w-4 shrink-0" />}
                          {el.type === "logo" && <User className="h-4 w-4 shrink-0" />}
                          {el.type === "contact" && <Phone className="h-4 w-4 shrink-0" />}
                          {el.type === "mascot" && <Sparkles className="h-4 w-4 shrink-0" />}
                          {el.type === "triangle" && <Triangle className="h-4 w-4 shrink-0" />}
                          {el.type === "star" && <Star className="h-4 w-4 shrink-0" />}
                          {el.type === "diamond" && <Diamond className="h-4 w-4 shrink-0" />}
                          {el.type === "hexagon" && <Hexagon className="h-4 w-4 shrink-0" />}
                          {el.type === "pentagon" && <Pentagon className="h-4 w-4 shrink-0" />}
                          {el.type === "line" && <Minus className="h-4 w-4 shrink-0" />}
                          {isEditing ? (
                            <Input
                              value={editingLayerName}
                              onChange={(e) => setEditingLayerName(e.target.value)}
                              onBlur={saveLayerName}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") saveLayerName();
                                if (e.key === "Escape") {
                                  setEditingLayerId(null);
                                  setEditingLayerName("");
                                }
                              }}
                              onClick={(e) => e.stopPropagation()}
                              className="h-6 text-xs flex-1 bg-background text-foreground"
                              autoFocus
                            />
                          ) : (
                            <span className="text-sm truncate flex-1">
                              {getDefaultLayerName(el)}
                            </span>
                          )}
                        </div>
                        <div className="flex gap-1 shrink-0">
                          {!isEditing && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-6 w-6 p-0"
                              onClick={(e) => {
                                e.stopPropagation();
                                startEditingLayerName(el);
                              }}
                            >
                              <Pencil className="h-3 w-3" />
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 w-6 p-0"
                            disabled={isFirst}
                            onClick={(e) => {
                              e.stopPropagation();
                              const idx = elements.findIndex((e) => e.id === el.id);
                              if (idx < elements.length - 1) {
                                const newElements = [...elements];
                                [newElements[idx], newElements[idx + 1]] = [
                                  newElements[idx + 1],
                                  newElements[idx],
                                ];
                                setElements(newElements);
                              }
                            }}
                          >
                            <ChevronUp className="h-3 w-3" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 w-6 p-0"
                            disabled={isLast}
                            onClick={(e) => {
                              e.stopPropagation();
                              const idx = elements.findIndex((e) => e.id === el.id);
                              if (idx > 0) {
                                const newElements = [...elements];
                                [newElements[idx], newElements[idx - 1]] = [
                                  newElements[idx - 1],
                                  newElements[idx],
                                ];
                                setElements(newElements);
                              }
                            }}
                          >
                            <ChevronDown className="h-3 w-3" />
                          </Button>
                        </div>
                      </div>
                      {/* Animation controls - shown when animated + selected */}
                      {isAnimated && isSelected && (
                        <div className="border border-t-0 border-primary/30 rounded-b bg-primary/5 p-2 space-y-2">
                          <div className="space-y-1">
                            <Label className="text-[10px] text-muted-foreground">Animação</Label>
                            <Select
                              value={el.animationType || "none"}
                              onValueChange={(v) => {
                                const newElements = [...elements];
                                const idx = elements.findIndex((e) => e.id === el.id);
                                if (idx >= 0) {
                                  newElements[idx] = { ...newElements[idx], animationType: v === "none" ? undefined : v };
                                  setElements(newElements);
                                  setSelectedElement(el.id);
                                  // Preview opens via Play button or bottom Preview button
                                }
                              }}
                            >
                              <SelectTrigger className="h-7 text-xs">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {animOptions.map((opt) => (
                                  <SelectItem key={opt.value} value={opt.value}>
                                    {opt.label}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          {el.animationType && el.animationType !== "none" && (
                            <div className="space-y-2">
                              <div className="flex items-center justify-between">
                                <Label className="text-[10px] text-muted-foreground">
                                  Duração: {(el.animDuration || 0.8).toFixed(1)}s
                                </Label>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="h-6 px-2 text-[10px] gap-1"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    startAnimation(el.id);
                                  }}
                                >
                                  <Play className="h-3 w-3" />
                                  Play
                                </Button>
                              </div>
                              <Slider
                                value={[el.animDuration || 0.8]}
                                onValueChange={([v]) => {
                                  const newElements = [...elements];
                                  const idx = elements.findIndex((e) => e.id === el.id);
                                  if (idx >= 0) {
                                    newElements[idx] = { ...newElements[idx], animDuration: v };
                                    setElements(newElements);
                                  }
                                }}
                                min={0.2}
                                max={5}
                                step={0.1}
                              />
                              <div className="flex items-center gap-2">
                                <Checkbox
                                  checked={!!el.animLoop}
                                  onCheckedChange={(checked) => {
                                    const newElements = [...elements];
                                    const idx = elements.findIndex((e) => e.id === el.id);
                                    if (idx >= 0) {
                                      newElements[idx] = { ...newElements[idx], animLoop: !!checked };
                                      setElements(newElements);
                                    }
                                  }}
                                  onClick={(e) => e.stopPropagation()}
                                />
                                <Label className="text-[10px] text-muted-foreground cursor-pointer">
                                  Loop contínuo
                                </Label>
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </ScrollArea>
          </TabsContent>
        </Tabs>
      </div>

    </div>
  );
};
