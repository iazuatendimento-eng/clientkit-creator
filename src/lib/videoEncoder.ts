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
  preImageOverlayPages?: string[]; // Transparent overlay for shapes BELOW the video/image (z-1)
  overlayPages?: string[]; // Transparent overlay pages for compositing on top of video
  logoOverlayPages?: string[]; // Transparent logo-only overlay pages
  imageRect?: { left: number; top: number; width: number; height: number } | null; // Image placeholder rect as percentages
  pageImageAdjustments?: { imageX: number; imageY: number; imageScale: number }[]; // Per-page image position/scale adjustments
  imageClipShape?: string; // Geometric clip shape for image placeholder (circle, triangle, diamond, etc.)
  audioUrl?: string; // URL of background audio to mix into the video
  requireEmailSafePreview?: boolean; // Force FFmpeg compatibility pass (H.264 baseline + AAC) for email preview clients
  customOverlayPages?: Record<number, { url: string; x: number; y: number; width: number; height: number; isVideo?: boolean }[]>;
  onProgress?: (progress: number) => void;
}

type FFmpegLoadStatusHandler = (status: string) => void;

type FFmpegSource = {
  label: string;
  core: string;
  wasm: string;
  classWorker: string;
};

let ffmpeg: FFmpeg | null = null;
let ffmpegLoadPromise: Promise<FFmpeg> | null = null;
let ffmpegLoadStartedAt = 0;
let ffmpegUnavailableUntil = 0;

const FFMPEG_MAX_RETRIES = 1;
const FFMPEG_FETCH_TIMEOUT_MS = 8_000;
const FFMPEG_LOAD_TIMEOUT_MS = 12_000;
const FFMPEG_RETRY_DELAY_MS = 250;
const FFMPEG_COOLDOWN_MS = 90_000;
const FFMPEG_STALE_PROMISE_MS = 12_000;

const FFMPEG_SOURCES: FFmpegSource[] = [
  {
    label: "jsdelivr",
    core: "https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.10/dist/esm/ffmpeg-core.js",
    wasm: "https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.10/dist/esm/ffmpeg-core.wasm",
    classWorker: "https://cdn.jsdelivr.net/npm/@ffmpeg/ffmpeg@0.12.10/dist/esm/worker.js",
  },
  {
    label: "unpkg",
    core: "https://unpkg.com/@ffmpeg/core@0.12.10/dist/esm/ffmpeg-core.js",
    wasm: "https://unpkg.com/@ffmpeg/core@0.12.10/dist/esm/ffmpeg-core.wasm",
    classWorker: "https://unpkg.com/@ffmpeg/ffmpeg@0.12.10/dist/esm/worker.js",
  },
];

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timeoutId: number | undefined;
  const timeoutPromise = new Promise<T>((_, reject) => {
    timeoutId = window.setTimeout(() => reject(new Error(`Timeout: ${label}`)), ms);
  });

  return Promise.race([promise, timeoutPromise]).finally(() => {
    if (timeoutId) window.clearTimeout(timeoutId);
  }) as Promise<T>;
}

export async function loadFFmpeg(onStatus?: FFmpegLoadStatusHandler): Promise<FFmpeg> {
  if (ffmpeg && ffmpeg.loaded) return ffmpeg;

  if (ffmpegLoadPromise) {
    const age = Date.now() - ffmpegLoadStartedAt;
    const remainingWindowMs = Math.max(8_000, FFMPEG_STALE_PROMISE_MS - age);

    try {
      return await withTimeout(
        ffmpegLoadPromise,
        remainingWindowMs,
        "aguardar carregamento em andamento do conversor MP4"
      );
    } catch (pendingErr) {
      console.warn(
        `[FFmpeg] Carregamento em andamento travou (${Math.round(age / 1000)}s). Reiniciando.`,
        pendingErr
      );
      ffmpegLoadPromise = null;
      ffmpegLoadStartedAt = 0;
      ffmpeg = null;
    }
  }

  const now = Date.now();
  if (ffmpegUnavailableUntil > now) {
    const cooldownSeconds = Math.ceil((ffmpegUnavailableUntil - now) / 1000);
    throw new Error(`Conversor MP4 temporariamente indisponível. Tente novamente em ${cooldownSeconds}s.`);
  }

  ffmpegLoadStartedAt = Date.now();
  ffmpegLoadPromise = (async () => {
    let lastErr: unknown = null;

    for (let attempt = 0; attempt < FFMPEG_MAX_RETRIES; attempt++) {
      for (const source of FFMPEG_SOURCES) {
        const sourceLabel = `${source.label} • tentativa ${attempt + 1}/${FFMPEG_MAX_RETRIES}`;
        onStatus?.(`Preparando conversor MP4 (${sourceLabel})...`);

        try {
          const instance = new FFmpeg();

          // Force same-origin worker + core/wasm via blob URL to avoid cross-origin worker hangs
          const [classWorkerURL, coreURL, wasmURL] = await withTimeout(
            Promise.all([
              toBlobURL(source.classWorker, "text/javascript"),
              toBlobURL(source.core, "text/javascript"),
              toBlobURL(source.wasm, "application/wasm"),
            ]),
            FFMPEG_FETCH_TIMEOUT_MS,
            `baixar núcleo MP4 (${sourceLabel})`
          );

          await withTimeout(
            instance.load({ classWorkerURL, coreURL, wasmURL } as any),
            FFMPEG_LOAD_TIMEOUT_MS,
            `carregar conversor MP4 (${sourceLabel})`
          );

          ffmpeg = instance;
          ffmpegUnavailableUntil = 0;
          console.log("[FFmpeg] Loaded successfully", { attempt: attempt + 1, source: source.label });
          return instance;
        } catch (err) {
          lastErr = err;
          ffmpeg = null;
          console.warn(`[FFmpeg] Load failed (${sourceLabel}):`, err);
        }
      }

      if (attempt < FFMPEG_MAX_RETRIES - 1) {
        await new Promise((r) => setTimeout(r, FFMPEG_RETRY_DELAY_MS));
      }
    }

    ffmpegUnavailableUntil = Date.now() + FFMPEG_COOLDOWN_MS;
    throw lastErr || new Error("FFmpeg failed to load after retries");
  })();

  try {
    return await ffmpegLoadPromise;
  } finally {
    ffmpegLoadPromise = null;
    ffmpegLoadStartedAt = 0;
  }
}

function pickSupportedMimeType(candidates: string[]): string | null {
  for (const c of candidates) {
    if (MediaRecorder.isTypeSupported(c)) return c;
  }
  return null;
}

function normalizeBackgroundVideoUrls(
  backgroundVideoUrls: (string | null)[] | undefined,
  pageCount: number
): (string | null)[] {
  const source = backgroundVideoUrls || [];
  const firstAvailable = source.find((url): url is string => !!url && url.trim().length > 0) || null;

  return Array.from({ length: pageCount }, (_, pageIdx) => {
    const pageUrl = source[pageIdx];
    if (pageUrl && pageUrl.trim().length > 0) return pageUrl;

    const isSignaturePage = pageCount > 1 && pageIdx === pageCount - 1;
    if (!isSignaturePage && firstAvailable) return firstAvailable;

    return null;
  });
}

/**
 * Per-page duration: min(bgVideo.duration, pageDuration).
 * If a page has no bg video, uses the full pageDuration.
 */
interface PerPageFrameInfo {
  pageDurations: number[];        // effective duration per page in seconds
  framesPerPageArr: number[];     // frames per page
  cumulativeFrames: number[];     // cumulative frame offset (start frame of each page)
  totalFrames: number;
}

function computePerPageFrameInfo(
  bgVideos: (HTMLVideoElement | null)[],
  pageCount: number,
  pageDuration: number,
  fps: number
): PerPageFrameInfo {
  const pageDurations: number[] = [];
  const framesPerPageArr: number[] = [];
  const cumulativeFrames: number[] = [];
  let total = 0;

  for (let i = 0; i < pageCount; i++) {
    const v = bgVideos[i];
    let dur = pageDuration;
    // If the bg video is shorter than the page, use the video's duration
    if (v && v.duration && isFinite(v.duration) && v.duration > 0) {
      dur = Math.min(v.duration, pageDuration);
    }
    pageDurations.push(dur);
    const frames = Math.max(1, Math.floor(dur * fps));
    framesPerPageArr.push(frames);
    cumulativeFrames.push(total);
    total += frames;
  }

  return { pageDurations, framesPerPageArr, cumulativeFrames, totalFrames: total };
}

/** Convert global frame number to page index and frame-within-page */
function frameToPageInfo(
  frameNum: number,
  cumulativeFrames: number[],
  framesPerPageArr: number[]
): { pageIdx: number; frameInPage: number } {
  for (let p = cumulativeFrames.length - 1; p >= 0; p--) {
    if (frameNum >= cumulativeFrames[p]) {
      return { pageIdx: p, frameInPage: frameNum - cumulativeFrames[p] };
    }
  }
  return { pageIdx: 0, frameInPage: frameNum };
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

const FFMPEG_MUX_TIMEOUT_MS = 75_000;
const FFMPEG_TRANSCODE_TIMEOUT_MS = 75_000;
const AUDIO_FETCH_TIMEOUT_MS = 20_000;

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

async function transcodeToTrueMp4(params: {
  inputBlob: Blob;
  inputFileName: string;
  audioUrl?: string;
  videoDurationSec?: number;
}): Promise<Blob> {
  const { inputBlob, inputFileName, audioUrl, videoDurationSec } = params;
  const ff = await loadFFmpeg();

  let audioFileName: string | null = null;

  try {
    await ff.writeFile(inputFileName, await fetchFile(inputBlob));

    if (audioUrl) {
      const audioResponse = await withTimeout(
        fetch(audioUrl, { cache: "no-store" }),
        AUDIO_FETCH_TIMEOUT_MS,
        "baixar trilha de áudio"
      );
      if (!audioResponse.ok) {
        throw new Error(`Falha ao baixar trilha de áudio (${audioResponse.status})`);
      }

      const audioBlob = await withTimeout(
        audioResponse.blob(),
        AUDIO_FETCH_TIMEOUT_MS,
        "processar trilha de áudio"
      );
      if (!audioBlob.size) {
        throw new Error("A trilha de áudio está vazia");
      }

      const audioExt = inferAudioExt(audioUrl, audioBlob.type);
      audioFileName = `audio.${audioExt}`;
      await ff.writeFile(audioFileName, await fetchFile(audioBlob));
    }

    // Use explicit duration (+1s buffer) instead of -shortest to prevent
    // FFmpeg from truncating the last page (signature page).
    const durationLimit = videoDurationSec
      ? ["-t", String(Math.ceil(videoDurationSec) + 1)]
      : [];

    // Gmail/Drive/Outlook need H.264 Baseline + AAC audio to show inline preview.
    // When no external audio is provided, generate a silent AAC track so the
    // container always has both video+audio streams — required for preview.
    const ffmpegArgs = audioFileName
      ? [
          "-i", inputFileName,
          "-stream_loop", "-1", "-i", audioFileName,
          "-map", "0:v:0", "-map", "1:a:0",
          "-c:v", "libx264", "-profile:v", "baseline", "-level", "3.1", "-preset", "veryfast", "-pix_fmt", "yuv420p",
          "-c:a", "aac", "-b:a", "128k", "-ar", "44100", "-ac", "2",
          ...durationLimit, ...(durationLimit.length === 0 ? ["-shortest"] : []),
          "-movflags", "+faststart", "-brand", "isom",
          "-f", "mp4", "-y", "output.mp4",
        ]
      : [
          // Generate silent audio via lavfi so the MP4 always has a valid audio stream
          "-i", inputFileName,
          "-f", "lavfi", "-i", "anullsrc=r=44100:cl=stereo",
          "-map", "0:v:0", "-map", "1:a:0",
          "-c:v", "libx264", "-profile:v", "baseline", "-level", "3.1", "-preset", "veryfast", "-pix_fmt", "yuv420p",
          "-c:a", "aac", "-b:a", "32k", "-ar", "44100", "-ac", "2",
          ...durationLimit, ...(durationLimit.length === 0 ? ["-shortest"] : []),
          "-movflags", "+faststart", "-brand", "isom",
          "-f", "mp4", "-y", "output.mp4",
        ];

    console.log("[FFmpeg] args:", ffmpegArgs.join(" "));

    await withTimeout(
      ff.exec(ffmpegArgs),
      audioFileName ? FFMPEG_MUX_TIMEOUT_MS : FFMPEG_TRANSCODE_TIMEOUT_MS,
      audioFileName ? "gerar MP4 com áudio" : "gerar MP4 compatível"
    );

    const mp4Data = await ff.readFile("output.mp4");
    // Do NOT patch the ftyp box — FFmpeg already wrote it correctly via -brand isom
    const mp4Blob = new Blob([new Uint8Array(mp4Data as unknown as ArrayBuffer)], { type: "video/mp4" });

    if (!(await isValidMP4(mp4Blob))) {
      throw new Error("Arquivo final inválido: ftyp ausente");
    }

    console.log("[FFmpeg] MP4 final OK, size:", mp4Blob.size, audioFileName ? "(com áudio)" : "(áudio silencioso)");
    return mp4Blob;
  } finally {
    await ff.deleteFile(inputFileName).catch(() => {});
    await ff.deleteFile("output.mp4").catch(() => {});
    if (audioFileName) {
      await ff.deleteFile(audioFileName).catch(() => {});
    }
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

function isFfmpegLoadFailure(err: unknown): boolean {
  const message = err instanceof Error ? err.message.toLowerCase() : String(err).toLowerCase();
  return (
    message.includes("timeout: carregar conversor mp4") ||
    message.includes("timeout: baixar núcleo do conversor mp4") ||
    message.includes("timeout: baixar núcleo mp4") ||
    message.includes("timeout: aguardar carregamento em andamento do conversor mp4") ||
    message.includes("timeout: gerar mp4 com áudio") ||
    message.includes("timeout: gerar mp4 compatível") ||
    message.includes("timeout: baixar trilha de áudio") ||
    message.includes("timeout: processar trilha de áudio") ||
    message.includes("falha ao baixar trilha de áudio") ||
    message.includes("conversor mp4 temporariamente indisponível") ||
    message.includes("tente novamente em") ||
    message.includes("ffmpeg failed to load") ||
    message.includes("failed to load")
  );
}

type Mp4VideoCodec = "h264" | "hevc" | "unknown";

function hasFourCC(bytes: Uint8Array, code: string): boolean {
  const c0 = code.charCodeAt(0);
  const c1 = code.charCodeAt(1);
  const c2 = code.charCodeAt(2);
  const c3 = code.charCodeAt(3);

  for (let i = 0; i <= bytes.length - 4; i++) {
    if (bytes[i] === c0 && bytes[i + 1] === c1 && bytes[i + 2] === c2 && bytes[i + 3] === c3) {
      return true;
    }
  }

  return false;
}

export async function detectMp4VideoCodec(blob: Blob): Promise<Mp4VideoCodec> {
  if (!(await isValidMP4(blob))) return "unknown";

  try {
    const scanSize = Math.min(blob.size, 512 * 1024);
    const bytes = new Uint8Array(await blob.slice(0, scanSize).arrayBuffer());

    if (hasFourCC(bytes, "hvc1") || hasFourCC(bytes, "hev1")) return "hevc";
    if (hasFourCC(bytes, "avc1") || hasFourCC(bytes, "avc3")) return "h264";

    return "unknown";
  } catch {
    return "unknown";
  }
}

async function ensureCompatibleMp4(blob: Blob, context: string): Promise<Blob> {
  const codec = await detectMp4VideoCodec(blob);

  if (codec === "hevc") {
    throw new Error("Vídeo gerado em HEVC (incompatível). Gere novamente para sair em H.264.");
  }

  if (codec === "unknown") {
    console.warn(`[VideoEncoder] Codec não identificado em ${context}; mantendo arquivo por compatibilidade.`);
  }

  return blob;
}

export async function encodeVideoToMP4(pages: string[], options: VideoEncoderOptions): Promise<Blob> {
  const { onProgress, audioUrl, requireEmailSafePreview = false, pageDuration } = options;
  const isMobileDevice = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
  const videoDurationSec = pages.length * pageDuration;

  console.log("[VideoEncoder] Starting encode. mobile:", isMobileDevice, "webcodecs:", hasWebCodecs(), "pages:", pages.length, "duration:", videoDurationSec);
  onProgress?.(0.05);

  // ====== ALL DEVICES: Try WebCodecs first (most reliable — each frame is encoded directly) ======
  if (hasWebCodecs()) {
    console.log("[VideoEncoder] Using WebCodecs path (direct frame encoding)", audioUrl ? "(with audio)" : "(no audio)");

    const attempts: { label: string; opts: VideoEncoderOptions }[] = [{ label: "full-res", opts: { ...options, audioUrl } }];

    // Add reduced resolution fallback for large canvases
    if (options.width > 720 || options.height > 1280) {
      const scale = Math.min(720 / options.width, 1280 / options.height, 1);
      const rw = Math.round(options.width * scale / 2) * 2;
      const rh = Math.round(options.height * scale / 2) * 2;
      attempts.push({ label: `reduced-${rw}x${rh}`, opts: { ...options, audioUrl, width: rw, height: rh } });
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

        const audioWasMuxed = !!(rawBlob as any).__hasAudio;
        console.log("[VideoEncoder] WebCodecs done, audioMuxed:", audioWasMuxed, "size:", rawBlob.size);

        // If audio was already muxed via AudioEncoder, skip FFmpeg entirely
        if (audioWasMuxed || (!audioUrl && !requireEmailSafePreview)) {
          const compatibleBlob = await ensureCompatibleMp4(rawBlob, "WebCodecs direto");
          onProgress?.(1);
          return compatibleBlob;
        }

        // Audio was requested but AudioEncoder AAC wasn't available — try FFmpeg
        if (audioUrl && !audioWasMuxed) {
          onProgress?.(0.72);
          try {
            const mp4WithAudio = await withTimeout(
              transcodeToTrueMp4({
                inputBlob: rawBlob,
                inputFileName: "input.mp4",
                audioUrl,
                videoDurationSec,
              }),
              35_000,
              "gerar MP4 com áudio"
            );
            console.log("[VideoEncoder] MP4 com áudio via FFmpeg, size:", mp4WithAudio.size);
            onProgress?.(1);
            return mp4WithAudio;
          } catch (transcodeErr) {
            console.warn("[VideoEncoder] FFmpeg transcode failed, returning video without audio:", transcodeErr);
            const compatibleBlob = await ensureCompatibleMp4(rawBlob, "WebCodecs sem áudio");
            onProgress?.(1);
            return compatibleBlob;
          }
        }

        // Email-safe preview without audio
        if (requireEmailSafePreview) {
          onProgress?.(0.72);
          try {
            const mp4Safe = await withTimeout(
              transcodeToTrueMp4({
                inputBlob: rawBlob,
                inputFileName: "input.mp4",
                videoDurationSec,
              }),
              35_000,
              "gerar MP4 compatível"
            );
            onProgress?.(1);
            return mp4Safe;
          } catch (transcodeErr) {
            if (isFfmpegLoadFailure(transcodeErr) && await isValidMP4(rawBlob)) {
              const compatibleBlob = await ensureCompatibleMp4(rawBlob, "WebCodecs fallback email-safe");
              console.warn("[VideoEncoder] FFmpeg indisponível, usando MP4 bruto compatível.", transcodeErr);
              onProgress?.(1);
              return compatibleBlob;
            }
            throw transcodeErr;
          }
        }
        const compatibleBlob = await ensureCompatibleMp4(rawBlob, "WebCodecs final");
        onProgress?.(1);
        return compatibleBlob;
      } catch (wcErr) {
        console.error("[VideoEncoder] WebCodecs FAILED (" + attempt.label + "):", wcErr);
        if (attempt === attempts[attempts.length - 1]) {
          if (isMobileDevice) {
            throw new Error("Falha ao gerar vídeo: " + (wcErr instanceof Error ? wcErr.message : String(wcErr)));
          }
          console.log("[VideoEncoder] All WebCodecs attempts failed, trying MediaRecorder fallback...");
        }
        onProgress?.(0.05);
      }
    }
  }

  // ====== FALLBACK: MediaRecorder ======
  const mp4Mime = pickSupportedMimeType(["video/mp4;codecs=avc1", "video/mp4"]);
  const webmMime = pickSupportedMimeType(["video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm"]);
  const recordMime = mp4Mime || webmMime || "video/webm";

  console.log("[VideoEncoder] MediaRecorder fallback, MIME:", recordMime);
  onProgress?.(0.1);

  if (mp4Mime) {
    const nativeMp4 = await withTimeout(
      encodeVideoSimple(pages, options, { mimeType: mp4Mime, outputType: "video/mp4" }),
      300_000,
      "gerar MP4"
    );
    onProgress?.(0.6);

    // Always transcode native MP4 through FFmpeg to guarantee H.264 Baseline
    // (some browsers produce HEVC via MediaRecorder which isn't universally playable)
    onProgress?.(0.72);
    try {
      const mp4H264 = await withTimeout(
        transcodeToTrueMp4({
          inputBlob: nativeMp4,
          inputFileName: "input.mp4",
          audioUrl,
          videoDurationSec,
        }),
        35_000,
        "gerar MP4 compatível"
      );
      onProgress?.(1);
      return mp4H264;
    } catch (transcodeErr) {
      if (isFfmpegLoadFailure(transcodeErr)) {
        // Em fluxo de e-mail/preview seguro, nunca retornar MP4 nativo (pode vir HEVC)
        if (requireEmailSafePreview || audioUrl) {
          throw new Error("Não foi possível gerar MP4 compatível para envio. Tente novamente em Chrome/Edge com conexão estável.");
        }

        // Fora do fluxo de e-mail, só aceita fallback se não for HEVC
        if (await isValidMP4(nativeMp4)) {
          const compatibleNative = await ensureCompatibleMp4(nativeMp4, "MediaRecorder nativo");
          console.warn("[VideoEncoder] FFmpeg indisponível, usando MP4 nativo compatível (fallback).", transcodeErr);
          onProgress?.(1);
          return compatibleNative;
        }
      }
      throw transcodeErr;
    }
  }

  // No native MP4 -> WebM then convert to true MP4 (with optional audio)
  console.log("[VideoEncoder] No native MP4, recording WebM for FFmpeg conversion");
  const webmBlob = await withTimeout(
    encodeVideoSimple(pages, options, { mimeType: webmMime || "video/webm", outputType: "video/webm" }),
    300_000,
    "gerar WebM"
  );

  onProgress?.(0.72);
  const convertedMp4 = await withTimeout(
    transcodeToTrueMp4({
      inputBlob: webmBlob,
      inputFileName: "input.webm",
      audioUrl,
      videoDurationSec,
    }),
    35_000,
    "gerar MP4 compatível"
  );

  onProgress?.(1);
  return convertedMp4;
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
    if (Math.abs(video.currentTime - time) < 0.03) {
      // Already at the right time, but ensure frame is decoded
      if (video.readyState >= 2) { resolve(); return; }
      // Wait briefly for readyState
      const check = () => {
        if (video.readyState >= 2) { resolve(); return; }
        setTimeout(check, 16);
      };
      setTimeout(check, 16);
      setTimeout(resolve, 500); // absolute max wait
      return;
    }
    let settled = false;
    const done = () => {
      if (settled) return;
      settled = true;
      video.removeEventListener("seeked", done);
      // Wait one extra frame for the decoder to present the frame
      requestAnimationFrame(() => resolve());
    };
    // Timeout to prevent hanging forever if seeked never fires
    setTimeout(() => { if (!settled) { settled = true; video.removeEventListener("seeked", done); resolve(); } }, 3000);
    video.addEventListener("seeked", done);
    try {
      video.currentTime = time;
    } catch {
      if (!settled) { settled = true; resolve(); }
    }
  });
}

// Pre-seek all videos to time 0 so the first frame is decoded and ready
async function preSeekVideos(videos: (HTMLVideoElement | null)[]): Promise<void> {
  await Promise.all(videos.map(async (v) => {
    if (!v) return;
    try {
      await seekVideoToTime(v, 0);
      // Double-check readyState
      if (v.readyState < 2) {
        await new Promise<void>((resolve) => {
          const timer = setTimeout(resolve, 1000);
          const check = () => {
            if (v.readyState >= 2) { clearTimeout(timer); resolve(); return; }
            setTimeout(check, 50);
          };
          check();
        });
      }
    } catch { /* ignore */ }
  }));
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

// Check if AudioEncoder supports AAC
async function checkAudioEncoderAAC(): Promise<boolean> {
  try {
    if (typeof AudioEncoder === "undefined") return false;
    const support = await AudioEncoder.isConfigSupported({
      codec: "mp4a.40.2",
      numberOfChannels: 2,
      sampleRate: 44100,
      bitrate: 128000,
    });
    return !!support.supported;
  } catch {
    return false;
  }
}

// Decode audio from URL into a Float32Array (mono or stereo interleaved)
async function decodeAudioForMuxing(audioUrl: string, targetDurationSec: number, sampleRate: number = 44100): Promise<{ left: Float32Array; right: Float32Array; numberOfChannels: number }> {
  const response = await withTimeout(fetch(audioUrl, { cache: "no-store" }), AUDIO_FETCH_TIMEOUT_MS, "baixar trilha de áudio");
  if (!response.ok) throw new Error(`Falha ao baixar trilha de áudio (${response.status})`);
  const arrayBuffer = await withTimeout(response.arrayBuffer(), AUDIO_FETCH_TIMEOUT_MS, "processar trilha de áudio");
  if (!arrayBuffer.byteLength) throw new Error("A trilha de áudio está vazia");

  const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate });
  const decoded = await audioCtx.decodeAudioData(arrayBuffer);
  await audioCtx.close();

  const totalSamples = Math.ceil(targetDurationSec * sampleRate);
  const srcLeft = decoded.getChannelData(0);
  const srcRight = decoded.numberOfChannels > 1 ? decoded.getChannelData(1) : srcLeft;

  // Loop audio to fill the video duration
  const left = new Float32Array(totalSamples);
  const right = new Float32Array(totalSamples);
  for (let i = 0; i < totalSamples; i++) {
    const srcIdx = i % srcLeft.length;
    left[i] = srcLeft[srcIdx];
    right[i] = srcRight[srcIdx];
  }

  return { left, right, numberOfChannels: 2 };
}

// WebCodecs-based full video encoder (replaces MediaRecorder on mobile)
// Replicates the same rendering pipeline as encodeVideoSimple but uses VideoEncoder + mp4-muxer
async function encodeVideoWithWebCodecs(pages: string[], options: VideoEncoderOptions): Promise<Blob> {
  const {
    width, height, pageDuration, fps: rawFps = 24,
    motionEffect = "ken-burns", transitionEffect = "fade",
    textAnimation = "none", logoAnimation = "none", textAnimDuration,
    backgroundVideoUrls, frameOverlayPages, preImageOverlayPages, overlayPages, logoOverlayPages,
    imageRect, pageImageAdjustments, imageClipShape, audioUrl, customOverlayPages, onProgress,
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

  // Helper: load video with reliability-first strategy for export.
  // 1) Try fetch-as-blob first (full random access for deterministic seeks)
  // 2) If blob load fails, fallback to direct URL
  const isMob = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
  const vidDirectTimeout = isMob ? 7_000 : 10_000;
  const vidFetchTimeout = isMob ? 25_000 : 40_000;
  const vidDecodeTimeout = isMob ? 10_000 : 14_000;

  const loadVid = async (url: string): Promise<HTMLVideoElement | null> => {
    if (!url) return null;

    const loadVideoElement = (src: string, timeoutMs: number, blobUrlToCleanup?: string): Promise<HTMLVideoElement | null> => {
      return new Promise<HTMLVideoElement | null>((resolve) => {
        const timer = setTimeout(() => {
          console.warn("[WebCodecs] Vid load timeout:", url.slice(0, 60));
          if (blobUrlToCleanup) URL.revokeObjectURL(blobUrlToCleanup);
          resolve(null);
        }, timeoutMs);

        const video = document.createElement("video");
        video.crossOrigin = "anonymous";
        video.muted = true;
        video.playsInline = true;
        video.preload = "auto";
        video.loop = true;

        let resolved = false;
        const done = () => {
          if (resolved) return;
          resolved = true;
          clearTimeout(timer);
          if (blobUrlToCleanup) (video as any).__blobUrl = blobUrlToCleanup;
          resolve(video);
        };
        const fail = () => {
          if (resolved) return;
          resolved = true;
          clearTimeout(timer);
          if (blobUrlToCleanup) URL.revokeObjectURL(blobUrlToCleanup);
          resolve(null);
        };

        video.onloadedmetadata = done;
        video.onloadeddata = done;
        video.oncanplay = done;
        video.onerror = fail;
        video.src = src;
        try { video.load(); } catch {}
      });
    };

    try {
      try {
        const controller = new AbortController();
        const fetchTimer = setTimeout(() => controller.abort(), vidFetchTimeout);
        const resp = await fetch(url, { signal: controller.signal, cache: "no-store" });
        clearTimeout(fetchTimer);
        if (!resp.ok) throw new Error(`status=${resp.status}`);

        const blob = await resp.blob();
        if (!blob.size) throw new Error("empty blob");

        const blobUrl = URL.createObjectURL(blob);
        const blobVideo = await loadVideoElement(blobUrl, vidDecodeTimeout, blobUrl);
        if (blobVideo) {
          console.log("[WebCodecs] Vid loaded via blob:", url.slice(0, 60));
          return blobVideo;
        }
      } catch (fetchErr) {
        console.warn("[WebCodecs] Blob video load failed, trying direct URL:", url.slice(0, 60), fetchErr);
      }

      const directVideo = await loadVideoElement(url, vidDirectTimeout);
      if (directVideo) {
        console.log("[WebCodecs] Vid loaded via direct URL:", url.slice(0, 60));
        return directVideo;
      }

      console.warn("[WebCodecs] Vid load failed (all strategies):", url.slice(0, 60));
      return null;
    } catch (err) {
      console.warn("[WebCodecs] Vid load error:", err);
      return null;
    }
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
  const normalizedBgVideoUrls = normalizeBackgroundVideoUrls(backgroundVideoUrls, pages.length);

  console.log("[WebCodecs] Loading bg videos...");
  const bgVideos: (HTMLVideoElement | null)[] = await Promise.all(
    normalizedBgVideoUrls.map(url => url ? loadVid(url) : Promise.resolve(null))
  );
  const expectedBgVideoCount = normalizedBgVideoUrls.filter(Boolean).length;
  const loadedBgVideoCount = bgVideos.filter(Boolean).length;
  console.log("[WebCodecs] Bg videos:", loadedBgVideoCount, "of", expectedBgVideoCount, "(normalized mapping)");

  // If videos were expected but none loaded, force fallback path instead of exporting static images.
  if (expectedBgVideoCount > 0 && loadedBgVideoCount === 0) {
    throw new Error("Nenhum vídeo de fundo carregou no modo WebCodecs");
  }

  onProgress?.(0.15);

  // Load overlays (parallel, with timeout)
  console.log("[WebCodecs] Loading overlays...");
  const loadList = (list: string[] | undefined) =>
    Promise.all((list || []).map(url => url ? loadImg(url) : Promise.resolve(null)));
  const [overlayImages, frameOverlayImages, logoOverlayImages, preImageOverlayImages] = await Promise.all([
    loadList(overlayPages), loadList(frameOverlayPages), loadList(logoOverlayPages), loadList(preImageOverlayPages),
  ]);
  console.log("[WebCodecs] Overlays loaded, starting encode...");

  // Load custom overlay images per page
  const customOvImgs: Record<number, HTMLImageElement[]> = {};
  if (customOverlayPages) {
    await Promise.all(Object.entries(customOverlayPages).map(async ([pageIdxStr, ovs]) => {
      const pageIdx = parseInt(pageIdxStr, 10);
      const imgs = await Promise.all(ovs.filter(o => !o.isVideo).map(o => loadImg(o.url)));
      customOvImgs[pageIdx] = imgs.filter(Boolean) as HTMLImageElement[];
    }));
  }

  onProgress?.(0.20);

  // Pre-seek all background videos to frame 0 so the first frame is decoded
  console.log("[WebCodecs] Pre-seeking background videos...");
  await preSeekVideos(bgVideos);
  console.log("[WebCodecs] Pre-seek done");

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d")!;

  // Per-page duration: min(bgVideo.duration, pageDuration)
  const ppInfo = computePerPageFrameInfo(bgVideos, images.length, pageDuration, fps);
  const { pageDurations: perPageDurations, framesPerPageArr, cumulativeFrames, totalFrames } = ppInfo;
  const framesPerPage = Math.max(1, Math.floor(pageDuration * fps)); // fallback for non-per-page uses
  const transitionFrames = Math.max(1, Math.floor(fps * 0.5));
  console.log("[WebCodecs] Per-page durations:", perPageDurations, "total frames:", totalFrames);

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

  const drawCustomOverlays = (pageIdx: number) => {
    const ovs = customOverlayPages?.[pageIdx];
    const imgs = customOvImgs[pageIdx];
    if (!ovs || !imgs) return;
    let imgIdx = 0;
    for (const ov of ovs) {
      if (ov.isVideo) continue; // video overlays not supported in encoder
      const img = imgs[imgIdx++];
      if (!img) continue;
      ctx.drawImage(img, ov.x, ov.y, ov.width, ov.height);
    }
  };

  // Keep a per-page buffer of the last successfully drawn video frame to avoid flashing
  const lastGoodVideoFrame: Record<number, ImageData | null> = {};

  const renderFrame = (frameNum: number) => {
    const { pageIdx, frameInPage } = frameToPageInfo(frameNum, cumulativeFrames, framesPerPageArr);
    if (pageIdx >= images.length) return;
    const pageFrames = framesPerPageArr[pageIdx];

    const img = images[pageIdx];
    const nextImg = pageIdx + 1 < images.length ? images[pageIdx + 1] : null;
    const bgVideo = bgVideos[pageIdx] || null;
    const isTransitionPhase = frameInPage >= pageFrames - transitionFrames && nextImg;
    const pageProgress = frameInPage / pageFrames;

    // Draw the base image first (no black clear — prevents flashing)
    if (isTransitionPhase && nextImg) {
      const transitionProgress = (frameInPage - (pageFrames - transitionFrames)) / transitionFrames;
      applyTransition(ctx, img, nextImg, transitionProgress, transitionEffect, width, height);
    } else if (bgVideo) {
      // Try drawing video frame; if not ready, use last good frame or static image
      let videoDrawn = false;
      if (bgVideo.readyState >= 2) {
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
          const piov = preImageOverlayImages[pageIdx];
          if (piov) ctx.drawImage(piov, 0, 0, width, height);

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

          // Save this good frame for fallback (base + pre-image + video)
          try { lastGoodVideoFrame[pageIdx] = ctx.getImageData(0, 0, width, height); } catch { /* ignore */ }

          const fov = frameOverlayImages[pageIdx]; if (fov) ctx.drawImage(fov, 0, 0, width, height);
          const ov = overlayImages[pageIdx]; if (ov) drawOverlay(ov, pageProgress);
          const lov = logoOverlayImages[pageIdx]; if (lov) drawLogoOverlay(lov, pageProgress);
          drawCustomOverlays(pageIdx);
          videoDrawn = true;
        } catch {
          // fall through
        }
      }

      // Fallback: use last good video frame if available (prevents flashing to static image)
      if (!videoDrawn) {
        const cached = lastGoodVideoFrame[pageIdx];
        if (cached) {
          ctx.putImageData(cached, 0, 0);
          const fov = frameOverlayImages[pageIdx]; if (fov) ctx.drawImage(fov, 0, 0, width, height);
          const ov = overlayImages[pageIdx]; if (ov) drawOverlay(ov, pageProgress);
          const lov = logoOverlayImages[pageIdx]; if (lov) drawLogoOverlay(lov, pageProgress);
          drawCustomOverlays(pageIdx);
        } else {
          // Last resort: static image
          drawSource(img, true, pageProgress);
          const piov3 = preImageOverlayImages[pageIdx]; if (piov3) ctx.drawImage(piov3, 0, 0, width, height);
          const fov = frameOverlayImages[pageIdx]; if (fov) ctx.drawImage(fov, 0, 0, width, height);
          const ov = overlayImages[pageIdx]; if (ov) drawOverlay(ov, pageProgress);
          const lov = logoOverlayImages[pageIdx]; if (lov) drawLogoOverlay(lov, pageProgress);
          drawCustomOverlays(pageIdx);
        }
      }
    } else {
      drawSource(img, true, pageProgress);
      const piov4 = preImageOverlayImages[pageIdx]; if (piov4) ctx.drawImage(piov4, 0, 0, width, height);
      const fov = frameOverlayImages[pageIdx]; if (fov) ctx.drawImage(fov, 0, 0, width, height);
      const ov = overlayImages[pageIdx]; if (ov) drawOverlay(ov, pageProgress);
      const lov = logoOverlayImages[pageIdx]; if (lov) drawLogoOverlay(lov, pageProgress);
      drawCustomOverlays(pageIdx);
    }
  };

  // Decode audio if provided (in parallel with video setup)
  let audioData: { left: Float32Array; right: Float32Array; numberOfChannels: number } | null = null;
  let canMuxAudio = false;
  const totalDurationSec = totalFrames / fps;

  if (audioUrl) {
    try {
      canMuxAudio = await checkAudioEncoderAAC();
      if (canMuxAudio) {
        console.log("[WebCodecs] AAC AudioEncoder supported, decoding audio...");
        audioData = await decodeAudioForMuxing(audioUrl, totalDurationSec, 44100);
        console.log("[WebCodecs] Audio decoded:", audioData.left.length, "samples for", totalDurationSec.toFixed(1), "s");
      } else {
        console.warn("[WebCodecs] AudioEncoder AAC not supported, video will need FFmpeg for audio");
      }
    } catch (audioErr) {
      console.warn("[WebCodecs] Failed to decode audio, continuing without:", audioErr);
      audioData = null;
    }
  }

  // Set up mp4-muxer + VideoEncoder (with optional audio track)
  console.log("[WebCodecs] Setting up muxer + encoder...", audioData ? "(with AAC audio)" : "(video only)");
  const muxerConfig: any = {
    target: new ArrayBufferTarget(),
    video: { codec: "avc", width, height },
    fastStart: "in-memory",
  };
  if (audioData) {
    muxerConfig.audio = { codec: "aac", numberOfChannels: 2, sampleRate: 44100 };
  }
  const muxer = new Muxer(muxerConfig);

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

  // Set up AudioEncoder if we have audio data
  let audioEncoder: AudioEncoder | null = null;
  let audioChunksReceived = 0;
  if (audioData) {
    audioEncoder = new AudioEncoder({
      output: (chunk, meta) => { muxer.addAudioChunk(chunk, meta ?? undefined); audioChunksReceived++; },
      error: (e) => console.error("[WebCodecs] Audio encoder error:", e),
    });
    audioEncoder.configure({
      codec: "mp4a.40.2",
      numberOfChannels: 2,
      sampleRate: 44100,
      bitrate: 128000,
    });
    console.log("[WebCodecs] AudioEncoder configured for AAC");
  }

  const frameDurationMicros = Math.round(1_000_000 / fps);

  // Reliability-first seek: guarantee decoded frame before drawing to avoid
  // long frozen stretches where only ~1s of background video appears in export.
  const waitForVideoReady = async (video: HTMLVideoElement, timeoutMs: number): Promise<boolean> => {
    if (video.readyState >= 2) return true;

    return await new Promise<boolean>((resolve) => {
      let settled = false;
      const finish = (ok: boolean) => {
        if (settled) return;
        settled = true;
        video.removeEventListener("loadeddata", onReady);
        video.removeEventListener("canplay", onReady);
        resolve(ok);
      };
      const onReady = () => finish(video.readyState >= 2);

      const timer = window.setTimeout(() => finish(video.readyState >= 2), timeoutMs);
      video.addEventListener("loadeddata", onReady);
      video.addEventListener("canplay", onReady);

      const poll = () => {
        if (settled) {
          window.clearTimeout(timer);
          return;
        }
        if (video.readyState >= 2) {
          window.clearTimeout(timer);
          finish(true);
          return;
        }
        window.setTimeout(poll, 20);
      };
      poll();
    });
  };

  const stopBgPlayback = (video: HTMLVideoElement | null) => {
    if (!video) return;
    try {
      video.pause();
    } catch {
      // ignore
    }
  };

  const prepareBgVideoForPage = async (pageIdx: number): Promise<void> => {
    const v = bgVideos[pageIdx];
    if (!v) return;

    try { v.pause(); } catch { /* ignore */ }

    // Seek to t=0 and ensure first frame is decoded
    await seekVideoToTime(v, 0);
    await waitForVideoReady(v, isMob ? 2000 : 1200);
  };

  // Deterministic seek: advance the video to the exact target time for each frame.
  const seekBgVideoToFrameTime = async (video: HTMLVideoElement, frameInPage: number, pageIdx: number): Promise<void> => {
    const pageDur = perPageDurations[pageIdx] || pageDuration;
    const pageFrames = framesPerPageArr[pageIdx] || framesPerPage;
    const targetTime = (frameInPage / pageFrames) * pageDur;

    if (Math.abs(video.currentTime - targetTime) < 0.02) return;
    await seekVideoToTime(video, targetTime);
  };

  console.log("[WebCodecs] Starting frame loop, total:", totalFrames);
  let lastPageIdx = -1;
  let activeBgVideo: HTMLVideoElement | null = null;
  for (let i = 0; i < totalFrames; i++) {
    if (encoderError) throw encoderError;

    const { pageIdx, frameInPage } = frameToPageInfo(i, cumulativeFrames, framesPerPageArr);

    // On page change, swap active video and seek to t=0
    if (pageIdx !== lastPageIdx) {
      if (activeBgVideo) { try { activeBgVideo.pause(); } catch {} }
      lastPageIdx = pageIdx;
      activeBgVideo = bgVideos[pageIdx] || null;
      if (activeBgVideo) {
        await prepareBgVideoForPage(pageIdx);
      }
    } else if (activeBgVideo) {
      // Deterministically seek to the exact time for this frame
      await seekBgVideoToFrameTime(activeBgVideo, frameInPage, pageIdx);
    }

    renderFrame(i);

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

    // Yield to UI and report progress
    if (activeBgVideo) {
      onProgress?.(Math.min(0.95, 0.20 + 0.75 * (i / totalFrames)));
      await new Promise((r) => setTimeout(r, 0));
    } else if (i % 2 === 0) {
      onProgress?.(Math.min(0.95, 0.20 + 0.75 * (i / totalFrames)));
      await new Promise((r) => setTimeout(r, 4));
    }

    if (encoder.encodeQueueSize > 8) {
      await new Promise((r) => setTimeout(r, 10));
    }
  }

  // Pause all videos after encoding
  bgVideos.forEach(v => { if (v) { try { v.pause(); } catch {} } });

  // Encode audio chunks AFTER video frames (audio is non-realtime, just feed the samples)
  if (audioEncoder && audioData) {
    console.log("[WebCodecs] Encoding audio chunks...");
    const CHUNK_SIZE = 1024; // samples per chunk
    const totalSamples = audioData.left.length;
    for (let offset = 0; offset < totalSamples; offset += CHUNK_SIZE) {
      const remaining = Math.min(CHUNK_SIZE, totalSamples - offset);
      // Interleave L/R into planar Float32 for AudioData
      const interleaved = new Float32Array(remaining * 2);
      for (let s = 0; s < remaining; s++) {
        interleaved[s] = audioData.left[offset + s];
        interleaved[remaining + s] = audioData.right[offset + s];
      }
      const audioDataObj = new AudioData({
        format: "f32-planar",
        sampleRate: 44100,
        numberOfFrames: remaining,
        numberOfChannels: 2,
        timestamp: Math.round((offset / 44100) * 1_000_000),
        data: interleaved,
      });
      audioEncoder.encode(audioDataObj);
      audioDataObj.close();

      // Yield periodically
      if (offset % (CHUNK_SIZE * 50) === 0) {
        await new Promise((r) => setTimeout(r, 0));
      }
    }
    console.log("[WebCodecs] Audio encoding done, flushing...");
    try {
      await audioEncoder.flush();
      console.log("[WebCodecs] Audio flush done. Audio chunks:", audioChunksReceived);
    } catch (audioFlushErr) {
      console.warn("[WebCodecs] Audio flush failed:", audioFlushErr);
    }
    try { audioEncoder.close(); } catch {}
  }

  // Cleanup videos
  bgVideos.forEach((v) => {
    if (!v) return;
    v.pause();
    const blobUrl = (v as any).__blobUrl as string | undefined;
    v.src = "";
    if (blobUrl) URL.revokeObjectURL(blobUrl);
  });

  console.log("[WebCodecs] Frame loop done. Video chunks:", chunksReceived, "Audio chunks:", audioChunksReceived, "encoder state:", encoder.state);

  if (encoderError) {
    console.error("[WebCodecs] Encoder had error during loop:", encoderError);
    try { encoder.close(); } catch {}
    throw encoderError;
  }

  try {
    console.log("[WebCodecs] Flushing video encoder...");
    await encoder.flush();
    console.log("[WebCodecs] Flush done. Total video chunks:", chunksReceived);
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
  console.log("[WebCodecs] Done! size:", blob.size, "video chunks:", chunksReceived, "audio chunks:", audioChunksReceived);
  
  if (blob.size < 1000) {
    throw new Error("Vídeo gerado muito pequeno (" + blob.size + " bytes). Possível falha de encoding.");
  }

  // Flag whether audio was muxed so caller knows
  (blob as any).__hasAudio = audioChunksReceived > 0;
  
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
    preImageOverlayPages,
    overlayPages,
    logoOverlayPages,
    imageRect,
    pageImageAdjustments,
    imageClipShape,
    audioUrl,
    customOverlayPages,
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

  // Load background videos for pages that have them (with blob->direct fallback)
  const normalizedBgVideoUrls = normalizeBackgroundVideoUrls(backgroundVideoUrls, pages.length);

  const bgVideos: (HTMLVideoElement | null)[] = await Promise.all(
    normalizedBgVideoUrls.map(async (videoUrl, idx) => {
      if (!videoUrl) return null;

      const loadVideoElement = (src: string, timeoutMs: number, blobUrlToKeep?: string): Promise<HTMLVideoElement | null> => {
        return new Promise((resolve) => {
          const video = document.createElement("video");
          video.muted = true;
          video.playsInline = true;
          video.preload = "auto";
          video.loop = true;

          const timer = setTimeout(() => resolve(null), timeoutMs);
          let settled = false;
          const done = () => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            if (blobUrlToKeep) (video as any).__blobUrl = blobUrlToKeep;
            resolve(video);
          };
          const fail = () => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            if (blobUrlToKeep) URL.revokeObjectURL(blobUrlToKeep);
            resolve(null);
          };

          video.onloadeddata = done;
          video.oncanplay = done;
          video.onerror = fail;
          video.src = src;
          try { video.load(); } catch {}
        });
      };

      try {
        const controller = new AbortController();
        const fetchTimer = setTimeout(() => controller.abort(), isMobileDevice ? 15_000 : 30_000);

        try {
          const resp = await fetch(videoUrl, { cache: "no-store", signal: controller.signal });
          clearTimeout(fetchTimer);
          if (!resp.ok) throw new Error(`status=${resp.status}`);

          const blob = await resp.blob();
          if (!blob.size) throw new Error("empty blob");

          const blobUrl = URL.createObjectURL(blob);
          const blobVideo = await loadVideoElement(blobUrl, 10_000, blobUrl);
          if (blobVideo) {
            console.log(`[VideoEncoder] Video ${idx} loaded via blob: ${blobVideo.videoWidth}x${blobVideo.videoHeight}`);
            return blobVideo;
          }
        } catch (blobErr) {
          clearTimeout(fetchTimer);
          console.warn(`[VideoEncoder] Video ${idx} blob load failed, trying direct URL:`, blobErr);
        }

        const directVideo = await loadVideoElement(videoUrl, 10_000);
        if (directVideo) {
          console.log(`[VideoEncoder] Video ${idx} loaded via direct URL: ${directVideo.videoWidth}x${directVideo.videoHeight}`);
          return directVideo;
        }

        console.warn(`[VideoEncoder] Video ${idx} failed in all load strategies`);
        return null;
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

  // Load pre-image overlay images (shapes below video - z-1)
  const preImageOverlayImages: (HTMLImageElement | null)[] = await Promise.all(
    (preImageOverlayPages || []).map(async (pageUrl) => {
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

  // Load custom overlay images per page
  const simpleCustomOvImgs: Record<number, HTMLImageElement[]> = {};
  if (customOverlayPages) {
    await Promise.all(Object.entries(customOverlayPages).map(async ([pageIdxStr, ovs]) => {
      const pageIdx = parseInt(pageIdxStr, 10);
      const imgs = await Promise.all(ovs.filter(o => !o.isVideo).map(async (o) => {
        try {
          return await new Promise<HTMLImageElement>((resolve, reject) => {
            const img = new Image(); img.crossOrigin = "anonymous";
            img.onload = () => resolve(img); img.onerror = reject; img.src = o.url;
          });
        } catch { return null; }
      }));
      simpleCustomOvImgs[pageIdx] = imgs.filter(Boolean) as HTMLImageElement[];
    }));
  }

  // Pre-seek all background videos to frame 0 so the first frame is decoded
  console.log("[VideoEncoder] Pre-seeking background videos...");
  await preSeekVideos(bgVideos);
  console.log("[VideoEncoder] Pre-seek done");

  // Per-page duration: min(bgVideo.duration, pageDuration)
  const simplePPInfo = computePerPageFrameInfo(bgVideos, images.length, pageDuration, fps);
  const { pageDurations: simplePerPageDurations, framesPerPageArr: simpleFramesPerPageArr, cumulativeFrames: simpleCumulativeFrames, totalFrames: simpleTotalFramesVar } = simplePPInfo;
  const framesPerPage = Math.max(1, Math.floor(pageDuration * fps)); // fallback
  const transitionFrames = Math.max(1, Math.floor(fps * 0.5));
  const totalFrames = simpleTotalFramesVar;
  console.log("[VideoEncoder] Per-page durations:", simplePerPageDurations, "total frames:", totalFrames);

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

  const drawSimpleCustomOverlays = (pageIdx: number) => {
    const ovs = customOverlayPages?.[pageIdx];
    const imgs = simpleCustomOvImgs[pageIdx];
    if (!ovs || !imgs) return;
    let imgIdx = 0;
    for (const ov of ovs) {
      if (ov.isVideo) continue;
      const img = imgs[imgIdx++];
      if (!img) continue;
      ctx.drawImage(img, ov.x, ov.y, ov.width, ov.height);
    }
  };

  // Keep a per-page buffer of the last successfully drawn video frame to avoid flashing
  const simpleLastGoodFrame: Record<number, ImageData | null> = {};

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

    if (isTransitionPhase && nextImg) {
      const transitionProgress = (frameInPage - (framesPerPage - transitionFrames)) / transitionFrames;
      applyTransition(ctx, img, nextImg, transitionProgress, transitionEffect, width, height);
    } else if (bgVideo) {
      let videoDrawn = false;
      if (bgVideo.readyState >= 2) {
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
          const preImgOv = preImageOverlayImages[pageIdx];
          if (preImgOv) ctx.drawImage(preImgOv, 0, 0, width, height);

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

          // Cache this good frame (base + pre-image + video)
          try { simpleLastGoodFrame[pageIdx] = ctx.getImageData(0, 0, width, height); } catch { /* ignore */ }

          const frameOverlay = frameOverlayImages[pageIdx];
          if (frameOverlay) ctx.drawImage(frameOverlay, 0, 0, width, height);
          const overlay = overlayImages[pageIdx];
          if (overlay) drawOverlay(overlay, pageProgress);
          const logoOverlay = logoOverlayImages[pageIdx];
          if (logoOverlay) drawLogoOverlay(logoOverlay, pageProgress);
          drawSimpleCustomOverlays(pageIdx);
          videoDrawn = true;
        } catch (e) {
          console.warn("[VideoEncoder] Video frame draw failed:", e);
        }
      }

      if (!videoDrawn) {
        const cached = simpleLastGoodFrame[pageIdx];
        if (cached) {
          ctx.putImageData(cached, 0, 0);
          const frameOverlay = frameOverlayImages[pageIdx];
          if (frameOverlay) ctx.drawImage(frameOverlay, 0, 0, width, height);
          const overlay = overlayImages[pageIdx];
          if (overlay) drawOverlay(overlay, pageProgress);
          const logoOverlay = logoOverlayImages[pageIdx];
          if (logoOverlay) drawLogoOverlay(logoOverlay, pageProgress);
          drawSimpleCustomOverlays(pageIdx);
        } else {
          drawSource(img, true, pageProgress);
          const piov3s = preImageOverlayImages[pageIdx]; if (piov3s) ctx.drawImage(piov3s, 0, 0, width, height);
          const frameOverlay = frameOverlayImages[pageIdx];
          if (frameOverlay) ctx.drawImage(frameOverlay, 0, 0, width, height);
          const overlay = overlayImages[pageIdx];
          if (overlay) drawOverlay(overlay, pageProgress);
          const logoOverlay = logoOverlayImages[pageIdx];
          if (logoOverlay) drawLogoOverlay(logoOverlay, pageProgress);
          drawSimpleCustomOverlays(pageIdx);
        }
      }
    } else {
      drawSource(img, true, pageProgress);
      const piov4s = preImageOverlayImages[pageIdx]; if (piov4s) ctx.drawImage(piov4s, 0, 0, width, height);
      const frameOverlay = frameOverlayImages[pageIdx];
      if (frameOverlay) ctx.drawImage(frameOverlay, 0, 0, width, height);
      const overlay = overlayImages[pageIdx];
      if (overlay) drawOverlay(overlay, pageProgress);
      const logoOverlay = logoOverlayImages[pageIdx];
      if (logoOverlay) drawLogoOverlay(logoOverlay, pageProgress);
      drawSimpleCustomOverlays(pageIdx);
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
  const videoStream = canvas.captureStream(isIOS ? 0 : fps);
  const outputStream = new MediaStream(videoStream.getVideoTracks());

  let audioCtx: AudioContext | null = null;
  let audioSourceNode: AudioBufferSourceNode | null = null;
  let audioDestination: MediaStreamAudioDestinationNode | null = null;

  if (audioUrl) {
    try {
      const audioResponse = await withTimeout(
        fetch(audioUrl, { cache: "no-store" }),
        AUDIO_FETCH_TIMEOUT_MS,
        "baixar trilha de áudio (fallback)"
      );
      if (!audioResponse.ok) {
        throw new Error(`Falha ao baixar trilha (${audioResponse.status})`);
      }

      const audioBuffer = await withTimeout(
        audioResponse.arrayBuffer(),
        AUDIO_FETCH_TIMEOUT_MS,
        "processar trilha de áudio (fallback)"
      );
      if (!audioBuffer.byteLength) {
        throw new Error("Trilha vazia");
      }

      audioCtx = new AudioContext();
      const decodedAudio = await audioCtx.decodeAudioData(audioBuffer.slice(0));

      audioSourceNode = audioCtx.createBufferSource();
      audioSourceNode.buffer = decodedAudio;
      audioSourceNode.loop = true;

      const gainNode = audioCtx.createGain();
      gainNode.gain.value = 1;

      audioDestination = audioCtx.createMediaStreamDestination();
      audioSourceNode.connect(gainNode);
      gainNode.connect(audioDestination);

      audioDestination.stream.getAudioTracks().forEach((track) => outputStream.addTrack(track));

      if (audioCtx.state === "suspended") {
        await audioCtx.resume();
      }
      audioSourceNode.start(0);
      console.log("[VideoEncoder] Audio track embedded in MediaRecorder fallback stream.");
    } catch (audioErr) {
      console.error("[VideoEncoder] Failed to embed template audio in fallback stream:", audioErr);
      throw new Error("Falha ao preparar áudio do template para exportação.");
    }
  }

  console.log("[VideoEncoder] Stream tracks:", outputStream.getTracks().length, "active:", outputStream.active);

  let mediaRecorder: MediaRecorder;
  try {
    mediaRecorder = new MediaRecorder(outputStream, {
      mimeType: chosenMime,
      videoBitsPerSecond: isMobileDevice ? 2_500_000 : bitrate,
    });
  } catch (mrErr) {
    console.error("[VideoEncoder] MediaRecorder creation failed:", mrErr);
    // Try without options
    mediaRecorder = new MediaRecorder(outputStream);
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

    const cleanupRecorderResources = () => {
      bgVideos.forEach((v) => {
        if (!v) return;
        v.pause();
        const blobUrl = (v as any).__blobUrl as string | undefined;
        v.src = "";
        if (blobUrl) URL.revokeObjectURL(blobUrl);
      });
      outputStream.getTracks().forEach((track) => track.stop());
      try {
        audioSourceNode?.stop();
      } catch {
        // ignore double-stop
      }
      audioSourceNode?.disconnect();
      audioDestination?.stream.getTracks().forEach((track) => track.stop());
      if (audioCtx) {
        audioCtx.close().catch(() => {});
      }
    };

    mediaRecorder.onstop = () => {
      if (stallTimer) window.clearTimeout(stallTimer);
      cleanupRecorderResources();
      const result = new Blob(chunks, { type: outType });
      console.log("[VideoEncoder] Stopped. chunks:", chunks.length, "size:", result.size, "dataEvents:", dataEventCount);
      resolve(result);
    };
    mediaRecorder.onerror = (e) => {
      console.error("[VideoEncoder] MediaRecorder error:", e);
      if (stallTimer) window.clearTimeout(stallTimer);
      cleanupRecorderResources();
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

    const hasAnimatedBackground = bgVideos.some((v) => !!v);
    const useRealtimePacing = isMobileDevice || hasAnimatedBackground;
    const FRAMES_PER_BATCH = useRealtimePacing ? 1 : 4;
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
        // Realtime pacing is mandatory for MediaRecorder when a background video is used,
        // otherwise the video track advances only ~1s while we render many synthetic frames.
        if (useRealtimePacing) {
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
        { name: "libx264-noaudio", args: ["-c:v", "libx264", "-profile:v", "baseline", "-level", "3.1", "-preset", "fast", "-crf", "23", "-pix_fmt", "yuv420p", "-an", ...durationArgs] },
        { name: "mpeg4-noaudio", args: ["-c:v", "mpeg4", "-q:v", "5", "-pix_fmt", "yuv420p", "-an", ...durationArgs] },
      ]
    : [
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
