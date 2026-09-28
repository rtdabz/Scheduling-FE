/**
 * Uploaded pictures, shrunk in the browser and stored as data URLs.
 *
 * Each upload form used to carry its own copy of this, and every copy drew
 * onto a transparent canvas and exported JPEG. JPEG has no transparency, so
 * the see-through parts of a PNG logo came out black.
 */

/** The server's cap on a stored department logo, in characters (see StoreDepartmentRequest). */
const LOGO_MAX_LENGTH = 200000;

const loadImage = (file: File) => new Promise<HTMLImageElement>((resolve, reject) => {
  const url = URL.createObjectURL(file);
  const img = new Image();
  img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
  img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Unreadable image')); };
  img.src = url;
});

/** The image's size scaled down, never up, so its longer side is at most `maxDim`. */
export const fitWithin = (width: number, height: number, maxDim: number) => {
  const scale = Math.min(1, maxDim / Math.max(width, height, 1));
  return { width: Math.round(width * scale), height: Math.round(height * scale) };
};

const drawScaled = (img: HTMLImageElement, maxDim: number, background: string | null) => {
  const { width, height } = fitWithin(img.width, img.height, maxDim);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas unavailable');
  if (background) {
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, width, height);
  }
  ctx.drawImage(img, 0, 0, width, height);
  return canvas;
};

/** A person's photo: JPEG over white, so a transparent PNG never turns black. */
export const photoDataUrl = async (file: File, maxDim = 300): Promise<string> => {
  const img = await loadImage(file);
  return drawScaled(img, maxDim, '#ffffff').toDataURL('image/jpeg', 0.85);
};

/**
 * A logo keeps its transparency: WebP, or PNG where the browser cannot encode
 * WebP. Only a PNG too large for the server falls back to JPEG over white.
 */
export const logoDataUrl = async (file: File, maxDim = 300): Promise<string> => {
  const img = await loadImage(file);
  const canvas = drawScaled(img, maxDim, null);
  // toDataURL quietly returns PNG when it cannot encode the requested type.
  const encoded = canvas.toDataURL('image/webp', 0.9);
  if (encoded.length <= LOGO_MAX_LENGTH) return encoded;
  return drawScaled(img, maxDim, '#ffffff').toDataURL('image/jpeg', 0.85);
};
