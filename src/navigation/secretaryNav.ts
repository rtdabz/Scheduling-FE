import { 
  LayoutDashboard, 
  CalendarDays, 
  DoorOpen, 
  BookOpen, 
  ClipboardList, 
  Users, 
  UserPlus,
  Settings,
} from 'lucide-react'
import type { NavSection } from './types'

export const secretaryNav: NavSection[] = [
  {
    section: 'MAIN MENU',
    items: [
      { label: 'Dashboard', path: '/secretary/dashboard', icon: LayoutDashboard, id: 'sidebar-dashboard' },
      { label: 'Class Schedules', path: '/secretary/schedules', icon: CalendarDays, id: 'sidebar-schedules' },
      { label: 'Sections', path: '/secretary/sections', icon: Users, id: 'sidebar-sections' },
      { label: 'Instructors', path: '/secretary/instructors', icon: UserPlus, id: 'sidebar-instructors' },
      { label: 'Rooms', path: '/secretary/rooms', icon: DoorOpen, id: 'sidebar-rooms' },
      { label: 'Subjects', path: '/secretary/subjects', icon: BookOpen, id: 'sidebar-subjects' },
    ]
  },
  {
    section: 'SYSTEM',
    items: [
      { label: 'Activity Log', path: '/secretary/activity-log', icon: ClipboardList, id: 'sidebar-activity-log' },
      { label: 'Settings', path: '/secretary/settings', icon: Settings, id: 'sidebar-settings' },
    ]
  }
]
