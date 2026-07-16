import SectionHeader from './SectionHeader';
import type { LucideIcon } from 'lucide-react';

export interface ActivityFeedItem {
  id: number;
  action: string;
  timestamp: string;
}

interface ActivityFeedProps {
  title: string;
  icon: LucideIcon;
  items: ActivityFeedItem[];
  emptyMessage: string;
  actionLabel: string;
  onAction: () => void;
}

export default function ActivityFeed({
  title,
  icon,
  items,
  emptyMessage,
  actionLabel,
  onAction,
}: ActivityFeedProps) {
  return (
    <div className="lg:col-span-2 bg-white p-6 rounded-xl border-[0.5px] border-gray-200 flex flex-col justify-between min-h-[280px]">
      <div>
        <SectionHeader title={title} icon={icon} className="mb-6" />

        {items.length === 0 ? (
          <p className="text-muted text-sm italic">{emptyMessage}</p>
        ) : (
          <div className="relative pl-6 space-y-6 before:absolute before:left-2 before:top-2 before:bottom-2 before:w-0.5 before:bg-gray-100">
            {items.map((item, index) => (
              <div key={item.id} className="relative flex items-start gap-4">
                <div className={`absolute -left-[22px] mt-1.5 w-3.5 h-3.5 rounded-full bg-white border-2 ${
                  index === 0 ? 'border-[#F5A623]' : 'border-gray-300'
                } flex items-center justify-center`} />
                <div className="flex-1">
                  <p className="text-sm text-gray-700 leading-snug">{item.action}</p>
                  <span className="text-xs text-gray-400 mt-1 block font-medium">{item.timestamp}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="mt-6 flex justify-end border-t border-gray-100 pt-4">
        <button
          type="button"
          onClick={onAction}
          className="text-xs font-bold text-[#5A1220] hover:text-[#410b15] hover:underline flex items-center gap-1.5"
        >
          {actionLabel}
        </button>
      </div>
    </div>
  );
}
