import { 
  LayoutDashboard, 
  CalendarDays, 
  GraduationCap, 
  DoorOpen,
  FileBarChart, 
  ClipboardList, 
  Users, 
  Settings 
} from 'lucide-react'
import type { NavSection } from './types'

export const vpaaNav: NavSection[] = [
  {
    section: 'MAIN MENU',
    items: [
      { label: 'Dashboard', path: '/dashboard', icon: LayoutDashboard, id: 'sidebar-dashboard' },
      { label: 'Class Schedules', path: '/schedules', icon: CalendarDays, id: 'sidebar-schedules' },
      { label: 'Faculty', path: '/faculty', icon: GraduationCap, id: 'sidebar-faculty' },
      { label: 'Rooms', path: '/rooms', icon: DoorOpen, id: 'sidebar-rooms' },
    ]
  },
  {
    section: 'SYSTEM',
    items: [
      { label: 'Reports', path: '/reports', icon: FileBarChart },
      { label: 'Activity Log', path: '/activity-log', icon: ClipboardList },
      { label: 'User Management', path: '/users', icon: Users },
      { label: 'Settings', path: '/settings', icon: Settings },
    ]
  }
]
