import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Menu, Bell, User, Settings, LogOut, MessageSquare, Check, RefreshCw } from 'lucide-react';
import logo from '../../assets/logo.jpg';
import { useToast } from '../../context/ToastContext';

interface HeaderProps {
  onToggleSidebar: () => void;
  sidebarOpen: boolean;
}

export default function Header({ onToggleSidebar, sidebarOpen }: HeaderProps) {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [showNotifications, setShowNotifications] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  
  const notifRef = useRef<HTMLDivElement>(null);
  const profileRef = useRef<HTMLDivElement>(null);

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
    <header className="fixed top-0 left-0 right-0 z-40 h-16 bg-[#1C0507] border-b border-white/10 flex items-center">
      
      {/* SECTION 1 — width matches sidebar */}
      <div className={`
        flex-shrink-0 flex items-center h-full
        border-r border-white/10
        transition-all duration-300 ease-in-out
        overflow-hidden
        ${sidebarOpen ? 'w-64 px-4' : 'w-0 md:w-16 justify-center px-0'}
      `}>
        <img src={logo} alt="TCC Logo" className="w-10 h-10 object-contain rounded-full flex-shrink-0" />
        {sidebarOpen && (
          <div className="ml-2 items-baseline gap-1 whitespace-nowrap hidden sm:flex">
            <span className="font-display text-white font-bold text-lg">TCC</span>
            <span className="text-[#E8D5C4]/60 text-sm">Scheduling</span>
          </div>
        )}
      </div>

      {/* SECTION 2 — flexible, takes remaining space */}
      <div className="flex flex-1 items-center justify-between px-4 h-full">
        
        {/* Left of section 2: Hamburger button */}
        <button
          onClick={onToggleSidebar}
          className="p-2 rounded-lg hover:bg-white/10 transition-all duration-300 text-white cursor-pointer"
          aria-label="Toggle Menu"
        >
          <div className={`transition-transform duration-500 ${sidebarOpen ? 'rotate-180' : 'rotate-0'}`}>
            <Menu size={22} />
          </div>
        </button>

        {/* Right of section 2: Notifications, divider, avatar */}
        <div className="flex items-center gap-3">
          {/* Notifications */}
          <div className="relative" ref={notifRef}>
            <button 
              onClick={() => setShowNotifications(!showNotifications)}
              className="relative p-2 text-[#E8D5C4] hover:text-white transition-colors rounded-full hover:bg-white/5 cursor-pointer"
            >
              <Bell size={20} />
              <span className="absolute top-1 right-2 w-2 h-2 bg-[#C9952A] rounded-full border border-[#1C0507]" />
            </button>

            {/* Notifications Dropdown */}
            {showNotifications && (
              <div className="absolute right-0 mt-2 w-80 bg-[#1C0507] border border-white/10 rounded-xl shadow-2xl overflow-hidden z-50">
                <div className="p-4 border-b border-white/10 flex justify-between items-center">
                  <h3 className="text-white font-semibold">Notifications</h3>
                  <button className="text-xs text-[#C9952A] hover:underline">Mark all as read</button>
                </div>
                <div className="max-h-96 overflow-y-auto">
                  {[
                    { title: 'New Schedule Request', desc: 'BSIT 3A requested a room change.', time: '5m ago', icon: <MessageSquare size={16} /> },
                    { title: 'System Update', desc: 'WICARS v1.0.2 is now live.', time: '1h ago', icon: <Settings size={16} /> },
                    { title: 'Success', desc: 'Conflict check completed successfully.', time: '2h ago', icon: <Check size={16} />, color: 'text-green-500' },
                  ].map((notif, i) => (
                    <div key={i} className="p-4 border-b border-white/5 hover:bg-white/5 transition-colors cursor-pointer">
                      <div className="flex gap-3">
                        <div className={`mt-1 p-2 rounded-lg bg-white/5 ${notif.color || 'text-[#C9952A]'}`}>
                          {notif.icon}
                        </div>
                        <div>
                          <p className="text-sm font-medium text-white">{notif.title}</p>
                          <p className="text-xs text-[#E8D5C4]/60 mt-0.5 line-clamp-2">{notif.desc}</p>
                          <p className="text-[10px] text-[#E8D5C4]/40 mt-1">{notif.time}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="p-3 text-center border-t border-white/10">
                  <button className="text-sm text-[#E8D5C4]/60 hover:text-white transition-colors w-full">View all notifications</button>
                </div>
              </div>
            )}
          </div>

          {/* Divider */}
          <div className="w-px h-6 bg-white/20 mx-1"></div>

          {/* User profile */}
          <div className="relative" ref={profileRef} id="sidebar-profile">
            <div 
              onClick={() => setShowProfile(!showProfile)}
              className="flex items-center gap-3 cursor-pointer p-1 rounded-full hover:bg-white/5 transition-colors pr-3"
            >
              <div className="w-9 h-9 rounded-full bg-gradient-to-br from-[#7B1113] to-[#C9952A] flex items-center justify-center flex-shrink-0 shadow-sm">
                <span className="text-white text-sm font-semibold font-display">AD</span>
              </div>
              
              <div className="hidden sm:flex flex-col">
                <span className="text-sm text-white font-medium leading-none">Administrator</span>
                <span className="text-xs text-[#E8D5C4]/60 mt-1 leading-none">VPAA</span>
              </div>
            </div>

            {/* Profile Dropdown */}
            {showProfile && (
              <div className="absolute right-0 mt-2 w-56 bg-[#1C0507] border border-white/10 rounded-xl shadow-2xl overflow-hidden z-50">
                <div className="p-4 border-b border-white/10 bg-white/5">
                  <p className="text-sm font-semibold text-white">Administrator</p>
                  <p className="text-xs text-[#E8D5C4]/60 truncate">admin@tcc.edu.ph</p>
                </div>
                <div className="p-2">
                  <button className="flex items-center gap-3 w-full px-3 py-2 text-sm text-[#E8D5C4] hover:bg-white/5 hover:text-white rounded-lg transition-colors">
                    <User size={16} /> My Profile
                  </button>
                  <button className="flex items-center gap-3 w-full px-3 py-2 text-sm text-[#E8D5C4] hover:bg-white/5 hover:text-white rounded-lg transition-colors">
                    <Settings size={16} /> Settings
                  </button>
                  <button 
                    onClick={() => {
                      localStorage.removeItem('wicars_tour_done');
                      window.location.reload();
                    }}
                    className="flex items-center gap-3 w-full px-3 py-2 text-sm text-[#C9952A] hover:bg-[#C9952A]/10 rounded-lg transition-colors"
                  >
                    <RefreshCw size={16} /> Restart Tour
                  </button>
                </div>
                <div className="p-2 border-t border-white/10">
                  <button 
                    onClick={() => {
                      toast.success('Logged Out', 'You have been successfully signed out.');
                      navigate('/');
                    }}
                    className="flex items-center gap-3 w-full px-3 py-2 text-sm text-red-400 hover:bg-red-400/10 rounded-lg transition-colors cursor-pointer"
                  >
                    <LogOut size={16} /> Log Out
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
