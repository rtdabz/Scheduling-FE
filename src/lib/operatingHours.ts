const TWELVE_HOUR_TIME = /^(\d{1,2}):(\d{2})\s*(AM|PM)$/i;
const TWENTY_FOUR_HOUR_TIME = /^(\d{2}):(\d{2})$/;

export const toTimeInputValue = (value: string): string => {
  const normalized = value.trim();
  const twentyFourHourMatch = normalized.match(TWENTY_FOUR_HOUR_TIME);
  if (twentyFourHourMatch) {
    const hour = Number(twentyFourHourMatch[1]);
    const minute = Number(twentyFourHourMatch[2]);
    return hour <= 23 && minute <= 59 ? normalized : '';
  }

  const twelveHourMatch = normalized.match(TWELVE_HOUR_TIME);
  if (!twelveHourMatch) return '';

  const hour = Number(twelveHourMatch[1]);
  const minute = Number(twelveHourMatch[2]);
  if (hour < 1 || hour > 12 || minute > 59) return '';

  const period = twelveHourMatch[3].toUpperCase();
  const hour24 = period === 'AM'
    ? hour % 12
    : (hour % 12) + 12;

  return `${String(hour24).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
};

export const toApiTime = (value: string): string => {
  const match = value.match(TWENTY_FOUR_HOUR_TIME);
  if (!match) return '';

  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) return '';

  const period = hour >= 12 ? 'PM' : 'AM';
  const hour12 = hour % 12 || 12;
  return `${hour12}:${String(minute).padStart(2, '0')} ${period}`;
};

export const timeInputMinutes = (value: string): number | null => {
  const match = value.match(TWENTY_FOUR_HOUR_TIME);
  if (!match) return null;

  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) return null;

  return (hour * 60) + minute;
};

/**
 * Mirrors TimeslotController::validateClosingTime and ::validateFieldEndTime.
 * An empty field end time is left out of the save, so it is not an error.
 */
export const operatingHoursError = (openingTime: string, closingTime: string, fieldEndTime = ''): string | null => {
  const openingMinutes = timeInputMinutes(openingTime);
  const closingMinutes = timeInputMinutes(closingTime);

  if (openingMinutes === null || closingMinutes === null) {
    return 'Choose a valid opening and closing time.';
  }

  if (closingMinutes <= openingMinutes) {
    return 'Closing time must be later than opening time.';
  }

  if (fieldEndTime === '') return null;

  const fieldEndMinutes = timeInputMinutes(fieldEndTime);
  if (fieldEndMinutes === null) return 'Choose a valid field end time.';
  if (fieldEndMinutes <= openingMinutes) return 'Field end time must be later than opening time.';
  if (fieldEndMinutes > closingMinutes) return 'Field end time cannot be later than closing time.';
  if ((fieldEndMinutes - openingMinutes) % 30 !== 0) return 'Field end time must fall on a 30-minute slot.';

  return null;
};
