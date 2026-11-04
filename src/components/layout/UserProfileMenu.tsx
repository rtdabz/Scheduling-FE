import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { ChevronDown, ChevronRight, LogOut, Settings } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { fetchCurrentUser, forgetCurrentUser } from '../../lib/currentUser';
import { useToast } from '../../context/ToastContext';
import { logoutCurrentSession } from '../../lib/authSession';
import ProfileAvatar from '../ui/ProfileAvatar';
import UserProfileModal, { type ProfileUser as StoredUser } from './UserProfileModal';

const roleLabel = (role?: string) => ({ vpaa: 'VPAA', dean: 'Dean', secretary: 'Secretary', program_head: 'Program Head' }[role?.toLowerCase() ?? ''] || role || 'User');

export default function UserProfileMenu() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [user, setUser] = useState<StoredUser | null>(() => {
    const raw = localStorage.getItem('user') || sessionStorage.getItem('user');
    try { return raw ? JSON.parse(raw) as StoredUser : null; } catch { return null; }
  });
  const [open, setOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const wrapper = useRef<HTMLDivElement>(null);
  const role = user?.role?.toLowerCase() || 'vpaa';
  const photo = user?.profile_picture || user?.photo || user?.avatar;

  const setMenuOpen = (value: boolean) => {
    setOpen(value);
    window.dispatchEvent(new CustomEvent('profile-menu-state', { detail: { open: value } }));
  };

  useEffect(() => {
    fetchCurrentUser<StoredUser>().then(setUser).catch(() => {});
  }, []);

  useEffect(() => {
    const close = (event: MouseEvent) => {
      if (!wrapper.current?.contains(event.target as Node)) setMenuOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  const handleProfileSaved = (saved: StoredUser) => {
    forgetCurrentUser();
    setUser((prev) => ({ ...prev, ...saved }));
    for (const storage of [localStorage, sessionStorage]) {
      const raw = storage.getItem('user');
      if (!raw) continue;
      try { storage.setItem('user', JSON.stringify({ ...JSON.parse(raw), ...saved })); } catch { }
    }
  };

  const logout = () => {
    setLoggingOut(true);
    logoutCurrentSession();
    toast.success('Logged Out', 'You have been successfully logged out.');
    navigate('/', { replace: true });
  };

  return <div ref={wrapper} className="relative">
    <button id="sidebar-profile" type="button" onClick={() => setMenuOpen(!open)} aria-label="Open user profile menu" aria-haspopup="menu" aria-expanded={open} title={`${user?.name || 'Administrator'} · ${roleLabel(user?.role)}`} className="relative flex h-11 w-11 items-center justify-center rounded-full transition hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C9952A]">
      <ProfileAvatar src={photo} alt={user?.name || 'User'} className="h-10 w-10 rounded-full ring-2 ring-white/20" />
      <span className="absolute bottom-0 right-0 flex h-4 w-4 items-center justify-center rounded-full border-2 border-[#4e0a10] bg-slate-700 text-white shadow-sm" aria-hidden="true">
        <ChevronDown className={`h-2.5 w-2.5 transition-transform ${open ? 'rotate-180' : ''}`} strokeWidth={3} />
      </span>
    </button>
    {open && <div role="menu" className="absolute right-0 top-full z-[60] mt-2 max-h-[calc(100vh-5rem)] w-[min(22.5rem,calc(100vw-1rem))] overflow-y-auto rounded-xl bg-white p-4 text-slate-900 shadow-[0_12px_28px_rgba(0,0,0,0.2),0_2px_4px_rgba(0,0,0,0.1)]">
      <div className="rounded-xl bg-white p-1 shadow-[0_2px_12px_rgba(0,0,0,0.15)]">
        <button role="menuitem" type="button" onClick={() => { setMenuOpen(false); setProfileOpen(true); }} className="flex w-full items-center gap-3 rounded-lg p-2 text-left transition hover:bg-slate-100">
          <ProfileAvatar src={photo} className="h-10 w-10 rounded-full" />
          <span className="min-w-0">
            <span className="block truncate text-[15px] font-bold">{user?.name || 'Administrator'}</span>
            <span className="block truncate text-xs text-slate-500">{roleLabel(user?.role)}{user?.email || user?.username ? ` · ${user?.email || user?.username}` : ''}</span>
          </span>
        </button>
        <div className="mx-2 my-1 border-t border-slate-200" />
        <button role="menuitem" type="button" onClick={() => { setMenuOpen(false); setProfileOpen(true); }} className="w-full rounded-lg px-2 py-2 text-left text-sm font-semibold text-[#4e0a10] transition hover:bg-slate-100">See your profile</button>
      </div>
      <div className="mt-3 space-y-0.5">
        {role === 'vpaa' && <MenuRow icon={<Settings size={20} />} label="Settings" onClick={() => { setMenuOpen(false); navigate('/settings'); }} chevron />}
        <MenuRow icon={<LogOut size={20} />} label={loggingOut ? 'Signing out...' : 'Log Out'} onClick={logout} disabled={loggingOut} />
      </div>
    </div>}
    {profileOpen && <UserProfileModal onClose={() => setProfileOpen(false)} user={user} roleLabel={roleLabel(user?.role)} onSaved={handleProfileSaved} />}
  </div>;
}

function MenuRow({ icon, label, onClick, disabled = false, chevron = false }: { icon: ReactNode; label: string; onClick: () => void; disabled?: boolean; chevron?: boolean }) {
  return <button role="menuitem" type="button" disabled={disabled} onClick={onClick} className="flex w-full items-center gap-3 rounded-lg p-2 text-left transition hover:bg-slate-100 disabled:opacity-50">
    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-200 text-slate-900">{icon}</span>
    <span className="flex-1 text-[15px] font-semibold">{label}</span>
    {chevron && <ChevronRight size={22} className="text-slate-500" />}
  </button>;
}
