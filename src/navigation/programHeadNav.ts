import type { NavSection } from './types';
import { 
  LayoutDashboard, 
  Calendar,
  Users,
  Building2,
  MapPin,
  FileText,
  Activity,
  UserCog,
  Settings
} from 'lucide-react';

export const programHeadNav: NavSection[] = [
  {
    section: 'Main Menu',
    items: [
      {
        id: 'sidebar-dashboard',
        label: 'Dashboard',
        path: '/program_head/dashboard',
        icon: LayoutDashboard
      },
      {
        id: 'sidebar-schedules',
        label: 'Class Schedules',
        path: '/program_head/schedules',
        icon: Calendar
      },
      {
        id: 'sidebar-faculty',
        label: 'Faculty',
        path: '/program_head/faculty',
        icon: Users
      },
      {
        id: 'sidebar-rooms',
        label: 'Rooms',
        path: '/program_head/rooms',
        icon: MapPin
      }
    ]
  },
  {
    section: 'System',
    items: [
      {
        id: 'reports',
        label: 'Reports',
        path: '/program_head/reports',
        icon: FileText
      },
      {
        id: 'settings',
        label: 'Settings',
        path: '/program_head/settings',
        icon: Settings
      }
    ]
  }
];
