import SectionHeader from './SectionHeader';
import type { LucideIcon } from 'lucide-react';

export interface TeachingLoadItem {
  id: number;
  name: string;
  assignedUnits: number;
  maxUnits: number;
  badgeLabel: string;
}

interface TeachingLoadCardProps {
  title: string;
  icon: LucideIcon;
  items: TeachingLoadItem[];
  emptyMessage: string;
  actionLabel: string;
  onAction: () => void;
}

export default function TeachingLoadCard({
  title,
  icon,
  items,
  emptyMessage,
  actionLabel,
  onAction,
}: TeachingLoadCardProps) {
  return (
    <div className="bg-white p-6 rounded-xl border-[0.5px] border-gray-200 flex flex-col justify-between min-h-[340px]">
      <div>
        <SectionHeader title={title} icon={icon} className="mb-5" />

        <div className="space-y-4 font-sans">
          {items.length === 0 ? (
            <p className="text-center text-gray-400 text-xs py-4 font-sans">{emptyMessage}</p>
          ) : (
            items.map((item) => {
              const pct = item.maxUnits > 0 ? Math.round((item.assignedUnits / item.maxUnits) * 100) : 0;
              let barColor = 'bg-[#F5A623]';
              let textColor = 'text-[#F5A623] bg-amber-50 border-amber-200';

              if (pct > 100) {
                barColor = 'bg-red-500';
                textColor = 'text-red-600 bg-red-50 border-red-200';
              } else if (pct === 100) {
                barColor = 'bg-emerald-500';
                textColor = 'text-emerald-600 bg-emerald-50 border-emerald-200';
              }

              return (
                <div key={item.id} className="space-y-1 pb-2 border-b border-gray-100 last:border-0 last:pb-0 font-sans">
                  <div className="flex justify-between items-center text-xs font-sans">
                    <span className="font-bold text-gray-800 truncate max-w-[130px]" title={item.name}>
                      {item.name}
                    </span>
                    <span className="text-[9px] bg-gray-100 text-gray-500 border border-gray-200 rounded px-1.5 py-0.5 font-bold uppercase">
                      {item.badgeLabel}
                    </span>
                  </div>

                  <div className="flex items-center justify-between gap-2 text-[10px] font-sans">
                    <div className="flex-1 bg-gray-100 h-2 rounded-full overflow-hidden max-w-[120px]">
                      <div
                        className={`h-full rounded-full transition-all duration-500 ${barColor}`}
                        style={{ width: `${Math.min(pct, 100)}%` }}
                      />
                    </div>
                    <div className="flex items-center gap-1">
                      <span className="font-semibold text-gray-400">
                        {item.assignedUnits}/{item.maxUnits}
                      </span>
                      <span className={`text-[9px] px-1.5 py-0.5 rounded font-bold border ${textColor}`}>
                        {pct}%
                      </span>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      <div className="mt-4 flex justify-end border-t border-gray-100 pt-3">
        <button
          type="button"
          onClick={onAction}
          className="text-xs font-bold text-[#5A1220] hover:text-[#410b15] hover:underline flex items-center gap-1.5 cursor-pointer"
        >
          {actionLabel}
        </button>
      </div>
    </div>
  );
}
