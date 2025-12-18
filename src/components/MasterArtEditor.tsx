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
} from "lucide-react";
import { searchUnsplashImages, UnsplashImage } from "@/lib/unsplash";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

interface CanvasElement {
  id: string;
  type: "rect" | "circle" | "text" | "image" | "logo" | "contact" | "mascot" | "triangle" | "line" | "star" | "diamond" | "hexagon" | "pentagon" | "wave" | "blob" | "arch" | "arrow" | "badge" | "ribbon";
  x: number;
  y: number;
  width: number;
  height: number;
  color?: string;
  text?: string;
  fontSize?: number;
  imageUrl?: string;
  placeholder?: boolean;
  rotation?: number;
  colorRole?: "background" | "text" | "accessory1" | "accessory2";
  opacity?: number; // 0-100
  borderRadius?: number;
  borderWidth?: number;
  borderColor?: string;
  shadowBlur?: number;
  shadowColor?: string;
  shadowOffsetX?: number;
  shadowOffsetY?: number;
  gradient?: {
    type: "linear" | "radial";
    color1: string;
    color2: string;
    opacity1?: number; // 0-100
    opacity2?: number; // 0-100
    angle?: number;
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

interface MasterArtEditorProps {
  onBack: () => void;
  onGenerateBatch: (template: MasterTemplate) => void;
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
  const { toast } = useToast();

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
          const dx = Math.cos(angle) * el.width;
          const dy = Math.sin(angle) * el.height;
          gradient = ctx.createLinearGradient(el.x, el.y, el.x + dx, el.y + dy);
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

    // Helper to draw border
    const drawBorder = (el: CanvasElement) => {
      if (el.borderWidth && el.borderWidth > 0) {
        ctx.strokeStyle = el.borderColor || "#000000";
        ctx.lineWidth = el.borderWidth;
        ctx.stroke();
      }
    };

    // Draw elements
    elements.forEach((el) => {
      ctx.save();
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
            ctx.strokeStyle = el.borderColor || "#000000";
            ctx.lineWidth = el.borderWidth;
            ctx.strokeRect(el.x, el.y, el.width, el.height);
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
      } else if (el.type === "text") {
        ctx.fillStyle = el.color || "#000000";
        ctx.font = `${el.fontSize || 32}px Arial`;
        ctx.fillText(el.text || "Texto", el.x, el.y + (el.fontSize || 32));
      } else if (el.type === "image" && el.imageUrl && !el.placeholder) {
        const img = new Image();
        img.crossOrigin = "anonymous";
        img.onload = () => {
          ctx.globalAlpha = (el.opacity ?? 100) / 100;
          ctx.drawImage(img, el.x, el.y, el.width, el.height);
          if (selectedElement === el.id) {
            drawSelection(ctx, el);
          }
        };
        img.src = el.imageUrl;
      } else if (el.placeholder || ["logo", "contact", "mascot"].includes(el.type)) {
        // Draw placeholder
        ctx.globalAlpha = (el.opacity ?? 100) / 100;
        ctx.fillStyle = el.color || "#e5e7eb";
        ctx.fillRect(el.x, el.y, el.width, el.height);
        ctx.strokeStyle = el.type === "image" ? "#8b5cf6" : "#9ca3af";
        ctx.lineWidth = el.type === "image" ? 3 : 1;
        ctx.setLineDash([10, 5]);
        ctx.strokeRect(el.x, el.y, el.width, el.height);
        ctx.setLineDash([]);
        ctx.lineWidth = 1;
        
        // Label
        ctx.fillStyle = el.type === "image" ? "#8b5cf6" : "#6b7280";
        ctx.font = "24px Arial";
        ctx.textAlign = "center";
        const label = el.type === "logo" ? "LOGO" : el.type === "contact" ? "CONTATO" : el.type === "mascot" ? "MASCOTE" : "FOTO";
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
    ctx.strokeRect(el.x - 3, el.y - 3, el.width + 6, el.height + 6);

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
    }
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

    const handleSize = 30; // Larger hit area for handles (matches visual size)
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
    onGenerateBatch(template);
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
                  <div className="flex items-center gap-2">
                    <FolderOpen className="h-4 w-4" />
                    {t.name}
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
        <div className="flex gap-2">
          {onOpenHistory && (
            <Button variant="outline" onClick={onOpenHistory}>
              <History className="mr-2 h-4 w-4" />
              Histórico
            </Button>
          )}
          <Button variant="outline" onClick={saveTemplate} disabled={isSaving}>
            {isSaving ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Save className="mr-2 h-4 w-4" />
            )}
            {currentTemplateId ? "Atualizar" : "Salvar"} Template
          </Button>
          <Button onClick={handleGenerateBatch} className="bg-gradient-primary">
            <Play className="mr-2 h-4 w-4" />
            Gerar Artes em Lote
          </Button>
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
                  </>
                )}

                {/* Color Role for shapes */}
                {(["rect", "circle", "triangle", "diamond", "hexagon", "pentagon", "star", "wave", "blob", "arch", "arrow", "badge", "ribbon"].includes(selectedEl.type)) && (
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
                {(["rect", "circle", "text", "triangle", "diamond", "hexagon", "pentagon", "star", "line", "wave", "blob", "arch", "arrow", "badge", "ribbon"].includes(selectedEl.type)) && (
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

                {/* Border Radius for rect */}
                {selectedEl.type === "rect" && (
                  <div>
                    <Label className="text-xs">Arredondamento: {selectedEl.borderRadius || 0}px</Label>
                    <Slider
                      value={[selectedEl.borderRadius || 0]}
                      onValueChange={([v]) => updateSelectedElement({ borderRadius: v })}
                      min={0}
                      max={200}
                      step={1}
                    />
                  </div>
                )}

                {/* Border */}
                {(["rect", "circle", "triangle", "diamond", "hexagon", "pentagon", "star", "wave", "blob", "arch", "arrow", "badge", "ribbon"].includes(selectedEl.type)) && (
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
                      <div className="w-10">
                        <Label className="text-[10px] text-muted-foreground">Cor</Label>
                        <Input
                          type="color"
                          value={selectedEl.borderColor || "#000000"}
                          onChange={(e) => updateSelectedElement({ borderColor: e.target.value })}
                          className="w-10 h-8 p-1"
                        />
                      </div>
                    </div>
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
                            : { type: "linear", color1: selectedEl.color || "#3b82f6", color2: "#8b5cf6", angle: 45 }
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
                        
                        {/* Color 1 with opacity */}
                        <div className="space-y-1 p-2 bg-muted/30 rounded">
                          <div className="flex items-center gap-2">
                            <Input
                              type="color"
                              value={selectedEl.gradient.color1}
                              onChange={(e) => updateSelectedElement({ 
                                gradient: { ...selectedEl.gradient!, color1: e.target.value }
                              })}
                              className="w-10 h-8 p-1"
                            />
                            <Label className="text-[10px] text-muted-foreground flex-1">Cor 1</Label>
                          </div>
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
                            <Input
                              type="color"
                              value={selectedEl.gradient.color2}
                              onChange={(e) => updateSelectedElement({ 
                                gradient: { ...selectedEl.gradient!, color2: e.target.value }
                              })}
                              className="w-10 h-8 p-1"
                            />
                            <Label className="text-[10px] text-muted-foreground flex-1">Cor 2</Label>
                          </div>
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
                        
                        {selectedEl.gradient.type === "linear" && (
                          <div>
                            <Label className="text-[10px] text-muted-foreground">Ângulo: {selectedEl.gradient.angle || 0}°</Label>
                            <Slider
                              value={[selectedEl.gradient.angle || 0]}
                              onValueChange={([v]) => updateSelectedElement({ 
                                gradient: { ...selectedEl.gradient!, angle: v }
                              })}
                              min={0}
                              max={360}
                              step={15}
                            />
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
        <div className="flex-1 bg-muted/30 flex items-center justify-center p-8 overflow-auto">
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
                  {[...elements].reverse().map((el, i) => (
                    <div
                      key={el.id}
                      className={`p-2 rounded cursor-pointer flex items-center gap-2 ${
                        selectedElement === el.id
                          ? "bg-primary text-primary-foreground"
                          : "hover:bg-muted"
                      }`}
                      onClick={() => setSelectedElement(el.id)}
                    >
                      {el.type === "rect" && <Square className="h-4 w-4" />}
                      {el.type === "circle" && <Circle className="h-4 w-4" />}
                      {el.type === "text" && <Type className="h-4 w-4" />}
                      {el.type === "image" && <ImageIcon className="h-4 w-4" />}
                      {["logo", "contact", "mascot"].includes(el.type) && (
                        <div
                          className="w-4 h-4 rounded"
                          style={{ backgroundColor: el.color }}
                        />
                      )}
                      <span className="text-sm truncate">
                        {el.type === "text"
                          ? el.text?.substring(0, 20) || "Texto"
                          : el.type === "logo"
                          ? "Logo"
                          : el.type === "contact"
                          ? "Contato"
                          : el.type === "mascot"
                          ? "Mascote"
                          : el.type.charAt(0).toUpperCase() + el.type.slice(1)}
                      </span>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
};
