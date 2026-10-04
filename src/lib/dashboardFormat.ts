export const grouped = (value: number) => value.toLocaleString();

export const humaniseEvent = (event: string) => {
  const words = event.replace(/[_.]+/g, ' ').trim();
  return words ? words.charAt(0).toUpperCase() + words.slice(1) : 'Activity';
};
