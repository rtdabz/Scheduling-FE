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
      { label: 'Dashboard', path: '/sec_ph/dashboard', icon: LayoutDashboard, id: 'sidebar-dashboard' },
      { label: 'Class Schedules', path: '/sec_ph/schedules', icon: CalendarDays, id: 'sidebar-schedules' },
      { label: 'Rooms', path: '/rooms', icon: DoorOpen, id: 'sidebar-rooms' },
    ]
  },
  {
    section: 'SYSTEM',
    items: [
      { label: 'Activity Log', path: '/activity-log', icon: ClipboardList },
    ]
  }
]
