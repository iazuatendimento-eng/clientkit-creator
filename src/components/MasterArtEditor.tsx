import { useState, useRef, useEffect } from "react";
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
  Move,
  Trash2,
  Copy,
  Layers,
  ChevronUp,
  ChevronDown,
  Search,
  Loader2,
  Save,
  Play,
  FolderOpen,
  Plus,
  Triangle,
  Minus,
  Star,
  Diamond,
  Hexagon,
  Pentagon,
  Octagon,
  History,
  Scissors,
  Pencil,
  Sparkles,
  Heart,
  CloudIcon,
  Zap,
  Shield,
  Moon,
  MessageCircle,
  Palette,
} from "lucide-react";
import { searchUnsplashImages, UnsplashImage } from "@/lib/unsplash";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { removeBackground } from "@/lib/backgroundRemoval";
import { ImageEraserModal } from "./ImageEraserModal";

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
}

interface MasterTemplate {
  id: string;
  name: string;
  elements: CanvasElement[];
  width: number;
  height: number;
  backgroundColor: string;
}

interface SavedTemplate {
  id: string;
  name: string;
  elements: CanvasElement[];
  width: number;
  height: number;
  background_color: string;
  created_at: string;
  updated_at: string;
}

type TeamFilter = string | undefined;

interface MasterArtEditorProps {
  onBack: () => void;
  onGenerateBatch: (template: MasterTemplate, teamFilter: TeamFilter) => void;
  onOpenHistory?: () => void;
}

export const MasterArtEditor = ({ onBack, onGenerateBatch, onOpenHistory }: MasterArtEditorProps) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [elements, setElements] = useState<CanvasElement[]>([]);
  const [selectedElement, setSelectedElement] = useState<string | null>(null);
  const [selectedTool, setSelectedTool] = useState<string>("move");
  const [backgroundColor, setBackgroundColor] = useState("#ffffff");
  const [templateName, setTemplateName] = useState("Template Principal");
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [isResizing, setIsResizing] = useState(false);
  const [resizeHandle, setResizeHandle] = useState<string | null>(null); // 'nw', 'ne', 'sw', 'se'
  const [resizeStart, setResizeStart] = useState({ x: 0, y: 0, width: 0, height: 0, elX: 0, elY: 0 });
  const [unsplashImages, setUnsplashImages] = useState<UnsplashImage[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const [activeTab, setActiveTab] = useState("images");
  const [savedTemplates, setSavedTemplates] = useState<SavedTemplate[]>([]);
  const [currentTemplateId, setCurrentTemplateId] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isRemovingBg, setIsRemovingBg] = useState(false);
  const [removeBgProgress, setRemoveBgProgress] = useState("");
  const [eraserModalOpen, setEraserModalOpen] = useState(false);
  const [editingLayerId, setEditingLayerId] = useState<string | null>(null);
  const [editingLayerName, setEditingLayerName] = useState("");
  const [selectedTeamFilter, setSelectedTeamFilter] = useState<TeamFilter>(undefined);
  const [availableTeams, setAvailableTeams] = useState<{ id: string; name: string }[]>([]);
  const [inlineEditText, setInlineEditText] = useState<string | null>(null);
  const [inlineEditId, setInlineEditId] = useState<string | null>(null);
  const directImageInputRef = useRef<HTMLInputElement>(null);
  const [directImageTargetId, setDirectImageTargetId] = useState<string | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    supabase.from("teams").select("*").order("created_at", { ascending: true }).then(({ data }) => {
      if (data) setAvailableTeams(data);
    });
  }, []);

  // Rounded-rect path helper (with fallback for browsers without ctx.roundRect)
  const roundedRectPath = (
    c: CanvasRenderingContext2D,
    x: number,
    y: number,
    w: number,
    h: number,
    r: number
  ) => {
    const radius = Math.max(0, Math.min(r, Math.min(w, h) / 2));
    if (radius <= 0) {
      c.rect(x, y, w, h);
      return;
    }
    const anyCtx = c as unknown as { roundRect?: (x: number, y: number, w: number, h: number, r: number) => void };
    if (typeof anyCtx.roundRect === "function") {
      anyCtx.roundRect(x, y, w, h, radius);
      return;
    }
    c.moveTo(x + radius, y);
    c.arcTo(x + w, y, x + w, y + h, radius);
    c.arcTo(x + w, y + h, x, y + h, radius);
    c.arcTo(x, y + h, x, y, radius);
    c.arcTo(x, y, x + w, y, radius);
    c.closePath();
  };

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
      wave: "Onda",
      blob: "Blob",
      arch: "Arco",
      arrow: "Seta",
      badge: "Badge",
      ribbon: "Fita",
      polkaDots: "Bolinhas",
      dotsGrid: "Pontos",
      confetti: "Confetti",
      splatter: "Splash",
      zigzag: "Zigzag",
      spiral: "Espiral",
      heart: "Coração",
      cross: "Cruz",
      cloud: "Nuvem",
      speechBubble: "Balão de Fala",
      lightning: "Raio",
      shield: "Escudo",
      crescent: "Lua",
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

  // Load saved templates on mount
  useEffect(() => {
    loadTemplates();
  }, []);

  const loadTemplates = async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('master_templates')
        .select('*')
        .eq('deleted', false)
        .order('updated_at', { ascending: false });

      if (error) throw error;
      const templates = (data || []).map(t => ({
        ...t,
        elements: t.elements as unknown as CanvasElement[],
      }));
      setSavedTemplates(templates as SavedTemplate[]);
    } catch (error) {
      console.error('Error loading templates:', error);
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
        elements: JSON.parse(JSON.stringify(elements)),
        width: CANVAS_WIDTH,
        height: CANVAS_HEIGHT,
        background_color: backgroundColor,
        created_by: user.id,
      };

      if (currentTemplateId) {
        // Update existing template
        const { error } = await supabase
          .from('master_templates')
          .update(templateData)
          .eq('id', currentTemplateId);

        if (error) throw error;
        toast({
          title: "Template atualizado!",
          description: "Suas alterações foram salvas.",
        });
      } else {
        // Create new template
        const { data, error } = await supabase
          .from('master_templates')
          .insert(templateData)
          .select()
          .single();

        if (error) throw error;
        setCurrentTemplateId(data.id);
        toast({
          title: "Template salvo!",
          description: "Seu template foi criado com sucesso.",
        });
      }

      loadTemplates();
    } catch (error) {
      console.error('Error saving template:', error);
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
        .from('master_templates')
        .select('*')
        .eq('id', templateId)
        .single();

      if (error) throw error;
      
      setCurrentTemplateId(data.id);
      setTemplateName(data.name);
      setElements(data.elements as unknown as CanvasElement[]);
      setBackgroundColor(data.background_color);
      
      toast({
        title: "Template carregado!",
        description: `"${data.name}" foi carregado.`,
      });
    } catch (error) {
      console.error('Error loading template:', error);
      toast({
        title: "Erro ao carregar",
        description: "Não foi possível carregar o template.",
        variant: "destructive",
      });
    }
  };

  const createNewTemplate = () => {
    setCurrentTemplateId(null);
    setTemplateName("Novo Template");
    setElements([]);
    setBackgroundColor("#ffffff");
    toast({
      title: "Novo template",
      description: "Canvas limpo para um novo template.",
    });
  };

  const deleteTemplate = async (templateId: string, templateName: string) => {
    if (!window.confirm(`Excluir o template "${templateName}" permanentemente?`)) return;
    try {
      const { error } = await supabase
        .from('master_templates')
        .update({ deleted: true })
        .eq('id', templateId);
      if (error) throw error;
      if (currentTemplateId === templateId) {
        createNewTemplate();
      }
      loadTemplates();
      toast({ title: "Template excluído", description: `"${templateName}" foi removido.` });
    } catch (error) {
      console.error('Error deleting template:', error);
      toast({ title: "Erro ao excluir", variant: "destructive" });
    }
  };

  const handleToolSelect = (toolId: string) => {
    setSelectedTool(toolId);
    if (toolId === "image") {
      toast({
        title: "Moldura de imagem",
        description: "Clique no canvas para adicionar uma moldura onde a foto será posicionada.",
      });
    }
  };

  const CANVAS_WIDTH = 1080;
  const CANVAS_HEIGHT = 1350;
  const SCALE = 0.4;

  const tools = [
    { id: "move", icon: Move, label: "Mover" },
    { id: "rect", icon: Square, label: "Retângulo" },
    { id: "circle", icon: Circle, label: "Círculo" },
    { id: "triangle", icon: Triangle, label: "Triângulo" },
    { id: "diamond", icon: Diamond, label: "Losango" },
    { id: "hexagon", icon: Hexagon, label: "Hexágono" },
    { id: "pentagon", icon: Pentagon, label: "Pentágono" },
    { id: "star", icon: Star, label: "Estrela" },
    { id: "wave", icon: Minus, label: "Onda" },
    { id: "blob", icon: Circle, label: "Blob" },
    { id: "arch", icon: Circle, label: "Arco" },
    { id: "arrow", icon: Triangle, label: "Seta" },
    { id: "badge", icon: Hexagon, label: "Badge" },
    { id: "ribbon", icon: Minus, label: "Fita" },
    { id: "line", icon: Minus, label: "Linha" },
    { id: "polkaDots", icon: Circle, label: "Bolinhas" },
    { id: "dotsGrid", icon: Circle, label: "Pontos" },
    { id: "confetti", icon: Sparkles, label: "Confetti" },
    { id: "splatter", icon: Circle, label: "Splash" },
    { id: "zigzag", icon: Minus, label: "Zigzag" },
    { id: "spiral", icon: Circle, label: "Espiral" },
    { id: "heart", icon: Heart, label: "Coração" },
    { id: "cross", icon: Plus, label: "Cruz" },
    { id: "cloud", icon: CloudIcon, label: "Nuvem" },
    { id: "speechBubble", icon: MessageCircle, label: "Balão" },
    { id: "lightning", icon: Zap, label: "Raio" },
    { id: "shield", icon: Shield, label: "Escudo" },
    { id: "crescent", icon: Moon, label: "Lua" },
    { id: "text", icon: Type, label: "Texto" },
    { id: "image", icon: ImageIcon, label: "Imagem" },
  ];

  const placeholders = [
    { id: "logo", label: "Logo do Cliente", color: "#3b82f6" },
    { id: "contact", label: "Dados de Contato", color: "#10b981" },
    { id: "mascot", label: "Mascote", color: "#f59e0b" },
  ];

  useEffect(() => {
    drawCanvas();
  }, [elements, selectedElement, backgroundColor]);

  const drawCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Clear and draw background
    ctx.fillStyle = backgroundColor;
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    // Rounded-rect path helper (with fallback for browsers without ctx.roundRect)
    const roundedRectPath = (
      c: CanvasRenderingContext2D,
      x: number,
      y: number,
      w: number,
      h: number,
      r: number
    ) => {
      const radius = Math.max(0, Math.min(r, Math.min(w, h) / 2));
      if (radius <= 0) {
        c.rect(x, y, w, h);
        return;
      }
      const anyCtx = c as unknown as { roundRect?: (x: number, y: number, w: number, h: number, r: number) => void };
      if (typeof anyCtx.roundRect === "function") {
        anyCtx.roundRect(x, y, w, h, radius);
        return;
      }
      c.moveTo(x + radius, y);
      c.arcTo(x + w, y, x + w, y + h, radius);
      c.arcTo(x + w, y + h, x, y + h, radius);
      c.arcTo(x, y + h, x, y, radius);
      c.arcTo(x, y, x + w, y, radius);
      c.closePath();
    };

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
      return el.color || "#cccccc";
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

    // Draw elements
    elements.forEach((el) => {
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
          roundedRectPath(ctx, el.x, el.y, el.width, el.height, radius);
          ctx.fill();
          drawBorder(el);
        } else {
          ctx.fillRect(el.x, el.y, el.width, el.height);
          if (el.borderWidth && el.borderWidth > 0) {
            ctx.globalAlpha = 1; // Borders always fully opaque
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
      } else if (el.type === "wave") {
        // Wavy shape
        ctx.beginPath();
        ctx.moveTo(el.x, el.y + el.height);
        const waves = 4;
        const waveHeight = el.height * 0.3;
        for (let i = 0; i <= waves; i++) {
          const x = el.x + (el.width / waves) * i;
          const y = el.y + (i % 2 === 0 ? waveHeight : 0);
          if (i === 0) {
            ctx.lineTo(x, y);
          } else {
            const prevX = el.x + (el.width / waves) * (i - 1);
            const cpX = (prevX + x) / 2;
            const prevY = el.y + ((i - 1) % 2 === 0 ? waveHeight : 0);
            ctx.quadraticCurveTo(prevX + (x - prevX) * 0.5, prevY, x, y);
          }
        }
        ctx.lineTo(el.x + el.width, el.y + el.height);
        ctx.closePath();
        ctx.fill();
        drawBorder(el);
      } else if (el.type === "blob") {
        // Organic blob shape
        const cx = el.x + el.width / 2;
        const cy = el.y + el.height / 2;
        const rx = el.width / 2;
        const ry = el.height / 2;
        ctx.beginPath();
        ctx.moveTo(cx + rx * 0.9, cy);
        ctx.bezierCurveTo(cx + rx, cy + ry * 0.6, cx + rx * 0.6, cy + ry, cx, cy + ry * 0.95);
        ctx.bezierCurveTo(cx - rx * 0.7, cy + ry * 0.9, cx - rx, cy + ry * 0.5, cx - rx * 0.95, cy);
        ctx.bezierCurveTo(cx - rx * 0.9, cy - ry * 0.6, cx - rx * 0.5, cy - ry, cx, cy - ry * 0.9);
        ctx.bezierCurveTo(cx + rx * 0.6, cy - ry * 0.95, cx + rx * 0.95, cy - ry * 0.4, cx + rx * 0.9, cy);
        ctx.closePath();
        ctx.fill();
        drawBorder(el);
      } else if (el.type === "arch") {
        // Arch/half-circle shape
        ctx.beginPath();
        ctx.arc(el.x + el.width / 2, el.y + el.height, el.width / 2, Math.PI, 0);
        ctx.lineTo(el.x + el.width, el.y + el.height);
        ctx.lineTo(el.x, el.y + el.height);
        ctx.closePath();
        ctx.fill();
        drawBorder(el);
      } else if (el.type === "arrow") {
        // Arrow pointing right
        const arrowWidth = el.width * 0.6;
        const arrowHead = el.width * 0.4;
        const shaftHeight = el.height * 0.4;
        ctx.beginPath();
        ctx.moveTo(el.x, el.y + el.height / 2 - shaftHeight / 2);
        ctx.lineTo(el.x + arrowWidth, el.y + el.height / 2 - shaftHeight / 2);
        ctx.lineTo(el.x + arrowWidth, el.y);
        ctx.lineTo(el.x + el.width, el.y + el.height / 2);
        ctx.lineTo(el.x + arrowWidth, el.y + el.height);
        ctx.lineTo(el.x + arrowWidth, el.y + el.height / 2 + shaftHeight / 2);
        ctx.lineTo(el.x, el.y + el.height / 2 + shaftHeight / 2);
        ctx.closePath();
        ctx.fill();
        drawBorder(el);
      } else if (el.type === "badge") {
        // Badge/seal shape with scalloped edges
        const cx = el.x + el.width / 2;
        const cy = el.y + el.height / 2;
        const outerR = Math.min(el.width, el.height) / 2;
        const innerR = outerR * 0.85;
        const points = 16;
        ctx.beginPath();
        for (let i = 0; i < points * 2; i++) {
          const angle = (Math.PI / points) * i;
          const r = i % 2 === 0 ? outerR : innerR;
          const px = cx + r * Math.cos(angle);
          const py = cy + r * Math.sin(angle);
          if (i === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
        ctx.closePath();
        ctx.fill();
        drawBorder(el);
      } else if (el.type === "ribbon") {
        // Ribbon/banner shape
        const notchDepth = el.width * 0.1;
        const foldHeight = el.height * 0.15;
        ctx.beginPath();
        ctx.moveTo(el.x, el.y);
        ctx.lineTo(el.x + el.width, el.y);
        ctx.lineTo(el.x + el.width, el.y + el.height - foldHeight);
        ctx.lineTo(el.x + el.width - notchDepth, el.y + el.height);
        ctx.lineTo(el.x + el.width / 2, el.y + el.height - foldHeight);
        ctx.lineTo(el.x + notchDepth, el.y + el.height);
        ctx.lineTo(el.x, el.y + el.height - foldHeight);
        ctx.closePath();
        ctx.fill();
        drawBorder(el);
      } else if (el.type === "line") {
        ctx.strokeStyle = el.color || "#cccccc";
        ctx.lineWidth = el.height || 4;
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(el.x, el.y + el.height / 2);
        ctx.lineTo(el.x + el.width, el.y + el.height / 2);
        ctx.stroke();
      } else if (el.type === "polkaDots") {
        // Polka dots pattern - like the Canva reference image
        const color = el.color || "#f59e0b";
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
        drawBorder(el);
      } else if (el.type === "dotsGrid") {
        // Scattered dots pattern
        const color = el.color || "#3b82f6";
        const dotCount = 25;
        ctx.fillStyle = color;
        
        // Use seeded random based on element position for consistency
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
        drawBorder(el);
      } else if (el.type === "confetti") {
        // Confetti scattered shapes
        const colors = [el.color || "#ec4899", "#f59e0b", "#3b82f6", "#10b981", "#8b5cf6"];
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
            // Rectangle
            ctx.fillRect(-size / 2, -size / 4, size, size / 2);
          } else if (shapeType === 1) {
            // Circle
            ctx.beginPath();
            ctx.arc(0, 0, size / 3, 0, Math.PI * 2);
            ctx.fill();
          } else {
            // Triangle
            ctx.beginPath();
            ctx.moveTo(0, -size / 2);
            ctx.lineTo(size / 2, size / 2);
            ctx.lineTo(-size / 2, size / 2);
            ctx.closePath();
            ctx.fill();
          }
          ctx.restore();
        }
        drawBorder(el);
      } else if (el.type === "splatter") {
        // Paint splatter effect
        const color = el.color || "#10b981";
        ctx.fillStyle = color;
        
        const seed = el.x + el.y;
        const random = (i: number) => {
          const x = Math.sin(seed + i * 9.999) * 10000;
          return x - Math.floor(x);
        };
        
        // Main blob
        const cx = el.x + el.width / 2;
        const cy = el.y + el.height / 2;
        const mainRadius = Math.min(el.width, el.height) * 0.3;
        
        ctx.beginPath();
        ctx.arc(cx, cy, mainRadius, 0, Math.PI * 2);
        ctx.fill();
        
        // Splatter droplets
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
        drawBorder(el);
      } else if (el.type === "zigzag") {
        // Zigzag line pattern
        const color = el.color || "#8b5cf6";
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
        drawBorder(el);
      } else if (el.type === "spiral") {
        // Spiral decorative element
        const color = el.color || "#f97316";
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
        drawBorder(el);
      } else if (el.type === "heart") {
        const cx = el.x + el.width / 2;
        const cy = el.y + el.height * 0.35;
        const w = el.width / 2;
        const h = el.height;
        ctx.beginPath();
        ctx.moveTo(cx, el.y + h * 0.85);
        ctx.bezierCurveTo(cx - w * 1.5, cy - h * 0.1, cx - w * 0.3, el.y - h * 0.1, cx, cy + h * 0.15);
        ctx.bezierCurveTo(cx + w * 0.3, el.y - h * 0.1, cx + w * 1.5, cy - h * 0.1, cx, el.y + h * 0.85);
        ctx.closePath();
        ctx.fill();
        drawBorder(el);
      } else if (el.type === "cross") {
        const arm = Math.min(el.width, el.height) * 0.3;
        ctx.beginPath();
        ctx.moveTo(el.x + el.width / 2 - arm, el.y);
        ctx.lineTo(el.x + el.width / 2 + arm, el.y);
        ctx.lineTo(el.x + el.width / 2 + arm, el.y + el.height / 2 - arm);
        ctx.lineTo(el.x + el.width, el.y + el.height / 2 - arm);
        ctx.lineTo(el.x + el.width, el.y + el.height / 2 + arm);
        ctx.lineTo(el.x + el.width / 2 + arm, el.y + el.height / 2 + arm);
        ctx.lineTo(el.x + el.width / 2 + arm, el.y + el.height);
        ctx.lineTo(el.x + el.width / 2 - arm, el.y + el.height);
        ctx.lineTo(el.x + el.width / 2 - arm, el.y + el.height / 2 + arm);
        ctx.lineTo(el.x, el.y + el.height / 2 + arm);
        ctx.lineTo(el.x, el.y + el.height / 2 - arm);
        ctx.lineTo(el.x + el.width / 2 - arm, el.y + el.height / 2 - arm);
        ctx.closePath();
        ctx.fill();
        drawBorder(el);
      } else if (el.type === "cloud") {
        const cx = el.x + el.width / 2;
        const cy = el.y + el.height * 0.6;
        ctx.beginPath();
        ctx.arc(cx - el.width * 0.25, cy, el.height * 0.3, 0, Math.PI * 2);
        ctx.arc(cx, cy - el.height * 0.15, el.height * 0.38, 0, Math.PI * 2);
        ctx.arc(cx + el.width * 0.25, cy, el.height * 0.3, 0, Math.PI * 2);
        ctx.arc(cx - el.width * 0.12, cy + el.height * 0.05, el.height * 0.28, 0, Math.PI * 2);
        ctx.arc(cx + el.width * 0.12, cy + el.height * 0.05, el.height * 0.28, 0, Math.PI * 2);
        ctx.fill();
        drawBorder(el);
      } else if (el.type === "speechBubble") {
        const r = 20;
        const tailH = el.height * 0.2;
        const bodyH = el.height - tailH;
        ctx.beginPath();
        ctx.moveTo(el.x + r, el.y);
        ctx.lineTo(el.x + el.width - r, el.y);
        ctx.quadraticCurveTo(el.x + el.width, el.y, el.x + el.width, el.y + r);
        ctx.lineTo(el.x + el.width, el.y + bodyH - r);
        ctx.quadraticCurveTo(el.x + el.width, el.y + bodyH, el.x + el.width - r, el.y + bodyH);
        ctx.lineTo(el.x + el.width * 0.35, el.y + bodyH);
        ctx.lineTo(el.x + el.width * 0.15, el.y + el.height);
        ctx.lineTo(el.x + el.width * 0.25, el.y + bodyH);
        ctx.lineTo(el.x + r, el.y + bodyH);
        ctx.quadraticCurveTo(el.x, el.y + bodyH, el.x, el.y + bodyH - r);
        ctx.lineTo(el.x, el.y + r);
        ctx.quadraticCurveTo(el.x, el.y, el.x + r, el.y);
        ctx.closePath();
        ctx.fill();
        drawBorder(el);
      } else if (el.type === "lightning") {
        ctx.beginPath();
        ctx.moveTo(el.x + el.width * 0.55, el.y);
        ctx.lineTo(el.x + el.width * 0.15, el.y + el.height * 0.5);
        ctx.lineTo(el.x + el.width * 0.45, el.y + el.height * 0.45);
        ctx.lineTo(el.x + el.width * 0.35, el.y + el.height);
        ctx.lineTo(el.x + el.width * 0.85, el.y + el.height * 0.4);
        ctx.lineTo(el.x + el.width * 0.55, el.y + el.height * 0.45);
        ctx.closePath();
        ctx.fill();
        drawBorder(el);
      } else if (el.type === "shield") {
        const cx = el.x + el.width / 2;
        ctx.beginPath();
        ctx.moveTo(cx, el.y);
        ctx.lineTo(el.x + el.width, el.y + el.height * 0.2);
        ctx.lineTo(el.x + el.width, el.y + el.height * 0.55);
        ctx.quadraticCurveTo(el.x + el.width, el.y + el.height * 0.85, cx, el.y + el.height);
        ctx.quadraticCurveTo(el.x, el.y + el.height * 0.85, el.x, el.y + el.height * 0.55);
        ctx.lineTo(el.x, el.y + el.height * 0.2);
        ctx.closePath();
        ctx.fill();
        drawBorder(el);
      } else if (el.type === "crescent") {
        const cx = el.x + el.width / 2;
        const cy = el.y + el.height / 2;
        const r = Math.min(el.width, el.height) / 2;
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.fill();
        // Cut out inner circle to create crescent
        ctx.globalCompositeOperation = "destination-out";
        ctx.beginPath();
        ctx.arc(cx + r * 0.35, cy - r * 0.1, r * 0.8, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalCompositeOperation = "source-over";
        drawBorder(el);
      } else if (el.type === "text") {
        ctx.fillStyle = el.color || "#000000";
        const fontSize = el.fontSize || 32;
        ctx.font = `${fontSize}px Arial`;
        const align = el.textAlign || "left";
        ctx.textAlign = align;
        const lh = (el.lineHeight || 1.2) * fontSize;
        const text = el.text || "Texto";
        const words = text.split(" ");
        let line = "";
        let drawX = align === "center" ? el.x + el.width / 2 : align === "right" ? el.x + el.width : el.x;
        let y = el.y + fontSize;
        const maxWidth = el.width || 400;
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
        const img = new Image();
        img.crossOrigin = "anonymous";
        img.onload = () => {
          ctx.globalAlpha = (el.opacity ?? 100) / 100;
          const radius = el.borderRadius || 0;
          if (radius > 0) {
            ctx.save();
            ctx.beginPath();
            roundedRectPath(ctx, el.x, el.y, el.width, el.height, radius);
            ctx.clip();
            ctx.drawImage(img, el.x, el.y, el.width, el.height);
            ctx.restore();
          } else {
            ctx.drawImage(img, el.x, el.y, el.width, el.height);
          }
          if (selectedElement === el.id) {
            drawSelection(ctx, el);
          }
        };
        img.src = el.imageUrl;
      } else if (el.placeholder || ["logo", "contact", "mascot"].includes(el.type)) {
        // Draw placeholder
        ctx.globalAlpha = (el.opacity ?? 100) / 100;
        ctx.fillStyle = el.color || "#e5e7eb";

        const shape = el.type === "image" ? (el.clipShape || "rect") : "rect";
        const radius = el.borderRadius || 0;
        
        if (el.type === "image" && shape !== "rect") {
          // Draw shaped image placeholder
          ctx.fillStyle = "rgba(139, 92, 246, 0.3)";
          ctx.beginPath();
          if (shape === "circle") {
            ctx.ellipse(el.x + el.width / 2, el.y + el.height / 2, el.width / 2, el.height / 2, 0, 0, Math.PI * 2);
          } else if (shape === "triangle") {
            ctx.moveTo(el.x + el.width / 2, el.y);
            ctx.lineTo(el.x + el.width, el.y + el.height);
            ctx.lineTo(el.x, el.y + el.height);
            ctx.closePath();
          } else if (shape === "diamond") {
            ctx.moveTo(el.x + el.width / 2, el.y);
            ctx.lineTo(el.x + el.width, el.y + el.height / 2);
            ctx.lineTo(el.x + el.width / 2, el.y + el.height);
            ctx.lineTo(el.x, el.y + el.height / 2);
            ctx.closePath();
          } else if (shape === "hexagon") {
            const cx = el.x + el.width / 2;
            const cy = el.y + el.height / 2;
            const r = Math.min(el.width, el.height) / 2;
            for (let i = 0; i < 6; i++) {
              const angle = (Math.PI / 3) * i - Math.PI / 2;
              const px = cx + r * Math.cos(angle);
              const py = cy + r * Math.sin(angle);
              if (i === 0) ctx.moveTo(px, py);
              else ctx.lineTo(px, py);
            }
            ctx.closePath();
          } else if (shape === "pentagon") {
            const cx = el.x + el.width / 2;
            const cy = el.y + el.height / 2;
            const r = Math.min(el.width, el.height) / 2;
            for (let i = 0; i < 5; i++) {
              const angle = (Math.PI * 2 / 5) * i - Math.PI / 2;
              const px = cx + r * Math.cos(angle);
              const py = cy + r * Math.sin(angle);
              if (i === 0) ctx.moveTo(px, py);
              else ctx.lineTo(px, py);
            }
            ctx.closePath();
          } else if (shape === "star") {
            const cx = el.x + el.width / 2;
            const cy = el.y + el.height / 2;
            const outerR = Math.min(el.width, el.height) / 2;
            const innerR = outerR * 0.4;
            for (let i = 0; i < 10; i++) {
              const angle = (Math.PI / 5) * i - Math.PI / 2;
              const r = i % 2 === 0 ? outerR : innerR;
              const px = cx + r * Math.cos(angle);
              const py = cy + r * Math.sin(angle);
              if (i === 0) ctx.moveTo(px, py);
              else ctx.lineTo(px, py);
            }
            ctx.closePath();
          }
          ctx.fill();
          ctx.strokeStyle = "#8b5cf6";
          ctx.lineWidth = 3;
          ctx.setLineDash([10, 5]);
          ctx.stroke();
          ctx.setLineDash([]);
        } else if (radius > 0) {
          ctx.beginPath();
          roundedRectPath(ctx, el.x, el.y, el.width, el.height, radius);
          ctx.fill();

          ctx.strokeStyle = el.type === "image" ? "#8b5cf6" : "#9ca3af";
          ctx.lineWidth = el.type === "image" ? 3 : 1;
          ctx.setLineDash([10, 5]);
          ctx.stroke();
          ctx.setLineDash([]);
          ctx.lineWidth = 1;
        } else {
          ctx.fillRect(el.x, el.y, el.width, el.height);
          ctx.strokeStyle = el.type === "image" ? "#8b5cf6" : "#9ca3af";
          ctx.lineWidth = el.type === "image" ? 3 : 1;
          ctx.setLineDash([10, 5]);
          ctx.strokeRect(el.x, el.y, el.width, el.height);
          ctx.setLineDash([]);
          ctx.lineWidth = 1;
        }
        
        // Label
        ctx.fillStyle = el.type === "image" ? "#8b5cf6" : "#6b7280";
        ctx.font = "24px Arial";
        ctx.textAlign = "center";
        const label = el.type === "logo" ? "LOGO" : el.type === "contact" ? "CONTATO" : el.type === "mascot" ? "MASCOTE" : (shape !== "rect" ? `FOTO (${shape.toUpperCase()})` : "FOTO");
        ctx.fillText(label, el.x + el.width / 2, el.y + el.height / 2 + 8);
        
        // Draw image icon for image placeholder
        if (el.type === "image") {
          ctx.font = "16px Arial";
          ctx.fillText("(Buscar no Unsplash)", el.x + el.width / 2, el.y + el.height / 2 + 35);
        }
        ctx.textAlign = "left";
      }

      // Draw selection border
      if (selectedElement === el.id && !(el.type === "image" && el.imageUrl && !el.placeholder)) {
        drawSelection(ctx, el);
      }

      ctx.restore();
    });
  };

  const drawSelection = (ctx: CanvasRenderingContext2D, el: CanvasElement) => {
    ctx.strokeStyle = "#3b82f6";
    ctx.lineWidth = 4;

    const radius = (el.type === "rect" || el.type === "image") ? (el.borderRadius || 0) : 0;
    if (radius > 0) {
      ctx.beginPath();
      // a bit larger than the element so the selection sits outside
      roundedRectPath(ctx, el.x - 3, el.y - 3, el.width + 6, el.height + 6, radius + 3);
      ctx.stroke();
    } else {
      ctx.strokeRect(el.x - 3, el.y - 3, el.width + 6, el.height + 6);
    }

    // Draw handles - larger for better visibility at 40% scale
    const handleSize = 24; // Larger handles (24 * 0.4 = ~10px on screen)
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
  };

  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const x = (e.clientX - rect.left) / SCALE;
    const y = (e.clientY - rect.top) / SCALE;

    if (selectedTool === "move") {
      // Find clicked element
      const clickedElement = [...elements].reverse().find((el) => {
        return x >= el.x && x <= el.x + el.width && y >= el.y && y <= el.y + el.height;
      });
      setSelectedElement(clickedElement?.id || null);
    } else if (selectedTool === "rect") {
      addElement({
        type: "rect",
        x: x - 75,
        y: y - 50,
        width: 150,
        height: 100,
        color: "#cccccc",
      });
    } else if (selectedTool === "circle") {
      addElement({
        type: "circle",
        x: x - 50,
        y: y - 50,
        width: 100,
        height: 100,
        color: "#cccccc",
      });
    } else if (selectedTool === "triangle") {
      addElement({
        type: "triangle",
        x: x - 50,
        y: y - 50,
        width: 100,
        height: 100,
        color: "#cccccc",
      });
    } else if (selectedTool === "diamond") {
      addElement({
        type: "diamond",
        x: x - 50,
        y: y - 50,
        width: 100,
        height: 100,
        color: "#cccccc",
      });
    } else if (selectedTool === "hexagon") {
      addElement({
        type: "hexagon",
        x: x - 50,
        y: y - 50,
        width: 100,
        height: 100,
        color: "#cccccc",
      });
    } else if (selectedTool === "pentagon") {
      addElement({
        type: "pentagon",
        x: x - 50,
        y: y - 50,
        width: 100,
        height: 100,
        color: "#cccccc",
      });
    } else if (selectedTool === "star") {
      addElement({
        type: "star",
        x: x - 50,
        y: y - 50,
        width: 100,
        height: 100,
        color: "#cccccc",
      });
    } else if (selectedTool === "line") {
      addElement({
        type: "line",
        x: x - 100,
        y: y - 4,
        width: 200,
        height: 8,
        color: "#cccccc",
      });
    } else if (selectedTool === "text") {
      addElement({
        type: "text",
        x,
        y,
        width: 200,
        height: 40,
        text: "Seu texto aqui",
        fontSize: 32,
        color: "#000000",
      });
    } else if (selectedTool === "image") {
      // Add image placeholder frame
      addElement({
        type: "image",
        x: x - 200,
        y: y - 250,
        width: 400,
        height: 500,
        placeholder: true,
        color: "#8b5cf6", // Purple color for image placeholder
      });
    } else if (selectedTool === "polkaDots") {
      addElement({
        type: "polkaDots",
        x: x - 100,
        y: y - 100,
        width: 200,
        height: 200,
        color: "#f59e0b",
      });
    } else if (selectedTool === "dotsGrid") {
      addElement({
        type: "dotsGrid",
        x: x - 100,
        y: y - 100,
        width: 200,
        height: 200,
        color: "#3b82f6",
      });
    } else if (selectedTool === "confetti") {
      addElement({
        type: "confetti",
        x: x - 100,
        y: y - 100,
        width: 200,
        height: 200,
        color: "#ec4899",
      });
    } else if (selectedTool === "splatter") {
      addElement({
        type: "splatter",
        x: x - 100,
        y: y - 100,
        width: 200,
        height: 200,
        color: "#10b981",
      });
    } else if (selectedTool === "zigzag") {
      addElement({
        type: "zigzag",
        x: x - 100,
        y: y - 25,
        width: 200,
        height: 50,
        color: "#8b5cf6",
      });
    } else if (selectedTool === "spiral") {
      addElement({
        type: "spiral",
        x: x - 75,
        y: y - 75,
        width: 150,
        height: 150,
        color: "#f97316",
      });
    } else if (selectedTool === "heart") {
      addElement({ type: "heart", x: x - 75, y: y - 75, width: 150, height: 150, color: "#ef4444" });
    } else if (selectedTool === "cross") {
      addElement({ type: "cross", x: x - 60, y: y - 60, width: 120, height: 120, color: "#6366f1" });
    } else if (selectedTool === "cloud") {
      addElement({ type: "cloud", x: x - 100, y: y - 60, width: 200, height: 120, color: "#94a3b8" });
    } else if (selectedTool === "speechBubble") {
      addElement({ type: "speechBubble", x: x - 100, y: y - 75, width: 200, height: 150, color: "#ffffff" });
    } else if (selectedTool === "lightning") {
      addElement({ type: "lightning", x: x - 40, y: y - 75, width: 80, height: 150, color: "#facc15" });
    } else if (selectedTool === "shield") {
      addElement({ type: "shield", x: x - 60, y: y - 75, width: 120, height: 150, color: "#3b82f6" });
    } else if (selectedTool === "crescent") {
      addElement({ type: "crescent", x: x - 60, y: y - 60, width: 120, height: 120, color: "#fbbf24" });
    }
  };

  // Double-click: inline edit text OR open file picker for image/logo/mascot
  const handleCanvasDoubleClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const x = (e.clientX - rect.left) / SCALE;
    const y = (e.clientY - rect.top) / SCALE;

    const clickedElement = [...elements].reverse().find((el) => {
      return x >= el.x && x <= el.x + el.width && y >= el.y && y <= el.y + el.height;
    });

    if (!clickedElement) return;

    if (clickedElement.type === "text") {
      // Inline text edit
      setInlineEditId(clickedElement.id);
      setInlineEditText(clickedElement.text || "");
      setSelectedElement(clickedElement.id);
    } else if (["image", "logo", "mascot", "contact"].includes(clickedElement.type)) {
      // Open file picker to replace image
      setDirectImageTargetId(clickedElement.id);
      setSelectedElement(clickedElement.id);
      directImageInputRef.current?.click();
    }
  };

  // Handle direct image file selection
  const handleDirectImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !directImageTargetId) return;

    const reader = new FileReader();
    reader.onload = (ev) => {
      const dataUrl = ev.target?.result as string;
      setElements((prev) =>
        prev.map((el) =>
          el.id === directImageTargetId
            ? { ...el, imageUrl: dataUrl, placeholder: false }
            : el
        )
      );
      setDirectImageTargetId(null);
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  // Commit inline text edit
  const commitInlineEdit = () => {
    if (inlineEditId && inlineEditText !== null) {
      setElements((prev) =>
        prev.map((el) =>
          el.id === inlineEditId ? { ...el, text: inlineEditText } : el
        )
      );
    }
    setInlineEditId(null);
    setInlineEditText(null);
  };

  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (selectedTool !== "move" || !selectedElement) return;

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
    if (!canvas || !selectedElement) return;

    const rect = canvas.getBoundingClientRect();
    const x = (e.clientX - rect.left) / SCALE;
    const y = (e.clientY - rect.top) / SCALE;

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

      setElements((prev) =>
        prev.map((el) =>
          el.id === selectedElement
            ? { ...el, x: newX, y: newY, width: newWidth, height: newHeight }
            : el
        )
      );
      return;
    }

    if (isDragging) {
      setElements((prev) =>
        prev.map((el) =>
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

  const getCursorStyle = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (selectedTool !== "move" || !selectedElement) return "crosshair";
    
    const canvas = canvasRef.current;
    if (!canvas) return "crosshair";
    
    const rect = canvas.getBoundingClientRect();
    const x = (e.clientX - rect.left) / SCALE;
    const y = (e.clientY - rect.top) / SCALE;
    
    const element = elements.find((el) => el.id === selectedElement);
    if (!element) return "crosshair";
    
    const handleSize = 30;
    const handles = [
      { id: 'nw', x: element.x, y: element.y, cursor: 'nwse-resize' },
      { id: 'ne', x: element.x + element.width, y: element.y, cursor: 'nesw-resize' },
      { id: 'sw', x: element.x, y: element.y + element.height, cursor: 'nesw-resize' },
      { id: 'se', x: element.x + element.width, y: element.y + element.height, cursor: 'nwse-resize' },
    ];
    
    for (const handle of handles) {
      if (Math.abs(x - handle.x) < handleSize && Math.abs(y - handle.y) < handleSize) {
        return handle.cursor;
      }
    }
    
    if (x >= element.x && x <= element.x + element.width && y >= element.y && y <= element.y + element.height) {
      return "move";
    }
    
    return "crosshair";
  };

  const [cursorStyle, setCursorStyle] = useState("crosshair");

  const handleMouseMoveWithCursor = (e: React.MouseEvent<HTMLCanvasElement>) => {
    setCursorStyle(getCursorStyle(e));
    handleMouseMove(e);
  };
  const addElement = (elementData: Omit<CanvasElement, "id">) => {
    const newElement: CanvasElement = {
      ...elementData,
      id: `el-${Date.now()}`,
    };
    setElements((prev) => [...prev, newElement]);
    setSelectedElement(newElement.id);
    setSelectedTool("move");
  };

  const addPlaceholder = (type: "logo" | "contact" | "mascot") => {
    const placeholder = placeholders.find((p) => p.id === type);
    addElement({
      type,
      x: CANVAS_WIDTH / 2 - 100,
      y: type === "logo" ? 50 : type === "contact" ? CANVAS_HEIGHT - 200 : CANVAS_HEIGHT / 2 - 100,
      width: 200,
      height: 150,
      color: placeholder?.color || "#e5e7eb",
      placeholder: true,
    });
  };

  const updateSelectedElement = (updates: Partial<CanvasElement>) => {
    if (!selectedElement) return;
    setElements((prev) =>
      prev.map((el) => (el.id === selectedElement ? { ...el, ...updates } : el))
    );
  };

  const deleteSelectedElement = () => {
    if (!selectedElement) return;
    setElements((prev) => prev.filter((el) => el.id !== selectedElement));
    setSelectedElement(null);
  };

  const duplicateSelectedElement = () => {
    if (!selectedElement) return;
    const element = elements.find((el) => el.id === selectedElement);
    if (!element) return;
    addElement({ ...element, x: element.x + 20, y: element.y + 20 });
  };

  const moveLayer = (direction: "up" | "down") => {
    if (!selectedElement) return;
    const index = elements.findIndex((el) => el.id === selectedElement);
    if (index === -1) return;

    const newIndex = direction === "up" ? index + 1 : index - 1;
    if (newIndex < 0 || newIndex >= elements.length) return;

    const newElements = [...elements];
    [newElements[index], newElements[newIndex]] = [newElements[newIndex], newElements[index]];
    setElements(newElements);
  };

  const handleSearchImages = async () => {
    if (!searchQuery.trim()) return;
    setIsSearching(true);
    try {
      const images = await searchUnsplashImages(searchQuery, 12);
      setUnsplashImages(images);
    } catch (error) {
      toast({
        title: "Erro ao buscar imagens",
        description: "Tente novamente mais tarde.",
        variant: "destructive",
      });
    } finally {
      setIsSearching(false);
    }
  };

  const addImageFromUnsplash = (image: UnsplashImage) => {
    addElement({
      type: "image",
      x: CANVAS_WIDTH / 2 - 200,
      y: CANVAS_HEIGHT / 2 - 250,
      width: 400,
      height: 500,
      imageUrl: image.urls.regular,
    });
  };

  const handleGenerateBatch = () => {
    const template: MasterTemplate = {
      id: `template-${Date.now()}`,
      name: templateName,
      elements,
      width: CANVAS_WIDTH,
      height: CANVAS_HEIGHT,
      backgroundColor,
    };
    onGenerateBatch(template, selectedTeamFilter);
  };

  const selectedEl = elements.find((el) => el.id === selectedElement);

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <div className="border-b bg-card px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={onBack}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          
          {/* Template Selector */}
          <Select 
            value={currentTemplateId || "new"} 
            onValueChange={(value) => value === "new" ? createNewTemplate() : loadTemplate(value)}
          >
            <SelectTrigger className="w-48">
              <SelectValue placeholder="Carregar template..." />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="new">
                <div className="flex items-center gap-2">
                  <Plus className="h-4 w-4" />
                  Novo Template
                </div>
              </SelectItem>
              {savedTemplates.map((t) => (
                <SelectItem key={t.id} value={t.id}>
                  <div className="flex items-center gap-2 w-full">
                    <FolderOpen className="h-4 w-4 shrink-0" />
                    <span className="flex-1 truncate">{t.name}</span>
                    <button
                      type="button"
                      className="ml-auto p-0.5 rounded hover:bg-destructive/20 text-muted-foreground hover:text-destructive shrink-0"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        deleteTemplate(t.id, t.name);
                      }}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Input
            value={templateName}
            onChange={(e) => setTemplateName(e.target.value)}
            className="w-64 font-semibold"
            placeholder="Nome do template"
          />
        </div>
        <div className="flex gap-2 items-center">
          <Button variant="outline" onClick={saveTemplate} disabled={isSaving}>
            {isSaving ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Save className="mr-2 h-4 w-4" />
            )}
            {currentTemplateId ? "Atualizar" : "Salvar"} Template
          </Button>
          
          {/* Team Filter Selector */}
          <Select 
            value={selectedTeamFilter || "all"} 
            onValueChange={(value) => setSelectedTeamFilter(value === "all" ? undefined : value)}
          >
            <SelectTrigger className="w-44">
              <SelectValue placeholder="Equipe..." />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os Clientes</SelectItem>
              {availableTeams.map((team) => (
                <SelectItem key={team.id} value={team.name}>{team.name}</SelectItem>
              ))}
            </SelectContent>
            </Select>

            <Button variant="default" onClick={handleGenerateBatch}>
              <Play className="mr-2 h-4 w-4" />
              Gerar em Lote
            </Button>

            {onOpenHistory && (
              <Button variant="outline" onClick={onOpenHistory}>
                <History className="mr-2 h-4 w-4" />
                Histórico
              </Button>
            )}
          </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Left Sidebar - Tools */}
        <div className="w-64 border-r bg-card p-4 flex flex-col gap-4">
          <div>
            <Label className="text-sm font-medium mb-2 block">Ferramentas</Label>
            <div className="grid grid-cols-3 gap-2">
              {tools.map((tool) => (
                <Button
                  key={tool.id}
                  variant={selectedTool === tool.id ? "default" : "outline"}
                  size="sm"
                  onClick={() => handleToolSelect(tool.id)}
                  className="flex flex-col h-16 gap-1"
                >
                  <tool.icon className="h-5 w-5" />
                  <span className="text-xs">{tool.label}</span>
                </Button>
              ))}
            </div>
          </div>

          <div>
            <Label className="text-sm font-medium mb-2 block">Placeholders do Cliente</Label>
            <div className="space-y-2">
              {placeholders.map((p) => (
                <Button
                  key={p.id}
                  variant="outline"
                  size="sm"
                  className="w-full justify-start"
                  onClick={() => addPlaceholder(p.id as any)}
                >
                  <div
                    className="w-4 h-4 rounded mr-2"
                    style={{ backgroundColor: p.color }}
                  />
                  {p.label}
                </Button>
              ))}
            </div>
          </div>

          <div>
            <Label className="text-sm font-medium mb-2 block">Cor de Fundo</Label>
            <div className="flex gap-2">
              <Input
                type="color"
                value={backgroundColor}
                onChange={(e) => setBackgroundColor(e.target.value)}
                className="w-12 h-10 p-1 cursor-pointer"
              />
              <Input
                type="text"
                value={backgroundColor}
                onChange={(e) => setBackgroundColor(e.target.value)}
                className="flex-1"
              />
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Será substituído pela cor do cliente
            </p>
          </div>

          {selectedEl && (
            <ScrollArea className="flex-1">
              <div className="space-y-3 border-t pt-4 pr-2">
                <Label className="text-sm font-medium">Propriedades</Label>
              
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
                      <SelectTrigger>
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
                      />
                    </div>
                    <div>
                      <Label className="text-xs">Tamanho: {selectedEl.fontSize}px</Label>
                      <Slider
                        value={[selectedEl.fontSize || 32]}
                        onValueChange={([v]) => updateSelectedElement({ fontSize: v })}
                        min={12}
                        max={120}
                        step={1}
                      />
                    </div>
                    <div>
                      <Label className="text-xs">Alinhamento</Label>
                      <Select
                        value={selectedEl.textAlign || "left"}
                        onValueChange={(v) => updateSelectedElement({ textAlign: v as "left" | "center" | "right" })}
                      >
                        <SelectTrigger>
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
                      <Label className="text-xs">Altura da Linha: {(selectedEl.lineHeight || 1.2).toFixed(1)}x</Label>
                      <Slider
                        value={[((selectedEl.lineHeight || 1.2) * 10)]}
                        onValueChange={([v]) => updateSelectedElement({ lineHeight: v / 10 })}
                        min={8}
                        max={30}
                        step={1}
                      />
                    </div>
                  </>
                )}

                {/* Color Role for shapes */}
                {(["rect", "circle", "triangle", "diamond", "hexagon", "pentagon", "star", "wave", "blob", "arch", "arrow", "badge", "ribbon", "polkaDots", "dotsGrid", "confetti", "splatter", "zigzag", "spiral", "heart", "cross", "cloud", "speechBubble", "lightning", "shield", "crescent", "polka-dots", "dots-grid"].includes(selectedEl.type)) && (
                  <div>
                    <Label className="text-xs">Papel da Cor (Kit de Marca)</Label>
                    <Select
                      value={selectedEl.colorRole || "none"}
                      onValueChange={(v) => updateSelectedElement({ colorRole: v === "none" ? undefined : v as any })}
                    >
                      <SelectTrigger>
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
                )}

                {/* Color picker */}
                {(["rect", "circle", "text", "triangle", "diamond", "hexagon", "pentagon", "star", "line", "wave", "blob", "arch", "arrow", "badge", "ribbon", "polkaDots", "dotsGrid", "confetti", "splatter", "zigzag", "spiral", "heart", "cross", "cloud", "speechBubble", "lightning", "shield", "crescent", "polka-dots", "dots-grid"].includes(selectedEl.type)) && (
                  <div>
                    <Label className="text-xs">Cor {selectedEl.colorRole ? "(preview)" : ""}</Label>
                    <div className="flex gap-2">
                      <Input
                        type="color"
                        value={selectedEl.color || "#000000"}
                        onChange={(e) => updateSelectedElement({ color: e.target.value })}
                        className="w-12 h-8 p-1"
                      />
                      <Input
                        value={selectedEl.color || "#000000"}
                        onChange={(e) => updateSelectedElement({ color: e.target.value })}
                        className="flex-1"
                      />
                    </div>
                  </div>
                )}

                {/* Remove Background for images */}
                {(selectedEl.type === "image" || ["logo", "mascot"].includes(selectedEl.type)) && selectedEl.imageUrl && (
                  <div className="p-3 bg-primary/10 rounded-md space-y-2">
                    <Label className="text-xs font-medium flex items-center gap-2">
                      <Scissors className="h-4 w-4" />
                      Edição de Imagem
                    </Label>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        className="flex-1"
                        onClick={handleRemoveBackground}
                        disabled={isRemovingBg}
                      >
                        {isRemovingBg ? (
                          <>
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            {removeBgProgress || "..."}
                          </>
                        ) : (
                          <>
                            <Scissors className="h-4 w-4 mr-2" />
                            Recortar
                          </>
                        )}
                      </Button>
                      <ImageEraserModal
                        open={eraserModalOpen}
                        onOpenChange={setEraserModalOpen}
                        imageUrl={selectedEl.imageUrl}
                        onSave={(newUrl) => updateSelectedElement({ imageUrl: newUrl })}
                      />
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setEraserModalOpen(true)}
                      >
                        Borracha
                      </Button>
                    </div>
                    <p className="text-[10px] text-muted-foreground">
                      Recortar remove o fundo com IA. Borracha limpa artefatos manualmente.
                    </p>
                  </div>
                )}

                {(selectedEl.type === "rect" || selectedEl.type === "image") && (
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
                {(["rect", "circle", "triangle", "diamond", "hexagon", "pentagon", "star", "wave", "blob", "arch", "arrow", "badge", "ribbon", "image", "line", "heart", "cross", "cloud", "speechBubble", "lightning", "shield", "crescent"].includes(selectedEl.type)) && (
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
                {(["rect", "circle", "triangle", "diamond", "hexagon", "pentagon", "star", "wave", "blob", "arch", "arrow", "badge", "ribbon"].includes(selectedEl.type)) && (
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

                {/* Dimensions */}
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label className="text-xs">Largura</Label>
                    <Input
                      type="number"
                      value={selectedEl.width}
                      onChange={(e) => updateSelectedElement({ width: Number(e.target.value) })}
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Altura</Label>
                    <Input
                      type="number"
                      value={selectedEl.height}
                      onChange={(e) => updateSelectedElement({ height: Number(e.target.value) })}
                    />
                  </div>
                </div>

                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={duplicateSelectedElement}>
                    <Copy className="h-4 w-4" />
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => moveLayer("up")}>
                    <ChevronUp className="h-4 w-4" />
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => moveLayer("down")}>
                    <ChevronDown className="h-4 w-4" />
                  </Button>
                  <Button size="sm" variant="destructive" onClick={deleteSelectedElement}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </ScrollArea>
          )}
        </div>

        {/* Canvas Area */}
        <div className="flex-1 bg-muted/30 flex items-start justify-center pt-1 overflow-auto">
          <div className="shadow-2xl">
            <canvas
              ref={canvasRef}
              width={CANVAS_WIDTH}
              height={CANVAS_HEIGHT}
              style={{ width: CANVAS_WIDTH * SCALE, height: CANVAS_HEIGHT * SCALE, cursor: cursorStyle }}
              className="bg-white"
              onClick={handleCanvasClick}
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMoveWithCursor}
              onMouseUp={handleMouseUp}
              onMouseLeave={handleMouseUp}
            />
          </div>
        </div>

        {/* Right Sidebar - Images & Layers */}
        <div className="w-80 border-l bg-card">
          <Tabs value={activeTab} onValueChange={setActiveTab} className="h-full flex flex-col">
            <TabsList className="w-full rounded-none border-b">
              <TabsTrigger value="images" className="flex-1">
                <ImageIcon className="h-4 w-4 mr-2" />
                Imagens
              </TabsTrigger>
              <TabsTrigger value="layers" className="flex-1">
                <Layers className="h-4 w-4 mr-2" />
                Camadas
              </TabsTrigger>
            </TabsList>

            <TabsContent value="images" className="flex-1 p-4 m-0">
              <div className="flex gap-2 mb-4">
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

              <ScrollArea className="h-[calc(100vh-280px)]">
                <div className="grid grid-cols-2 gap-2">
                  {unsplashImages.map((image) => (
                    <div
                      key={image.id}
                      className="aspect-[4/5] rounded-lg overflow-hidden cursor-pointer hover:ring-2 ring-primary transition-all"
                      onClick={() => addImageFromUnsplash(image)}
                    >
                      <img
                        src={image.urls.small}
                        alt={image.description || "Unsplash image"}
                        className="w-full h-full object-cover"
                      />
                    </div>
                  ))}
                </div>
                {unsplashImages.length === 0 && (
                  <p className="text-center text-muted-foreground py-8">
                    Busque imagens para adicionar à sua arte
                  </p>
                )}
              </ScrollArea>
            </TabsContent>

            <TabsContent value="layers" className="flex-1 p-4 m-0">
              <ScrollArea className="h-[calc(100vh-200px)]">
                <div className="space-y-1">
                  {[...elements].reverse().map((el, reversedIndex) => {
                    const actualIndex = elements.length - 1 - reversedIndex;
                    const isFirst = actualIndex === elements.length - 1;
                    const isLast = actualIndex === 0;
                    const isEditing = editingLayerId === el.id;
                    
                    return (
                      <div
                        key={el.id}
                        className={`p-2 rounded cursor-pointer flex items-center gap-2 ${
                          selectedElement === el.id
                            ? "bg-primary text-primary-foreground"
                            : "hover:bg-muted"
                        }`}
                        onClick={() => setSelectedElement(el.id)}
                      >
                        {el.type === "rect" && <Square className="h-4 w-4 shrink-0" />}
                        {el.type === "circle" && <Circle className="h-4 w-4 shrink-0" />}
                        {el.type === "text" && <Type className="h-4 w-4 shrink-0" />}
                        {el.type === "image" && <ImageIcon className="h-4 w-4 shrink-0" />}
                        {el.type === "triangle" && <Triangle className="h-4 w-4 shrink-0" />}
                        {el.type === "star" && <Star className="h-4 w-4 shrink-0" />}
                        {el.type === "diamond" && <Diamond className="h-4 w-4 shrink-0" />}
                        {el.type === "hexagon" && <Hexagon className="h-4 w-4 shrink-0" />}
                        {el.type === "pentagon" && <Pentagon className="h-4 w-4 shrink-0" />}
                        {el.type === "line" && <Minus className="h-4 w-4 shrink-0" />}
                        {["logo", "contact", "mascot"].includes(el.type) && (
                          <div
                            className="w-4 h-4 rounded shrink-0"
                            style={{ backgroundColor: el.color }}
                          />
                        )}
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
                        <div className="flex gap-1 shrink-0">
                          {!isEditing && (
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-6 w-6"
                              onClick={(e) => {
                                e.stopPropagation();
                                startEditingLayerName(el);
                              }}
                            >
                              <Pencil className="h-3 w-3" />
                            </Button>
                          )}
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-6 w-6"
                            disabled={isFirst}
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedElement(el.id);
                              const idx = elements.findIndex((e) => e.id === el.id);
                              if (idx < elements.length - 1) {
                                const newElements = [...elements];
                                [newElements[idx], newElements[idx + 1]] = [newElements[idx + 1], newElements[idx]];
                                setElements(newElements);
                              }
                            }}
                          >
                            <ChevronUp className="h-3 w-3" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-6 w-6"
                            disabled={isLast}
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedElement(el.id);
                              const idx = elements.findIndex((e) => e.id === el.id);
                              if (idx > 0) {
                                const newElements = [...elements];
                                [newElements[idx], newElements[idx - 1]] = [newElements[idx - 1], newElements[idx]];
                                setElements(newElements);
                              }
                            }}
                          >
                            <ChevronDown className="h-3 w-3" />
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </ScrollArea>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
};
