import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, CheckCheck } from 'lucide-react';
import { useSystemNotifications } from '../../hooks/useSystemNotifications';
import type { ActivityFeedItem } from '../overview';
import Skeleton from '../ui/Skeleton';

export default function NotificationBell() {
  const { feedItems, unreadCount, isLoading, markAsRead, markAllAsRead } = useSystemNotifications();
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const wrapper = useRef<HTMLDivElement>(null);
  const [filter, setFilter] = useState<'all' | 'unread'>('all');

  const visibleItems = useMemo(
    () => (filter === 'unread' ? feedItems.filter(item => item.isUnread) : feedItems),
    [feedItems, filter],
  );
  const sections = useMemo(() => {
    const fresh = visibleItems.filter(item => item.isUnread);
    const earlier = visibleItems.filter(item => !item.isUnread);
    return [
      { label: 'New', items: fresh },
      { label: 'Earlier', items: earlier },
    ].filter(section => section.items.length > 0);
  }, [visibleItems]);

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

  const openItem = useCallback(async (item: ActivityFeedItem) => {
    if (item.href) {
      setOpen(false);
      navigate(item.href);
    }
    if (!item.isUnread) return;
    try {
      await markAsRead(item.id);
    } catch {
    }
  }, [markAsRead, navigate]);

  return (
    // Not `relative`: the panel anchors to the header's actions group so it lines up
    // with the account menu (same right edge and top offset) instead of the bell.
    <div ref={wrapper}>
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
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Notifications"
          className="absolute right-0 top-full z-50 mt-2 flex max-h-[min(30rem,calc(100vh-5rem))] w-[min(22.5rem,calc(100vw-1rem))] flex-col overflow-hidden rounded-xl border border-[#4e0a10]/10 bg-white shadow-[0_10px_24px_rgba(78,10,16,0.14),0_2px_4px_rgba(0,0,0,0.06)]"
        >
          <div className="shrink-0 border-b border-[#4e0a10]/10 px-3 pb-2 pt-2.5">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-[15px] font-bold text-[#4e0a10]">Notifications</h2>
              {unreadCount > 0 && (
                <button
                  type="button"
                  onClick={() => { void markAllAsRead(); }}
                  className="inline-flex shrink-0 items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-semibold text-[#4e0a10] transition hover:bg-[#F7F4F0]"
                >
                  <CheckCheck className="h-3.5 w-3.5" />Mark all read
                </button>
              )}
            </div>
            <div className="mt-1.5 flex items-center gap-1" role="tablist" aria-label="Filter notifications">
              {(['all', 'unread'] as const).map((value) => (
                <button
                  key={value}
                  type="button"
                  role="tab"
                  aria-selected={filter === value}
                  onClick={() => setFilter(value)}
                  className={`selection-indicator rounded-full px-2.5 py-1 text-xs font-semibold transition ${filter === value ? '' : 'text-slate-700 hover:bg-[#F7F4F0]'}`}
                >
                  {value === 'all' ? 'All' : 'Unread'}
                </button>
              ))}
              {unreadCount > 0 && (
                <span className="ml-auto text-[11px] font-semibold text-slate-500">{unreadCount} unread</span>
              )}
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto">
            {isLoading && feedItems.length === 0 ? (
              <div className="space-y-3 p-3" aria-busy="true" aria-label="Loading notifications">
                <span className="sr-only">Loading notifications</span>
                {Array.from({ length: 4 }).map((_, index) => (
                  <div key={index} className="flex items-center gap-2.5">
                    <Skeleton className="h-10 w-10 shrink-0 rounded-full" />
                    <div className="flex-1 space-y-2"><Skeleton className="h-3 w-full" /><Skeleton className="h-3 w-1/3" /></div>
                  </div>
                ))}
              </div>
            ) : visibleItems.length > 0 ? (
              sections.map((section) => (
                <section key={section.label} aria-label={section.label}>
                  <h3 className="bg-[#F7F4F0] px-3 py-1 text-[11px] font-bold uppercase tracking-wide text-[#4e0a10]/70">{section.label}</h3>
                  <ul className="divide-y divide-slate-100">
                    {section.items.map(item => (
                      <li key={item.id}>
                        <button
                          type="button"
                          onClick={() => { void openItem(item); }}
                          title={[item.title, item.action, item.remarks].filter(Boolean).join(' — ')}
                          className="flex w-full items-start gap-2.5 px-3 py-2 text-left transition hover:bg-[#F7F4F0]"
                        >
                          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#4e0a10]/10 text-[#4e0a10]">
                            <Bell className="h-[18px] w-[18px]" />
                          </span>
                          <span className="min-w-0 flex-1">
                            {item.title && (
                              <span className={`block truncate text-sm leading-5 ${item.isUnread ? 'font-bold text-slate-900' : 'font-semibold text-slate-600'}`}>{item.title}</span>
                            )}
                            <span className={`line-clamp-2 text-[13px] leading-[1.35] ${item.isUnread ? 'text-slate-700' : 'text-slate-500'}`}>{item.action}</span>
                            {item.remarks && item.remarks.trim().toLowerCase() !== 'none' && (
                              <span className="block truncate text-xs italic leading-4 text-slate-500">{item.remarks}</span>
                            )}
                            <span className={`mt-0.5 block text-[11px] leading-4 ${item.isUnread ? 'font-semibold text-[#4e0a10]' : 'text-slate-400'}`}>{item.timestamp}</span>
                          </span>
                          {item.isUnread && <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-[#4e0a10]" aria-label="Unread" />}
                        </button>
                      </li>
                    ))}
                  </ul>
                </section>
              ))
            ) : (
              <div className="flex flex-col items-center px-3 py-6 text-center">
                <span className="flex h-10 w-10 items-center justify-center rounded-full bg-[#F7F4F0] text-[#4e0a10]/50"><Bell className="h-[18px] w-[18px]" /></span>
                <p className="mt-2 text-[13px] font-semibold text-slate-500">
                  {filter === 'unread' && feedItems.length > 0 ? 'You have no unread notifications.' : 'No notifications yet.'}
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
