import type { Tour } from 'shepherd.js';

let activeTour: Tour | null = null;

export const startExclusiveTour = async (tour: Tour): Promise<void> => {
  if (activeTour && activeTour !== tour) {
    await activeTour.cancel();
  }
  activeTour = tour;
  const release = () => {
    if (activeTour === tour) activeTour = null;
  };
  tour.once('complete', release);
  tour.once('cancel', release);
  await tour.start();
};

export const cancelActiveTour = (): void => {
  if (activeTour) void activeTour.cancel();
};
