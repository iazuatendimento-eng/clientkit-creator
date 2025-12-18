import { FFmpeg } from "@ffmpeg/ffmpeg";
import { fetchFile, toBlobURL } from "@ffmpeg/util";

// Video encoder using MediaRecorder API + FFmpeg for MP4 conversion
export interface VideoEncoderOptions {
  width: number;
  height: number;
  pageDuration: number; // seconds per page
  transitionDuration?: number; // seconds for transition
  fps?: number;
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
      "yuv predominantly",
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
  const { width, height, pageDuration, fps = 24, onProgress } = options;

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d")!;

  // Load all images
  const images: HTMLImageElement[] = await Promise.all(
    pages.map(
      (pageUrl) =>
        new Promise<HTMLImageElement>((resolve, reject) => {
          const img = new Image();
          img.crossOrigin = "anonymous";
          img.onload = () => resolve(img);
          img.onerror = reject;
          img.src = pageUrl;
        })
    )
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
      resolve(new Blob(chunks, { type: outType }));
    };
    mediaRecorder.onerror = reject;
    mediaRecorder.start(250); // fewer callbacks = less overhead

    let pageIdx = 0;
    let frameCount = 0;
    const framesPerPage = Math.max(1, Math.floor(pageDuration * fps));
    const transitionFrames = Math.max(1, Math.floor(fps * 0.5)); // 0.5s transition
    const totalFrames = framesPerPage * images.length;

    const tick = () => {
      if (pageIdx >= images.length) {
        setTimeout(() => mediaRecorder.stop(), 200);
        return;
      }

      const img = images[pageIdx];
      const nextImg = images[pageIdx + 1];

      const frameInPage = frameCount % framesPerPage;
      const isTransitionPhase = frameInPage >= framesPerPage - transitionFrames && nextImg;

      ctx.fillStyle = "#000";
      ctx.fillRect(0, 0, width, height);

      if (isTransitionPhase && nextImg) {
        const progress = (frameInPage - (framesPerPage - transitionFrames)) / transitionFrames;
        ctx.globalAlpha = 1 - progress;
        ctx.drawImage(img, 0, 0, width, height);
        ctx.globalAlpha = progress;
        ctx.drawImage(nextImg, 0, 0, width, height);
        ctx.globalAlpha = 1;
      } else {
        ctx.drawImage(img, 0, 0, width, height);
      }

      frameCount++;
      if (frameCount >= framesPerPage) {
        pageIdx++;
        frameCount = 0;
      }

      onProgress?.(Math.min(0.95, Math.max(0.05, (pageIdx * framesPerPage + frameInPage) / totalFrames)));

      // Render at the requested fps to reduce CPU and avoid long UI hangs
      setTimeout(tick, 1000 / fps);
    };

    tick();
  });
}
