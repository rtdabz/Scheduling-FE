import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Menu, Bell, User, Settings, LogOut, MessageSquare, Check, RefreshCw } from 'lucide-react';
import logo from '../../assets/logo.jpg';
import { useToast } from '../../context/ToastContext';
import api from '../../lib/api';

interface HeaderProps {
  onToggleSidebar: () => void;
  sidebarOpen: boolean;
}

export default function Header({ onToggleSidebar, sidebarOpen }: HeaderProps) {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [showNotifications, setShowNotifications] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  
  const notifRef = useRef<HTMLDivElement>(null);
  const profileRef = useRef<HTMLDivElement>(null);

  // Get user data from localStorage or sessionStorage
  const userJson = localStorage.getItem('user') || sessionStorage.getItem('user');
  const user = userJson ? JSON.parse(userJson) : null;

  // Format initials
  const getInitials = (name: string) => {
    return name?.split(' ').map(n => n[0]).join('').toUpperCase() || 'AD';
  };

  // Format role for display
  const formatRole = (role: string) => {
    const roles: Record<string, string> = {
      'vpaa': 'VPAA',
      'dean': 'Dean',
      'secretary': 'Secretary',
      'program_head': 'Program Head'
    };
    return roles[role?.toLowerCase()] || role || 'User';
  };

  // Close dropdowns when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (notifRef.current && !notifRef.current.contains(event.target as Node)) {
        setShowNotifications(false);
      }
      if (profileRef.current && !profileRef.current.contains(event.target as Node)) {
        setShowProfile(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <header className="fixed top-0 left-0 right-0 z-40 h-16 bg-[#4e0a10]/95 backdrop-blur-md border-b border-white/10 flex items-center shadow-lg shadow-black/10">
      
      {/* SECTION 1 — width matches sidebar */}
      <div className={`
        flex-shrink-0 flex items-center h-full
        border-r border-white/10
        transition-all duration-300 ease-in-out
        overflow-hidden
        bg-black/10
        ${sidebarOpen ? 'w-64 px-4' : 'w-0 md:w-16 justify-center px-0'}
      `}>
        <div className="relative group flex items-center">
          <img 
            src={logo} 
            alt="TCC Logo" 
            className="w-10 h-10 object-contain rounded-full flex-shrink-0 ring-2 ring-[#C9952A]/40 ring-offset-2 ring-offset-[#4e0a10] group-hover:rotate-12 transition-transform duration-500" 
          />
        </div>
        {sidebarOpen && (
          <div className="ml-3 items-baseline gap-1 whitespace-nowrap hidden sm:flex">
            <span className="font-display text-white font-extrabold text-lg tracking-wider bg-gradient-to-r from-white to-[#E8D5C4] bg-clip-text text-transparent">TCC</span>
            <span className="text-[#C9952A] text-sm font-bold uppercase tracking-tight">Scheduling</span>
          </div>
        )}
      </div>

      {/* SECTION 2 — flexible, takes remaining space */}
      <div className="flex flex-1 items-center justify-between px-5 h-full">
        
        {/* Left of section 2: Hamburger button */}
        <button
          onClick={onToggleSidebar}
          className="p-2 rounded-xl hover:bg-white/10 text-white cursor-pointer active:scale-95 border border-transparent hover:border-white/5 shadow-sm transition-all duration-300"
          aria-label="Toggle Menu"
        >
          <div className={`transition-transform duration-500 ${sidebarOpen ? 'rotate-180' : 'rotate-0'}`}>
            <Menu size={20} />
          </div>
        </button>

        {/* Right of section 2: Notifications, divider, avatar */}
        <div className="flex items-center gap-4">
          {/* Notifications */}
          <div className="relative flex" ref={notifRef}>
            <button 
              onClick={() => setShowNotifications(!showNotifications)}
              className={`relative p-2 text-[#E8D5C4] hover:text-white transition-all duration-300 rounded-xl hover:bg-white/10 border border-transparent hover:border-white/5 cursor-pointer ${
                showNotifications ? 'bg-white/10 border-white/10 text-white' : ''
              }`}
            >
              <Bell size={20} />
              <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-[#C9952A] rounded-full border border-[#4e0a10] animate-pulse" />
            </button>

            {/* Notifications Dropdown */}
            {showNotifications && (
              <div className="absolute right-0 mt-12 w-96 bg-[#F7F4F0] border border-slate-200/80 rounded-2xl shadow-2xl overflow-hidden z-50 animate-slide-in origin-top-right">
                <div className="p-4 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
                  <h3 className="text-gray-800 font-bold tracking-tight">Notifications</h3>
                  <button className="text-xs font-semibold text-[#C9952A] hover:text-[#a0741c] hover:underline transition-colors">Mark all as read</button>
                </div>
                <div className="max-h-80 overflow-y-auto">
                  {[
                    { title: 'New Schedule Request', desc: 'BSIT 3A requested a room change.', time: '5m ago', icon: <MessageSquare size={16} /> },
                    { title: 'System Update', desc: 'WICARS v1.0.2 is now live.', time: '1h ago', icon: <Settings size={16} /> },
                    { title: 'Success', desc: 'Conflict check completed successfully.', time: '2h ago', icon: <Check size={16} />, color: 'text-green-600 bg-green-50' },
                  ].map((notif, i) => (
                    <div key={i} className="p-4 border-b border-gray-100 hover:bg-gray-50 transition-colors cursor-pointer group">
                      <div className="flex gap-3">
                        <div className={`mt-0.5 p-2 rounded-xl border border-gray-200/50 shadow-sm transition-all duration-300 flex-shrink-0 h-fit ${notif.color || 'text-[#C9952A] bg-gray-50'}`}>
                          {notif.icon}
                        </div>
                        <div className="flex-1">
                          <p className="text-sm font-semibold text-gray-800 group-hover:text-gray-900 transition-colors">{notif.title}</p>
                          <p className="text-xs text-gray-500 mt-0.5 leading-relaxed line-clamp-2">{notif.desc}</p>
                          <p className="text-[10px] text-gray-400 font-semibold mt-1">{notif.time}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="p-3.5 text-center border-t border-gray-100 bg-gray-50/50">
                  <button className="text-xs font-bold text-gray-500 hover:text-gray-800 transition-colors w-full">View all notifications</button>
                </div>
              </div>
            )}
          </div>

          {/* Divider */}
          <div className="w-px h-6 bg-white/20"></div>

          {/* User profile */}
          <div className="relative flex" ref={profileRef} id="sidebar-profile">
            <div 
              onClick={() => setShowProfile(!showProfile)}
              className={`flex items-center gap-3 cursor-pointer p-1 rounded-xl hover:bg-white/10 pr-3 border border-transparent hover:border-white/5 transition-all duration-300 ${
                showProfile ? 'bg-white/10 border-white/10' : ''
              }`}
            >
              <div className="w-9 h-9 rounded-full bg-gradient-to-br from-[#7B1113] to-[#C9952A] flex items-center justify-center flex-shrink-0 shadow-sm ring-2 ring-white/10">
                <span className="text-white text-sm font-bold font-display">
                  {user ? getInitials(user.name) : 'AD'}
                </span>
              </div>
              
              <div className="hidden sm:flex flex-col">
                <span className="text-sm text-white font-semibold leading-none">
                  {user?.name || 'Administrator'}
                </span>
                <span className="text-xs text-[#E8D5C4]/60 mt-1 leading-none font-medium">
                  {formatRole(user?.role)}
                </span>
              </div>
            </div>

            {/* Profile Dropdown */}
            {showProfile && (
              <div className="absolute right-0 mt-12 w-60 bg-[#F7F4F0] border border-slate-200/80 rounded-2xl shadow-2xl overflow-hidden z-50 animate-slide-in origin-top-right">
                <div className="p-4 border-b border-gray-100 bg-gray-50/50 flex flex-col gap-0.5">
                  <p className="text-sm font-bold text-gray-800 leading-tight">{user?.name || 'Administrator'}</p>
                  <p className="text-xs text-gray-500 font-medium truncate">{user?.username || 'admin'}@tcc.edu.ph</p>
                  <span className="inline-flex w-fit items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-[#4e0a10]/10 text-[#7B1113] border border-[#4e0a10]/10 mt-1.5 uppercase tracking-wider">
                    {formatRole(user?.role)}
                  </span>
                </div>
                <div className="p-2 space-y-0.5">
                  <button className="flex items-center gap-3 w-full px-3.5 py-2 text-sm text-gray-700 hover:bg-[#4e0a10]/5 hover:text-[#7B1113] rounded-xl transition-all duration-200 font-semibold cursor-pointer">
                    <User size={16} className="text-[#C9952A]" /> My Profile
                  </button>
                  <button className="flex items-center gap-3 w-full px-3.5 py-2 text-sm text-gray-700 hover:bg-[#4e0a10]/5 hover:text-[#7B1113] rounded-xl transition-all duration-200 font-semibold cursor-pointer">
                    <Settings size={16} className="text-[#C9952A]" /> Settings
                  </button>
                  <button 
                    onClick={() => {
                      window.dispatchEvent(new CustomEvent('restart-tour'));
                    }}
                    className="flex items-center gap-3 w-full px-3.5 py-2 text-sm text-[#C9952A] hover:bg-[#C9952A]/10 rounded-xl transition-all duration-200 font-bold cursor-pointer"
                  >
                    <RefreshCw size={16} className="text-[#C9952A]" /> Restart Tour
                  </button>
                </div>
                <div className="p-2 border-t border-gray-100">
                  <button 
                    disabled={isLoggingOut}
                    onClick={async () => {
                      if (isLoggingOut) return;
                      setIsLoggingOut(true);
                      try {
                        await api.post('/logout');
                      } finally {
                        localStorage.removeItem('token');
                        localStorage.removeItem('user');
                        sessionStorage.removeItem('token');
                        sessionStorage.removeItem('user');
                        toast.success('Logged Out', 'You have been successfully signed out.');
                        navigate('/');
                        setIsLoggingOut(false);
                      }
                    }}
                    className="flex items-center gap-3 w-full px-3.5 py-2 text-sm text-red-600 hover:bg-red-50 hover:text-red-700 rounded-xl transition-all duration-200 font-bold cursor-pointer disabled:opacity-50 disabled:pointer-events-none"
                  >
                    {isLoggingOut ? (
                      <>
                        <span className="w-4 h-4 border-2 border-red-600 border-t-transparent rounded-full animate-spin" />
                        Signing out...
                      </>
                    ) : (
                      <>
                        <LogOut size={16} /> Log Out
                      </>
                    )}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

      </div>

    </header>
  );
}
