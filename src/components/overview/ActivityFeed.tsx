import SectionHeader from './SectionHeader';
import type { LucideIcon } from 'lucide-react';

export interface ActivityFeedItem {
  id: number;
  title?: string;
  action: string;
  timestamp: string;
  remarks?: string;
  isUnread?: boolean;
}

interface ActivityFeedProps {
  title: string;
  icon: LucideIcon;
  items: ActivityFeedItem[];
  emptyMessage: string;
  actionLabel: string;
  onAction: () => void;
  unreadCount?: number;
}

export default function ActivityFeed({
  title,
  icon,
  items,
  emptyMessage,
  actionLabel,
  onAction,
  unreadCount = 0,
}: ActivityFeedProps) {
  return (
    <div className="lg:col-span-2 bg-white p-4 rounded-xl border-[0.5px] border-gray-200 flex flex-col justify-between min-h-[220px]">
      <div>
        <div className="mb-4 flex items-start justify-between gap-3">
          <SectionHeader title={title} icon={icon} />
          {unreadCount > 0 && (
            <span className="rounded-full border border-[#F5A623]/30 bg-[#F5A623]/10 px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wider text-[#5A1220]">
              {unreadCount} unread
            </span>
          )}
        </div>

        {items.length === 0 ? (
          <p className="text-muted text-sm italic">{emptyMessage}</p>
        ) : (
          <div className="relative pl-6 space-y-4 before:absolute before:left-2 before:top-2 before:bottom-2 before:w-0.5 before:bg-gray-100">
            {items.map((item, index) => (
              <div key={item.id} className="relative flex items-start gap-4">
                <div className={`absolute -left-[22px] mt-1.5 w-3.5 h-3.5 rounded-full bg-white border-2 ${
                  index === 0 ? 'border-[#F5A623]' : 'border-gray-300'
                } flex items-center justify-center`} />
                <div className="flex-1">
                  {item.title && (
                    <div className="mb-1 flex items-center gap-2">
                      {item.isUnread && <span className="h-2 w-2 rounded-full bg-[#F5A623]" />}
                      <p className="text-xs font-extrabold uppercase tracking-wider text-[#5A1220]">{item.title}</p>
                    </div>
                  )}
                  <p className="text-sm text-gray-700 leading-snug">{item.action}</p>
                  {item.remarks && (
                    <p className="mt-1 rounded-lg border border-amber-200 bg-amber-50 px-2 py-1 text-xs font-medium leading-relaxed text-amber-800">
                      Remarks: {item.remarks}
                    </p>
                  )}
                  <span className="text-xs text-gray-400 mt-1 block font-medium">{item.timestamp}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="mt-4 flex justify-end border-t border-gray-100 pt-3">
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
