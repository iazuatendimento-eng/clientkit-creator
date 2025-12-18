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

async function loadFFmpeg(): Promise<FFmpeg> {
  if (ffmpeg && ffmpeg.loaded) return ffmpeg;
  
  if (ffmpegLoading) {
    // Wait for existing load
    while (ffmpegLoading) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    if (ffmpeg && ffmpeg.loaded) return ffmpeg;
  }

  ffmpegLoading = true;
  
  try {
    ffmpeg = new FFmpeg();
    
    const baseURL = "https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm";
    
    await ffmpeg.load({
      coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, "text/javascript"),
      wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, "application/wasm"),
    });
    
    return ffmpeg;
  } finally {
    ffmpegLoading = false;
  }
}

// Generate WebM first, then convert to MP4
export async function encodeVideoToMP4(
  pages: string[],
  options: VideoEncoderOptions
): Promise<Blob> {
  const { onProgress } = options;
  
  // Step 1: Generate WebM
  onProgress?.(0.1);
  const webmBlob = await encodeVideoSimple(pages, options);
  
  // Step 2: Load FFmpeg
  onProgress?.(0.3);
  const ff = await loadFFmpeg();
  
  // Step 3: Convert to MP4
  onProgress?.(0.5);
  
  const webmData = await fetchFile(webmBlob);
  await ff.writeFile("input.webm", webmData);
  
  // Convert WebM to MP4 with H.264 codec (Instagram compatible)
  await ff.exec([
    "-i", "input.webm",
    "-c:v", "libx264",
    "-preset", "fast",
    "-crf", "23",
    "-pix_fmt", "yuv420p",
    "-movflags", "+faststart",
    "output.mp4"
  ]);
  
  onProgress?.(0.9);
  
  const mp4Data = await ff.readFile("output.mp4");
  const mp4Blob = new Blob([new Uint8Array(mp4Data as unknown as ArrayBuffer)], { type: "video/mp4" });
  
  // Cleanup
  await ff.deleteFile("input.webm");
  await ff.deleteFile("output.mp4");
  
  onProgress?.(1);
  
  return mp4Blob;
}

// Simple WebM encoder using MediaRecorder
export async function encodeVideoSimple(
  pages: string[],
  options: VideoEncoderOptions
): Promise<Blob> {
  const {
    width,
    height,
    pageDuration,
    fps = 24,
  } = options;

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

  // Try different codecs for compatibility
  let mimeType = "video/webm;codecs=vp9";
  if (!MediaRecorder.isTypeSupported(mimeType)) {
    mimeType = "video/webm;codecs=vp8";
  }
  if (!MediaRecorder.isTypeSupported(mimeType)) {
    mimeType = "video/webm";
  }

  const stream = canvas.captureStream(fps);
  const mediaRecorder = new MediaRecorder(stream, {
    mimeType,
    videoBitsPerSecond: 4000000,
  });

  const chunks: Blob[] = [];
  mediaRecorder.ondataavailable = (e) => {
    if (e.data.size > 0) chunks.push(e.data);
  };

  return new Promise((resolve, reject) => {
    mediaRecorder.onstop = () => {
      resolve(new Blob(chunks, { type: "video/webm" }));
    };
    mediaRecorder.onerror = reject;
    mediaRecorder.start(100); // Collect data every 100ms

    let pageIdx = 0;
    let frameCount = 0;
    const framesPerPage = pageDuration * fps;
    const transitionFrames = Math.floor(fps * 0.5); // 0.5s transition

    const render = () => {
      if (pageIdx >= images.length) {
        setTimeout(() => mediaRecorder.stop(), 200);
        return;
      }

      const img = images[pageIdx];
      const nextImg = images[pageIdx + 1];

      // Check if in transition phase
      const frameInPage = frameCount % framesPerPage;
      const isTransitionPhase = frameInPage >= framesPerPage - transitionFrames && nextImg;

      ctx.fillStyle = "#000";
      ctx.fillRect(0, 0, width, height);

      if (isTransitionPhase && nextImg) {
        const progress = (frameInPage - (framesPerPage - transitionFrames)) / transitionFrames;
        
        // Fade effect
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

      requestAnimationFrame(render);
    };

    render();
  });
}
