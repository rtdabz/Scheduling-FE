let socketId: string | null = null;
let connected = false;
let disconnectHandler: (() => void) | null = null;

export const getLiveSocketId = (): string | null => socketId;

export const isLiveConnected = (): boolean => connected;

export const setLiveSocketState = (id: string | null, isConnected: boolean): void => {
  socketId = id;
  connected = isConnected;
};

export const registerLiveDisconnect = (handler: (() => void) | null): void => {
  disconnectHandler = handler;
};

export const disconnectLiveUpdates = (): void => {
  disconnectHandler?.();
};
