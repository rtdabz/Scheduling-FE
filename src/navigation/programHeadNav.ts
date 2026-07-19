import type { NavSection } from './types';
import { 
  LayoutDashboard, 
  Calendar,
  Users,
  MapPin,
  FileText,
  Settings,
  UserRoundCheck
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
        icon: Calendar,
        children: [
          {
            id: 'sidebar-schedule-builder',
            label: 'Schedule Builder',
            path: '/program_head/schedules',
            icon: Calendar
          },
          {
            id: 'sidebar-instructor-assignment',
            label: 'Instructor Assignment',
            path: '/program_head/instructor-assignment',
            icon: UserRoundCheck
          }
        ]
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
        id: 'sidebar-reports',
        label: 'Reports',
        path: '/program_head/reports',
        icon: FileText
      },
      {
        id: 'sidebar-settings',
        label: 'Settings',
        path: '/program_head/settings',
        icon: Settings
      }
    ]
  }
];
