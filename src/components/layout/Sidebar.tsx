import type { NavSection } from '../../navigation/types';
import { NavLink } from 'react-router-dom';
import logo from '../../assets/logo.jpg';
import
{ 
  Menu
} from 'lucide-react';

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
  navItems: NavSection[];
}

export default function Sidebar({ isOpen, onClose, navItems }: SidebarProps) {
  return (
    <div 
      className={`
        fixed top-0 left-0 z-30 h-screen
        bg-[#4e0a10] border-r border-white/5
        flex flex-col
        transition-all duration-300 ease-in-out
        ${isOpen ? 'w-64 translate-x-0' : '-translate-x-full md:translate-x-0 md:w-16'}
      `}
    >
      {/* Sidebar Header */}
      <div className={`h-16 flex items-center border-b border-white/10 flex-shrink-0 overflow-hidden ${isOpen ? 'px-4 justify-between' : 'justify-center'}`}>
        
        {/* Left: simple system label */}
        <div className="flex items-center gap-2">
          <img src={logo} alt="Logo" className="w-8 h-8 object-contain rounded-full flex-shrink-0" />
        </div>

        {/* Right: close button — MOBILE ONLY */}
        {isOpen && (
          <button
            onClick={onClose}
            className="md:hidden p-1.5 rounded-lg hover:bg-white/10 transition-all text-[#E8D5C4]"
          >
            <Menu size={18} />
          </button>
        )}
      </div>

      {/* Navigation - takes up remaining space */}
      <nav className="flex-1 overflow-y-auto px-3 py-6 text-[#E8D5C4]">
        {navItems.map((section) => (
          <div key={section.section} className="mb-6 last:mb-0">
            {/* Section label — hide when collapsed */}
            {isOpen && (
              <div className="mb-2 px-2">
                <h4 className="text-[10px] font-semibold tracking-[0.2em] uppercase text-[#E8D5C4]/40 whitespace-nowrap">
                  {section.section}
                </h4>
              </div>
            )}

            {/* Nav items */}
            <div className="flex flex-col gap-1">
              {section.items.map((item) => (
                <NavLink
                  key={item.path}
                  to={item.path}
                  id={item.id}
                  className={({ isActive }) => `
                    flex items-center h-10 rounded-lg
                    transition-all duration-200 cursor-pointer
                    ${isOpen ? 'gap-3 px-3' : 'justify-center px-0'}
                    ${isActive
                      ? 'sidebar-item-active'
                      : 'sidebar-item-hover text-[#E8D5C4]'
                    }
                  `}
                  onClick={() => {
                    // Auto-close sidebar on mobile when navigating
                    if (window.innerWidth < 768) {
                      onClose();
                    }
                  }}
                >
                  <item.icon size={18} className="flex-shrink-0" />
                  {isOpen && (
                    <span className="text-sm font-medium whitespace-nowrap">
                      {item.label}
                    </span>
                  )}
                </NavLink>
              ))}
            </div>
          </div>
        ))}
      </nav>
    </div>
  );
}
