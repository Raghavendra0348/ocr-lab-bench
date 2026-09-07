export interface PreprocessOptions {
  grayscale: boolean;
  contrast: boolean;
  sharpen: boolean;
  upscale2x: boolean;
  upscale3x: boolean;
  threshold: boolean;
}

export const DEFAULT_PREPROCESS: PreprocessOptions = {
  grayscale: false,
  contrast: false,
  sharpen: false,
  upscale2x: false,
  upscale3x: false,
  threshold: false,
};

export function preprocessEnabled(options: PreprocessOptions): boolean {
  return Object.values(options).some(Boolean);
}

export function describePreprocess(options: PreprocessOptions): string {
  const on = Object.entries(options)
    .filter(([, value]) => value)
    .map(([key]) => key);
  return on.length ? on.join(" + ") : "none";
}

async function blobToBitmap(blob: Blob): Promise<ImageBitmap> {
  try {
    return await createImageBitmap(blob);
  } catch (error) {
    throw new Error(
      `Image could not be decoded (unsupported or corrupted file): ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
}

function convolve(data: Uint8ClampedArray, width: number, height: number, kernel: number[]) {
  const source = new Uint8ClampedArray(data);
  const side = Math.sqrt(kernel.length) | 0;
  const half = (side / 2) | 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let r = 0;
      let g = 0;
      let b = 0;
      for (let ky = 0; ky < side; ky++) {
        for (let kx = 0; kx < side; kx++) {
          const sy = Math.min(height - 1, Math.max(0, y + ky - half));
          const sx = Math.min(width - 1, Math.max(0, x + kx - half));
          const weight = kernel[ky * side + kx]!;
          const si = (sy * width + sx) * 4;
          r += source[si]! * weight;
          g += source[si + 1]! * weight;
          b += source[si + 2]! * weight;
        }
      }
      const di = (y * width + x) * 4;
      data[di] = r;
      data[di + 1] = g;
      data[di + 2] = b;
    }
  }
}

/**
 * Local canvas-only preprocessing. Nothing leaves the browser.
 */
export async function preprocessImage(
  blob: Blob,
  options: PreprocessOptions,
): Promise<{ blob: Blob; width: number; height: number }> {
  const bitmap = await blobToBitmap(blob);
  const scale = options.upscale3x ? 3 : options.upscale2x ? 2 : 1;
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("Canvas 2D context unavailable (possible browser memory pressure).");
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close?.();

  if (options.grayscale || options.contrast || options.sharpen || options.threshold) {
    const image = ctx.getImageData(0, 0, width, height);
    const data = image.data;

    if (options.grayscale || options.threshold) {
      for (let i = 0; i < data.length; i += 4) {
        const gray = 0.299 * data[i]! + 0.587 * data[i + 1]! + 0.114 * data[i + 2]!;
        data[i] = gray;
        data[i + 1] = gray;
        data[i + 2] = gray;
      }
    }

    if (options.contrast) {
      // Linear contrast stretch around mid-gray.
      const factor = 1.6;
      for (let i = 0; i < data.length; i += 4) {
        for (let c = 0; c < 3; c++) {
          data[i + c] = (data[i + c]! - 128) * factor + 128;
        }
      }
    }

    if (options.sharpen) {
      convolve(data, width, height, [0, -1, 0, -1, 5, -1, 0, -1, 0]);
    }

    if (options.threshold) {
      // Otsu global threshold on the luminance histogram.
      const hist = new Array<number>(256).fill(0);
      for (let i = 0; i < data.length; i += 4) hist[data[i]!]! += 1;
      const total = width * height;
      let sum = 0;
      for (let t = 0; t < 256; t++) sum += t * hist[t]!;
      let sumB = 0;
      let wB = 0;
      let best = 0;
      let cut = 128;
      for (let t = 0; t < 256; t++) {
        wB += hist[t]!;
        if (wB === 0) continue;
        const wF = total - wB;
        if (wF === 0) break;
        sumB += t * hist[t]!;
        const mB = sumB / wB;
        const mF = (sum - sumB) / wF;
        const between = wB * wF * (mB - mF) * (mB - mF);
        if (between > best) {
          best = between;
          cut = t;
        }
      }
      for (let i = 0; i < data.length; i += 4) {
        const value = data[i]! > cut ? 255 : 0;
        data[i] = value;
        data[i + 1] = value;
        data[i + 2] = value;
      }
    }

    ctx.putImageData(image, 0, 0);
  }

  const out = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
  if (!out) throw new Error("Preprocessed image could not be encoded.");
  return { blob: out, width, height };
}

export async function imageDimensions(blob: Blob): Promise<{ width: number; height: number }> {
  const bitmap = await blobToBitmap(blob);
  const size = { width: bitmap.width, height: bitmap.height };
  bitmap.close?.();
  return size;
}
