import { X, Check } from 'lucide-react';
import tccLogo from '../../assets/logo.jpg';
import municipalLogo from '../../assets/municipal-logo.png';
import type { ApprovalScheduleItem } from './ScheduleApprovalList';

type PreviewStatus = 'pending' | 'approved' | 'rejected';

interface PreviewSection { id: string; name: string }

interface Props<T extends ApprovalScheduleItem> {
  open: boolean;
  title: string;
  status: PreviewStatus;
  statusLabel: string;
  sections: PreviewSection[];
  schedules: T[];
  getCourseCode: (item: T) => string | undefined;
  getCourseName: (item: T) => string | undefined;
  getRoomName: (item: T) => string | undefined;
  getModeLabel: (mode: T['mode']) => string | undefined;
  formatTime: (value: string) => string;
  departmentLogoUrl?: string | null;
  canAct: boolean;
  onApprove: () => void;
  onReject: () => void;
  onClose: () => void;
}

const fullDay = (day: string) => day.length <= 3
  ? ({ mon: 'Monday', tue: 'Tuesday', wed: 'Wednesday', thu: 'Thursday', fri: 'Friday', sat: 'Saturday', sun: 'Sunday' }[day.toLowerCase()] ?? day)
  : day;

export default function ScheduleApprovalPreviewModal<T extends ApprovalScheduleItem>({
  open, title, status, statusLabel, sections, schedules, getCourseCode, getCourseName,
  getRoomName, getModeLabel, formatTime, canAct, onApprove, onReject, onClose,
  departmentLogoUrl,
}: Props<T>) {
  if (!open) return null;
  const grouped = sections.map((section) => ({
    ...section,
    rows: schedules.filter((item) => String(item.section_id) === String(section.id)),
  })).filter((section) => section.rows.length > 0);
  const badge = status === 'approved' ? 'bg-green-50 text-green-700 border-green-200' : status === 'rejected' ? 'bg-red-50 text-red-700 border-red-200' : 'bg-amber-50 text-amber-700 border-amber-200';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-3 backdrop-blur-sm">
      <div className="flex h-[95vh] w-full max-w-7xl flex-col overflow-hidden rounded-xl border border-gray-300 bg-[#F7F4F0] shadow-2xl">
        <div className="flex items-center justify-between border-b border-gray-300 bg-white px-5 py-3">
          <div className="flex items-center gap-3"><h2 className="font-serif text-lg font-bold text-[#1A1410]">{title}</h2><span className={`rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase ${badge}`}>{statusLabel}</span></div>
          <button type="button" onClick={onClose} className="rounded-lg p-1 text-gray-500 hover:bg-gray-100"><X size={20} /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-4 md:p-7">
          <div className="mx-auto max-w-[1120px] border border-black bg-white px-5 py-5 text-black shadow-sm md:px-8">
            <div className="relative border-b-[3px] border-[#7b0c17] pb-3 text-center font-serif">
              <img src={tccLogo} alt="Tagoloan Community College" className="absolute left-3 top-1 h-[83px] w-[83px] object-contain" />
              <img src={municipalLogo} alt="Municipality of Tagoloan" className="absolute right-[10%] top-0 h-[121px] w-[121px] object-contain" />
              {departmentLogoUrl && <img src={departmentLogoUrl} alt="Department logo" className="absolute right-0 top-0 h-[91px] w-[91px] object-contain" />}
              <div className="text-[11px] leading-4 text-gray-600">Republic of the Philippines<br />Province of Misamis Oriental</div>
              <div className="text-xs font-bold">Municipality of Tagoloan</div>
              <div className="mt-1 text-base font-bold text-[#7b0c17]">TAGOLOAN COMMUNITY COLLEGE</div>
              <div className="text-[10px] font-bold text-gray-600">Baluarte, Tagoloan, Misamis Oriental</div>
              <div className="text-[10px] italic text-blue-700 underline">tccadmin@tcc.edu.ph</div>
              <div className="mt-1 text-[9px] text-gray-500">Member: Association of Local Colleges &amp; Universities (ALCU)</div>
              <div className="text-[9px] text-gray-500 underline">Member: Association of Local Colleges &amp; Universities Commission on Accreditation</div>
            </div>
            <div className="mt-3 border border-black">
              <div className="bg-[#7b0c17] py-1 text-center text-sm font-bold text-white">{title.toUpperCase()}</div>
              <div className="border-t border-black py-1 text-center text-xs font-bold">CLASS SCHEDULE AY 2025-2026&nbsp;&nbsp;&nbsp; 2nd Term</div>
            </div>
            {grouped.length === 0 ? <div className="py-16 text-center text-sm italic text-gray-500">This department has no schedule entries.</div> : grouped.map((section) => (
              <div key={section.id} className="mt-4">
                <div className="border border-black bg-white py-1 text-center text-xs font-bold uppercase">{section.name}</div>
                <table className="w-full border-collapse border border-black text-[10px]">
                  <thead>
                    <tr className="font-bold"><th rowSpan={2} className="border border-black px-1 py-1">COURSE CODE</th><th rowSpan={2} className="border border-black px-1 py-1">COURSE DESCRIPTION</th><th colSpan={3} className="border border-black px-1 py-1">UNITS</th><th rowSpan={2} className="border border-black px-1 py-1">DAY</th><th rowSpan={2} className="border border-black px-1 py-1">TIME</th><th rowSpan={2} className="border border-black px-1 py-1">ROOM</th></tr>
                    <tr className="font-bold"><th className="border border-black px-1 py-1">LEC</th><th className="border border-black px-1 py-1">LAB</th><th className="border border-black px-1 py-1">TOTAL</th></tr>
                  </thead>
                  <tbody>{section.rows.map((item) => <tr key={item.id}><td className="border border-black px-1 py-1 text-center">{getCourseCode(item) ?? '—'}</td><td className="border border-black px-1 py-1">{getCourseName(item) ?? '—'}</td><td className="border border-black px-1 py-1 text-center">—</td><td className="border border-black px-1 py-1 text-center">—</td><td className="border border-black px-1 py-1 text-center">—</td><td className="border border-black px-1 py-1 text-center">{fullDay(item.day)}</td><td className="border border-black px-1 py-1 text-center">{formatTime(item.start_time)} – {formatTime(item.end_time)}</td><td className="border border-black px-1 py-1 text-center">{getRoomName(item) || getModeLabel(item.mode) || '—'}</td></tr>)}</tbody>
                </table>
              </div>
            ))}
            <div className="mt-6 grid grid-cols-2 border border-black text-center text-[10px] md:grid-cols-4"><div className="border-r border-black p-3"><div>Prepared by:</div><div className="mt-4 border-b border-black font-bold">&nbsp;</div><i>Program Head</i></div><div className="border-r border-black p-3"><div>Reviewed by:</div><div className="mt-4 border-b border-black font-bold">&nbsp;</div><i>Dean</i></div><div className="border-r border-black p-3"><div>Recommended by:</div><div className="mt-4 border-b border-black font-bold">&nbsp;</div><i>Vice-President for Academic Affairs</i></div><div className="p-3"><div>Approved by:</div><div className="mt-4 border-b border-black font-bold">&nbsp;</div><i>President</i></div></div>
          </div>
        </div>
        <div className="flex items-center justify-between border-t border-gray-300 bg-white px-5 py-3"><div className="flex gap-2">{canAct && <><button type="button" onClick={onApprove} className="inline-flex items-center gap-1 rounded-lg bg-[#4e0a10] px-4 py-2 text-xs font-bold text-white hover:bg-[#C9952A]"><Check size={14} /> Approve</button><button type="button" onClick={onReject} className="rounded-lg border border-red-500 px-4 py-2 text-xs font-bold text-red-600 hover:bg-red-50">Reject</button></>}</div><button type="button" onClick={onClose} className="rounded-lg border border-gray-300 px-4 py-2 text-xs font-bold text-gray-700 hover:bg-gray-50">Close</button></div>
      </div>
    </div>
  );
}
