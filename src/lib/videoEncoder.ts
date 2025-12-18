// Video encoder using MediaRecorder API
export interface VideoEncoderOptions {
  width: number;
  height: number;
  pageDuration: number; // seconds per page
  transitionDuration?: number; // seconds for transition
  fps?: number;
}

export async function encodeVideoFromPages(
  pages: string[],
  options: VideoEncoderOptions
): Promise<Blob> {
  const {
    width,
    height,
    pageDuration,
    transitionDuration = 0.5,
    fps = 30,
  } = options;

  // Create offscreen canvas
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d")!;

  // Load all page images
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

  // Setup MediaRecorder
  const stream = canvas.captureStream(fps);
  const mediaRecorder = new MediaRecorder(stream, {
    mimeType: "video/webm;codecs=vp9",
    videoBitsPerSecond: 5000000,
  });

  const chunks: Blob[] = [];
  mediaRecorder.ondataavailable = (e) => {
    if (e.data.size > 0) {
      chunks.push(e.data);
    }
  };

  return new Promise((resolve, reject) => {
    mediaRecorder.onstop = () => {
      const blob = new Blob(chunks, { type: "video/webm" });
      resolve(blob);
    };

    mediaRecorder.onerror = reject;
    mediaRecorder.start();

    const totalFramesPerPage = Math.floor(pageDuration * fps);
    const transitionFrames = Math.floor(transitionDuration * fps);

    let currentFrame = 0;
    const totalFrames =
      images.length * totalFramesPerPage +
      (images.length - 1) * transitionFrames;

    const renderFrame = () => {
      if (currentFrame >= totalFrames) {
        mediaRecorder.stop();
        return;
      }

      // Calculate which page we're on and transition state
      let frameInSequence = currentFrame;
      let pageIndex = 0;
      let isTransition = false;
      let transitionProgress = 0;

      for (let i = 0; i < images.length; i++) {
        const pageFrames = totalFramesPerPage;
        const transFrames = i < images.length - 1 ? transitionFrames : 0;

        if (frameInSequence < pageFrames) {
          pageIndex = i;
          break;
        }
        frameInSequence -= pageFrames;

        if (transFrames > 0 && frameInSequence < transFrames) {
          pageIndex = i;
          isTransition = true;
          transitionProgress = frameInSequence / transFrames;
          break;
        }
        frameInSequence -= transFrames;
      }

      // Clear canvas
      ctx.fillStyle = "#000";
      ctx.fillRect(0, 0, width, height);

      if (isTransition && pageIndex < images.length - 1) {
        // Fade transition effect
        const currentImg = images[pageIndex];
        const nextImg = images[pageIndex + 1];

        // Draw current page fading out
        ctx.globalAlpha = 1 - transitionProgress;
        ctx.drawImage(currentImg, 0, 0, width, height);

        // Draw next page fading in
        ctx.globalAlpha = transitionProgress;
        ctx.drawImage(nextImg, 0, 0, width, height);

        ctx.globalAlpha = 1;
      } else {
        // Draw current page
        const img = images[pageIndex];
        if (img) {
          ctx.drawImage(img, 0, 0, width, height);
        }
      }

      currentFrame++;
      requestAnimationFrame(renderFrame);
    };

    renderFrame();
  });
}

// Alternative simpler encoder for better compatibility
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
