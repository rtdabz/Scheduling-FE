/**
 * Optional browser Geolocation fix attached to sign-in requests for the VPAA Activity Log.
 *
 * Consent is the browser's own permission prompt. Every path resolves (never rejects): denial,
 * timeout, an insecure origin or an unsupported browser all yield `null`, and sign-in proceeds
 * without a location.
 */
export type DeviceLocationPayload = {
  latitude: number;
  longitude: number;
  /** Radius in metres, as reported by the browser. */
  accuracy: number;
  captured_at: string;
};

const FIX_TIMEOUT_MS = 8000;

async function permissionState(): Promise<PermissionState | 'unknown'> {
  try {
    const status = await navigator.permissions?.query({ name: 'geolocation' });
    return status?.state ?? 'unknown';
  } catch {
    return 'unknown';
  }
}

/**
 * Starts acquiring a fix. With `allowPrompt: false` it only reads a location the user has already
 * granted, so no prompt appears outside a sign-in the user started.
 */
export async function captureDeviceLocation({ allowPrompt }: { allowPrompt: boolean }): Promise<DeviceLocationPayload | null> {
  if (typeof navigator === 'undefined' || !navigator.geolocation || !window.isSecureContext) return null;
  const state = await permissionState();
  if (state === 'denied' || (!allowPrompt && state !== 'granted')) return null;

  return new Promise(resolve => {
    navigator.geolocation.getCurrentPosition(
      ({ coords, timestamp }) => {
        const { latitude, longitude, accuracy } = coords;
        resolve(Number.isFinite(latitude) && Number.isFinite(longitude) && Number.isFinite(accuracy)
          ? { latitude, longitude, accuracy, captured_at: new Date(timestamp).toISOString() }
          : null);
      },
      () => resolve(null),
      { enableHighAccuracy: true, timeout: FIX_TIMEOUT_MS, maximumAge: 60_000 },
    );
  });
}

/** Waits for a pending fix at most `ms`, so a slow GPS or an unanswered prompt never holds up sign-in. */
export function settleWithin<T>(pending: Promise<T | null>, ms: number): Promise<T | null> {
  return Promise.race([pending, new Promise<null>(resolve => window.setTimeout(() => resolve(null), ms))]);
}
