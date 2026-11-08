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
          className="absolute right-0 top-full z-50 mt-2 flex max-h-[min(36rem,calc(100vh-5rem))] w-[min(22.5rem,calc(100vw-1rem))] flex-col overflow-hidden rounded-xl bg-white shadow-[0_12px_28px_rgba(0,0,0,0.2),0_2px_4px_rgba(0,0,0,0.1)]"
        >
          <div className="shrink-0 px-4 pb-2 pt-3">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-2xl font-bold text-slate-900">Notifications</h2>
              {unreadCount > 0 && (
                <button
                  type="button"
                  onClick={() => { void markAllAsRead(); }}
                  className="inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold text-[#4e0a10] transition hover:bg-slate-100"
                >
                  <CheckCheck className="h-3.5 w-3.5" />Mark all read
                </button>
              )}
            </div>
            <div className="mt-2 flex items-center gap-1" role="tablist" aria-label="Filter notifications">
              {(['all', 'unread'] as const).map((value) => (
                <button
                  key={value}
                  type="button"
                  role="tab"
                  aria-selected={filter === value}
                  onClick={() => setFilter(value)}
                  className={`rounded-full px-3 py-1.5 text-sm font-semibold transition ${filter === value ? 'bg-[#4e0a10]/10 text-[#4e0a10]' : 'text-slate-700 hover:bg-slate-100'}`}
                >
                  {value === 'all' ? 'All' : 'Unread'}
                </button>
              ))}
              {unreadCount > 0 && (
                <span className="ml-auto text-xs font-semibold text-slate-500">{unreadCount} unread</span>
              )}
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
            {isLoading && feedItems.length === 0 ? (
              <div className="space-y-3 p-2" aria-busy="true" aria-label="Loading notifications">
                <span className="sr-only">Loading notifications</span>
                {Array.from({ length: 4 }).map((_, index) => (
                  <div key={index} className="flex items-center gap-3">
                    <Skeleton className="h-14 w-14 shrink-0 rounded-full" />
                    <div className="flex-1 space-y-2"><Skeleton className="h-3 w-full" /><Skeleton className="h-3 w-1/3" /></div>
                  </div>
                ))}
              </div>
            ) : visibleItems.length > 0 ? (
              sections.map((section) => (
                <section key={section.label} aria-label={section.label}>
                  <h3 className="px-2 pb-1 pt-2 text-base font-bold text-slate-900">{section.label}</h3>
                  <ul>
                    {section.items.map(item => (
                      <li key={item.id}>
                        <button
                          type="button"
                          onClick={() => { void openItem(item); }}
                          className="flex w-full items-center gap-3 rounded-lg p-2 text-left transition hover:bg-slate-100"
                        >
                          <span className="relative shrink-0">
                            <span className="flex h-14 w-14 items-center justify-center rounded-full bg-[#4e0a10]/10 text-[#4e0a10]">
                              <Bell className="h-6 w-6" />
                            </span>
                            <span className="absolute -bottom-0.5 -right-0.5 flex h-6 w-6 items-center justify-center rounded-full bg-[#C9952A] text-white ring-2 ring-white">
                              <Bell className="h-3 w-3" />
                            </span>
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className={`block line-clamp-3 text-[13px] leading-[1.3] ${item.isUnread ? 'text-slate-900' : 'text-slate-500'}`}>
                              {item.title && <span className="font-bold">{item.title} </span>}
                              <span>{item.action}</span>
                            </span>
                            {item.remarks && (
                              <span className="mt-1 block line-clamp-2 text-xs italic leading-4 text-slate-500">{item.remarks}</span>
                            )}
                            <span className={`mt-0.5 block text-xs ${item.isUnread ? 'font-bold text-[#4e0a10]' : 'text-slate-500'}`}>{item.timestamp}</span>
                          </span>
                          {item.isUnread && <span className="h-3 w-3 shrink-0 rounded-full bg-[#4e0a10]" aria-label="Unread" />}
                        </button>
                      </li>
                    ))}
                  </ul>
                </section>
              ))
            ) : (
              <div className="flex flex-col items-center py-10 text-center">
                <span className="flex h-14 w-14 items-center justify-center rounded-full bg-slate-100 text-slate-400"><Bell className="h-6 w-6" /></span>
                <p className="mt-3 text-sm font-semibold text-slate-500">
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
