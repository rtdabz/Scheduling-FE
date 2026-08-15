import { Bell, CheckCircle2 } from 'lucide-react';
import type { ActivityFeedItem } from './ActivityFeed';

interface DashboardNotificationBannerProps {
  items: ActivityFeedItem[];
  unreadCount: number;
  actionLabel: string;
  onAction: () => void;
  onMarkAllRead: () => void;
}

export default function DashboardNotificationBanner({
  items,
  unreadCount,
  actionLabel,
  onAction,
  onMarkAllRead,
}: DashboardNotificationBannerProps) {
  const actionableTypes = new Set([
    'schedule_submitted',
    'schedule_withdrawn',
    'schedule_approved_by_dean',
    'schedule_returned_by_dean',
    'schedule_returned_by_vpaa',
  ]);
  const actionableItems = items.filter((item) => item.type && actionableTypes.has(item.type));
  const unreadItems = actionableItems.filter((item) => item.isUnread);
  const visibleItem = unreadItems[0] ?? actionableItems[0];
  const visibleUnreadCount = visibleItem?.isUnread ? 1 : 0;

  if (!visibleItem) return null;

  return (
    <section className="rounded-xl border border-[#C9952A]/30 bg-[#FFF7E8] px-4 py-3 shadow-sm">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex min-w-0 gap-3">
          <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#C9952A]/15 text-[#7B1113]">
            <Bell size={18} />
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-sm font-extrabold text-[#4e0a10]">Schedule Notifications</h2>
              {visibleUnreadCount > 0 && (
                <span className="rounded-full border border-[#C9952A]/30 bg-white px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[#7B1113]">
                  {visibleUnreadCount} unread
                </span>
              )}
            </div>
            <button
              type="button"
              onClick={onAction}
              className="mt-2 block w-full rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-white/70"
            >
              <p className="text-xs font-bold uppercase tracking-wide text-[#7B1113]">{visibleItem.title}</p>
              <p className="mt-0.5 line-clamp-2 text-sm leading-5 text-slate-700">{visibleItem.action}</p>
              <p className="mt-0.5 text-[11px] font-semibold text-slate-500">{visibleItem.timestamp}</p>
            </button>
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2 lg:justify-end">
          {visibleUnreadCount > 0 && (
            <button
              type="button"
              onClick={onMarkAllRead}
              className="inline-flex items-center gap-1.5 rounded-lg border border-[#C9952A]/30 bg-white px-3 py-2 text-xs font-bold text-[#7B1113] transition-colors hover:bg-[#C9952A]/10"
            >
              <CheckCircle2 size={14} />
              Mark read
            </button>
          )}
          <button
            type="button"
            onClick={onAction}
            className="rounded-lg bg-[#4e0a10] px-3 py-2 text-xs font-bold text-white shadow-sm transition-colors hover:bg-[#C9952A]"
          >
            {actionLabel}
          </button>
        </div>
      </div>
    </section>
  );
}
