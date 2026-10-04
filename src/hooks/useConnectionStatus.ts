import { useSyncExternalStore } from 'react';
import {
  getConnectionStatus,
  subscribeConnectionStatus,
  type ConnectionStatus,
} from '../lib/connectionStatus';

export function useConnectionStatus(): ConnectionStatus {
  return useSyncExternalStore(subscribeConnectionStatus, getConnectionStatus, getConnectionStatus);
}
