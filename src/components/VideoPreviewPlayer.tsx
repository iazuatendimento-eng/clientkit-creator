import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Play, Pause, SkipBack, SkipForward } from "lucide-react";
import { cn } from "@/lib/utils";
import type { MotionEffect, TransitionEffect, TextAnimation, LogoAnimation } from "@/lib/videoEncoder";

interface VideoPreviewPlayerProps {
  pages: string[];
  pageDuration?: number;
  onPageChange?: (page: number) => void;
  className?: string;
  motionEffect?: MotionEffect;
  transitionEffect?: TransitionEffect;
  textAnimation?: TextAnimation;
  logoAnimation?: LogoAnimation;
  textAnimDuration?: number; // seconds for text animation (default 0.8)
  videoUrls?: (string | null)[];
  overlayPages?: string[];
  frameOverlayPages?: string[];
  logoOverlayPages?: string[];
  imageRect?: { left: number; top: number; width: number; height: number } | null;
}

export function VideoPreviewPlayer({
  pages,
  pageDuration = 3,
  onPageChange,
  className,
  motionEffect = "ken-burns",
  transitionEffect = "fade",
  textAnimation = "none",
  logoAnimation = "none",
  textAnimDuration = 0.8,
  videoUrls,
  overlayPages,
  frameOverlayPages,
  logoOverlayPages,
  imageRect,
}: VideoPreviewPlayerProps) {
  const [currentPage, setCurrentPage] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [pageStartTime, setPageStartTime] = useState(0);
  const intervalRef = useRef<number | null>(null);
  const transitionTimeoutRef = useRef<number | null>(null);
  const videoRefs = useRef<(HTMLVideoElement | null)[]>([]);

  const hasVideoForPage = (idx: number) => {
    return videoUrls?.[idx] && videoUrls[idx] !== null && videoUrls[idx] !== "";
  };

  useEffect(() => {
    if (isPlaying && pages.length > 1) {
      intervalRef.current = window.setInterval(() => {
        setIsTransitioning(true);
        
        transitionTimeoutRef.current = window.setTimeout(() => {
          setCurrentPage((p) => (p + 1) % pages.length);
          
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
    setPageStartTime(Date.now());
  }, [currentPage, onPageChange]);

  // Handle play/pause for current video
  useEffect(() => {
    const vid = videoRefs.current[0]; // Only one video element rendered at a time
    if (vid) {
      if (isPlaying) {
        vid.play().catch(() => {});
      } else {
        vid.pause();
      }
    }
  }, [isPlaying, currentPage]);

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
      switch (transitionEffect) {
        case "fade": return "opacity-100 scale-100";
        case "slide-left": return "translate-x-0 opacity-100";
        case "slide-right": return "translate-x-0 opacity-100";
        case "slide-up": return "translate-y-0 opacity-100";
        case "slide-down": return "translate-y-0 opacity-100";
        case "zoom": return "scale-100 opacity-100";
        case "zoom-out": return "scale-100 opacity-100";
        default: return "opacity-100";
      }
    } else {
      switch (transitionEffect) {
        case "fade": return "opacity-0 scale-95";
        case "slide-left": return "-translate-x-full opacity-0";
        case "slide-right": return "translate-x-full opacity-0";
        case "slide-up": return "-translate-y-full opacity-0";
        case "slide-down": return "translate-y-full opacity-0";
        case "zoom": return "scale-50 opacity-0";
        case "zoom-out": return "scale-150 opacity-0";
        default: return "opacity-0";
      }
    }
  };

  const getMotionClass = () => {
    if (isTransitioning) return "";
    
    switch (motionEffect) {
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

  const getTextAnimClass = () => {
    if (isTransitioning || textAnimation === "none") return "opacity-100";
    return `animate-text-${textAnimation}`;
  };

  const getLogoAnimClass = () => {
    if (isTransitioning || logoAnimation === "none") return "opacity-100";
    return `animate-logo-${logoAnimation}`;
  };

  const showVideoBackground = hasVideoForPage(currentPage);
  const currentOverlay = overlayPages?.[currentPage];
  const currentFrameOverlay = frameOverlayPages?.[currentPage];
  const currentLogoOverlay = logoOverlayPages?.[currentPage];
  const hasOverlay = currentOverlay && currentOverlay !== "";
  const hasFrameOverlay = currentFrameOverlay && currentFrameOverlay !== "";
  const hasLogoOverlay = currentLogoOverlay && currentLogoOverlay !== "";

  return (
    <div className={cn("flex flex-col gap-4", className)}>
      {/* Video Preview */}
      <div className="relative aspect-[9/16] bg-black rounded-lg overflow-hidden">
        {/* Background layer: video or static image */}
        <div
          className={cn(
            "absolute inset-0 transition-all duration-300 ease-out",
            getTransitionClass()
          )}
        >
        {/* Layer 0: Base static page image (z-0) */}
          <img
            src={pages[currentPage]}
            alt={`Página ${currentPage + 1}`}
            className={cn("w-full h-full object-contain z-0", showVideoBackground ? "" : getMotionClass())}
            draggable={false}
          />

          {/* Layer 1: Video background within image placeholder (z-[1]) */}
          {showVideoBackground && (
            <div
              className="absolute overflow-hidden z-[1]"
              style={imageRect ? {
                left: `${imageRect.left}%`, top: `${imageRect.top}%`,
                width: `${imageRect.width}%`, height: `${imageRect.height}%`,
              } : { left: 0, top: 0, width: '100%', height: '100%' }}
            >
              <video
                key={`video-bg-${currentPage}`}
                ref={(el) => { videoRefs.current[0] = el; if (el) { el.play().catch(() => {}); } }}
                src={videoUrls![currentPage]!}
                className={cn("w-full h-full object-cover", getMotionClass())}
                muted
                loop
                playsInline
                crossOrigin="anonymous"
                onError={() => console.warn(`[VideoPreview] Video failed to load for page ${currentPage}`)}
              />
            </div>
          )}

          {/* Layer 2: Frame overlay - static shapes (z-[2]) */}
          {hasFrameOverlay && (
            <img
              key={`frame-${currentPage}`}
              src={currentFrameOverlay}
              alt=""
              className="absolute inset-0 w-full h-full object-contain z-[2] pointer-events-none"
              draggable={false}
            />
          )}

          {/* Layer 3: Text overlay (z-[3]) */}
          {hasOverlay && (
            <img
              key={`overlay-${currentPage}-${pageStartTime}`}
              src={currentOverlay}
              alt=""
              className={cn("absolute inset-0 w-full h-full object-contain z-[3]", getTextAnimClass())}
              style={{ animationDuration: `${textAnimDuration}s` }}
              draggable={false}
            />
          )}

          {/* Layer 4: Logo overlay (z-[4]) */}
          {hasLogoOverlay && (
            <img
              key={`logo-${currentPage}-${pageStartTime}`}
              src={currentLogoOverlay}
              alt=""
              className={cn("absolute inset-0 w-full h-full object-contain z-[4]", getLogoAnimClass())}
              draggable={false}
            />
          )}
        </div>

        {/* Page indicator */}
        <div className="absolute top-3 right-3 bg-black/60 text-white text-xs px-2 py-1 rounded-full z-10">
          {currentPage + 1} / {pages.length}
        </div>

        {/* Progress bar */}
        {isPlaying && (
          <div className="absolute bottom-0 left-0 right-0 h-1 bg-black/30 z-10">
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
      </div>

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
        
        @keyframes float-anim {
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
        .animate-float { animation: float-anim 3s ease-in-out infinite; }
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

        /* Text animations */
        @keyframes text-fade-in { from { opacity: 0; } to { opacity: 1; } }
        @keyframes text-slide-up { from { opacity: 0; transform: translateY(30%); } to { opacity: 1; transform: translateY(0); } }
        @keyframes text-slide-down { from { opacity: 0; transform: translateY(-30%); } to { opacity: 1; transform: translateY(0); } }
        @keyframes text-slide-left { from { opacity: 0; transform: translateX(30%); } to { opacity: 1; transform: translateX(0); } }
        @keyframes text-slide-right { from { opacity: 0; transform: translateX(-30%); } to { opacity: 1; transform: translateX(0); } }
        @keyframes text-scale-in { from { opacity: 0; transform: scale(0.3); } to { opacity: 1; transform: scale(1); } }
        @keyframes text-bounce-in { 
          0% { opacity: 0; transform: scale(0.2) translateY(20%); }
          40% { opacity: 1; transform: scale(1.15); }
          55% { transform: scale(0.9); }
          70% { transform: scale(1.05); }
          85% { transform: scale(0.97); }
          100% { opacity: 1; transform: scale(1) translateY(0); }
        }
        @keyframes text-rotate-in {
          from { opacity: 0; transform: rotate(15deg) scale(0.7) translate(-10%, 10%); }
          to { opacity: 1; transform: rotate(0deg) scale(1) translate(0, 0); }
        }
        @keyframes text-blur-in {
          from { opacity: 0; filter: blur(20px); transform: scale(1.05); }
          to { opacity: 1; filter: blur(0px); transform: scale(1); }
        }
        @keyframes text-drop-in {
          0% { opacity: 0; transform: translateY(-50%); }
          40% { opacity: 1; transform: translateY(0); }
          55% { transform: translateY(-8%); }
          70% { transform: translateY(0); }
          80% { transform: translateY(-3%); }
          100% { opacity: 1; transform: translateY(0); }
        }
        @keyframes text-swing-in {
          0% { opacity: 0; transform: translateX(-20%); }
          20% { transform: translateX(15%); }
          40% { transform: translateX(-10%); }
          60% { transform: translateX(5%); }
          80% { transform: translateX(-2%); }
          100% { opacity: 1; transform: translateX(0); }
        }
        @keyframes text-elastic-in {
          0% { opacity: 0; transform: scale(0.3); }
          30% { transform: scale(1.15); }
          45% { transform: scale(0.85); }
          60% { opacity: 1; transform: scale(1.08); }
          75% { transform: scale(0.95); }
          100% { opacity: 1; transform: scale(1); }
        }
        @keyframes text-flip-in {
          0% { opacity: 0; transform: perspective(400px) rotateX(90deg) translateY(15%); }
          40% { transform: perspective(400px) rotateX(-15deg); }
          60% { opacity: 1; transform: perspective(400px) rotateX(8deg); }
          80% { transform: perspective(400px) rotateX(-3deg); }
          100% { opacity: 1; transform: perspective(400px) rotateX(0deg) translateY(0); }
        }

        .animate-text-fade-in { animation: text-fade-in ease-out forwards; }
        .animate-text-slide-up { animation: text-slide-up ease-out forwards; }
        .animate-text-slide-down { animation: text-slide-down ease-out forwards; }
        .animate-text-slide-left { animation: text-slide-left ease-out forwards; }
        .animate-text-slide-right { animation: text-slide-right ease-out forwards; }
        .animate-text-scale-in { animation: text-scale-in ease-out forwards; }
        .animate-text-bounce-in { animation: text-bounce-in ease-out forwards; }
        .animate-text-rotate-in { animation: text-rotate-in ease-out forwards; }
        .animate-text-blur-in { animation: text-blur-in ease-out forwards; }
        .animate-text-drop-in { animation: text-drop-in ease-out forwards; }
        .animate-text-swing-in { animation: text-swing-in ease-out forwards; }
        .animate-text-elastic-in { animation: text-elastic-in ease-out forwards; }
        .animate-text-flip-in { animation: text-flip-in ease-out forwards; }

        /* Logo animations */
        @keyframes logo-fade-in { from { opacity: 0; } to { opacity: 1; } }
        @keyframes logo-slide-up { from { opacity: 0; transform: translateY(20%); } to { opacity: 1; transform: translateY(0); } }
        @keyframes logo-slide-down { from { opacity: 0; transform: translateY(-20%); } to { opacity: 1; transform: translateY(0); } }
        @keyframes logo-slide-left { from { opacity: 0; transform: translateX(20%); } to { opacity: 1; transform: translateX(0); } }
        @keyframes logo-slide-right { from { opacity: 0; transform: translateX(-20%); } to { opacity: 1; transform: translateX(0); } }
        @keyframes logo-scale-in { from { opacity: 0; transform: scale(0.3); } to { opacity: 1; transform: scale(1); } }
        @keyframes logo-bounce-in { 
          0% { opacity: 0; transform: scale(0.2); }
          50% { opacity: 1; transform: scale(1.15); }
          70% { transform: scale(0.9); }
          100% { opacity: 1; transform: scale(1); }
        }
        @keyframes logo-spin-in { 
          from { opacity: 0; transform: scale(0.3) rotate(360deg); } 
          to { opacity: 1; transform: scale(1) rotate(0deg); } 
        }
        @keyframes logo-flip-in { 
          0% { opacity: 0; transform: perspective(400px) rotateY(90deg); }
          40% { transform: perspective(400px) rotateY(-20deg); }
          60% { opacity: 1; transform: perspective(400px) rotateY(10deg); }
          80% { transform: perspective(400px) rotateY(-5deg); }
          100% { opacity: 1; transform: perspective(400px) rotateY(0deg); }
        }
        @keyframes logo-swing { 
          0% { opacity: 0; transform: rotate(15deg); }
          30% { transform: rotate(-10deg); }
          50% { opacity: 1; transform: rotate(5deg); }
          70% { transform: rotate(-3deg); }
          100% { opacity: 1; transform: rotate(0deg); }
        }

        .animate-logo-fade-in { animation: logo-fade-in 0.9s ease-out forwards; }
        .animate-logo-slide-up { animation: logo-slide-up 0.9s ease-out forwards; }
        .animate-logo-slide-down { animation: logo-slide-down 0.9s ease-out forwards; }
        .animate-logo-slide-left { animation: logo-slide-left 0.9s ease-out forwards; }
        .animate-logo-slide-right { animation: logo-slide-right 0.9s ease-out forwards; }
        .animate-logo-scale-in { animation: logo-scale-in 0.9s ease-out forwards; }
        .animate-logo-bounce-in { animation: logo-bounce-in 0.9s ease-out forwards; }
        .animate-logo-spin-in { animation: logo-spin-in 1s ease-out forwards; }
        .animate-logo-flip-in { animation: logo-flip-in 1s ease forwards; }
        .animate-logo-swing { animation: logo-swing 1s ease-out forwards; }
      `}</style>
    </div>
  );
}
