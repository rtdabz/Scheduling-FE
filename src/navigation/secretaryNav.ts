import { 
  LayoutDashboard, 
  CalendarDays, 
  AlertTriangle, 
  DoorOpen, 
  BookOpen, 
  ClipboardList 
} from 'lucide-react'
import type { NavSection } from './types'

export const secretaryNav: NavSection[] = [
  {
    section: 'MAIN MENU',
    items: [
      { label: 'Dashboard', path: '/secretary/dashboard', icon: LayoutDashboard, id: 'sidebar-dashboard' },
      { label: 'Class Schedules', path: '/secretary/schedules', icon: CalendarDays, id: 'sidebar-schedules' },
      { label: 'Rooms', path: '/secretary/rooms', icon: DoorOpen, id: 'sidebar-rooms' },
      { label: 'Subjects', path: '/secretary/subjects', icon: BookOpen, id: 'sidebar-subjects' },
    ]
  },
  {
    section: 'SYSTEM',
    items: [
      { label: 'Activity Log', path: '/activity-log', icon: ClipboardList },
    ]
  }
]
