import { useCallback, useEffect, useRef, useState } from 'react';
import { Bell, CheckCheck, Loader2 } from 'lucide-react';
import { useSystemNotifications } from '../../hooks/useSystemNotifications';
import type { ActivityFeedItem } from '../overview';

/**
 * Notification bell for the app shell: unread count on the badge, the recent
 * feed in a popover.
 *
 * Mounted once in AppLayout, which every role's routes render inside, so VPAA,
 * Dean, Secretary and Program Head share one implementation. /notifications is
 * scoped to the signed-in user server-side, so the bell needs no role handling
 * of its own.
 */
export default function NotificationBell() {
  const { feedItems, unreadCount, isLoading, markAsRead, markAllAsRead } = useSystemNotifications();
  const [open, setOpen] = useState(false);
  const wrapper = useRef<HTMLDivElement>(null);

  // The two ways a popover is expected to close: a click outside it, and Escape.
  useEffect(() => {
    if (!open) return;

    const onPointerDown = (event: MouseEvent) => {
      if (!wrapper.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };

    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  const readItem = useCallback(async (item: ActivityFeedItem) => {
    if (!item.isUnread) return;
    // A failed write is not worth interrupting the user for: the 15s poll
    // reconciles the badge either way.
    try {
      await markAsRead(item.id);
    } catch {
      /* ignored */
    }
  }, [markAsRead]);

  return (
    <div ref={wrapper} className="relative">
      <button
        type="button"
        onClick={() => setOpen(previous => !previous)}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={unreadCount > 0 ? `Notifications, ${unreadCount} unread` : 'Notifications'}
        className={`relative flex h-10 w-10 items-center justify-center rounded-full border shadow-sm transition ${open ? 'border-[#4e0a10] bg-[#4e0a10] text-white' : 'border-slate-200 bg-white text-slate-600 hover:border-[#4e0a10]/40 hover:text-[#4e0a10]'}`}
      >
        <Bell className="h-[18px] w-[18px]" />
        {unreadCount > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex min-w-[16px] items-center justify-center rounded-full bg-[#b3261e] px-1 text-[9px] font-bold leading-4 text-white ring-2 ring-[#F7F4F0]">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Notifications"
          className="absolute right-0 top-full z-50 mt-2 w-[min(22rem,calc(100vw-2rem))] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl"
        >
          <div className="flex items-center justify-between gap-2 border-b border-slate-100 px-3 py-2.5">
            <div className="flex min-w-0 items-center gap-2">
              <h2 className="text-xs font-extrabold uppercase tracking-wide text-[#4e0a10]">Notifications</h2>
              {unreadCount > 0 && (
                <span className="shrink-0 rounded-full bg-[#C9952A]/15 px-1.5 py-0.5 text-[9px] font-bold text-[#7B1113]">{unreadCount} unread</span>
              )}
            </div>
            {unreadCount > 0 && (
              <button
                type="button"
                onClick={() => { void markAllAsRead(); }}
                className="inline-flex shrink-0 items-center gap-1 text-[10px] font-bold text-[#4e0a10] transition hover:underline"
              >
                <CheckCheck className="h-3 w-3" />Mark all read
              </button>
            )}
          </div>

          <div className="max-h-[22rem] overflow-y-auto">
            {isLoading && feedItems.length === 0 ? (
              <p className="flex items-center justify-center gap-2 py-6 text-[11px] text-slate-400">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />Loading notifications
              </p>
            ) : feedItems.length > 0 ? (
              <ul className="divide-y divide-slate-100">
                {feedItems.map(item => (
                  <li key={item.id}>
                    <button
                      type="button"
                      onClick={() => { void readItem(item); }}
                      className={`flex w-full gap-2 px-3 py-2.5 text-left transition hover:bg-slate-50 ${item.isUnread ? 'bg-[#FFF7E8]/70' : ''}`}
                    >
                      <span className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${item.isUnread ? 'bg-[#b3261e]' : 'bg-slate-200'}`} />
                      <span className="min-w-0 flex-1">
                        {item.title && <span className="block text-[10px] font-bold uppercase tracking-wide text-[#7B1113]">{item.title}</span>}
                        <span className="mt-0.5 block line-clamp-3 text-[11px] leading-4 text-slate-600">{item.action}</span>
                        {item.remarks && (
                          <span className="mt-1 block line-clamp-2 rounded bg-slate-50 px-1.5 py-1 text-[10px] italic leading-4 text-slate-500">{item.remarks}</span>
                        )}
                        <span className="mt-1 block text-[9px] font-semibold text-slate-400">{item.timestamp}</span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="py-6 text-center text-[11px] italic text-slate-400">No notifications yet.</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
