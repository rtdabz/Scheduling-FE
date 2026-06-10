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
      { label: 'Dashboard', path: '/dashboard', icon: LayoutDashboard, id: 'sidebar-dashboard' },
      { label: 'Class Schedules', path: '/schedules', icon: CalendarDays, id: 'sidebar-schedules' },
      { label: 'Conflict Detection', path: '/conflicts', icon: AlertTriangle },
      { label: 'Rooms', path: '/rooms', icon: DoorOpen, id: 'sidebar-rooms' },
      { label: 'Subjects', path: '/subjects', icon: BookOpen },
    ]
  },
  {
    section: 'SYSTEM',
    items: [
      { label: 'Activity Log', path: '/activity-log', icon: ClipboardList },
    ]
  }
]
