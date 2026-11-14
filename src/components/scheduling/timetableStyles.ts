/**
 * The one visual language for every weekly timetable, taken from the Schedule Management
 * timetable. Grids, cells, blocks and legends import these instead of restating classes,
 * so a timetable anywhere in the system reads the same as the scheduler's.
 */
import { slotMinutes } from "../../lib/timeGrid";

const BAND_MINUTES = 90;

/** True when the slot closes a 1 hour 30 minute band, whose bottom line is drawn stronger. */
export const endsTimeBand = (slot: number): boolean => {
  const bandSlots = Math.max(1, Math.round(BAND_MINUTES / slotMinutes()));
  return (slot + 1) % bandSlots === 0;
};

/** Quiet day dividers; a faint line every slot and a firmer one closing each 1.5-hour band. */
export const timetableCellBorderClass = (slot: number): string =>
  `border-b border-r border-r-slate-100 ${endsTimeBand(slot) ? "border-b-slate-200" : "border-b-slate-100/80"}`;

/** Interaction states of a grid cell, shared by placement in the scheduler and slot pickers. */
export const TIMETABLE_CELL_STATE = {
  idle: "bg-white",
  /** A slot that can be clicked to place or start something there. */
  available:
    "cursor-pointer bg-[#c9952a]/[0.05] hover:bg-[#c9952a]/15 hover:ring-2 hover:ring-inset hover:ring-[#c9952a]/70 focus:outline-none focus-visible:bg-[#c9952a]/15 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#4e0a10]/60",
  target: "bg-[#c9952a]/15 ring-2 ring-inset ring-[#c9952a]/70",
  conflict: "bg-rose-50 ring-2 ring-inset ring-rose-400/70",
  /** Free, but too short for what is being placed. */
  unavailable:
    "cursor-not-allowed bg-slate-50 bg-[repeating-linear-gradient(135deg,transparent,transparent_4px,rgba(148,163,184,0.12)_4px,rgba(148,163,184,0.12)_8px)]",
} as const;

/** Geometry every block on the grid shares with the scheduler's class cards. */
export const TIMETABLE_BLOCK_BASE = "mx-[3px] my-px min-w-0 box-border overflow-hidden rounded-lg";

/** Time held by something other than a class card the viewer can open. */
export const TIMETABLE_BLOCK_STYLES = {
  occupied:
    "border border-l-[3px] border-slate-300 border-l-slate-500 bg-slate-100 bg-[repeating-linear-gradient(135deg,transparent,transparent_6px,rgba(100,116,139,0.08)_6px,rgba(100,116,139,0.08)_12px)] text-slate-600",
  borrowed: "border-2 border-dashed border-orange-300 bg-orange-50/90 text-orange-800",
  selected: "border-2 border-[#c9952a] bg-[#c9952a]/15 text-[#7a5410] ring-2 ring-[#c9952a]/25",
  invalid: "border-2 border-rose-400 bg-rose-50 text-rose-700 ring-2 ring-rose-400/20",
} as const;

/** Block text, matching the class card's code line and time line. */
export const TIMETABLE_BLOCK_TITLE = "text-[11px] font-black uppercase leading-tight tracking-tight";
export const TIMETABLE_BLOCK_META = "text-[10.5px] font-medium leading-tight";

/** Buttons on the timetable's maroon title bar. Pair with TIMETABLE_HEADER_BUTTON_PRESSED for toggles. */
export const TIMETABLE_HEADER_BUTTON =
  "inline-flex h-9 items-center gap-1.5 rounded-lg border px-3 text-xs font-semibold transition-colors cursor-pointer border-white/20 bg-white/10 text-white hover:border-white/35 hover:bg-white/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#C9952A]/60";
/** A toggle shows its state, not priority: pressed is a brighter fill. */
export const TIMETABLE_HEADER_BUTTON_PRESSED = "!border-white/45 !bg-white/25";

/** Legend swatches, in the same order and colours as the scheduler's legend. */
export const TIMETABLE_SWATCH = {
  major: "border-l-[3px] border-rose-200 border-l-[#4e0a10] bg-rose-50",
  minor: "border-l-[3px] border-amber-200 border-l-[#c9952a] bg-amber-50",
  available: "border-slate-300 bg-white",
  target: "border-[#c9952a]/70 bg-[#c9952a]/15",
  selected: "border-[#4e0a10] bg-white ring-1 ring-[#4e0a10]",
  conflict: "border-rose-400 bg-rose-50",
  occupied: "border-l-[3px] border-slate-300 border-l-slate-500 bg-slate-100",
  borrowed: "border-2 border-dashed border-orange-300 bg-orange-50",
  unavailable: "border-slate-200 bg-slate-50 bg-[repeating-linear-gradient(135deg,transparent,transparent_2px,rgba(148,163,184,0.35)_2px,rgba(148,163,184,0.35)_4px)]",
  requested: "border-2 border-[#c9952a] bg-[#c9952a]/10",
} as const;
