import { useState, useEffect, useRef, useCallback } from "react";
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
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { searchImages, SearchImage } from "@/lib/imageSearch";
import { supabase } from "@/integrations/supabase/client";
import { removeBackground } from "@/lib/backgroundRemoval";

interface CanvasElement {
  id: string;
  type: "rect" | "circle" | "text" | "image" | "logo" | "contact" | "mascot" | "triangle" | "line" | "star" | "diamond" | "hexagon" | "pentagon";
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
    fadeMode?: boolean; // Single color to transparent mode
  };
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

interface MasterVideoEditorProps {
  onBack: () => void;
  onGenerateBatch: (template: VideoTemplate) => void;
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
  
  // Drag and resize state
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [isResizing, setIsResizing] = useState(false);
  const [resizeHandle, setResizeHandle] = useState<string | null>(null);
  const [resizeStart, setResizeStart] = useState({ x: 0, y: 0, width: 0, height: 0, elX: 0, elY: 0 });
  const [cursorStyle, setCursorStyle] = useState("crosshair");
  
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { toast } = useToast();

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
  const SCALE = 0.35; // Scale for display

  const elements = currentPage === "content" ? contentElements : signatureElements;
  const setElements = currentPage === "content" ? setContentElements : setSignatureElements;

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
  }, [elements, selectedElement, backgroundColor, currentPage]);

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
      return el.color || currentColor;
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
      } else if (el.type === "line") {
        ctx.strokeStyle = el.color || currentColor;
        ctx.lineWidth = el.height || 4;
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(el.x, el.y + el.height / 2);
        ctx.lineTo(el.x + el.width, el.y + el.height / 2);
        ctx.stroke();
      } else if (el.type === "text") {
        ctx.fillStyle = el.color || "#ffffff";
        ctx.font = `${el.fontSize || 48}px Arial`;
        ctx.textAlign = "left";
        ctx.fillText(el.text || "Texto", el.x, el.y + (el.fontSize || 48));
      } else if (el.type === "image" && el.placeholder) {
        // Draw image placeholder
        ctx.fillStyle = "rgba(139, 92, 246, 0.3)";
        ctx.fillRect(el.x, el.y, el.width, el.height);
        ctx.strokeStyle = "#8B5CF6";
        ctx.lineWidth = 3;
        ctx.setLineDash([10, 5]);
        ctx.strokeRect(el.x, el.y, el.width, el.height);
        ctx.setLineDash([]);
        ctx.fillStyle = "#8B5CF6";
        ctx.font = "bold 36px Arial";
        ctx.textAlign = "center";
        ctx.fillText("📷 IMAGEM", el.x + el.width / 2, el.y + el.height / 2);
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
  }, [elements, selectedElement, backgroundColor, currentPage, currentColor]);

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
    };

    onGenerateBatch(template);
  };

  const selectedEl = elements.find((el) => el.id === selectedElement);

  return (
    <div className="min-h-screen bg-background flex">
      {/* Left Sidebar - Tools */}
      <div className="w-72 border-r bg-card flex flex-col">
        <div className="p-4 border-b">
          <Button variant="outline" onClick={onBack} className="w-full">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Voltar
          </Button>
        </div>

        <ScrollArea className="flex-1">
          <div className="p-4 space-y-6">
            {/* Template Load/Save */}
            <div className="space-y-2">
              <Label>Carregar Template</Label>
              <div className="flex gap-2">
                <Select
                  value={currentTemplateId || ""}
                  onValueChange={(value) => value && loadTemplate(value)}
                >
                  <SelectTrigger className="flex-1">
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
                <Button variant="outline" size="icon" onClick={newTemplate}>
                  <FolderOpen className="h-4 w-4" />
                </Button>
              </div>
            </div>

            {/* Template Name */}
            <div className="space-y-2">
              <Label>Nome do Template</Label>
              <div className="flex gap-2">
                <Input
                  value={templateName}
                  onChange={(e) => setTemplateName(e.target.value)}
                  placeholder="Nome do template"
                  className="flex-1"
                />
                <Button 
                  variant="outline" 
                  size="icon" 
                  onClick={saveTemplate}
                  disabled={isSaving}
                >
                  {isSaving ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Save className="h-4 w-4" />
                  )}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                {currentTemplateId ? "Atualizar template existente" : "Salvar novo template"}
              </p>
            </div>

            {/* Page Selector */}
            <div className="space-y-2">
              <Label>Página</Label>
              <div className="grid grid-cols-2 gap-2">
                <Button
                  variant={currentPage === "content" ? "default" : "outline"}
                  onClick={() => setCurrentPage("content")}
                  className="text-xs"
                >
                  <Film className="mr-1 h-3 w-3" />
                  Conteúdo
                </Button>
                <Button
                  variant={currentPage === "signature" ? "default" : "outline"}
                  onClick={() => setCurrentPage("signature")}
                  className="text-xs"
                >
                  <User className="mr-1 h-3 w-3" />
                  Assinatura
                </Button>
              </div>
            </div>

            {/* Page Duration */}
            <div className="space-y-2">
              <Label>Duração por Página: {pageDuration}s</Label>
              <Slider
                value={[pageDuration]}
                onValueChange={(v) => setPageDuration(v[0])}
                min={3}
                max={30}
                step={1}
              />
            </div>

            {/* Tools */}
            <div className="space-y-2">
              <Label>Ferramentas</Label>
              <div className="grid grid-cols-3 gap-2">
                {tools.map((tool) => (
                  <Button
                    key={tool.id}
                    variant={selectedTool === tool.id ? "default" : "outline"}
                    size="sm"
                    onClick={() => setSelectedTool(tool.id)}
                    className="flex flex-col h-16 text-xs"
                  >
                    <tool.icon className="h-4 w-4 mb-1" />
                    {tool.label}
                  </Button>
                ))}
              </div>
            </div>

            {/* Placeholders */}
            <div className="space-y-2">
              <Label>Elementos de Marca</Label>
              <div className="grid grid-cols-3 gap-2">
                {placeholders.map((p) => (
                  <Button
                    key={p.id}
                    variant="outline"
                    size="sm"
                    onClick={() => addPlaceholder(p.type)}
                    className="flex flex-col h-16 text-xs"
                  >
                    <p.icon className="h-4 w-4 mb-1" />
                    {p.label}
                  </Button>
                ))}
              </div>
            </div>

            {/* Colors */}
            <div className="space-y-2">
              <Label>Cor do Fundo</Label>
              <div className="flex gap-2">
                <Input
                  type="color"
                  value={backgroundColor}
                  onChange={(e) => setBackgroundColor(e.target.value)}
                  className="w-12 h-10 p-1"
                />
                <Input
                  value={backgroundColor}
                  onChange={(e) => setBackgroundColor(e.target.value)}
                  className="flex-1"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Cor do Elemento</Label>
              <div className="flex gap-2">
                <Input
                  type="color"
                  value={currentColor}
                  onChange={(e) => setCurrentColor(e.target.value)}
                  className="w-12 h-10 p-1"
                />
                <Input
                  value={currentColor}
                  onChange={(e) => setCurrentColor(e.target.value)}
                  className="flex-1"
                />
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
                  </>
                )}

                {(selectedEl.type === "rect" ||
                  selectedEl.type === "circle" ||
                  selectedEl.type === "triangle" ||
                  selectedEl.type === "diamond" ||
                  selectedEl.type === "hexagon" ||
                  selectedEl.type === "pentagon" ||
                  selectedEl.type === "star") && (
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
                  selectedEl.type === "line") && (
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
                {(["rect", "circle", "triangle", "diamond", "hexagon", "pentagon", "star"].includes(selectedEl.type)) && (
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
                                <Input
                                  type="color"
                                  value={selectedEl.gradient.color1}
                                  onChange={(e) => updateSelectedElement({ 
                                    gradient: { ...selectedEl.gradient!, color1: e.target.value, color2: e.target.value }
                                  })}
                                  className="w-10 h-8 p-1"
                                />
                                <Label className="text-[10px] text-muted-foreground flex-1">Cor</Label>
                              </div>
                            </div>
                            
                            <div className="p-2 bg-muted/30 rounded space-y-2">
                              <Label className="text-[10px] text-muted-foreground">Direção do Fade</Label>
                              <div className="flex gap-2">
                                <Button
                                  variant={(selectedEl.gradient.opacity1 ?? 100) === 100 ? "default" : "outline"}
                                  size="sm"
                                  className="flex-1 h-7 text-xs"
                                  onClick={() => updateSelectedElement({ 
                                    gradient: { ...selectedEl.gradient!, opacity1: 100, opacity2: 0 }
                                  })}
                                >
                                  Cor → Trans
                                </Button>
                                <Button
                                  variant={(selectedEl.gradient.opacity1 ?? 100) === 0 ? "default" : "outline"}
                                  size="sm"
                                  className="flex-1 h-7 text-xs"
                                  onClick={() => updateSelectedElement({ 
                                    gradient: { ...selectedEl.gradient!, opacity1: 0, opacity2: 100 }
                                  })}
                                >
                                  Trans → Cor
                                </Button>
                              </div>
                            </div>
                          </div>
                        ) : (
                          /* Normal Mode - Two colors */
                          <>
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
                          </>
                        )}
                        
                        {/* Angle for linear gradient */}
                        {selectedEl.gradient.type === "linear" && (
                          <div>
                            <Label className="text-[10px] text-muted-foreground">
                              Ângulo: {selectedEl.gradient.angle || 0}°
                            </Label>
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
              </div>
            )}
          </div>
        </ScrollArea>

        {/* Generate Button */}
        <div className="p-4 border-t space-y-2">
          {onOpenHistory && (
            <Button variant="outline" className="w-full" onClick={onOpenHistory}>
              <History className="mr-2 h-4 w-4" />
              Histórico de Vídeos
            </Button>
          )}
          <Button className="w-full bg-gradient-primary" onClick={handleGenerateBatch}>
            <Play className="mr-2 h-4 w-4" />
            Gerar Vídeos em Lote
          </Button>
        </div>
      </div>

      {/* Canvas Area */}
      <div className="flex-1 flex items-center justify-center bg-muted/30 p-8 overflow-auto">
        <div className="relative shadow-2xl rounded-lg overflow-hidden">
          <canvas
            ref={canvasRef}
            width={CANVAS_WIDTH}
            height={CANVAS_HEIGHT}
            style={{
              width: CANVAS_WIDTH * SCALE,
              height: CANVAS_HEIGHT * SCALE,
              cursor: cursorStyle,
            }}
            onClick={handleCanvasClick}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
          />
        </div>
      </div>

      {/* Right Sidebar - Images */}
      <div className="w-72 border-l bg-card flex flex-col">
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
                {[...elements].reverse().map((el, index) => (
                  <div
                    key={el.id}
                    className={`p-2 rounded border cursor-pointer flex items-center justify-between ${
                      selectedElement === el.id ? "border-primary bg-primary/10" : "border-border"
                    }`}
                    onClick={() => setSelectedElement(el.id)}
                  >
                    <div className="flex items-center gap-2">
                      {el.type === "rect" && <Square className="h-4 w-4" />}
                      {el.type === "circle" && <Circle className="h-4 w-4" />}
                      {el.type === "text" && <Type className="h-4 w-4" />}
                      {el.type === "image" && <ImageIcon className="h-4 w-4" />}
                      {el.type === "logo" && <User className="h-4 w-4" />}
                      {el.type === "contact" && <Phone className="h-4 w-4" />}
                      {el.type === "mascot" && <Sparkles className="h-4 w-4" />}
                      <span className="text-sm capitalize truncate max-w-[100px]">
                        {el.type === "text" ? el.text?.substring(0, 15) : el.type}
                      </span>
                    </div>
                    <div className="flex gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 w-6 p-0"
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
                ))}
              </div>
            </ScrollArea>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};
