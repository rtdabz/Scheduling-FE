/** Shared size, shape and focus ring for the system header's icon buttons (menu, notifications, profile). */
export const HEADER_ICON_BUTTON_SHAPE =
  'inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C9952A] focus-visible:ring-offset-2 focus-visible:ring-offset-[#4e0a10]';

/** Menu toggle: the same solid white button as the idle notification bell. */
export const HEADER_ICON_BUTTON =
  `${HEADER_ICON_BUTTON_SHAPE} border-slate-200 bg-white text-slate-700 shadow-sm hover:border-[#4e0a10]/40 hover:text-[#4e0a10] active:bg-slate-100`;

/** Notification bell: white button at rest, maroon while its panel is showing. */
export const HEADER_BELL_BUTTON_IDLE =
  'border-slate-200 bg-white text-slate-600 shadow-sm hover:border-[#4e0a10]/40 hover:text-[#4e0a10]';
export const HEADER_BELL_BUTTON_OPEN = 'border-[#4e0a10] bg-[#4e0a10] text-white shadow-sm';

/** Profile trigger: no fill of its own, just a soft hover wash around the avatar. */
export const HEADER_PROFILE_BUTTON = `${HEADER_ICON_BUTTON_SHAPE} border-transparent hover:bg-white/10`;
