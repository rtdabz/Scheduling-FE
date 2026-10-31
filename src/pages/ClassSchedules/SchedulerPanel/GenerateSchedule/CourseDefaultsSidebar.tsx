import { useState } from "react";
import {
  CalendarRange,
  CheckCircle2,
  DoorOpen,
  Settings,
} from "lucide-react";
import { LAB_ROOM_TYPE_OPTIONS, type LabRoomType } from "../../../../lib/labRoomPolicy";
import type { CourseDefaults } from "./courseClassConfig";
import SlideOverPanel from "./SlideOverPanel";

export default function CourseDefaultsSidebar({
  defaults,
  customizedCount,
  onResetCustomized,
  laboratoryEnabled = true,
  labRoomType = "laboratory",
  onLabRoomTypeApply,
  disabled,
  onClose,
  onApply,
}: {
  defaults: CourseDefaults;
  customizedCount: number;
  onResetCustomized: () => void;
  laboratoryEnabled?: boolean;
  labRoomType?: LabRoomType;
  onLabRoomTypeApply?: (next: LabRoomType) => void | Promise<unknown>;
  disabled: boolean;
  onClose: () => void;
  onApply: (next: CourseDefaults) => void;
}) {
  const [allowFridaySaturday, setAllowFridaySaturday] = useState(defaults.allowFridaySaturdaySplit);
  const [labRoomDraft, setLabRoomDraft] = useState<LabRoomType>(labRoomType);

  const draft: CourseDefaults = {
    allowFridaySaturdaySplit: allowFridaySaturday,
  };

  return (
    <SlideOverPanel
      ariaLabel="Default Settings"
      icon={<Settings className="h-5 w-5" />}
      heading={<h3 className="text-base font-black tracking-tight">Default Settings</h3>}
      subheading="Applies to every course without its own Configure settings"
      onClose={onClose}
      footer={(close) => (
        <>
          <button
            type="button"
            onClick={() => close()}
            className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-xs font-bold text-slate-700 transition hover:bg-slate-100"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={disabled}
            onClick={() => close(() => {
              onApply(draft);
              if (laboratoryEnabled && labRoomDraft !== labRoomType) void onLabRoomTypeApply?.(labRoomDraft);
            })}
            className="inline-flex items-center gap-1.5 rounded-lg bg-[#4e0a10] px-4 py-2 text-xs font-black text-white shadow-2xs transition hover:bg-[#34070a] disabled:cursor-not-allowed disabled:opacity-50"
          >
            <CheckCircle2 className="h-4 w-4" /> Apply Defaults
          </button>
        </>
      )}
    >
      {laboratoryEnabled && (
        <div>
          <label
            htmlFor="default-lab-room-requirement"
            className="mb-2 flex items-center gap-1.5 text-xs font-black uppercase tracking-wider text-slate-700"
          >
            <DoorOpen className="h-4 w-4 text-slate-400" />
            Default LAB Room Requirement
          </label>
          <select
            id="default-lab-room-requirement"
            value={labRoomDraft}
            disabled={disabled}
            aria-describedby="default-lab-room-help"
            onChange={(e) => setLabRoomDraft(e.target.value as LabRoomType)}
            className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-800 outline-none transition focus:ring-2 focus:ring-[#C9952A] disabled:cursor-not-allowed disabled:bg-slate-100"
          >
            {LAB_ROOM_TYPE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
          <p id="default-lab-room-help" className="mt-1.5 text-[11px] font-semibold leading-snug text-slate-500">
            The room type used for LAB classes.
          </p>
        </div>
      )}

      <div>
        <p className="mb-2 flex items-center gap-1.5 text-xs font-black uppercase tracking-wider text-slate-700">
          <CalendarRange className="h-4 w-4 text-slate-400" />
          Split Days
        </p>
        <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-slate-200 bg-white p-3 transition hover:bg-slate-50">
          <input
            type="checkbox"
            checked={allowFridaySaturday}
            disabled={disabled}
            aria-describedby="default-friday-saturday-help"
            onChange={(e) => setAllowFridaySaturday(e.target.checked)}
            className="mt-0.5 h-4 w-4 accent-[#4e0a10]"
          />
          <span className="text-xs font-bold text-slate-900">
            Allow Friday and Saturday as Paired Days
          </span>
        </label>
        <p
          id="default-friday-saturday-help"
          className="mt-1.5 text-[11px] font-semibold leading-snug text-slate-500"
        >
          Split courses may also meet Friday + Saturday. Mon/Wed and Tue/Thu are still tried first.
        </p>
      </div>

      {customizedCount > 0 && (
        <div className="space-y-1.5 rounded-xl border border-slate-200 bg-slate-50 p-3 text-[11px] font-semibold text-slate-600">
          <p>
            {customizedCount} course{customizedCount === 1 ? " has" : "s have"} its own
            Configure settings and {customizedCount === 1 ? "is" : "are"} skipped.
            <button
              type="button"
              disabled={disabled}
              onClick={onResetCustomized}
              className="ml-1 font-bold text-[#4e0a10] hover:underline disabled:opacity-50"
            >
              Use defaults for all
            </button>
          </p>
        </div>
      )}
    </SlideOverPanel>
  );
}
