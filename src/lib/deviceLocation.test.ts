import { afterEach, describe, expect, it, vi } from 'vitest';
import { captureDeviceLocation, settleWithin } from './deviceLocation';

const stubBrowser = (state: PermissionState, getCurrentPosition: Geolocation['getCurrentPosition']) => {
  vi.stubGlobal('isSecureContext', true);
  vi.stubGlobal('navigator', {
    permissions: { query: vi.fn().mockResolvedValue({ state }) },
    geolocation: { getCurrentPosition: vi.fn(getCurrentPosition) },
  });
};

afterEach(() => vi.unstubAllGlobals());

describe('captureDeviceLocation', () => {
  it('returns the fix with accuracy and capture time when granted', async () => {
    stubBrowser('granted', success => success({ coords: { latitude: 6.92, longitude: 122.08, accuracy: 15 }, timestamp: Date.UTC(2026, 10, 17) } as GeolocationPosition));
    await expect(captureDeviceLocation({ allowPrompt: false })).resolves.toEqual({
      latitude: 6.92, longitude: 122.08, accuracy: 15, captured_at: '2026-11-17T00:00:00.000Z',
    });
  });

  it('never prompts outside a user-started sign-in, and never asks again after a denial', async () => {
    stubBrowser('prompt', () => {});
    await expect(captureDeviceLocation({ allowPrompt: false })).resolves.toBeNull();
    expect(navigator.geolocation.getCurrentPosition).not.toHaveBeenCalled();

    stubBrowser('denied', () => {});
    await expect(captureDeviceLocation({ allowPrompt: true })).resolves.toBeNull();
    expect(navigator.geolocation.getCurrentPosition).not.toHaveBeenCalled();
  });

  it('resolves null when the browser reports an error', async () => {
    stubBrowser('prompt', (_success, error) => error?.({ code: 1 } as GeolocationPositionError));
    await expect(captureDeviceLocation({ allowPrompt: true })).resolves.toBeNull();
  });
});

describe('settleWithin', () => {
  it('gives up on a pending fix so sign-in is never held up', async () => {
    vi.useFakeTimers();
    const result = settleWithin(new Promise(() => {}), 2500);
    vi.advanceTimersByTime(2500);
    await expect(result).resolves.toBeNull();
    vi.useRealTimers();
  });
});
