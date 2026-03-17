import { FFmpeg } from "@ffmpeg/ffmpeg";
import { fetchFile, toBlobURL } from "@ffmpeg/util";
import { Muxer, ArrayBufferTarget } from "mp4-muxer";
// Video encoder using MediaRecorder API + FFmpeg for MP4 conversion
export type MotionEffect = "none" | "ken-burns" | "ken-burns-reverse" | "pulse" | "pulse-strong" | "float" | "float-diagonal" | "shake" | "shake-strong" | "sway" | "breathe" | "drift" | "wobble" | "zoom-pulse" | "pan-left" | "pan-right";
export type TransitionEffect = "fade" | "slide-left" | "slide-right" | "slide-up" | "slide-down" | "zoom" | "zoom-out";
export type TextAnimation = "none" | "fade-in" | "slide-up" | "slide-down" | "slide-left" | "slide-right" | "scale-in" | "typewriter" | "bounce-in" | "rotate-in" | "blur-in" | "drop-in" | "swing-in" | "elastic-in" | "flip-in" | "rise" | "pop" | "flow" | "breathe-in" | "tectonic" | "drift-in" | "wipe-left" | "wipe-right" | "stomp" | "tumble" | "zoom-out-in" | "glitch" | "panorama";
export type LogoAnimation = "none" | "fade-in" | "slide-up" | "slide-down" | "slide-left" | "slide-right" | "scale-in" | "bounce-in" | "spin-in" | "flip-in" | "swing" | "rise" | "pop" | "flow" | "breathe-in" | "tectonic" | "stomp" | "tumble" | "zoom-out-in" | "glitch";

export interface VideoEncoderOptions {
  width: number;
  height: number;
  pageDuration: number; // seconds per page
  transitionDuration?: number; // seconds for transition
  fps?: number;
  motionEffect?: MotionEffect;
  transitionEffect?: TransitionEffect;
  textAnimation?: TextAnimation;
  logoAnimation?: LogoAnimation;
  textAnimDuration?: number; // 0-1 fraction of page duration for text animation (default 0.3)
  backgroundVideoUrls?: (string | null)[]; // Actual video URLs per page to use as animated background
  frameOverlayPages?: string[]; // Transparent frame overlay pages (decorative shapes - static)
  overlayPages?: string[]; // Transparent overlay pages for compositing on top of video
  logoOverlayPages?: string[]; // Transparent logo-only overlay pages
  imageRect?: { left: number; top: number; width: number; height: number } | null; // Image placeholder rect as percentages
  pageImageAdjustments?: { imageX: number; imageY: number; imageScale: number }[]; // Per-page image position/scale adjustments
  imageClipShape?: string; // Geometric clip shape for image placeholder (circle, triangle, diamond, etc.)
  audioUrl?: string; // URL of background audio to mix into the video
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

export async function loadFFmpeg(): Promise<FFmpeg> {
  if (ffmpeg && ffmpeg.loaded) return ffmpeg;

  if (ffmpegLoading) {
    while (ffmpegLoading) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    if (ffmpeg && ffmpeg.loaded) return ffmpeg;
  }

  ffmpegLoading = true;

  try {
    ffmpeg = new FFmpeg();

    const baseURL = "https://unpkg.com/@ffmpeg/core@0.12.10/dist/esm";

    // Pre-fetch URLs in parallel first
    const [coreURL, wasmURL] = await Promise.all([
      toBlobURL(`${baseURL}/ffmpeg-core.js`, "text/javascript"),
      toBlobURL(`${baseURL}/ffmpeg-core.wasm`, "application/wasm"),
    ]);

    await withTimeout(
      ffmpeg.load({ coreURL, wasmURL }),
      180_000,
      "carregar conversor MP4"
    );

    return ffmpeg;
  } catch (err) {
    // Reset so next call can retry
    ffmpeg = null;
    throw err;
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

function inferAudioExt(audioUrl: string, mimeType?: string): "mp3" | "wav" | "ogg" | "m4a" {
  const normalizedUrl = audioUrl.toLowerCase().split("?")[0].split("#")[0];
  const normalizedMime = (mimeType || "").toLowerCase();

  if (normalizedUrl.endsWith(".wav") || normalizedMime.includes("wav")) return "wav";
  if (normalizedUrl.endsWith(".ogg") || normalizedMime.includes("ogg")) return "ogg";
  if (
    normalizedUrl.endsWith(".m4a") ||
    normalizedUrl.endsWith(".aac") ||
    normalizedUrl.endsWith(".mp4") ||
    normalizedMime.includes("mp4") ||
    normalizedMime.includes("aac") ||
    normalizedMime.includes("m4a")
  ) return "m4a";

  return "mp3";
}

// Generate MP4 (best effort: native MediaRecorder MP4 when available, otherwise WebM->FFmpeg)
// Check if blob is actually MP4 by verifying ftyp box header
async function isValidMP4(blob: Blob): Promise<boolean> {
  try {
    const header = await blob.slice(0, 12).arrayBuffer();
    const view = new Uint8Array(header);
    const ftyp = String.fromCharCode(view[4], view[5], view[6], view[7]);
    console.log("[VideoEncoder] File header check:", ftyp, "size:", blob.size);
    return ftyp === "ftyp";
  } catch {
    return false;
  }
}

// Patch MP4 ftyp box: change major_brand to "isom" for WhatsApp compatibility
async function patchMP4Brand(blob: Blob): Promise<Blob> {
  try {
    const buffer = await blob.arrayBuffer();
    const view = new Uint8Array(buffer);
    
    const ftyp = String.fromCharCode(view[4], view[5], view[6], view[7]);
    if (ftyp !== "ftyp") return blob;
    
    const currentBrand = String.fromCharCode(view[8], view[9], view[10], view[11]);
    console.log("[VideoEncoder] Current major brand:", currentBrand);
    
    if (currentBrand === "isom") return blob;
    
    // Patch major brand to "isom" (bytes 8-11)
    view[8] = 105; view[9] = 115; view[10] = 111; view[11] = 109;
    
    console.log("[VideoEncoder] Patched brand from", currentBrand, "to isom");
    return new Blob([view], { type: "video/mp4" });
  } catch (err) {
    console.error("[VideoEncoder] Failed to patch brand:", err);
    return blob;
  }
}

// Check if WebCodecs VideoEncoder is available AND supports H.264
async function checkWebCodecsSupport(): Promise<boolean> {
  try {
    if (typeof VideoEncoder === "undefined" || typeof VideoFrame === "undefined") {
      console.log("[WebCodecs] Not available in this browser");
      return false;
    }
    const support = await VideoEncoder.isConfigSupported({
      codec: "avc1.42001f",
      width: 640,
      height: 480,
      bitrate: 1_000_000,
      framerate: 15,
    });
    console.log("[WebCodecs] H.264 support:", support.supported);
    return !!support.supported;
  } catch (e) {
    console.warn("[WebCodecs] Support check failed:", e);
    return false;
  }
}

function hasWebCodecs(): boolean {
  return typeof VideoEncoder !== "undefined" && typeof VideoFrame !== "undefined";
}

// WebCodecs-based encoder using mp4-muxer — bypasses broken MediaRecorder entirely
export async function encodeWithWebCodecs(
  pages: string[],
  options: VideoEncoderOptions,
  renderFrame: (canvas: HTMLCanvasElement | OffscreenCanvas, ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D, frameNum: number) => void,
  totalFrames: number,
): Promise<Blob> {
  const { width, height, fps = 24, onProgress } = options;

  console.log("[WebCodecs] Starting encode:", { width, height, fps, totalFrames });

  const muxer = new Muxer({
    target: new ArrayBufferTarget(),
    video: {
      codec: "avc",
      width,
      height,
    },
    fastStart: "in-memory",
  });

  let framesEncoded = 0;
  const encoder = new VideoEncoder({
    output: (chunk, meta) => {
      muxer.addVideoChunk(chunk, meta ?? undefined);
      framesEncoded++;
    },
    error: (e) => console.error("[WebCodecs] Encoder error:", e),
  });

  // Use Baseline profile for maximum compatibility (WhatsApp, iOS, etc.)
  encoder.configure({
    codec: "avc1.42001f", // H.264 Baseline Level 3.1
    width,
    height,
    bitrate: 4_000_000,
    framerate: fps,
    hardwareAcceleration: "prefer-hardware",
  });

  // Use OffscreenCanvas if available, else regular canvas
  let canvas: HTMLCanvasElement | OffscreenCanvas;
  let ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
  
  if (typeof OffscreenCanvas !== "undefined") {
    canvas = new OffscreenCanvas(width, height);
    ctx = canvas.getContext("2d")!;
  } else {
    const c = document.createElement("canvas");
    c.width = width;
    c.height = height;
    canvas = c;
    ctx = c.getContext("2d")!;
  }

  const frameDurationMicros = Math.round(1_000_000 / fps);

  for (let i = 0; i < totalFrames; i++) {
    // Render the frame onto the canvas
    renderFrame(canvas, ctx, i);

    // Create VideoFrame from canvas
    const frame = new VideoFrame(canvas as any, {
      timestamp: i * frameDurationMicros,
      duration: frameDurationMicros,
    });

    // Encode — keyFrame every 2 seconds
    const keyFrame = i % (fps * 2) === 0;
    encoder.encode(frame, { keyFrame });
    frame.close();

    // Yield to UI periodically to avoid blocking
    if (i % 5 === 0) {
      onProgress?.(Math.min(0.95, 0.05 + 0.9 * (i / totalFrames)));
      await new Promise((r) => setTimeout(r, 0));
    }

    // Back-pressure: if encoder queue gets too large, wait
    if (encoder.encodeQueueSize > 10) {
      await new Promise((r) => setTimeout(r, 10));
    }
  }

  // Flush remaining frames
  await encoder.flush();
  encoder.close();
  muxer.finalize();

  const buffer = (muxer.target as ArrayBufferTarget).buffer!;
  const blob = new Blob([buffer], { type: "video/mp4" });
  console.log("[WebCodecs] Done! Encoded", framesEncoded, "frames, size:", blob.size);
  onProgress?.(1);
  return blob;
}

export async function encodeVideoToMP4(pages: string[], options: VideoEncoderOptions): Promise<Blob> {
  const { onProgress, audioUrl } = options;
  const isMobileDevice = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

  console.log("[VideoEncoder] Starting encode. mobile:", isMobileDevice, "webcodecs:", hasWebCodecs());
  onProgress?.(0.05);

  // ====== ALL DEVICES: Try WebCodecs first (most reliable — each frame is encoded directly) ======
  if (hasWebCodecs()) {
    console.log("[VideoEncoder] Using WebCodecs path (direct frame encoding)");

    const attempts: { label: string; opts: VideoEncoderOptions }[] = [
      { label: "full-res", opts: options },
    ];

    // Add reduced resolution fallback for large canvases
    if (options.width > 720 || options.height > 1280) {
      const scale = Math.min(720 / options.width, 1280 / options.height, 1);
      const rw = Math.round(options.width * scale / 2) * 2;
      const rh = Math.round(options.height * scale / 2) * 2;
      attempts.push({ label: `reduced-${rw}x${rh}`, opts: { ...options, width: rw, height: rh } });
    }

    for (const attempt of attempts) {
      try {
        onProgress?.(0.07);
        console.log("[VideoEncoder] WebCodecs attempt:", attempt.label, attempt.opts.width, "x", attempt.opts.height);
        const rawBlob = await withTimeout(
          encodeVideoWithWebCodecs(pages, attempt.opts),
          600_000,
          "gerar vídeo (WebCodecs)"
        );
        console.log("[VideoEncoder] WebCodecs SUCCESS!", attempt.label, "blob size:", rawBlob.size);

        // Desktop: only run FFmpeg when we actually need to mux audio.
        if (!isMobileDevice) {
          if (!audioUrl) {
            const patched = await patchMP4Brand(rawBlob);
            onProgress?.(1);
            return patched;
          }

          try {
            const ff = await loadFFmpeg();
            onProgress?.(0.7);
            await ff.writeFile("input.mp4", await fetchFile(rawBlob));

            let hasAudio = false;
            let audioFileName: string | null = null;
            if (audioUrl) {
              try {
                console.log("[VideoEncoder] Fetching audio:", audioUrl.substring(0, 80));
                const audioResponse = await fetch(audioUrl);
                if (audioResponse.ok) {
                  const audioBlob = await audioResponse.blob();
                  if (audioBlob.size > 0) {
                    const audioExt = inferAudioExt(audioUrl, audioBlob.type);
                    audioFileName = `audio.${audioExt}`;
                    await ff.writeFile(audioFileName, await fetchFile(audioBlob));
                    hasAudio = true;
                    console.log(`[VideoEncoder] Audio loaded: ${audioBlob.size} bytes (${audioExt})`);
                  }
                }
              } catch (audioErr) {
                console.warn("[VideoEncoder] Failed to fetch audio:", audioErr);
              }
            }

            const ffmpegArgs = hasAudio && audioFileName
              ? ["-i", "input.mp4", "-stream_loop", "-1", "-i", audioFileName, "-map", "0:v:0", "-map", "1:a:0", "-c:v", "copy", "-c:a", "aac", "-b:a", "128k", "-shortest", "-movflags", "+faststart", "-f", "mp4", "output.mp4"]
              : ["-i", "input.mp4", "-c:v", "copy", "-c:a", "copy", "-movflags", "+faststart", "-f", "mp4", "output.mp4"];

            await withTimeout(ff.exec(ffmpegArgs), 180_000, hasAudio ? "muxar vídeo + áudio" : "remux faststart");
            onProgress?.(0.9);

            const mp4Data = await ff.readFile("output.mp4");
            let mp4Blob = new Blob([new Uint8Array(mp4Data as unknown as ArrayBuffer)], { type: "video/mp4" });
            await ff.deleteFile("input.mp4").catch(() => {});
            await ff.deleteFile("output.mp4").catch(() => {});
            if (hasAudio && audioFileName) await ff.deleteFile(audioFileName).catch(() => {});
            mp4Blob = await patchMP4Brand(mp4Blob);

            if (await isValidMP4(mp4Blob)) {
              console.log("[VideoEncoder] Remuxed MP4 size:", mp4Blob.size);
              onProgress?.(1);
              return mp4Blob;
            }
          } catch (err) {
            console.warn("[VideoEncoder] FFmpeg remux failed, using raw WebCodecs output:", err);
          }

          // If FFmpeg failed, return raw WebCodecs output
          const patched = await patchMP4Brand(rawBlob);
          onProgress?.(1);
          return patched;
        }

        // Mobile: return directly (no FFmpeg needed)
        onProgress?.(1);
        return rawBlob;
      } catch (wcErr) {
        console.error("[VideoEncoder] WebCodecs FAILED (" + attempt.label + "):", wcErr);
        if (attempt === attempts[attempts.length - 1]) {
          // On mobile, no fallback — throw error
          if (isMobileDevice) {
            throw new Error("Falha ao gerar vídeo: " + (wcErr instanceof Error ? wcErr.message : String(wcErr)));
          }
          // On desktop, fall through to MediaRecorder fallback
          console.log("[VideoEncoder] All WebCodecs attempts failed, trying MediaRecorder fallback...");
        }
        onProgress?.(0.05);
      }
    }
  }

  // ====== DESKTOP FALLBACK: MediaRecorder (only if WebCodecs unavailable/failed) ======
  const mp4Mime = pickSupportedMimeType(["video/mp4;codecs=avc1", "video/mp4"]);
  const webmMime = pickSupportedMimeType(["video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm"]);
  const recordMime = mp4Mime || webmMime || "video/webm";

  console.log("[VideoEncoder] MediaRecorder fallback, MIME:", recordMime);
  onProgress?.(0.1);

  if (mp4Mime) {
    const nativeMp4 = await withTimeout(
      encodeVideoSimple(pages, options, { mimeType: mp4Mime, outputType: "video/mp4" }),
      240_000,
      "gerar MP4"
    );
    onProgress?.(0.6);

    if (!audioUrl) {
      const patched = await patchMP4Brand(nativeMp4);
      onProgress?.(1);
      return patched;
    }

    try {
      const ff = await loadFFmpeg();
      onProgress?.(0.7);
      await ff.writeFile("input.mp4", await fetchFile(nativeMp4));

      let hasAudio = false;
      let audioFileName: string | null = null;
      if (audioUrl) {
        try {
          const audioResponse = await fetch(audioUrl);
          if (audioResponse.ok) {
            const audioBlob = await audioResponse.blob();
            if (audioBlob.size > 0) {
              const audioExt = inferAudioExt(audioUrl, audioBlob.type);
              audioFileName = `audio.${audioExt}`;
              await ff.writeFile(audioFileName, await fetchFile(audioBlob));
              hasAudio = true;
              console.log(`[VideoEncoder] Audio loaded: ${audioBlob.size} bytes (${audioExt})`);
            }
          }
        } catch (audioErr) {
          console.warn("[VideoEncoder] Failed to fetch audio:", audioErr);
        }
      }

      const ffmpegArgs = hasAudio && audioFileName
        ? ["-i", "input.mp4", "-stream_loop", "-1", "-i", audioFileName, "-map", "0:v:0", "-map", "1:a:0", "-c:v", "copy", "-c:a", "aac", "-b:a", "128k", "-shortest", "-movflags", "+faststart", "-f", "mp4", "output.mp4"]
        : ["-i", "input.mp4", "-c:v", "copy", "-c:a", "copy", "-movflags", "+faststart", "-f", "mp4", "output.mp4"];

      await withTimeout(ff.exec(ffmpegArgs), 180_000, hasAudio ? "muxar vídeo + áudio" : "remux faststart");
      onProgress?.(0.9);

      const mp4Data = await ff.readFile("output.mp4");
      let mp4Blob = new Blob([new Uint8Array(mp4Data as unknown as ArrayBuffer)], { type: "video/mp4" });
      await ff.deleteFile("input.mp4").catch(() => {});
      await ff.deleteFile("output.mp4").catch(() => {});
      if (hasAudio && audioFileName) await ff.deleteFile(audioFileName).catch(() => {});
      mp4Blob = await patchMP4Brand(mp4Blob);

      if (await isValidMP4(mp4Blob)) {
        onProgress?.(1);
        return mp4Blob;
      }
    } catch (err) {
      console.error("[VideoEncoder] FFmpeg remux failed, using native MP4:", err);
    }

    const patched = await patchMP4Brand(nativeMp4);
    onProgress?.(1);
    return patched;
  }

  // No native MP4 - WebM → FFmpeg
  console.log("[VideoEncoder] No native MP4, recording WebM for FFmpeg conversion");
  onProgress?.(0.1);
  const webmBlob = await withTimeout(encodeVideoSimple(pages, options), 240_000, "gerar WebM");

  try {
    onProgress?.(0.35);
    const ff = await loadFFmpeg();
    onProgress?.(0.55);
    await ff.writeFile("input.webm", await fetchFile(webmBlob));

    const encoders = [
      ["-c:v", "libx264", "-profile:v", "baseline", "-level", "3.1", "-preset", "fast", "-crf", "23", "-pix_fmt", "yuv420p"],
      ["-c:v", "mpeg4", "-q:v", "5", "-pix_fmt", "yuv420p"],
    ];

    for (const encoderArgs of encoders) {
      try {
        await withTimeout(
          ff.exec(["-i", "input.webm", ...encoderArgs, "-movflags", "+faststart", "-an", "-y", "output.mp4"]),
          360_000, "converter para MP4"
        );
        const mp4Data = await ff.readFile("output.mp4");
        let mp4Blob = new Blob([new Uint8Array(mp4Data as unknown as ArrayBuffer)], { type: "video/mp4" });
        mp4Blob = await patchMP4Brand(mp4Blob);
        if (await isValidMP4(mp4Blob)) {
          await ff.deleteFile("input.webm").catch(() => {});
          await ff.deleteFile("output.mp4").catch(() => {});
          onProgress?.(1);
          return mp4Blob;
        }
      } catch (encErr) {
        console.warn("[VideoEncoder] Encoder", encoderArgs[1], "failed:", encErr);
      }
    }
    await ff.deleteFile("input.webm").catch(() => {});
  } catch (err) {
    console.error("[VideoEncoder] FFmpeg failed:", err);
  }

  onProgress?.(1);
  return webmBlob;
}

// Calculate motion transform based on effect and progress (0-1)
function getMotionTransform(effect: MotionEffect, progress: number): { scale: number; translateX: number; translateY: number; rotate: number } {
  const t = progress;
  const halfCycle = Math.sin(t * Math.PI);
  
  switch (effect) {
    case "ken-burns": {
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
      const tx = (1 - t) * 3 - 1.5;
      return { scale: 1.05, translateX: tx, translateY: 0, rotate: 0 };
    }
    case "pan-right": {
      const tx = t * 3 - 1.5;
      return { scale: 1.05, translateX: tx, translateY: 0, rotate: 0 };
    }
    default:
      return { scale: 1, translateX: 0, translateY: 0, rotate: 0 };
  }
}

// Calculate text animation transform
function getTextAnimationTransform(effect: TextAnimation, progress: number, customDuration?: number): { opacity: number; translateX: number; translateY: number; scale: number; rotate: number } {
  // Text animation happens in a configurable fraction of the page duration
  const animDuration = customDuration ?? 0.3;
  const t = Math.min(1, progress / animDuration); // 0 to 1 within animation window
  // Use a slower easing that keeps the movement visible longer
  const eased = t < 0.5 
    ? 2 * t * t  // ease-in for first half
    : 1 - Math.pow(-2 * t + 2, 2) / 2; // ease-out for second half

  switch (effect) {
    case "fade-in":
      return { opacity: eased, translateX: 0, translateY: 0, scale: 1, rotate: 0 };
    case "slide-up":
      return { opacity: eased, translateX: 0, translateY: (1 - eased) * 30, scale: 1, rotate: 0 };
    case "slide-down":
      return { opacity: eased, translateX: 0, translateY: (1 - eased) * -30, scale: 1, rotate: 0 };
    case "slide-left":
      return { opacity: eased, translateX: (1 - eased) * 30, translateY: 0, scale: 1, rotate: 0 };
    case "slide-right":
      return { opacity: eased, translateX: (1 - eased) * -30, translateY: 0, scale: 1, rotate: 0 };
    case "scale-in": {
      const s = 0.3 + eased * 0.7;
      return { opacity: eased, translateX: 0, translateY: 0, scale: s, rotate: 0 };
    }
    case "typewriter":
      return { opacity: eased, translateX: 0, translateY: 0, scale: 1, rotate: 0 };
    case "bounce-in": {
      let bounce: number;
      if (t < 0.5) {
        bounce = (t / 0.5);
      } else if (t < 0.7) {
        bounce = 1 + Math.sin((t - 0.5) / 0.2 * Math.PI) * 0.25;
      } else if (t < 0.85) {
        bounce = 1 - Math.sin((t - 0.7) / 0.15 * Math.PI) * 0.1;
      } else {
        bounce = 1;
      }
      const s = 0.2 + bounce * 0.8;
      return { opacity: Math.min(1, t * 2.5), translateX: 0, translateY: (1 - bounce) * 20, scale: s, rotate: 0 };
    }
    case "rotate-in": {
      const rot = (1 - eased) * 15;
      const s = 0.7 + eased * 0.3;
      return { opacity: eased, translateX: (1 - eased) * -10, translateY: (1 - eased) * 10, scale: s, rotate: rot };
    }
    case "blur-in":
      return { opacity: eased, translateX: 0, translateY: 0, scale: 1 + (1 - eased) * 0.05, rotate: 0 };
    case "drop-in": {
      const dropT = t;
      let yOff: number;
      if (dropT < 0.4) {
        yOff = (1 - dropT / 0.4) * -50;
      } else if (dropT < 0.6) {
        yOff = Math.sin((dropT - 0.4) / 0.2 * Math.PI) * 10;
      } else if (dropT < 0.8) {
        yOff = Math.sin((dropT - 0.6) / 0.2 * Math.PI) * -4;
      } else {
        yOff = 0;
      }
      return { opacity: Math.min(1, t * 3), translateX: 0, translateY: yOff, scale: 1, rotate: 0 };
    }
    case "swing-in": {
      const angle = Math.sin(t * Math.PI * 2.5) * (1 - eased) * 20;
      return { opacity: eased, translateX: angle * 0.5, translateY: 0, scale: 1, rotate: angle };
    }
    case "elastic-in": {
      const elastic = t < 1 ? 1 - Math.pow(2, -10 * t) * Math.cos(t * Math.PI * 3) : 1;
      const s = 0.3 + elastic * 0.7;
      return { opacity: Math.min(1, t * 2), translateX: 0, translateY: 0, scale: s, rotate: 0 };
    }
    case "flip-in": {
      const s = eased < 0.3 ? eased / 0.3 * 0.01 : 0.01 + (eased - 0.3) / 0.7;
      return { opacity: eased, translateX: 0, translateY: (1 - eased) * 15, scale: Math.max(0.01, s), rotate: 0 };
    }
    case "rise":
      return { opacity: eased, translateX: 0, translateY: (1 - eased) * 40, scale: 0.95 + eased * 0.05, rotate: 0 };
    case "pop": {
      let popScale: number;
      if (t < 0.4) popScale = t / 0.4 * 1.2;
      else if (t < 0.6) popScale = 1.2 - (t - 0.4) / 0.2 * 0.3;
      else if (t < 0.8) popScale = 0.9 + (t - 0.6) / 0.2 * 0.1;
      else popScale = 1;
      return { opacity: Math.min(1, t * 3), translateX: 0, translateY: 0, scale: Math.max(0.01, popScale), rotate: 0 };
    }
    case "flow": {
      const skewFactor = (1 - eased) * 8;
      return { opacity: eased, translateX: (1 - eased) * -40, translateY: 0, scale: 1, rotate: skewFactor * 0.3 };
    }
    case "breathe-in": {
      const breatheScale = t < 0.5 ? 0.85 + t * 0.4 : 1.05 - (t - 0.5) * 0.1;
      return { opacity: eased, translateX: 0, translateY: 0, scale: breatheScale, rotate: 0 };
    }
    case "tectonic": {
      const shakeAmp = (1 - t) * 8;
      const shakeX = Math.sin(t * Math.PI * 8) * shakeAmp;
      return { opacity: Math.min(1, t * 2), translateX: shakeX * 0.3, translateY: 0, scale: 1, rotate: 0 };
    }
    case "drift-in":
      return { opacity: eased, translateX: (1 - eased) * -20, translateY: (1 - eased) * 15, scale: 1, rotate: (1 - eased) * -5 };
    case "wipe-left":
    case "wipe-right":
      return { opacity: eased, translateX: 0, translateY: 0, scale: 1, rotate: 0 };
    case "stomp":
      return { opacity: eased, translateX: 0, translateY: 0, scale: 1 + (1 - eased) * 1.5, rotate: 0 };
    case "tumble": {
      let tumbleR: number;
      if (t < 0.6) tumbleR = -90 + (t / 0.6) * 100;
      else tumbleR = 10 - (t - 0.6) / 0.4 * 10;
      return { opacity: Math.min(1, t * 2), translateX: 0, translateY: (1 - eased) * -30, scale: 1, rotate: tumbleR };
    }
    case "zoom-out-in":
      return { opacity: eased, translateX: 0, translateY: 0, scale: 1 + (1 - eased) * 1, rotate: 0 };
    case "glitch": {
      const glitchX = Math.sin(t * Math.PI * 8) * (1 - t) * 5;
      const glitchY = Math.cos(t * Math.PI * 6) * (1 - t) * 3;
      return { opacity: Math.min(1, t * 2.5), translateX: glitchX * 0.3, translateY: glitchY * 0.3, scale: 1, rotate: 0 };
    }
    case "panorama":
      return { opacity: eased, translateX: (1 - eased) * -70, translateY: 0, scale: 1, rotate: 0 };
    default:
      return { opacity: 1, translateX: 0, translateY: 0, scale: 1, rotate: 0 };
  }
}

// Calculate logo animation transform
function getLogoAnimationTransform(effect: LogoAnimation, progress: number): { opacity: number; translateX: number; translateY: number; scale: number; rotate: number } {
  const animDuration = 0.35;
  const t = Math.min(1, progress / animDuration);
  const eased = 1 - Math.pow(1 - t, 3); // easeOutCubic

  switch (effect) {
    case "fade-in":
      return { opacity: eased, translateX: 0, translateY: 0, scale: 1, rotate: 0 };
    case "slide-up":
      return { opacity: eased, translateX: 0, translateY: (1 - eased) * 20, scale: 1, rotate: 0 };
    case "slide-down":
      return { opacity: eased, translateX: 0, translateY: (1 - eased) * -20, scale: 1, rotate: 0 };
    case "slide-left":
      return { opacity: eased, translateX: (1 - eased) * 20, translateY: 0, scale: 1, rotate: 0 };
    case "slide-right":
      return { opacity: eased, translateX: (1 - eased) * -20, translateY: 0, scale: 1, rotate: 0 };
    case "scale-in": {
      const s = 0.3 + eased * 0.7;
      return { opacity: eased, translateX: 0, translateY: 0, scale: s, rotate: 0 };
    }
    case "bounce-in": {
      let bounce: number;
      if (t < 0.5) bounce = t / 0.5;
      else if (t < 0.75) bounce = 1 + Math.sin((t - 0.5) / 0.25 * Math.PI) * 0.2;
      else bounce = 1;
      const s = 0.2 + bounce * 0.8;
      return { opacity: Math.min(1, t * 2.5), translateX: 0, translateY: 0, scale: s, rotate: 0 };
    }
    case "spin-in": {
      const s = 0.3 + eased * 0.7;
      const rotate = (1 - eased) * 360;
      return { opacity: eased, translateX: 0, translateY: 0, scale: s, rotate };
    }
    case "flip-in": {
      const s = eased < 0.5 ? eased * 2 * 0.01 : (eased - 0.5) * 2;
      return { opacity: eased, translateX: 0, translateY: 0, scale: Math.max(0.01, s), rotate: 0 };
    }
    case "swing": {
      const angle = Math.sin(t * Math.PI * 3) * (1 - eased) * 25;
      return { opacity: eased, translateX: 0, translateY: 0, scale: 1, rotate: angle };
    }
    case "rise":
      return { opacity: eased, translateX: 0, translateY: (1 - eased) * 30, scale: 0.95 + eased * 0.05, rotate: 0 };
    case "pop": {
      let popS: number;
      if (t < 0.4) popS = t / 0.4 * 1.2;
      else if (t < 0.7) popS = 1.2 - (t - 0.4) / 0.3 * 0.3;
      else popS = 1;
      return { opacity: Math.min(1, t * 3), translateX: 0, translateY: 0, scale: Math.max(0.01, popS), rotate: 0 };
    }
    case "flow": {
      return { opacity: eased, translateX: (1 - eased) * -30, translateY: 0, scale: 1, rotate: (1 - eased) * 5 };
    }
    case "breathe-in": {
      const bScale = t < 0.5 ? 0.85 + t * 0.4 : 1.05 - (t - 0.5) * 0.1;
      return { opacity: eased, translateX: 0, translateY: 0, scale: bScale, rotate: 0 };
    }
    case "tectonic": {
      const amp = (1 - t) * 6;
      const shk = Math.sin(t * Math.PI * 8) * amp;
      return { opacity: Math.min(1, t * 2), translateX: shk * 0.3, translateY: 0, scale: 1, rotate: 0 };
    }
    case "stomp":
      return { opacity: eased, translateX: 0, translateY: 0, scale: 1 + (1 - eased) * 1.5, rotate: 0 };
    case "tumble": {
      let tR: number;
      if (t < 0.6) tR = -90 + (t / 0.6) * 100;
      else tR = 10 - (t - 0.6) / 0.4 * 10;
      return { opacity: Math.min(1, t * 2), translateX: 0, translateY: (1 - eased) * -20, scale: 1, rotate: tR };
    }
    case "zoom-out-in":
      return { opacity: eased, translateX: 0, translateY: 0, scale: 1 + (1 - eased) * 1, rotate: 0 };
    case "glitch": {
      const gx = Math.sin(t * Math.PI * 8) * (1 - t) * 4;
      return { opacity: Math.min(1, t * 2.5), translateX: gx * 0.3, translateY: 0, scale: 1, rotate: 0 };
    }
    default:
      return { opacity: 1, translateX: 0, translateY: 0, scale: 1, rotate: 0 };
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

// Helper: seek video to a specific time and wait for the frame to be ready
function seekVideoToTime(video: HTMLVideoElement, time: number): Promise<void> {
  return new Promise<void>((resolve) => {
    if (Math.abs(video.currentTime - time) < 0.05) {
      // Already close enough
      resolve();
      return;
    }
    const onSeeked = () => {
      video.removeEventListener("seeked", onSeeked);
      resolve();
    };
    video.addEventListener("seeked", onSeeked);
    video.currentTime = time;
  });
}

// Apply geometric clip path to canvas context
function applyCanvasClipShape(ctx: CanvasRenderingContext2D, shape: string, x: number, y: number, w: number, h: number) {
  const cx = x + w / 2;
  const cy = y + h / 2;
  ctx.beginPath();
  switch (shape) {
    case "circle":
      ctx.ellipse(cx, cy, w / 2, h / 2, 0, 0, Math.PI * 2);
      break;
    case "triangle":
      ctx.moveTo(cx, y);
      ctx.lineTo(x + w, y + h);
      ctx.lineTo(x, y + h);
      break;
    case "diamond":
      ctx.moveTo(cx, y);
      ctx.lineTo(x + w, cy);
      ctx.lineTo(cx, y + h);
      ctx.lineTo(x, cy);
      break;
    case "hexagon": {
      const r = Math.min(w, h) / 2;
      for (let i = 0; i < 6; i++) {
        const angle = (Math.PI / 3) * i - Math.PI / 2;
        const px = cx + r * Math.cos(angle);
        const py = cy + r * Math.sin(angle);
        if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      break;
    }
    case "pentagon": {
      const r = Math.min(w, h) / 2;
      for (let i = 0; i < 5; i++) {
        const angle = (Math.PI * 2 / 5) * i - Math.PI / 2;
        const px = cx + r * Math.cos(angle);
        const py = cy + r * Math.sin(angle);
        if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      break;
    }
    case "star": {
      const outerR = Math.min(w, h) / 2;
      const innerR = outerR * 0.4;
      for (let i = 0; i < 10; i++) {
        const angle = (Math.PI / 5) * i - Math.PI / 2;
        const r = i % 2 === 0 ? outerR : innerR;
        const px = cx + r * Math.cos(angle);
        const py = cy + r * Math.sin(angle);
        if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      break;
    }
    default:
      ctx.rect(x, y, w, h);
      break;
  }
  ctx.closePath();
  ctx.clip();
}

// WebCodecs-based full video encoder (replaces MediaRecorder on mobile)
// Replicates the same rendering pipeline as encodeVideoSimple but uses VideoEncoder + mp4-muxer
async function encodeVideoWithWebCodecs(pages: string[], options: VideoEncoderOptions): Promise<Blob> {
  const {
    width, height, pageDuration, fps: rawFps = 24,
    motionEffect = "ken-burns", transitionEffect = "fade",
    textAnimation = "none", logoAnimation = "none", textAnimDuration,
    backgroundVideoUrls, frameOverlayPages, overlayPages, logoOverlayPages,
    imageRect, pageImageAdjustments, imageClipShape, onProgress,
  } = options;

  const fps = Math.min(rawFps, 20);
  console.log("[WebCodecs] Full encode start:", { width, height, fps, pages: pages.length, bgVideoUrls: (backgroundVideoUrls || []).filter(Boolean).length });
  onProgress?.(0.06);

  // Helper: load image with 10s timeout
  const loadImg = (url: string): Promise<HTMLImageElement | null> => {
    if (!url) return Promise.resolve(null);
    return new Promise<HTMLImageElement | null>((resolve) => {
      const timer = setTimeout(() => { console.warn("[WebCodecs] Img timeout:", url.slice(0, 60)); resolve(null); }, 10_000);
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => { clearTimeout(timer); resolve(img); };
      img.onerror = () => { clearTimeout(timer); console.warn("[WebCodecs] Img error:", url.slice(0, 60)); resolve(null); };
      img.src = url;
    });
  };

  // Helper: load video with short timeout (mobile often blocks video preload)
  const isMob = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
  const vidTimeout = isMob ? 3_000 : 8_000;
  const loadVid = (url: string): Promise<HTMLVideoElement | null> => {
    if (!url) return Promise.resolve(null);
    return new Promise<HTMLVideoElement | null>((resolve) => {
      const timer = setTimeout(() => { console.warn("[WebCodecs] Vid timeout (" + vidTimeout + "ms):", url.slice(0, 60)); resolve(null); }, vidTimeout);
      const video = document.createElement("video");
      video.crossOrigin = "anonymous";
      video.muted = true;
      video.playsInline = true;
      video.preload = "auto";
      video.loop = true;
      // Listen to multiple events — mobile may only fire canplay, not loadeddata
      let resolved = false;
      const done = () => { if (resolved) return; resolved = true; clearTimeout(timer); resolve(video); };
      const fail = () => { if (resolved) return; resolved = true; clearTimeout(timer); resolve(null); };
      video.onloadeddata = done;
      video.oncanplay = done;
      video.onerror = fail;
      video.onstalled = () => console.warn("[WebCodecs] Vid stalled:", url.slice(0, 40));
      video.src = url;
      // On mobile, try to trigger load explicitly
      try { video.load(); } catch {}
    });
  };

  // Load page images (data URLs = instant)
  console.log("[WebCodecs] Loading page images...");
  const rawImages = await Promise.all(pages.map(p => loadImg(p)));
  const images: HTMLImageElement[] = rawImages.map((img, i) => {
    if (img) return img;
    console.warn("[WebCodecs] Page", i, "failed, blank fallback");
    const c = document.createElement("canvas"); c.width = width; c.height = height;
    const ctx2 = c.getContext("2d")!; ctx2.fillStyle = "#000"; ctx2.fillRect(0, 0, width, height);
    const fb = new Image(); fb.src = c.toDataURL(); return fb;
  });
  console.log("[WebCodecs] Pages loaded:", images.length);
  onProgress?.(0.10);

  // Load background videos (timeout = skip)
  console.log("[WebCodecs] Loading bg videos...");
  const bgVideos: (HTMLVideoElement | null)[] = await Promise.all(
    (backgroundVideoUrls || []).map(url => url ? loadVid(url) : Promise.resolve(null))
  );
  console.log("[WebCodecs] Bg videos:", bgVideos.filter(Boolean).length);
  onProgress?.(0.15);

  // Load overlays (parallel, with timeout)
  console.log("[WebCodecs] Loading overlays...");
  const loadList = (list: string[] | undefined) =>
    Promise.all((list || []).map(url => url ? loadImg(url) : Promise.resolve(null)));
  const [overlayImages, frameOverlayImages, logoOverlayImages] = await Promise.all([
    loadList(overlayPages), loadList(frameOverlayPages), loadList(logoOverlayPages),
  ]);
  console.log("[WebCodecs] Overlays loaded, starting encode...");
  onProgress?.(0.20);

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d")!;

  const framesPerPage = Math.max(1, Math.floor(pageDuration * fps));
  const transitionFrames = Math.max(1, Math.floor(fps * 0.5));
  const totalFrames = framesPerPage * images.length;

  // Drawing helpers (same as encodeVideoSimple)
  const drawSource = (source: HTMLImageElement | HTMLVideoElement, applyMotion: boolean, progress: number) => {
    if (applyMotion && motionEffect !== "none") {
      const motion = getMotionTransform(motionEffect, progress);
      ctx.save();
      ctx.translate(width / 2, height / 2);
      ctx.rotate((motion.rotate * Math.PI) / 180);
      ctx.scale(motion.scale, motion.scale);
      ctx.translate(-width / 2 + (motion.translateX * width) / 100, -height / 2 + (motion.translateY * height) / 100);
      ctx.drawImage(source, 0, 0, width, height);
      ctx.restore();
    } else {
      ctx.drawImage(source, 0, 0, width, height);
    }
  };

  const drawOverlay = (overlay: HTMLImageElement, progress: number) => {
    if (textAnimation === "none") { ctx.drawImage(overlay, 0, 0, width, height); return; }
    const anim = getTextAnimationTransform(textAnimation, progress, textAnimDuration);
    ctx.save();
    ctx.globalAlpha = anim.opacity;
    ctx.translate(width / 2, height / 2);
    ctx.rotate((anim.rotate * Math.PI) / 180);
    ctx.scale(anim.scale, anim.scale);
    ctx.translate(-width / 2 + (anim.translateX * width) / 100, -height / 2 + (anim.translateY * height) / 100);
    ctx.drawImage(overlay, 0, 0, width, height);
    ctx.restore();
    ctx.globalAlpha = 1;
  };

  const drawLogoOverlay = (logoImg: HTMLImageElement, progress: number) => {
    if (logoAnimation === "none") { ctx.drawImage(logoImg, 0, 0, width, height); return; }
    const anim = getLogoAnimationTransform(logoAnimation, progress);
    ctx.save();
    ctx.globalAlpha = anim.opacity;
    ctx.translate(width / 2, height / 2);
    ctx.rotate((anim.rotate * Math.PI) / 180);
    ctx.scale(anim.scale, anim.scale);
    ctx.translate(-width / 2 + (anim.translateX * width) / 100, -height / 2 + (anim.translateY * height) / 100);
    ctx.drawImage(logoImg, 0, 0, width, height);
    ctx.restore();
    ctx.globalAlpha = 1;
  };

  const renderFrame = async (frameNum: number) => {
    const pageIdx = Math.floor(frameNum / framesPerPage);
    const frameInPage = frameNum - (pageIdx * framesPerPage);
    if (pageIdx >= images.length) return;

    const img = images[pageIdx];
    const nextImg = pageIdx + 1 < images.length ? images[pageIdx + 1] : null;
    const bgVideo = bgVideos[pageIdx] || null;
    const isTransitionPhase = frameInPage >= framesPerPage - transitionFrames && nextImg;
    const pageProgress = frameInPage / framesPerPage;

    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, width, height);

    if (isTransitionPhase && nextImg) {
      const transitionProgress = (frameInPage - (framesPerPage - transitionFrames)) / transitionFrames;
      applyTransition(ctx, img, nextImg, transitionProgress, transitionEffect, width, height);
    } else if (bgVideo && bgVideo.readyState >= 2) {
      try {
        const vw = bgVideo.videoWidth;
        const vh = bgVideo.videoHeight;
        let dx = 0, dy = 0, dw = width, dh = height;
        if (imageRect) { dx = (imageRect.left / 100) * width; dy = (imageRect.top / 100) * height; dw = (imageRect.width / 100) * width; dh = (imageRect.height / 100) * height; }
        const destRatio = dw / dh;
        const videoRatio = vw / vh;
        let sx = 0, sy = 0, sw = vw, sh = vh;
        if (videoRatio > destRatio) { sw = vh * destRatio; sx = (vw - sw) / 2; }
        else { sh = vw / destRatio; sy = (vh - sh) / 2; }

        const applyMotionToCanvas = motionEffect !== "none";
        if (applyMotionToCanvas) {
          const motion = getMotionTransform(motionEffect, pageProgress);
          ctx.save();
          ctx.translate(width / 2, height / 2);
          ctx.rotate((motion.rotate * Math.PI) / 180);
          ctx.scale(motion.scale, motion.scale);
          ctx.translate(-width / 2 + (motion.translateX * width) / 100, -height / 2 + (motion.translateY * height) / 100);
        }

        ctx.drawImage(img, 0, 0, width, height);
        const adj = pageImageAdjustments?.[pageIdx];
        const clipShape = imageClipShape || "rect";
        if (adj && (adj.imageScale !== 100 || adj.imageX !== 0 || adj.imageY !== 0)) {
          const scale = adj.imageScale / 100;
          const scaledW = dw * scale; const scaledH = dh * scale;
          const offsetX = (adj.imageX / dw) * scaledW; const offsetY = (adj.imageY / dh) * scaledH;
          ctx.save(); applyCanvasClipShape(ctx, clipShape, dx, dy, dw, dh);
          ctx.drawImage(bgVideo, sx, sy, sw, sh, dx + (dw - scaledW) / 2 + offsetX, dy + (dh - scaledH) / 2 + offsetY, scaledW, scaledH);
          ctx.restore();
        } else {
          ctx.save(); applyCanvasClipShape(ctx, clipShape, dx, dy, dw, dh);
          ctx.drawImage(bgVideo, sx, sy, sw, sh, dx, dy, dw, dh); ctx.restore();
        }

        if (applyMotionToCanvas) ctx.restore();
        const fov = frameOverlayImages[pageIdx]; if (fov) ctx.drawImage(fov, 0, 0, width, height);
        const ov = overlayImages[pageIdx]; if (ov) drawOverlay(ov, pageProgress);
        const lov = logoOverlayImages[pageIdx]; if (lov) drawLogoOverlay(lov, pageProgress);
      } catch {
        drawSource(img, true, pageProgress);
      }
    } else {
      drawSource(img, true, pageProgress);
      const fov = frameOverlayImages[pageIdx]; if (fov) ctx.drawImage(fov, 0, 0, width, height);
      const ov = overlayImages[pageIdx]; if (ov) drawOverlay(ov, pageProgress);
      const lov = logoOverlayImages[pageIdx]; if (lov) drawLogoOverlay(lov, pageProgress);
    }
  };

  // Set up mp4-muxer + VideoEncoder
  console.log("[WebCodecs] Setting up muxer + encoder...");
  const muxer = new Muxer({
    target: new ArrayBufferTarget(),
    video: { codec: "avc", width, height },
    fastStart: "in-memory",
  });

  let encoderError: Error | null = null;
  let chunksReceived = 0;
  const encoder = new VideoEncoder({
    output: (chunk, meta) => { muxer.addVideoChunk(chunk, meta ?? undefined); chunksReceived++; if (chunksReceived <= 3) console.log("[WebCodecs] Chunk received #" + chunksReceived, "size:", chunk.byteLength); },
    error: (e) => { console.error("[WebCodecs] Encoder error:", e); encoderError = e instanceof Error ? e : new Error(String(e)); },
  });

  const config: VideoEncoderConfig = {
    codec: "avc1.42001f",
    width, height,
    bitrate: 2_000_000,
    framerate: fps,
  };
  console.log("[WebCodecs] Configuring encoder:", JSON.stringify(config));
  
  try {
    encoder.configure(config);
  } catch (configErr) {
    console.error("[WebCodecs] Configure FAILED:", configErr);
    throw configErr;
  }
  console.log("[WebCodecs] Encoder configured, state:", encoder.state);

  const frameDurationMicros = Math.round(1_000_000 / fps);

  // Seek-based video sync: instead of play() (real-time), seek to exact frame time
  // This ensures background videos advance correctly in the faster-than-realtime encoding loop
  const seekVideoForFrame = async (pageIdx: number, frameInPage: number) => {
    const v = bgVideos[pageIdx];
    if (!v || v.readyState < 2) return;
    const targetTime = (frameInPage / fps) % (v.duration || 999);
    // Only seek if difference is significant (avoid redundant seeks)
    if (Math.abs(v.currentTime - targetTime) > 0.04) {
      await seekVideoToTime(v, targetTime);
    }
  };

  console.log("[WebCodecs] Starting frame loop, total:", totalFrames);
  for (let i = 0; i < totalFrames; i++) {
    if (encoderError) throw encoderError;

    const pageIdx = Math.floor(i / framesPerPage);
    const frameInPage = i - (pageIdx * framesPerPage);

    // Seek background video to correct time for this frame
    if (bgVideos[pageIdx]) {
      await seekVideoForFrame(pageIdx, frameInPage);
    }

    await renderFrame(i);

    try {
      const frame = new VideoFrame(canvas, {
        timestamp: i * frameDurationMicros,
        duration: frameDurationMicros,
      });
      encoder.encode(frame, { keyFrame: i % (fps * 2) === 0 });
      frame.close();

      if (i === 0) console.log("[WebCodecs] First frame encoded OK, queue:", encoder.encodeQueueSize);
    } catch (frameErr) {
      console.error("[WebCodecs] Frame", i, "failed:", frameErr);
      throw frameErr;
    }

    // Yield to UI every few frames
    if (i % 3 === 0) {
      onProgress?.(Math.min(0.95, 0.20 + 0.75 * (i / totalFrames)));
      await new Promise((r) => setTimeout(r, 0));
    }
    if (encoder.encodeQueueSize > 8) {
      await new Promise((r) => setTimeout(r, 10));
    }
  }

  // Cleanup videos
  bgVideos.forEach((v) => { if (v) { v.pause(); v.src = ""; } });

  console.log("[WebCodecs] Frame loop done. Chunks so far:", chunksReceived, "encoder state:", encoder.state);

  if (encoderError) {
    console.error("[WebCodecs] Encoder had error during loop:", encoderError);
    try { encoder.close(); } catch {}
    throw encoderError;
  }

  try {
    console.log("[WebCodecs] Flushing encoder...");
    await encoder.flush();
    console.log("[WebCodecs] Flush done. Total chunks:", chunksReceived);
  } catch (flushErr) {
    console.error("[WebCodecs] Flush FAILED:", flushErr);
    // Still try to finalize with what we have
  }

  try { encoder.close(); } catch {}

  if (chunksReceived === 0) {
    throw new Error("Nenhum frame foi codificado. O encoder não produziu dados.");
  }

  try {
    muxer.finalize();
  } catch (muxErr) {
    console.error("[WebCodecs] Muxer finalize FAILED:", muxErr);
    throw new Error("Falha ao finalizar vídeo: " + (muxErr instanceof Error ? muxErr.message : String(muxErr)));
  }

  const buffer = (muxer.target as ArrayBufferTarget).buffer!;
  const blob = new Blob([buffer], { type: "video/mp4" });
  console.log("[WebCodecs] Done! size:", blob.size, "chunks:", chunksReceived);
  
  if (blob.size < 1000) {
    throw new Error("Vídeo gerado muito pequeno (" + blob.size + " bytes). Possível falha de encoding.");
  }
  
  return blob;
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
    width: rawWidth, 
    height: rawHeight, 
    pageDuration, 
    fps: rawFps = 30, 
    motionEffect = "ken-burns",
    transitionEffect = "fade",
    textAnimation = "none",
    logoAnimation = "none",
    textAnimDuration,
    backgroundVideoUrls,
    frameOverlayPages,
    overlayPages,
    logoOverlayPages,
    imageRect,
    pageImageAdjustments,
    imageClipShape,
    onProgress 
  } = options;

  // Keep full resolution on all devices — quality matters for social media
  const isMobileDevice = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
  const width = rawWidth;
  const height = rawHeight;
  const fps = rawFps;
  const bitrate = 12_000_000;

  if (isMobileDevice) {
    console.log(`[VideoEncoder] Mobile device detected: ${width}x${height} @${fps}fps`);
  }

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
        video.loop = true;
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

  // Load frame overlay images (decorative shapes - drawn statically)
  const frameOverlayImages: (HTMLImageElement | null)[] = await Promise.all(
    (frameOverlayPages || []).map(async (pageUrl) => {
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

  // Load logo overlay images (transparent PNGs with logo only)
  const logoOverlayImages: (HTMLImageElement | null)[] = await Promise.all(
    (logoOverlayPages || []).map(async (pageUrl) => {
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

  const framesPerPage = Math.max(1, Math.floor(pageDuration * fps));
  const transitionFrames = Math.max(1, Math.floor(fps * 0.5));
  const totalFrames = framesPerPage * images.length;

  // --- Drawing helpers (shared by mobile & desktop paths) ---
  const drawSource = (source: HTMLImageElement | HTMLVideoElement, applyMotion: boolean, progress: number) => {
    if (applyMotion && motionEffect !== "none") {
      const motion = getMotionTransform(motionEffect, progress);
      ctx.save();
      ctx.translate(width / 2, height / 2);
      ctx.rotate((motion.rotate * Math.PI) / 180);
      ctx.scale(motion.scale, motion.scale);
      ctx.translate(-width / 2 + (motion.translateX * width) / 100, -height / 2 + (motion.translateY * height) / 100);
      ctx.drawImage(source, 0, 0, width, height);
      ctx.restore();
    } else {
      ctx.drawImage(source, 0, 0, width, height);
    }
  };

  const drawOverlay = (overlay: HTMLImageElement, progress: number) => {
    if (textAnimation === "none") {
      ctx.globalAlpha = 1;
      ctx.drawImage(overlay, 0, 0, width, height);
      return;
    }
    const anim = getTextAnimationTransform(textAnimation, progress, textAnimDuration);
    ctx.save();
    ctx.globalAlpha = anim.opacity;
    ctx.translate(width / 2, height / 2);
    ctx.rotate((anim.rotate * Math.PI) / 180);
    ctx.scale(anim.scale, anim.scale);
    ctx.translate(-width / 2 + (anim.translateX * width) / 100, -height / 2 + (anim.translateY * height) / 100);
    ctx.drawImage(overlay, 0, 0, width, height);
    ctx.restore();
    ctx.globalAlpha = 1;
  };

  const drawLogoOverlay = (logoImg: HTMLImageElement, progress: number) => {
    if (logoAnimation === "none") {
      ctx.globalAlpha = 1;
      ctx.drawImage(logoImg, 0, 0, width, height);
      return;
    }
    const anim = getLogoAnimationTransform(logoAnimation, progress);
    ctx.save();
    ctx.globalAlpha = anim.opacity;
    ctx.translate(width / 2, height / 2);
    ctx.rotate((anim.rotate * Math.PI) / 180);
    ctx.scale(anim.scale, anim.scale);
    ctx.translate(-width / 2 + (anim.translateX * width) / 100, -height / 2 + (anim.translateY * height) / 100);
    ctx.drawImage(logoImg, 0, 0, width, height);
    ctx.restore();
    ctx.globalAlpha = 1;
  };

  // Pure rendering function for a single frame (no side effects)
  const renderFrameToCanvas = (frameNum: number) => {
    const pageIdx = Math.floor(frameNum / framesPerPage);
    const frameInPage = frameNum - (pageIdx * framesPerPage);
    if (pageIdx >= images.length) return;

    const img = images[pageIdx];
    const nextImg = pageIdx + 1 < images.length ? images[pageIdx + 1] : null;
    const bgVideo = bgVideos[pageIdx] || null;
    const isTransitionPhase = frameInPage >= framesPerPage - transitionFrames && nextImg;
    const pageProgress = frameInPage / framesPerPage;

    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, width, height);

    if (isTransitionPhase && nextImg) {
      const transitionProgress = (frameInPage - (framesPerPage - transitionFrames)) / transitionFrames;
      applyTransition(ctx, img, nextImg, transitionProgress, transitionEffect, width, height);
    } else if (bgVideo && bgVideo.readyState >= 2) {
      try {
        const vw = bgVideo.videoWidth;
        const vh = bgVideo.videoHeight;
        let dx = 0, dy = 0, dw = width, dh = height;
        if (imageRect) {
          dx = (imageRect.left / 100) * width;
          dy = (imageRect.top / 100) * height;
          dw = (imageRect.width / 100) * width;
          dh = (imageRect.height / 100) * height;
        }
        const destRatio = dw / dh;
        const videoRatio = vw / vh;
        let sx = 0, sy = 0, sw = vw, sh = vh;
        if (videoRatio > destRatio) { sw = vh * destRatio; sx = (vw - sw) / 2; }
        else { sh = vw / destRatio; sy = (vh - sh) / 2; }

        const applyMotionToCanvas = motionEffect !== "none";
        if (applyMotionToCanvas) {
          const motion = getMotionTransform(motionEffect, pageProgress);
          ctx.save();
          ctx.translate(width / 2, height / 2);
          ctx.rotate((motion.rotate * Math.PI) / 180);
          ctx.scale(motion.scale, motion.scale);
          ctx.translate(-width / 2 + (motion.translateX * width) / 100, -height / 2 + (motion.translateY * height) / 100);
        }

        ctx.drawImage(img, 0, 0, width, height);
        const adj = pageImageAdjustments?.[pageIdx];
        const clipShape = imageClipShape || "rect";

        if (adj && (adj.imageScale !== 100 || adj.imageX !== 0 || adj.imageY !== 0)) {
          const scale = adj.imageScale / 100;
          const scaledW = dw * scale;
          const scaledH = dh * scale;
          const offsetX = (adj.imageX / dw) * scaledW;
          const offsetY = (adj.imageY / dh) * scaledH;
          const adjDx = dx + (dw - scaledW) / 2 + offsetX;
          const adjDy = dy + (dh - scaledH) / 2 + offsetY;
          ctx.save();
          applyCanvasClipShape(ctx, clipShape, dx, dy, dw, dh);
          ctx.drawImage(bgVideo, sx, sy, sw, sh, adjDx, adjDy, scaledW, scaledH);
          ctx.restore();
        } else {
          ctx.save();
          applyCanvasClipShape(ctx, clipShape, dx, dy, dw, dh);
          ctx.drawImage(bgVideo, sx, sy, sw, sh, dx, dy, dw, dh);
          ctx.restore();
        }

        if (applyMotionToCanvas) ctx.restore();

        const frameOverlay = frameOverlayImages[pageIdx];
        if (frameOverlay) ctx.drawImage(frameOverlay, 0, 0, width, height);
        const overlay = overlayImages[pageIdx];
        if (overlay) drawOverlay(overlay, pageProgress);
        const logoOverlay = logoOverlayImages[pageIdx];
        if (logoOverlay) drawLogoOverlay(logoOverlay, pageProgress);
      } catch (e) {
        console.warn("[VideoEncoder] Video frame draw failed, using static:", e);
        drawSource(img, true, pageProgress);
      }
    } else {
      drawSource(img, true, pageProgress);
      const frameOverlay = frameOverlayImages[pageIdx];
      if (frameOverlay) ctx.drawImage(frameOverlay, 0, 0, width, height);
      const overlay = overlayImages[pageIdx];
      if (overlay) drawOverlay(overlay, pageProgress);
      const logoOverlay = logoOverlayImages[pageIdx];
      if (logoOverlay) drawLogoOverlay(logoOverlay, pageProgress);
    }
  };

  console.log("[VideoEncoder] Config:", {
    pages: images.length, width, height, pageDuration, fps,
    framesPerPage, transitionFrames, totalFrames,
    motionEffect, transitionEffect, textAnimation, logoAnimation,
    bgVideoCount: bgVideos.filter(Boolean).length,
    isMobileDevice,
  });

  // ====== ALL DEVICES: MediaRecorder approach ======
  const isIOS = /iPhone|iPad|iPod/i.test(navigator.userAgent);

  // iOS Safari only supports video/mp4 for MediaRecorder
  // On iOS, captureStream(0) works better — captures a frame on each canvas change
  const chosenMime =
    (extra?.mimeType && MediaRecorder.isTypeSupported(extra.mimeType) ? extra.mimeType : null) ||
    (isMobileDevice
      ? pickSupportedMimeType(["video/mp4;codecs=avc1", "video/mp4", "video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm"])
      : pickSupportedMimeType(["video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm", "video/mp4;codecs=avc1", "video/mp4"])) ||
    "video/webm";

  console.log(`[VideoEncoder] MIME: ${chosenMime}, mobile: ${isMobileDevice}, iOS: ${isIOS}`);

  const outType = extra?.outputType || (chosenMime.startsWith("video/mp4") ? "video/mp4" : "video/webm");

  // On mobile, reduce FPS for performance
  const effectiveFps = isMobileDevice ? Math.min(fps, 12) : fps;
  const effectiveFramesPerPage = Math.max(1, Math.floor(pageDuration * effectiveFps));
  const effectiveTotalFrames = effectiveFramesPerPage * images.length;
  const frameIntervalMs = Math.floor(1000 / effectiveFps);

  // iOS: captureStream(0) — frame captured on each canvas draw
  // Desktop: captureStream(fps) — automatic frame rate
  const stream = canvas.captureStream(isIOS ? 0 : fps);
  console.log("[VideoEncoder] Stream tracks:", stream.getTracks().length, "active:", stream.active);

  let mediaRecorder: MediaRecorder;
  try {
    mediaRecorder = new MediaRecorder(stream, {
      mimeType: chosenMime,
      videoBitsPerSecond: isMobileDevice ? 2_500_000 : bitrate,
    });
  } catch (mrErr) {
    console.error("[VideoEncoder] MediaRecorder creation failed:", mrErr);
    // Try without options
    mediaRecorder = new MediaRecorder(stream);
    console.log("[VideoEncoder] Fallback MediaRecorder created, mimeType:", mediaRecorder.mimeType);
  }

  const chunks: Blob[] = [];
  let dataReceived = false;
  let dataEventCount = 0;
  mediaRecorder.ondataavailable = (e) => {
    dataEventCount++;
    if (e.data.size > 0) {
      chunks.push(e.data);
      dataReceived = true;
    }
    if (dataEventCount <= 3) {
      console.log(`[VideoEncoder] ondataavailable #${dataEventCount}: size=${e.data.size}`);
    }
  };

  const useFramesPerPage = isMobileDevice ? effectiveFramesPerPage : framesPerPage;
  const useTotalFrames = isMobileDevice ? effectiveTotalFrames : totalFrames;

  return new Promise((resolve, reject) => {
    // Stall detector for mobile
    let stallTimer: number | undefined;
    if (isMobileDevice) {
      stallTimer = window.setTimeout(() => {
        console.error("[VideoEncoder] STALL: no data after 20s. state:", mediaRecorder.state, "chunks:", chunks.length, "dataEvents:", dataEventCount);
        if (mediaRecorder.state === "recording") {
          try { mediaRecorder.requestData(); } catch {}
          // Give it 2 more seconds after requesting data
          window.setTimeout(() => {
            if (!dataReceived) {
              console.error("[VideoEncoder] Still no data after requestData. Aborting.");
              try { mediaRecorder.stop(); } catch {}
            }
          }, 2000);
        }
      }, 20_000);
    }

    mediaRecorder.onstop = () => {
      if (stallTimer) window.clearTimeout(stallTimer);
      bgVideos.forEach((v) => { if (v) { v.pause(); v.src = ""; } });
      const result = new Blob(chunks, { type: outType });
      console.log("[VideoEncoder] Stopped. chunks:", chunks.length, "size:", result.size, "dataEvents:", dataEventCount);
      resolve(result);
    };
    mediaRecorder.onerror = (e) => {
      console.error("[VideoEncoder] MediaRecorder error:", e);
      if (stallTimer) window.clearTimeout(stallTimer);
      reject(e);
    };

    // Start with timeslice — forces periodic ondataavailable events
    const timeslice = isMobileDevice ? 500 : 250;
    mediaRecorder.start(timeslice);
    console.log("[VideoEncoder] MediaRecorder started, state:", mediaRecorder.state, "timeslice:", timeslice);

    let globalFrame = 0;
    let activeVideoIdx = -1;
    let lastPageIdx = 0;

    const startVideoForPage = (pageIdx: number) => {
      if (activeVideoIdx >= 0 && bgVideos[activeVideoIdx]) bgVideos[activeVideoIdx]!.pause();
      activeVideoIdx = pageIdx;
      const v = bgVideos[pageIdx];
      if (v) { v.currentTime = 0; v.play().catch(() => {}); }
    };

    if (bgVideos[0]) startVideoForPage(0);

    const FRAMES_PER_BATCH = isMobileDevice ? 1 : 4;
    const PROGRESS_INTERVAL = isMobileDevice ? 3 : 10;
    let progressCounter = 0;

    const tick = () => {
      if (globalFrame >= useTotalFrames) {
        bgVideos.forEach((v) => { if (v) v.pause(); });
        // Wait a bit for last data events before stopping
        setTimeout(() => {
          try {
            mediaRecorder.requestData();
            setTimeout(() => {
              try { mediaRecorder.stop(); } catch {}
            }, 300);
          } catch {
            try { mediaRecorder.stop(); } catch {}
          }
        }, 500);
        return;
      }

      let framesThisBatch = 0;
      while (framesThisBatch < FRAMES_PER_BATCH && globalFrame < useTotalFrames) {
        const pageIdx = Math.floor(globalFrame / useFramesPerPage);
        if (pageIdx !== lastPageIdx) {
          startVideoForPage(pageIdx);
          lastPageIdx = pageIdx;
        }
        renderFrameToCanvas(globalFrame);
        globalFrame++;
        framesThisBatch++;
      }

      progressCounter++;
      if (progressCounter % PROGRESS_INTERVAL === 0) {
        onProgress?.(Math.min(0.95, Math.max(0.05, globalFrame / useTotalFrames)));
      }

      if (globalFrame < useTotalFrames) {
        // On mobile, render at real-time pace so MediaRecorder can keep up
        if (isMobileDevice) {
          setTimeout(tick, frameIntervalMs);
        } else {
          setTimeout(tick, 0);
        }
      } else {
        bgVideos.forEach((v) => { if (v) v.pause(); });
        setTimeout(() => {
          try {
            mediaRecorder.requestData();
            setTimeout(() => { try { mediaRecorder.stop(); } catch {} }, 300);
          } catch {
            try { mediaRecorder.stop(); } catch {}
          }
        }, 500);
      }
    };

    // Give MediaRecorder time to fully initialize before rendering
    setTimeout(tick, isMobileDevice ? 1000 : 0);
  });
}

/**
 * Remux any video blob to a WhatsApp-compatible MP4:
 * Uses -c:v copy (no re-encoding, no libx264 needed) + faststart moov atom + isom brand.
 * Falls back to libx264 re-encode if copy fails, then mpeg4 as last resort.
 */
export async function reencodeForWhatsApp(
  inputBlob: Blob,
  onProgress?: (p: number) => void,
  options?: { stripAudio?: boolean; expectedDuration?: number }
): Promise<Blob> {
  onProgress?.(0.1);
  const ff = await loadFFmpeg();
  onProgress?.(0.3);

  await ff.writeFile("input.mp4", await fetchFile(inputBlob));

  const stripAudio = options?.stripAudio ?? false;
  const expectedDuration = options?.expectedDuration;
  const durationArgs = expectedDuration ? ["-t", String(expectedDuration)] : [];
  const strategies = stripAudio
    ? [
        { name: "copy-noaudio", args: ["-c:v", "copy", "-an", ...durationArgs] },
        { name: "libx264-noaudio", args: ["-c:v", "libx264", "-profile:v", "baseline", "-level", "3.1", "-preset", "fast", "-crf", "23", "-pix_fmt", "yuv420p", "-an", ...durationArgs] },
        { name: "mpeg4-noaudio", args: ["-c:v", "mpeg4", "-q:v", "5", "-pix_fmt", "yuv420p", "-an", ...durationArgs] },
      ]
    : [
        { name: "copy", args: ["-c:v", "copy", "-c:a", "copy", ...durationArgs] },
        { name: "libx264", args: ["-c:v", "libx264", "-profile:v", "baseline", "-level", "3.1", "-preset", "fast", "-crf", "23", "-pix_fmt", "yuv420p", "-an", ...durationArgs] },
        { name: "mpeg4", args: ["-c:v", "mpeg4", "-q:v", "5", "-pix_fmt", "yuv420p", "-an", ...durationArgs] },
      ];

  for (const strategy of strategies) {
    try {
      console.log(`[reencodeForWhatsApp] Trying strategy: ${strategy.name}`);
      await withTimeout(
        ff.exec([
          "-i", "input.mp4",
          ...strategy.args,
          "-movflags", "+faststart",
          "-y", "output.mp4",
        ]),
        360_000,
        `re-encode (${strategy.name})`
      );

      onProgress?.(0.85);
      const mp4Data = await ff.readFile("output.mp4");
      let mp4Blob = new Blob([new Uint8Array(mp4Data as unknown as ArrayBuffer)], { type: "video/mp4" });
      await ff.deleteFile("output.mp4");

      if (await isValidMP4(mp4Blob)) {
        mp4Blob = await patchMP4Brand(mp4Blob);
        await ff.deleteFile("input.mp4");
        console.log(`[reencodeForWhatsApp] Success with ${strategy.name}, size: ${mp4Blob.size}`);
        onProgress?.(1);
        return mp4Blob;
      }
    } catch (err) {
      console.warn(`[reencodeForWhatsApp] Strategy ${strategy.name} failed:`, err);
    }
  }

  // All strategies failed - return original with brand patch
  await ff.deleteFile("input.mp4").catch(() => {});
  console.error("[reencodeForWhatsApp] All strategies failed, returning original");
  onProgress?.(1);
  return await patchMP4Brand(inputBlob);
}
