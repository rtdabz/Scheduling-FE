import { useEffect, useRef, useState } from 'react';
import { ChevronsUpDown, LogOut, Settings, User } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import api from '../../lib/api';
import { useToast } from '../../context/ToastContext';
import { logoutCurrentSession } from '../../lib/authSession';

interface StoredUser {
  name?: string;
  username?: string;
  email?: string | null;
  role?: string;
  profile_picture?: string | null;
  photo?: string | null;
  avatar?: string | null;
}

const initials = (name?: string) => name?.split(' ').map((part) => part[0]).join('').toUpperCase() || 'AD';
const roleLabel = (role?: string) => ({ vpaa: 'VPAA', dean: 'Dean', secretary: 'Secretary', program_head: 'Program Head' }[role?.toLowerCase() ?? ''] || role || 'User');

export default function UserProfileMenu() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [user, setUser] = useState<StoredUser | null>(null);
  const [open, setOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const wrapper = useRef<HTMLDivElement>(null);
  const role = user?.role?.toLowerCase() || 'vpaa';
  const photo = user?.profile_picture || user?.photo || user?.avatar;

  const setMenuOpen = (value: boolean) => {
    setOpen(value);
    window.dispatchEvent(new CustomEvent('profile-menu-state', { detail: { open: value } }));
  };

  useEffect(() => {
    const raw = localStorage.getItem('user') || sessionStorage.getItem('user');
    if (raw) {
      try { setUser(JSON.parse(raw) as StoredUser); } catch { /* use API fallback */ }
    }
    api.get<StoredUser>('/me').then((response) => setUser(response.data)).catch(() => {});
  }, []);

  useEffect(() => {
    const close = (event: MouseEvent) => {
      if (!wrapper.current?.contains(event.target as Node)) setMenuOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  const logout = () => {
    setLoggingOut(true);
    logoutCurrentSession();
    toast.success('Logged Out', 'You have been successfully logged out.');
    navigate('/', { replace: true });
  };

  return <div ref={wrapper} className="relative">
    <button id="sidebar-profile" type="button" onClick={() => setMenuOpen(!open)} aria-label="Open user profile menu" aria-expanded={open} className="flex items-center gap-2 rounded-full p-1 pr-2 text-left text-white transition hover:bg-white/10">
      <span className="flex h-8 w-8 items-center justify-center overflow-hidden rounded-full bg-gradient-to-br from-[#7B1113] to-[#C9952A] ring-1 ring-white/30">
        {photo ? <img src={photo} alt={user?.name || 'User'} className="h-full w-full object-cover" /> : <span className="text-xs font-bold">{initials(user?.name)}</span>}
      </span>
      <span className="hidden min-w-0 max-w-32 flex-col sm:flex"><span className="truncate text-xs font-bold">{user?.name || 'Administrator'}</span><span className="text-[10px] text-white/65">{roleLabel(user?.role)}</span></span>
      <ChevronsUpDown className="hidden h-3.5 w-3.5 text-white/60 sm:block" />
    </button>
    {open && <div className="absolute right-0 top-full z-[60] mt-2 max-h-[calc(100vh-5rem)] w-[min(15rem,calc(100vw-1rem))] overflow-y-auto rounded-xl border border-slate-200 bg-[#F7F4F0] text-slate-700 shadow-2xl">
      <div className="flex items-center gap-2.5 border-b border-gray-100 bg-gray-50/50 p-2.5"><span className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-full bg-gradient-to-br from-[#7B1113] to-[#C9952A] text-white">{photo ? <img src={photo} alt="" className="h-full w-full object-cover" /> : initials(user?.name)}</span><div className="min-w-0"><p className="truncate text-xs font-bold">{user?.name || 'Administrator'}</p><p className="truncate text-[10px] text-gray-500">{user?.email || user?.username || ''}</p></div></div>
      <div className="space-y-0.5 p-1.5"><button type="button" onClick={() => { setMenuOpen(false); navigate(`/${role}/settings`); }} className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold hover:bg-[#4e0a10]/5"><User size={14} /> My Profile</button><button type="button" onClick={() => { setMenuOpen(false); navigate(`/${role}/settings`); }} className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold hover:bg-[#4e0a10]/5"><Settings size={14} /> Settings</button></div>
      <div className="border-t border-gray-100 p-1.5"><button type="button" disabled={loggingOut} onClick={logout} className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-xs font-bold text-red-600 hover:bg-red-50 disabled:opacity-50"><LogOut size={14} /> {loggingOut ? 'Signing out...' : 'Log Out'}</button></div>
    </div>}
  </div>;
}
