import { LayoutDashboard, Settings } from 'lucide-react';
import type { NavSection } from './types';

export const directorNav: NavSection[] = [
  {
    section: 'MAIN MENU',
    items: [
      { label: 'Dashboard', path: '/director/dashboard', icon: LayoutDashboard, id: 'sidebar-dashboard' },
    ],
  },
  {
    section: 'SYSTEM',
    items: [
      { label: 'Settings', path: '/director/settings', icon: Settings, id: 'sidebar-settings' },
    ],
  },
];
