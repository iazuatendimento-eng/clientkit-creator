import { FFmpeg } from "@ffmpeg/ffmpeg";
import { fetchFile, toBlobURL } from "@ffmpeg/util";

// Video encoder using MediaRecorder API + FFmpeg for MP4 conversion
export type MotionEffect = "none" | "ken-burns" | "ken-burns-reverse" | "pulse" | "pulse-strong" | "float" | "float-diagonal" | "shake" | "shake-strong" | "sway" | "breathe" | "drift" | "wobble" | "zoom-pulse" | "pan-left" | "pan-right";
export type TransitionEffect = "fade" | "slide-left" | "slide-right" | "slide-up" | "slide-down" | "zoom" | "zoom-out";

export interface VideoEncoderOptions {
  width: number;
  height: number;
  pageDuration: number; // seconds per page
  transitionDuration?: number; // seconds for transition
  fps?: number;
  motionEffect?: MotionEffect;
  transitionEffect?: TransitionEffect;
  backgroundVideoUrls?: (string | null)[]; // Actual video URLs per page to use as animated background
  overlayPages?: string[]; // Transparent overlay pages for compositing on top of video
  onProgress?: (progress: number) => void;
}

let ffmpeg: FFmpeg | null = null;
let ffmpegLoading = false;

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timeoutId: number | undefined;
  const timeoutPromise = new Promise<T>((_, reject) => {
    timeoutId = window.setTimeout(() => reject(new Error(`Timeout: ${label}`)), ms);
  });

  return Promise.race([promise, timeoutPromise]).finally(() => {
    if (timeoutId) window.clearTimeout(timeoutId);
  }) as Promise<T>;
}

async function loadFFmpeg(): Promise<FFmpeg> {
  if (ffmpeg && ffmpeg.loaded) return ffmpeg;

  if (ffmpegLoading) {
    // Wait for existing load
    while (ffmpegLoading) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    if (ffmpeg && ffmpeg.loaded) return ffmpeg;
  }

  ffmpegLoading = true;

  try {
    ffmpeg = new FFmpeg();

    // Keep core version aligned with @ffmpeg/ffmpeg to reduce compatibility issues
    const baseURL = "https://unpkg.com/@ffmpeg/core@0.12.10/dist/esm";

    await withTimeout(
      ffmpeg.load({
        coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, "text/javascript"),
        wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, "application/wasm"),
      }),
      120_000,
      "carregar conversor MP4"
    );

    return ffmpeg;
  } finally {
    ffmpegLoading = false;
  }
}

function pickSupportedMimeType(candidates: string[]): string | null {
  for (const c of candidates) {
    if (MediaRecorder.isTypeSupported(c)) return c;
  }
  return null;
}

// Generate MP4 (best effort: native MediaRecorder MP4 when available, otherwise WebM->FFmpeg)
export async function encodeVideoToMP4(pages: string[], options: VideoEncoderOptions): Promise<Blob> {
  const { onProgress } = options;

  // Best path: some browsers support recording directly to MP4 via MediaRecorder
  const mp4Mime = pickSupportedMimeType([
    "video/mp4;codecs=avc1",
    "video/mp4",
  ]);

  if (mp4Mime) {
    onProgress?.(0.1);
    const mp4 = await withTimeout(
      encodeVideoSimple(pages, options, { mimeType: mp4Mime, outputType: "video/mp4" }),
      240_000,
      "gerar MP4 (nativo)"
    );
    onProgress?.(1);
    return mp4;
  }

  // Fallback: WebM first, then convert to MP4 with FFmpeg
  onProgress?.(0.1);
  const webmBlob = await withTimeout(encodeVideoSimple(pages, options), 240_000, "gerar WebM");

  onProgress?.(0.35);
  const ff = await loadFFmpeg();

  onProgress?.(0.55);
  const webmData = await fetchFile(webmBlob);
  await ff.writeFile("input.webm", webmData);

  // Convert WebM to MP4 with H.264 codec (Instagram compatible)
  await withTimeout(
    ff.exec([
      "-i",
      "input.webm",
      "-c:v",
      "libx264",
      "-preset",
      "fast",
      "-crf",
      "23",
      "-pix_fmt",
      "yuv420p",
      "-movflags",
      "+faststart",
      "output.mp4",
    ]),
    360_000,
    "converter para MP4"
  );

  onProgress?.(0.9);

  const mp4Data = await ff.readFile("output.mp4");
  const mp4Blob = new Blob([new Uint8Array(mp4Data as unknown as ArrayBuffer)], {
    type: "video/mp4",
  });

  // Cleanup
  await ff.deleteFile("input.webm");
  await ff.deleteFile("output.mp4");

  onProgress?.(1);

  return mp4Blob;
}

// Calculate motion transform based on effect and progress (0-1)
function getMotionTransform(effect: MotionEffect, progress: number): { scale: number; translateX: number; translateY: number; rotate: number } {
  const t = progress; // 0 to 1 within the page duration
  const cycle = Math.sin(t * Math.PI * 2); // Full cycle
  const halfCycle = Math.sin(t * Math.PI); // Half cycle (0 to 1 to 0)
  
  switch (effect) {
    case "ken-burns": {
      // Gradual zoom in and pan
      const scale = 1 + t * 0.15;
      const tx = Math.sin(t * Math.PI) * 3;
      const ty = Math.sin(t * Math.PI * 0.5) * 3;
      return { scale, translateX: tx, translateY: ty, rotate: 0 };
    }
    case "ken-burns-reverse": {
      const scale = 1.15 - t * 0.15;
      const tx = Math.sin(t * Math.PI) * -3;
      const ty = Math.sin(t * Math.PI * 0.5) * -3;
      return { scale, translateX: tx, translateY: ty, rotate: 0 };
    }
    case "pulse": {
      const scale = 1 + halfCycle * 0.02;
      return { scale, translateX: 0, translateY: 0, rotate: 0 };
    }
    case "pulse-strong": {
      const scale = 1 + halfCycle * 0.08;
      return { scale, translateX: 0, translateY: 0, rotate: 0 };
    }
    case "float": {
      const ty = Math.sin(t * Math.PI * 2) * -0.5;
      return { scale: 1, translateX: 0, translateY: ty, rotate: 0 };
    }
    case "float-diagonal": {
      const tx = Math.sin(t * Math.PI * 2) * 0.3;
      const ty = Math.cos(t * Math.PI * 2) * -0.5;
      return { scale: 1, translateX: tx, translateY: ty, rotate: 0 };
    }
    case "shake": {
      const tx = Math.sin(t * Math.PI * 8) * 0.2;
      return { scale: 1, translateX: tx, translateY: 0, rotate: 0 };
    }
    case "shake-strong": {
      const tx = Math.sin(t * Math.PI * 12) * 0.5;
      return { scale: 1, translateX: tx, translateY: 0, rotate: 0 };
    }
    case "sway": {
      const rotate = Math.sin(t * Math.PI * 2) * 2;
      return { scale: 1, translateX: 0, translateY: 0, rotate };
    }
    case "breathe": {
      const scale = 1 + halfCycle * 0.03;
      return { scale, translateX: 0, translateY: 0, rotate: 0 };
    }
    case "drift": {
      const tx = Math.sin(t * Math.PI * 2) * 0.3;
      const ty = Math.sin(t * Math.PI) * -0.3;
      const rotate = Math.sin(t * Math.PI * 2) * 0.5;
      return { scale: 1, translateX: tx, translateY: ty, rotate };
    }
    case "wobble": {
      const scale = 1 + Math.sin(t * Math.PI * 4) * 0.02;
      const rotate = Math.sin(t * Math.PI * 3) * 2;
      return { scale, translateX: 0, translateY: 0, rotate };
    }
    case "zoom-pulse": {
      const scale = 1 + halfCycle * 0.05;
      return { scale, translateX: 0, translateY: 0, rotate: 0 };
    }
    case "pan-left": {
      const tx = (1 - t) * 3 - 1.5; // From right to left
      return { scale: 1.05, translateX: tx, translateY: 0, rotate: 0 };
    }
    case "pan-right": {
      const tx = t * 3 - 1.5; // From left to right
      return { scale: 1.05, translateX: tx, translateY: 0, rotate: 0 };
    }
    default:
      return { scale: 1, translateX: 0, translateY: 0, rotate: 0 };
  }
}

// Apply transition effect
function applyTransition(
  ctx: CanvasRenderingContext2D,
  currentImg: HTMLImageElement,
  nextImg: HTMLImageElement,
  progress: number,
  effect: TransitionEffect,
  width: number,
  height: number
): void {
  switch (effect) {
    case "slide-left":
      ctx.drawImage(currentImg, -progress * width, 0, width, height);
      ctx.drawImage(nextImg, (1 - progress) * width, 0, width, height);
      break;
    case "slide-right":
      ctx.drawImage(currentImg, progress * width, 0, width, height);
      ctx.drawImage(nextImg, -(1 - progress) * width, 0, width, height);
      break;
    case "slide-up":
      ctx.drawImage(currentImg, 0, -progress * height, width, height);
      ctx.drawImage(nextImg, 0, (1 - progress) * height, width, height);
      break;
    case "slide-down":
      ctx.drawImage(currentImg, 0, progress * height, width, height);
      ctx.drawImage(nextImg, 0, -(1 - progress) * height, width, height);
      break;
    case "zoom": {
      const scale = 1 - progress * 0.5;
      ctx.globalAlpha = 1 - progress;
      ctx.drawImage(currentImg, (1 - scale) * width / 2, (1 - scale) * height / 2, width * scale, height * scale);
      ctx.globalAlpha = progress;
      ctx.drawImage(nextImg, 0, 0, width, height);
      ctx.globalAlpha = 1;
      break;
    }
    case "zoom-out": {
      const scale = 1 + progress * 0.5;
      ctx.globalAlpha = 1 - progress;
      ctx.drawImage(currentImg, (1 - scale) * width / 2, (1 - scale) * height / 2, width * scale, height * scale);
      ctx.globalAlpha = progress;
      ctx.drawImage(nextImg, 0, 0, width, height);
      ctx.globalAlpha = 1;
      break;
    }
    case "fade":
    default:
      ctx.globalAlpha = 1 - progress;
      ctx.drawImage(currentImg, 0, 0, width, height);
      ctx.globalAlpha = progress;
      ctx.drawImage(nextImg, 0, 0, width, height);
      ctx.globalAlpha = 1;
      break;
  }
}

export async function encodeVideoSimple(pages: string[], options: VideoEncoderOptions): Promise<Blob>;
export async function encodeVideoSimple(
  pages: string[],
  options: VideoEncoderOptions,
  extra?: { mimeType?: string; outputType?: string }
): Promise<Blob>;

// Simple encoder using MediaRecorder
export async function encodeVideoSimple(
  pages: string[],
  options: VideoEncoderOptions,
  extra?: { mimeType?: string; outputType?: string }
): Promise<Blob> {
  const { 
    width, 
    height, 
    pageDuration, 
    fps = 24, 
    motionEffect = "ken-burns",
    transitionEffect = "fade",
    backgroundVideoUrls,
    overlayPages,
    onProgress 
  } = options;

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d")!;

  // Load all images (static fallback for each page)
  const images: HTMLImageElement[] = await Promise.all(
    pages.map(
      (pageUrl, idx) =>
        new Promise<HTMLImageElement>((resolve, reject) => {
          const img = new Image();
          img.crossOrigin = "anonymous";
          img.onload = () => {
            console.log(`[VideoEncoder] Image ${idx} loaded: ${img.naturalWidth}x${img.naturalHeight}`);
            resolve(img);
          };
          img.onerror = (err) => {
            console.error(`[VideoEncoder] Image ${idx} failed to load:`, err);
            reject(err);
          };
          img.src = pageUrl;
        })
    )
  );

  // Load background videos for pages that have them
  const bgVideos: (HTMLVideoElement | null)[] = await Promise.all(
    (backgroundVideoUrls || []).map(async (videoUrl, idx) => {
      if (!videoUrl) return null;
      try {
        const video = document.createElement("video");
        video.crossOrigin = "anonymous";
        video.muted = true;
        video.playsInline = true;
        video.preload = "auto";
        video.src = videoUrl;
        
        await new Promise<void>((resolve, reject) => {
          video.onloadeddata = () => {
            console.log(`[VideoEncoder] Video ${idx} loaded: ${video.videoWidth}x${video.videoHeight}, duration: ${video.duration}s`);
            resolve();
          };
          video.onerror = () => {
            console.error(`[VideoEncoder] Video ${idx} failed to load`);
            reject(new Error(`Video ${idx} failed`));
          };
        });
        
        // Start playing (muted) so we can draw frames
        video.currentTime = 0;
        await video.play();
        
        return video;
      } catch (err) {
        console.error(`[VideoEncoder] Could not load video ${idx}:`, err);
        return null;
      }
    })
  );

  // Load overlay images (transparent PNGs for compositing on top of video)
  const overlayImages: (HTMLImageElement | null)[] = await Promise.all(
    (overlayPages || []).map(async (pageUrl) => {
      if (!pageUrl) return null;
      try {
        return await new Promise<HTMLImageElement>((resolve, reject) => {
          const img = new Image();
          img.crossOrigin = "anonymous";
          img.onload = () => resolve(img);
          img.onerror = reject;
          img.src = pageUrl;
        });
      } catch {
        return null;
      }
    })
  );

  // Pick mime
  const chosenMime =
    (extra?.mimeType && MediaRecorder.isTypeSupported(extra.mimeType) ? extra.mimeType : null) ||
    pickSupportedMimeType(["video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm"]) ||
    "video/webm";

  const outType = extra?.outputType || (chosenMime.startsWith("video/mp4") ? "video/mp4" : "video/webm");

  const stream = canvas.captureStream(fps);
  const mediaRecorder = new MediaRecorder(stream, {
    mimeType: chosenMime,
    videoBitsPerSecond: 4_000_000,
  });

  const chunks: Blob[] = [];
  mediaRecorder.ondataavailable = (e) => {
    if (e.data.size > 0) chunks.push(e.data);
  };

  return new Promise((resolve, reject) => {
    mediaRecorder.onstop = () => {
      // Cleanup: pause all background videos
      bgVideos.forEach(v => { if (v) { v.pause(); v.src = ""; } });
      resolve(new Blob(chunks, { type: outType }));
    };
    mediaRecorder.onerror = reject;
    mediaRecorder.start(250); // fewer callbacks = less overhead

    let pageIdx = 0;
    let frameCount = 0;
    const framesPerPage = Math.max(1, Math.floor(pageDuration * fps));
    const transitionFrames = Math.max(1, Math.floor(fps * 0.5)); // 0.5s transition
    const totalFrames = framesPerPage * images.length;

    // Track video start time per page to sync playback
    let pageVideoStartTime: number | null = null;

    console.log("[VideoEncoder] Config:", { 
      pages: images.length, width, height, pageDuration, fps, 
      framesPerPage, transitionFrames, totalFrames,
      motionEffect, transitionEffect, chosenMime,
      bgVideoCount: bgVideos.filter(Boolean).length,
    });

    const drawSource = (source: HTMLImageElement | HTMLVideoElement, applyMotion: boolean, progress: number) => {
      if (applyMotion) {
        const motion = getMotionTransform(motionEffect, progress);
        ctx.save();
        ctx.translate(width / 2, height / 2);
        ctx.rotate((motion.rotate * Math.PI) / 180);
        ctx.scale(motion.scale, motion.scale);
        ctx.translate(
          -width / 2 + (motion.translateX * width) / 100,
          -height / 2 + (motion.translateY * height) / 100
        );
        ctx.drawImage(source, 0, 0, width, height);
        ctx.restore();
      } else {
        ctx.drawImage(source, 0, 0, width, height);
      }
    };

    // Use a global frame counter across all pages
    let globalFrame = 0;

    const tick = () => {
      if (globalFrame >= totalFrames) {
        setTimeout(() => mediaRecorder.stop(), 200);
        return;
      }

      // Determine current page and frame within it
      pageIdx = Math.floor(globalFrame / framesPerPage);
      const frameInPage = globalFrame - (pageIdx * framesPerPage);

      if (pageIdx >= images.length) {
        setTimeout(() => mediaRecorder.stop(), 200);
        return;
      }

      const img = images[pageIdx];
      const nextImg = pageIdx + 1 < images.length ? images[pageIdx + 1] : null;
      const bgVideo = bgVideos[pageIdx] || null;

      const isTransitionPhase = frameInPage >= framesPerPage - transitionFrames && nextImg;
      const pageProgress = frameInPage / framesPerPage; // 0 to 1

      // Sync background video currentTime directly (don't rely on play())
      if (bgVideo && bgVideo.readyState >= 2) {
        const videoDuration = bgVideo.duration || pageDuration;
        // Map page progress to video time, looping if video is shorter
        bgVideo.currentTime = (pageProgress * pageDuration) % videoDuration;
      }

      ctx.fillStyle = "#000";
      ctx.fillRect(0, 0, width, height);

      if (isTransitionPhase && nextImg) {
        const transitionProgress = (frameInPage - (framesPerPage - transitionFrames)) / transitionFrames;
        applyTransition(ctx, img, nextImg, transitionProgress, transitionEffect, width, height);
      } else if (bgVideo && bgVideo.readyState >= 2) {
        // Draw the actual video frame as background
        try {
          const vw = bgVideo.videoWidth;
          const vh = bgVideo.videoHeight;
          const canvasRatio = width / height;
          const videoRatio = vw / vh;
          let sx = 0, sy = 0, sw = vw, sh = vh;
          if (videoRatio > canvasRatio) {
            sw = vh * canvasRatio;
            sx = (vw - sw) / 2;
          } else {
            sh = vw / canvasRatio;
            sy = (vh - sh) / 2;
          }

          // Draw video frame without extra motion (video itself is the motion)
          ctx.drawImage(bgVideo, sx, sy, sw, sh, 0, 0, width, height);

          // Draw overlay (transparent PNG with text/elements) on top
          const overlay = overlayImages[pageIdx];
          if (overlay) {
            ctx.globalAlpha = 1;
            ctx.drawImage(overlay, 0, 0, width, height);
          }
        } catch (e) {
          console.warn("[VideoEncoder] Video frame draw failed, using static:", e);
          drawSource(img, true, pageProgress);
        }
      } else {
        // No background video — use static image with motion effects
        drawSource(img, true, pageProgress);
      }

      globalFrame++;

      onProgress?.(Math.min(0.95, Math.max(0.05, globalFrame / totalFrames)));

      // Render at the requested fps
      setTimeout(tick, 1000 / fps);
    };

    // Pause all videos initially; we'll seek manually per frame
    bgVideos.forEach(v => { if (v) v.pause(); });

    tick();
  });
}
