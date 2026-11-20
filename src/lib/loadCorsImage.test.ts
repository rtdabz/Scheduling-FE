import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadCorsImage } from './loadCorsImage';

/** Fake Image: loads succeed unless the src is listed as failing. */
function installImage(failing: string[]) {
  const created: Array<{ src: string; crossOrigin: string | null }> = [];
  class FakeImage {
    crossOrigin: string | null = null;
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    private value = '';
    get src() { return this.value; }
    set src(next: string) {
      this.value = next;
      created.push({ src: next, crossOrigin: this.crossOrigin });
      queueMicrotask(() => (failing.includes(next) ? this.onerror?.() : this.onload?.()));
    }
  }
  vi.stubGlobal('Image', FakeImage);
  return created;
}

afterEach(() => vi.unstubAllGlobals());

describe('loadCorsImage', () => {
  it('loads with CORS so the image can be drawn into a PDF', async () => {
    const created = installImage([]);
    expect(await loadCorsImage('https://api.example.test/api/departments/1/logo?v=2a')).not.toBeNull();
    expect(created).toEqual([{ src: 'https://api.example.test/api/departments/1/logo?v=2a', crossOrigin: 'anonymous' }]);
  });

  it('retries once with a cache-busting CORS request when a cached non-CORS copy is rejected', async () => {
    const url = 'https://api.example.test/api/departments/1/logo?v=2a';
    const created = installImage([url]);
    expect(await loadCorsImage(url)).not.toBeNull();
    expect(created).toEqual([
      { src: url, crossOrigin: 'anonymous' },
      { src: `${url}&cors=1`, crossOrigin: 'anonymous' },
    ]);
  });

  it('resolves null when the image is unavailable, and never retries data URLs', async () => {
    const created = installImage(['https://api.example.test/logo', 'https://api.example.test/logo?cors=1', 'data:image/png;base64,AA']);
    expect(await loadCorsImage('https://api.example.test/logo')).toBeNull();
    expect(await loadCorsImage('data:image/png;base64,AA')).toBeNull();
    expect(await loadCorsImage(null)).toBeNull();
    expect(created.map(({ src }) => src)).toEqual(['https://api.example.test/logo', 'https://api.example.test/logo?cors=1', 'data:image/png;base64,AA']);
  });
});
