export const PHILIPPINE_TIME_ZONE = 'Asia/Manila';

export const formatPhilippineDate = (value: string | number | Date, options: Intl.DateTimeFormatOptions = {}) =>
  new Intl.DateTimeFormat('en-PH', { ...options, timeZone: PHILIPPINE_TIME_ZONE }).format(new Date(value));

export const getPhilippineNowParts = (value: Date = new Date()) => {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: PHILIPPINE_TIME_ZONE,
    weekday: 'short',
    hour: 'numeric',
    minute: 'numeric',
    hour12: false,
  }).formatToParts(value);
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? '';
  const weekdayIndex = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(get('weekday'));
  return { weekdayIndex, hour: Number(get('hour')) % 24, minute: Number(get('minute')) };
};
