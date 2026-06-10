import { 
  LayoutDashboard, 
  CalendarDays, 
  GraduationCap, 
  BookOpen, 
  FileBarChart, 
  ClipboardList 
} from 'lucide-react'
import type { NavSection } from './types'

export const deanNav: NavSection[] = [
  {
    section: 'MAIN MENU',
    items: [
      { label: 'Dashboard', path: '/dean/dashboard', icon: LayoutDashboard, id: 'sidebar-dashboard' },
      { label: 'Class Schedules', path: '/dean/schedules', icon: CalendarDays, id: 'sidebar-schedules' },
      { label: 'Faculty', path: '/dean/faculty', icon: GraduationCap, id: 'sidebar-faculty' },
      { label: 'Rooms', path: '/dean/rooms', icon: BookOpen, id: 'sidebar-rooms' },
    ]
  },
  {
    section: 'SYSTEM',
    items: [
      { label: 'Reports', path: '/reports', icon: FileBarChart },
      { label: 'Activity Log', path: '/activity-log', icon: ClipboardList },
    ]
  }
]
