/**
 * Dependency-free state shared between the API client and the live-updates
 * connection. Kept apart from liveUpdates.ts so api.ts can read the socket id
 * and end the connection without importing (and bundling) the socket client.
 */

let socketId: string | null = null;
let connected = false;
let disconnectHandler: (() => void) | null = null;

/**
 * Sent as X-Socket-ID so the server leaves this tab out of the broadcast a
 * write triggers -- the tab that made the change already refreshed itself.
 */
export const getLiveSocketId = (): string | null => socketId;

export const isLiveConnected = (): boolean => connected;

export const setLiveSocketState = (id: string | null, isConnected: boolean): void => {
  socketId = id;
  connected = isConnected;
};

export const registerLiveDisconnect = (handler: (() => void) | null): void => {
  disconnectHandler = handler;
};

/** Close the live connection, if one is open (sign-out, expired session). */
export const disconnectLiveUpdates = (): void => {
  disconnectHandler?.();
};
