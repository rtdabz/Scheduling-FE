import { describe, expect, it } from 'vitest';
import { operatingHoursError, toApiTime, toTimeInputValue } from './operatingHours';

describe('operating hours helpers', () => {
  it('converts API times to native time input values', () => {
    expect(toTimeInputValue('7:00 AM')).toBe('07:00');
    expect(toTimeInputValue('8:00 PM')).toBe('20:00');
  });

  it('converts user-selected times back to the existing API format', () => {
    expect(toApiTime('07:00')).toBe('7:00 AM');
    expect(toApiTime('20:30')).toBe('8:30 PM');
  });

  it('requires closing time to be later than opening time', () => {
    expect(operatingHoursError('07:00', '20:00')).toBeNull();
    expect(operatingHoursError('20:00', '07:00')).toBe('Closing time must be later than opening time.');
  });
});
