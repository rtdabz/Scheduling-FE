import { useState } from 'react';
import { LogOut, User } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import api from '../../lib/api';
import { useToast } from '../../context/ToastContext';
import { clearDataCache } from '../../lib/dataCache';

interface StoredUser {
  name?: string;
  username?: string;
  email?: string | null;
  role?: string;
}

const getStoredUser = (): StoredUser | null => {
  const userJson = localStorage.getItem('user') || sessionStorage.getItem('user');
  if (!userJson) return null;

  try {
    return JSON.parse(userJson) as StoredUser;
  } catch {
    return null;
  }
};

const formatRole = (role?: string): string => {
  const roles: Record<string, string> = {
    vpaa: 'VPAA',
    dean: 'Dean',
    secretary: 'Secretary',
    program_head: 'Program Head',
  };
  const normalizedRole = role?.toLowerCase() ?? '';
  return roles[normalizedRole] || role || 'User';
};

export default function AccountSettingsPanel() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const user = getStoredUser();
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  const handleLogout = async () => {
    if (isLoggingOut) return;

    setIsLoggingOut(true);
    try {
      await api.post('/logout');
    } catch {
      // Token cleanup below still completes local sign out if the server session is already gone.
    } finally {
      clearDataCache();
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      sessionStorage.removeItem('token');
      sessionStorage.removeItem('user');
      toast.success('Logged Out', 'You have been successfully signed out.');
      navigate('/');
      setIsLoggingOut(false);
    }
  };

  return (
    <section className="border border-slate-200 bg-white shadow-sm" style={{ borderRadius: 10 }}>
      <div className="flex flex-col gap-4 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center bg-[#6b0f1a]/10 text-[#6b0f1a]" style={{ borderRadius: 8 }}>
            <User size={18} />
          </div>
          <div className="min-w-0">
            <h2 className="truncate text-sm font-semibold text-slate-900">{user?.name || 'Administrator'}</h2>
            <p className="truncate text-xs leading-5 text-slate-600">
              {user?.email?.trim() || (user?.username?.includes('@') ? user.username : '')}
            </p>
            <span className="mt-1 inline-flex w-fit rounded-full border border-[#4e0a10]/10 bg-[#4e0a10]/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-[#7B1113]">
              {formatRole(user?.role)}
            </span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={isLoggingOut}
            onClick={handleLogout}
            className="inline-flex items-center gap-2 rounded-lg border border-red-200 bg-white px-3.5 py-2 text-sm font-bold text-red-600 transition-colors hover:bg-red-50 disabled:pointer-events-none disabled:opacity-50"
          >
            {isLoggingOut ? (
              <>
                <span className="h-4 w-4 rounded-full border-2 border-red-600 border-t-transparent animate-spin" />
                Signing out...
              </>
            ) : (
              <>
                <LogOut size={16} />
                Log Out
              </>
            )}
          </button>
        </div>
      </div>
    </section>
  );
}
