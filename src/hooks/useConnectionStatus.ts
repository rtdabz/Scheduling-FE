import { useSyncExternalStore } from 'react';
import {
  getConnectionStatus,
  subscribeConnectionStatus,
  type ConnectionStatus,
} from '../lib/connectionStatus';

/** The app's current view of its link to the server; see lib/connectionStatus.ts. */
export function useConnectionStatus(): ConnectionStatus {
  return useSyncExternalStore(subscribeConnectionStatus, getConnectionStatus, getConnectionStatus);
}
