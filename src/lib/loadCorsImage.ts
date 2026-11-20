/**
 * Loads an image that will be drawn into a PDF or canvas, which requires a CORS-approved copy.
 *
 * Department logos are served from the API host. When a page has already shown a logo through a plain
 * <img> (no CORS request), the browser may reuse that cached copy for this crossOrigin load and block it
 * for lacking CORS headers, and the logo silently disappears from the printout. If the first load fails,
 * retry once with a cache-busting query so the browser makes a fresh CORS request. Resolves `null` when
 * the image is unavailable, so callers can fall back to a placeholder.
 */
export const loadCorsImage = (url?: string | null): Promise<HTMLImageElement | null> => {
  if (!url) return Promise.resolve(null);

  const attempt = (src: string): Promise<HTMLImageElement | null> =>
    new Promise((resolve) => {
      const image = new Image();
      if (!src.startsWith("data:")) image.crossOrigin = "anonymous";
      image.onload = () => resolve(image);
      image.onerror = () => resolve(null);
      image.src = src;
    });

  return attempt(url).then((image) => {
    if (image || !/^https?:/i.test(url)) return image;
    return attempt(`${url}${url.includes("?") ? "&" : "?"}cors=1`);
  });
};
