import { beforeEach, describe, expect, it } from 'vitest';
import {
  SLOW_RESPONSE_MS,
  getConnectionStatus,
  reportNoResponse,
  reportResponse,
  reportShowingSavedData,
  resetConnectionStatus,
} from './connectionStatus';

describe('connectionStatus', () => {
  beforeEach(() => resetConnectionStatus());

  it('starts online', () => {
    expect(getConnectionStatus()).toEqual({ quality: 'online', showingSavedData: false });
  });

  it('calls a run of unanswered requests offline, and recovers on any answer', () => {
    reportNoResponse();
    expect(getConnectionStatus().quality).toBe('online');

    reportNoResponse();
    expect(getConnectionStatus().quality).toBe('offline');

    reportResponse();
    expect(getConnectionStatus().quality).toBe('online');
  });

  it('flags slow reads only once there are enough samples', () => {
    reportResponse(SLOW_RESPONSE_MS + 1000);
    reportResponse(SLOW_RESPONSE_MS + 1000);
    expect(getConnectionStatus().quality).toBe('online');

    reportResponse(SLOW_RESPONSE_MS + 1000);
    expect(getConnectionStatus().quality).toBe('slow');
  });

  it('ignores a single slow outlier', () => {
    reportResponse(200);
    reportResponse(SLOW_RESPONSE_MS * 5);
    reportResponse(300);
    expect(getConnectionStatus().quality).toBe('online');
  });

  it('clears the saved-data notice once the server answers again', () => {
    reportShowingSavedData();
    expect(getConnectionStatus().showingSavedData).toBe(true);

    reportResponse(100);
    expect(getConnectionStatus().showingSavedData).toBe(false);
  });
});
