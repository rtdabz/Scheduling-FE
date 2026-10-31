import { useEffect, useRef, useState } from 'react';
import { ChevronDown, LogOut, Settings, User } from 'lucide-react';
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
    {open && <div role="menu" className="absolute right-0 top-full z-[60] mt-3 max-h-[calc(100vh-5rem)] w-[min(15rem,calc(100vw-1rem))] overflow-y-auto rounded-xl border border-slate-200 bg-[#F7F4F0] text-slate-700 shadow-2xl">
      <div className="flex items-center gap-2.5 border-b border-gray-100 bg-gray-50/50 p-2.5"><ProfileAvatar src={photo} className="h-9 w-9 rounded-full" /><div className="min-w-0"><p className="truncate text-xs font-bold">{user?.name || 'Administrator'}</p><p className="truncate text-[10px] text-gray-500">{user?.email || user?.username || ''}</p></div></div>
      <div className="space-y-0.5 p-1.5"><button role="menuitem" type="button" onClick={() => { setMenuOpen(false); setProfileOpen(true); }} className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold hover:bg-[#4e0a10]/5"><User size={14} /> My Profile</button>
{role === 'vpaa' && <><button role="menuitem" type="button" onClick={() => { setMenuOpen(false); navigate('/settings'); }} className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold hover:bg-[#4e0a10]/5"><Settings size={14} /> Settings</button></>}</div>
      <div className="border-t border-gray-100 p-1.5"><button role="menuitem" type="button" disabled={loggingOut} onClick={logout} className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-xs font-bold text-red-600 hover:bg-red-50 disabled:opacity-50"><LogOut size={14} /> {loggingOut ? 'Signing out...' : 'Log Out'}</button></div>
    </div>}
    {profileOpen && <UserProfileModal onClose={() => setProfileOpen(false)} user={user} roleLabel={roleLabel(user?.role)} onSaved={handleProfileSaved} />}
  </div>;
}
