import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Play, Pause, SkipBack, SkipForward, Settings } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

type TransitionEffect = "fade" | "slide-left" | "slide-right" | "slide-up" | "slide-down" | "zoom" | "zoom-out" | "flip" | "flip-vertical" | "rotate" | "rotate-reverse" | "blur" | "bounce" | "swing" | "spiral";
type MotionEffect = "none" | "ken-burns" | "ken-burns-reverse" | "pulse" | "pulse-strong" | "float" | "float-diagonal" | "shake" | "shake-strong" | "sway" | "breathe" | "drift" | "wobble" | "zoom-pulse" | "pan-left" | "pan-right";

interface VideoPreviewPlayerProps {
  pages: string[];
  pageDuration?: number;
  onPageChange?: (page: number) => void;
  className?: string;
}

export function VideoPreviewPlayer({
  pages,
  pageDuration = 3,
  onPageChange,
  className,
}: VideoPreviewPlayerProps) {
  const [currentPage, setCurrentPage] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [transition, setTransition] = useState<TransitionEffect>("fade");
  const [motion, setMotion] = useState<MotionEffect>("ken-burns");
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const intervalRef = useRef<number | null>(null);
  const transitionTimeoutRef = useRef<number | null>(null);

  useEffect(() => {
    if (isPlaying && pages.length > 1) {
      intervalRef.current = window.setInterval(() => {
        setIsTransitioning(true);
        
        // Wait for exit animation
        transitionTimeoutRef.current = window.setTimeout(() => {
          setCurrentPage((p) => (p + 1) % pages.length);
          
          // Reset transitioning after enter animation
          transitionTimeoutRef.current = window.setTimeout(() => {
            setIsTransitioning(false);
          }, 300);
        }, 300);
      }, pageDuration * 1000);

      return () => {
        if (intervalRef.current) window.clearInterval(intervalRef.current);
        if (transitionTimeoutRef.current) window.clearTimeout(transitionTimeoutRef.current);
      };
    }
  }, [isPlaying, pages.length, pageDuration]);

  useEffect(() => {
    onPageChange?.(currentPage);
  }, [currentPage, onPageChange]);

  const goToPage = (page: number) => {
    setIsPlaying(false);
    setIsTransitioning(true);
    setTimeout(() => {
      setCurrentPage(page);
      setTimeout(() => setIsTransitioning(false), 300);
    }, 200);
  };

  const getTransitionClass = () => {
    if (!isTransitioning) {
      switch (transition) {
        case "fade": return "opacity-100 scale-100";
        case "slide-left": return "translate-x-0 opacity-100";
        case "slide-right": return "translate-x-0 opacity-100";
        case "slide-up": return "translate-y-0 opacity-100";
        case "slide-down": return "translate-y-0 opacity-100";
        case "zoom": return "scale-100 opacity-100";
        case "zoom-out": return "scale-100 opacity-100";
        case "flip": return "rotate-y-0 opacity-100";
        case "flip-vertical": return "rotate-x-0 opacity-100";
        case "rotate": return "rotate-0 scale-100 opacity-100";
        case "rotate-reverse": return "rotate-0 scale-100 opacity-100";
        case "blur": return "opacity-100 blur-0";
        case "bounce": return "translate-y-0 opacity-100 scale-100";
        case "swing": return "rotate-0 opacity-100";
        case "spiral": return "rotate-0 scale-100 opacity-100";
        default: return "";
      }
    } else {
      switch (transition) {
        case "fade": return "opacity-0 scale-95";
        case "slide-left": return "-translate-x-full opacity-0";
        case "slide-right": return "translate-x-full opacity-0";
        case "slide-up": return "-translate-y-full opacity-0";
        case "slide-down": return "translate-y-full opacity-0";
        case "zoom": return "scale-50 opacity-0";
        case "zoom-out": return "scale-150 opacity-0";
        case "flip": return "rotate-y-90 opacity-0";
        case "flip-vertical": return "rotate-x-90 opacity-0";
        case "rotate": return "rotate-12 scale-75 opacity-0";
        case "rotate-reverse": return "-rotate-12 scale-75 opacity-0";
        case "blur": return "opacity-0 blur-lg";
        case "bounce": return "-translate-y-8 opacity-0 scale-90";
        case "swing": return "rotate-6 opacity-0";
        case "spiral": return "rotate-45 scale-50 opacity-0";
        default: return "opacity-0";
      }
    }
  };

  const getMotionClass = () => {
    if (isTransitioning) return "";
    
    switch (motion) {
      case "ken-burns": return "animate-ken-burns";
      case "ken-burns-reverse": return "animate-ken-burns-reverse";
      case "pulse": return "animate-pulse-subtle";
      case "pulse-strong": return "animate-pulse-strong";
      case "float": return "animate-float";
      case "float-diagonal": return "animate-float-diagonal";
      case "shake": return "animate-shake-subtle";
      case "shake-strong": return "animate-shake-strong";
      case "sway": return "animate-sway";
      case "breathe": return "animate-breathe";
      case "drift": return "animate-drift";
      case "wobble": return "animate-wobble";
      case "zoom-pulse": return "animate-zoom-pulse";
      case "pan-left": return "animate-pan-left";
      case "pan-right": return "animate-pan-right";
      default: return "";
    }
  };

  return (
    <div className={cn("flex flex-col gap-4", className)}>
      {/* Video Preview */}
      <div className="relative aspect-[9/16] bg-black rounded-lg overflow-hidden">
        {pages[currentPage] && (
          <div
            className={cn(
              "absolute inset-0 transition-all duration-300 ease-out",
              getTransitionClass()
            )}
          >
            <img
              src={pages[currentPage]}
              alt={`Página ${currentPage + 1}`}
              className={cn(
                "w-full h-full object-contain",
                getMotionClass()
              )}
              draggable={false}
            />
          </div>
        )}

        {/* Page indicator */}
        <div className="absolute top-3 right-3 bg-black/60 text-white text-xs px-2 py-1 rounded-full">
          {currentPage + 1} / {pages.length}
        </div>

        {/* Progress bar */}
        {isPlaying && (
          <div className="absolute bottom-0 left-0 right-0 h-1 bg-black/30">
            <div
              className="h-full bg-primary transition-all ease-linear"
              style={{
                animation: `progress ${pageDuration}s linear infinite`,
              }}
            />
          </div>
        )}
      </div>

      {/* Controls */}
      <div className="flex items-center justify-center gap-2">
        <Button
          variant="outline"
          size="icon"
          onClick={() => goToPage(Math.max(0, currentPage - 1))}
          disabled={currentPage === 0}
        >
          <SkipBack className="h-4 w-4" />
        </Button>
        
        <Button
          variant={isPlaying ? "default" : "outline"}
          size="icon"
          onClick={() => setIsPlaying(!isPlaying)}
          disabled={pages.length <= 1}
          className="w-12 h-12"
        >
          {isPlaying ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5" />}
        </Button>
        
        <Button
          variant="outline"
          size="icon"
          onClick={() => goToPage(Math.min(pages.length - 1, currentPage + 1))}
          disabled={currentPage === pages.length - 1}
        >
          <SkipForward className="h-4 w-4" />
        </Button>

        <Button
          variant="ghost"
          size="icon"
          onClick={() => setShowSettings(!showSettings)}
        >
          <Settings className="h-4 w-4" />
        </Button>
      </div>

      {/* Effect Settings */}
      {showSettings && (
        <div className="grid grid-cols-2 gap-4 p-3 bg-muted/50 rounded-lg animate-fade-in">
          <div className="space-y-2">
            <Label className="text-xs">Transição</Label>
            <Select value={transition} onValueChange={(v) => setTransition(v as TransitionEffect)}>
              <SelectTrigger className="h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="fade">Fade</SelectItem>
                <SelectItem value="slide-left">Deslizar Esquerda</SelectItem>
                <SelectItem value="slide-right">Deslizar Direita</SelectItem>
                <SelectItem value="slide-up">Deslizar Cima</SelectItem>
                <SelectItem value="slide-down">Deslizar Baixo</SelectItem>
                <SelectItem value="zoom">Zoom In</SelectItem>
                <SelectItem value="zoom-out">Zoom Out</SelectItem>
                <SelectItem value="flip">Virar Horizontal</SelectItem>
                <SelectItem value="flip-vertical">Virar Vertical</SelectItem>
                <SelectItem value="rotate">Rotacionar</SelectItem>
                <SelectItem value="rotate-reverse">Rotacionar Inverso</SelectItem>
                <SelectItem value="blur">Blur</SelectItem>
                <SelectItem value="bounce">Bounce</SelectItem>
                <SelectItem value="swing">Swing</SelectItem>
                <SelectItem value="spiral">Espiral</SelectItem>
              </SelectContent>
            </Select>
          </div>
          
          <div className="space-y-2">
            <Label className="text-xs">Movimento</Label>
            <Select value={motion} onValueChange={(v) => setMotion(v as MotionEffect)}>
              <SelectTrigger className="h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Nenhum</SelectItem>
                <SelectItem value="ken-burns">Ken Burns</SelectItem>
                <SelectItem value="ken-burns-reverse">Ken Burns Reverso</SelectItem>
                <SelectItem value="pulse">Pulsar Suave</SelectItem>
                <SelectItem value="pulse-strong">Pulsar Forte</SelectItem>
                <SelectItem value="float">Flutuar</SelectItem>
                <SelectItem value="float-diagonal">Flutuar Diagonal</SelectItem>
                <SelectItem value="shake">Tremer Suave</SelectItem>
                <SelectItem value="shake-strong">Tremer Forte</SelectItem>
                <SelectItem value="sway">Balançar</SelectItem>
                <SelectItem value="breathe">Respirar</SelectItem>
                <SelectItem value="drift">Deriva</SelectItem>
                <SelectItem value="wobble">Bambolear</SelectItem>
                <SelectItem value="zoom-pulse">Zoom Pulsar</SelectItem>
                <SelectItem value="pan-left">Pan Esquerda</SelectItem>
                <SelectItem value="pan-right">Pan Direita</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      )}

      {/* Thumbnails */}
      <div className="flex gap-2 overflow-x-auto pb-1 justify-center">
        {pages.map((page, idx) => (
          <button
            key={idx}
            type="button"
            className={cn(
              "shrink-0 rounded-md border overflow-hidden transition-all duration-200",
              currentPage === idx
                ? "border-primary ring-2 ring-primary/30 scale-105"
                : "border-border hover:border-primary/50"
            )}
            onClick={() => goToPage(idx)}
          >
            <img
              src={page}
              alt={`Página ${idx + 1}`}
              className="h-12 w-8 object-cover"
              loading="lazy"
            />
          </button>
        ))}
      </div>

      {/* CSS for animations */}
      <style>{`
        @keyframes progress {
          from { width: 0%; }
          to { width: 100%; }
        }
        
        @keyframes ken-burns {
          0% { transform: scale(1) translate(0, 0); }
          25% { transform: scale(1.05) translate(-1%, -1%); }
          50% { transform: scale(1.08) translate(1%, 1%); }
          75% { transform: scale(1.05) translate(-1%, 1%); }
          100% { transform: scale(1) translate(0, 0); }
        }
        
        @keyframes ken-burns-reverse {
          0% { transform: scale(1.08) translate(1%, 1%); }
          25% { transform: scale(1.05) translate(-1%, 1%); }
          50% { transform: scale(1) translate(0, 0); }
          75% { transform: scale(1.05) translate(1%, -1%); }
          100% { transform: scale(1.08) translate(1%, 1%); }
        }
        
        @keyframes pulse-subtle {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.02); }
        }
        
        @keyframes pulse-strong {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.08); }
        }
        
        @keyframes float {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-8px); }
        }
        
        @keyframes float-diagonal {
          0%, 100% { transform: translate(0, 0); }
          25% { transform: translate(5px, -5px); }
          50% { transform: translate(0, -10px); }
          75% { transform: translate(-5px, -5px); }
        }
        
        @keyframes shake-subtle {
          0%, 100% { transform: translateX(0); }
          25% { transform: translateX(-2px); }
          75% { transform: translateX(2px); }
        }
        
        @keyframes shake-strong {
          0%, 100% { transform: translateX(0); }
          10%, 30%, 50%, 70%, 90% { transform: translateX(-5px); }
          20%, 40%, 60%, 80% { transform: translateX(5px); }
        }
        
        @keyframes sway {
          0%, 100% { transform: rotate(-2deg); }
          50% { transform: rotate(2deg); }
        }
        
        @keyframes breathe {
          0%, 100% { transform: scale(1); opacity: 1; }
          50% { transform: scale(1.03); opacity: 0.95; }
        }
        
        @keyframes drift {
          0%, 100% { transform: translate(0, 0) rotate(0deg); }
          25% { transform: translate(3px, -3px) rotate(0.5deg); }
          50% { transform: translate(0, -5px) rotate(0deg); }
          75% { transform: translate(-3px, -3px) rotate(-0.5deg); }
        }
        
        @keyframes wobble {
          0%, 100% { transform: rotate(0deg) scale(1); }
          15% { transform: rotate(-3deg) scale(1.02); }
          30% { transform: rotate(2deg) scale(0.98); }
          45% { transform: rotate(-2deg) scale(1.01); }
          60% { transform: rotate(1deg) scale(0.99); }
          75% { transform: rotate(-1deg) scale(1); }
        }
        
        @keyframes zoom-pulse {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.05); }
        }
        
        @keyframes pan-left {
          0% { transform: translateX(3%); }
          100% { transform: translateX(-3%); }
        }
        
        @keyframes pan-right {
          0% { transform: translateX(-3%); }
          100% { transform: translateX(3%); }
        }
        
        .animate-ken-burns { animation: ken-burns 8s ease-in-out infinite; }
        .animate-ken-burns-reverse { animation: ken-burns-reverse 8s ease-in-out infinite; }
        .animate-pulse-subtle { animation: pulse-subtle 2s ease-in-out infinite; }
        .animate-pulse-strong { animation: pulse-strong 1.5s ease-in-out infinite; }
        .animate-float { animation: float 3s ease-in-out infinite; }
        .animate-float-diagonal { animation: float-diagonal 4s ease-in-out infinite; }
        .animate-shake-subtle { animation: shake-subtle 0.5s ease-in-out infinite; }
        .animate-shake-strong { animation: shake-strong 0.8s ease-in-out infinite; }
        .animate-sway { animation: sway 3s ease-in-out infinite; }
        .animate-breathe { animation: breathe 4s ease-in-out infinite; }
        .animate-drift { animation: drift 6s ease-in-out infinite; }
        .animate-wobble { animation: wobble 2s ease-in-out infinite; }
        .animate-zoom-pulse { animation: zoom-pulse 2s ease-in-out infinite; }
        .animate-pan-left { animation: pan-left 8s linear infinite alternate; }
        .animate-pan-right { animation: pan-right 8s linear infinite alternate; }
        
        .rotate-y-0 { transform: perspective(1000px) rotateY(0deg); }
        .rotate-y-90 { transform: perspective(1000px) rotateY(90deg); }
        .rotate-x-0 { transform: perspective(1000px) rotateX(0deg); }
        .rotate-x-90 { transform: perspective(1000px) rotateX(90deg); }
        .blur-lg { filter: blur(10px); }
        .blur-0 { filter: blur(0); }
      `}</style>
    </div>
  );
}
