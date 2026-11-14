/**
 * Shared look for everything inside a dialog, so forms, notices and action
 * buttons read the same in every module. Use these with `Modal`; the scheduler's
 * workflow dialogs keep their own `scheduler-dialog-*` classes.
 */

/** Standard padded body. Dialogs that pin a table or preview pass their own layout instead. */
export const modalBody = 'space-y-4 px-4 py-4 sm:px-5 sm:py-5';

/**
 * For a form that must own its submit button: give the Modal `bodyClassName="flex flex-col"`, make the
 * form `flex min-h-0 flex-1 flex-col`, then use these for its scrolling fields and pinned action bar.
 */
export const modalFormBody = 'min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4 sm:px-5 sm:py-5';
export const modalFormFooter = 'flex shrink-0 flex-wrap items-center justify-end gap-2.5 border-t border-black/5 bg-[#F7F4F0] px-4 py-3 sm:px-5 sm:py-4';

export const modalLabel = 'mb-1.5 block text-[11px] font-bold uppercase tracking-wide text-slate-500';
export const modalHint = 'mt-1 text-xs leading-5 text-slate-500';
export const modalError = 'mt-1 text-xs font-semibold text-red-600';

const controlBase =
  'w-full rounded-lg border bg-white px-3 text-sm text-slate-800 outline-none transition placeholder:text-slate-400 focus:ring-2 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400';
const controlTone = (hasError: boolean) =>
  hasError ? 'border-red-400 focus:border-red-500 focus:ring-red-500/20' : 'border-slate-200 focus:border-[#C9952A] focus:ring-[#C9952A]/25';

/** Text inputs and native selects: 40px tall, gold focus ring, red when invalid. */
export const modalControl = (hasError = false) => `h-10 ${controlBase} ${controlTone(hasError)}`;
export const modalTextarea = (hasError = false) => `resize-none py-2 leading-5 ${controlBase} ${controlTone(hasError)}`;

const buttonBase =
  'inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-lg px-4 text-sm transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer';

export const modalButton = {
  primary: `${buttonBase} bg-[#4e0a10] font-bold text-white hover:bg-[#6b0e17] focus-visible:ring-[#4e0a10]`,
  secondary: `${buttonBase} border border-slate-300 bg-white font-semibold text-slate-700 hover:bg-slate-100 focus-visible:ring-slate-400`,
  danger: `${buttonBase} bg-red-600 font-bold text-white hover:bg-red-700 focus-visible:ring-red-500`,
  dangerOutline: `${buttonBase} border border-red-300 bg-white font-semibold text-red-600 hover:bg-red-50 focus-visible:ring-red-400`,
  ghost: `${buttonBase} font-semibold text-[#4e0a10] hover:bg-[#4e0a10]/5 focus-visible:ring-[#4e0a10]`,
} as const;

export const modalNotice = {
  error: 'border-red-200 bg-red-50 text-red-700',
  warning: 'border-amber-200 bg-amber-50 text-amber-800',
  info: 'border-slate-200 bg-white text-slate-600',
  success: 'border-emerald-200 bg-emerald-50 text-emerald-800',
} as const;
