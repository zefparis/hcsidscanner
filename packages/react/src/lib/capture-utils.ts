/**
 * Image capture & quality utilities for the DocumentScanner component.
 *
 * These run client-side before calling the API, reducing wasted MRZ
 * analysis attempts on images that are too dark, blurry, or small.
 */

// ─── Types ───────────────────────────────────────────────────────────────────

export interface QualityReport {
  width: number;
  height: number;
  brightness: number; // 0..255
  sharpness: number; // variance of Laplacian (higher = sharper)
  sizeBytes: number;
}

export interface QualityError {
  code: 'too_dark' | 'too_blurry' | 'too_small' | 'empty_capture';
  message: string;
}

// ─── Thresholds ──────────────────────────────────────────────────────────────

const MIN_BRIGHTNESS = 40; // below this → "Luminosité insuffisante"
const MIN_SHARPNESS = 50; // below this → "Document trop flou"
const MIN_WIDTH = 640;
const MIN_HEIGHT = 480;
const MAX_PAYLOAD_BYTES = 4 * 1024 * 1024; // 4 MB
const MAX_DIMENSION = 1280;
const COMPRESS_QUALITY = 0.85;

// ─── Capture helpers ─────────────────────────────────────────────────────────

/**
 * Capture a single frame at the video's native resolution.
 * Returns a canvas (for analysis) and the data URL (for display/send).
 */
export function captureFrameFromVideo(
  video: HTMLVideoElement,
  quality = 0.92,
): { canvas: HTMLCanvasElement; dataUrl: string } | null {
  if (!video.videoWidth || !video.videoHeight) return null;

  const canvas = document.createElement('canvas');
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
  const dataUrl = canvas.toDataURL('image/jpeg', quality);
  return { canvas, dataUrl };
}

/**
 * Capture multiple frames with a delay, return the sharpest one.
 * This helps stabilize the image (reduces motion blur after pressing capture).
 */
export async function captureStabilized(
  video: HTMLVideoElement,
  numFrames = 3,
  intervalMs = 120,
  quality = 0.92,
): Promise<{ canvas: HTMLCanvasElement; dataUrl: string } | null> {
  const frames: { canvas: HTMLCanvasElement; dataUrl: string; sharpness: number }[] = [];

  for (let i = 0; i < numFrames; i++) {
    if (i > 0) await sleep(intervalMs);
    const frame = captureFrameFromVideo(video, quality);
    if (!frame) continue;
    const sharpness = computeSharpness(frame.canvas);
    frames.push({ ...frame, sharpness });
  }

  if (frames.length === 0) return null;

  // Pick the frame with highest sharpness
  frames.sort((a, b) => b.sharpness - a.sharpness);
  return { canvas: frames[0].canvas, dataUrl: frames[0].dataUrl };
}

// ─── Quality analysis ────────────────────────────────────────────────────────

/**
 * Average luminance (0..255) of the image.
 * Uses the standard BT.601 coefficients for perceptual brightness.
 */
export function computeBrightness(canvas: HTMLCanvasElement): number {
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return 0;

  // Sample a center region (60% of the image) for efficiency
  const sx = Math.floor(canvas.width * 0.2);
  const sy = Math.floor(canvas.height * 0.2);
  const sw = Math.floor(canvas.width * 0.6);
  const sh = Math.floor(canvas.height * 0.6);
  const imageData = ctx.getImageData(sx, sy, sw, sh);
  const d = imageData.data;

  let sum = 0;
  const pixelCount = d.length / 4;
  // Sample every 4th pixel for speed on large images
  const step = Math.max(1, Math.floor(pixelCount / 50000)) * 4;
  let sampled = 0;
  for (let i = 0; i < d.length; i += step * 4) {
    sum += 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
    sampled++;
  }
  return sampled > 0 ? sum / sampled : 0;
}

/**
 * Sharpness score based on Laplacian variance.
 * Higher = sharper. Computed on a downsampled grayscale for performance.
 */
export function computeSharpness(canvas: HTMLCanvasElement): number {
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return 0;

  // Downsample to ~320px wide for perf
  const scale = Math.min(1, 320 / canvas.width);
  const w = Math.floor(canvas.width * scale);
  const h = Math.floor(canvas.height * scale);

  const tmp = document.createElement('canvas');
  tmp.width = w;
  tmp.height = h;
  const tmpCtx = tmp.getContext('2d', { willReadFrequently: true });
  if (!tmpCtx) return 0;
  tmpCtx.drawImage(canvas, 0, 0, w, h);

  const imageData = tmpCtx.getImageData(0, 0, w, h);
  const d = imageData.data;

  // Convert to grayscale array
  const gray = new Float32Array(w * h);
  for (let i = 0; i < gray.length; i++) {
    const idx = i * 4;
    gray[i] = 0.299 * d[idx] + 0.587 * d[idx + 1] + 0.114 * d[idx + 2];
  }

  // Compute Laplacian (3x3 kernel: 0 1 0 / 1 -4 1 / 0 1 0)
  let sum = 0;
  let sum2 = 0;
  let count = 0;
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const idx = y * w + x;
      const lap =
        gray[idx - w] +
        gray[idx - 1] +
        gray[idx + 1] +
        gray[idx + w] -
        4 * gray[idx];
      sum += lap;
      sum2 += lap * lap;
      count++;
    }
  }

  if (count === 0) return 0;
  const mean = sum / count;
  const variance = sum2 / count - mean * mean;
  return variance;
}

/**
 * Run all quality checks on a captured canvas.
 * Returns null if OK, or the first QualityError found.
 */
export function validateCapture(
  canvas: HTMLCanvasElement,
): QualityError | null {
  if (!canvas.width || !canvas.height) {
    return { code: 'empty_capture', message: 'Capture vide. Réessayez.' };
  }

  if (canvas.width < MIN_WIDTH || canvas.height < MIN_HEIGHT) {
    return {
      code: 'too_small',
      message: `Rapprochez le document. Résolution trop faible (${canvas.width}×${canvas.height}).`,
    };
  }

  const brightness = computeBrightness(canvas);
  if (brightness < MIN_BRIGHTNESS) {
    return {
      code: 'too_dark',
      message: `Luminosité insuffisante (${Math.round(brightness)}/255). Améliorez l'éclairage.`,
    };
  }

  const sharpness = computeSharpness(canvas);
  if (sharpness < MIN_SHARPNESS) {
    return {
      code: 'too_blurry',
      message: 'Document trop flou. Stabilisez l\'appareil et assurez la mise au point.',
    };
  }

  return null;
}

/**
 * Full quality report (for debug overlay).
 */
export function getQualityReport(
  canvas: HTMLCanvasElement,
  dataUrl: string,
): QualityReport {
  return {
    width: canvas.width,
    height: canvas.height,
    brightness: computeBrightness(canvas),
    sharpness: computeSharpness(canvas),
    sizeBytes: Math.round((dataUrl.length - dataUrl.indexOf(',') - 1) * 0.75),
  };
}

// ─── Compression ─────────────────────────────────────────────────────────────

/**
 * If the data URL exceeds `maxBytes`, resize the longest edge to `maxDim`
 * and re-compress at `quality`. Returns the (possibly smaller) data URL.
 */
export function compressIfNeeded(
  dataUrl: string,
  maxBytes = MAX_PAYLOAD_BYTES,
  maxDim = MAX_DIMENSION,
  quality = COMPRESS_QUALITY,
): Promise<string> {
  return new Promise((resolve) => {
    const approxBytes = (dataUrl.length - dataUrl.indexOf(',') - 1) * 0.75;
    if (approxBytes <= maxBytes) {
      resolve(dataUrl);
      return;
    }

    const img = new Image();
    img.onload = () => {
      let w = img.naturalWidth;
      let h = img.naturalHeight;

      if (w > maxDim || h > maxDim) {
        const ratio = Math.min(maxDim / w, maxDim / h);
        w = Math.round(w * ratio);
        h = Math.round(h * ratio);
      }

      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        resolve(dataUrl);
        return;
      }
      ctx.drawImage(img, 0, 0, w, h);
      resolve(canvas.toDataURL('image/jpeg', quality));
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });
}

/**
 * Load a File (from <input type="file">) as a data URL, with optional
 * resize if it exceeds maxDim.
 */
export function loadFileAsDataUrl(
  file: File,
  maxDim = MAX_DIMENSION,
  quality = 0.92,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      const img = new Image();
      img.onload = () => {
        let w = img.naturalWidth;
        let h = img.naturalHeight;

        if (w <= maxDim && h <= maxDim) {
          resolve(dataUrl);
          return;
        }

        const ratio = Math.min(maxDim / w, maxDim / h);
        w = Math.round(w * ratio);
        h = Math.round(h * ratio);

        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(dataUrl);
          return;
        }
        ctx.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.onerror = () => reject(new Error('invalid_image_file'));
      img.src = dataUrl;
    };
    reader.onerror = () => reject(new Error('file_read_error'));
    reader.readAsDataURL(file);
  });
}

// ─── Utilities ───────────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
