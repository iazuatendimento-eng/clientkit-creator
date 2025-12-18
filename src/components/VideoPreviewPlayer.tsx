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

type TransitionEffect = "fade" | "slide-left" | "slide-right" | "slide-up" | "zoom" | "flip" | "rotate";
type MotionEffect = "none" | "ken-burns" | "pulse" | "float" | "shake";

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
        case "fade":
          return "opacity-100 scale-100";
        case "slide-left":
          return "translate-x-0 opacity-100";
        case "slide-right":
          return "translate-x-0 opacity-100";
        case "slide-up":
          return "translate-y-0 opacity-100";
        case "zoom":
          return "scale-100 opacity-100";
        case "flip":
          return "rotate-y-0 opacity-100";
        case "rotate":
          return "rotate-0 scale-100 opacity-100";
        default:
          return "";
      }
    } else {
      switch (transition) {
        case "fade":
          return "opacity-0 scale-95";
        case "slide-left":
          return "-translate-x-full opacity-0";
        case "slide-right":
          return "translate-x-full opacity-0";
        case "slide-up":
          return "-translate-y-full opacity-0";
        case "zoom":
          return "scale-50 opacity-0";
        case "flip":
          return "rotate-y-90 opacity-0";
        case "rotate":
          return "rotate-12 scale-75 opacity-0";
        default:
          return "opacity-0";
      }
    }
  };

  const getMotionClass = () => {
    if (isTransitioning) return "";
    
    switch (motion) {
      case "ken-burns":
        return "animate-ken-burns";
      case "pulse":
        return "animate-pulse-subtle";
      case "float":
        return "animate-float";
      case "shake":
        return "animate-shake-subtle";
      default:
        return "";
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
                <SelectItem value="zoom">Zoom</SelectItem>
                <SelectItem value="flip">Virar</SelectItem>
                <SelectItem value="rotate">Rotacionar</SelectItem>
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
                <SelectItem value="pulse">Pulsar</SelectItem>
                <SelectItem value="float">Flutuar</SelectItem>
                <SelectItem value="shake">Tremer</SelectItem>
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
        
        @keyframes pulse-subtle {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.02); }
        }
        
        @keyframes float {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-8px); }
        }
        
        @keyframes shake-subtle {
          0%, 100% { transform: translateX(0); }
          25% { transform: translateX(-2px); }
          75% { transform: translateX(2px); }
        }
        
        .animate-ken-burns {
          animation: ken-burns 8s ease-in-out infinite;
        }
        
        .animate-pulse-subtle {
          animation: pulse-subtle 2s ease-in-out infinite;
        }
        
        .animate-float {
          animation: float 3s ease-in-out infinite;
        }
        
        .animate-shake-subtle {
          animation: shake-subtle 0.5s ease-in-out infinite;
        }
        
        .rotate-y-0 {
          transform: perspective(1000px) rotateY(0deg);
        }
        
        .rotate-y-90 {
          transform: perspective(1000px) rotateY(90deg);
        }
      `}</style>
    </div>
  );
}
