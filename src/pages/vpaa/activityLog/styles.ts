import { buttonClass } from '../../../components/ui/buttonStyles';
/** Shared Activity Log control styles (WICARS maroon focus ring, compact 36px controls). */
export const FIELD = 'h-9 w-full rounded-lg border border-gray-300 bg-white px-2.5 text-xs font-medium text-gray-800 transition-colors hover:border-gray-400 focus:border-[#701522] focus:outline-none focus:ring-2 focus:ring-[#701522]/15';
export const SECONDARY_BUTTON = buttonClass({ variant: 'secondary' });
export const PRIMARY_BUTTON = buttonClass({ variant: 'primary', className: 'relative flex-1 lg:flex-none' });
