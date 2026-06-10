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
      { label: 'Dashboard', path: '/dashboard', icon: LayoutDashboard, id: 'sidebar-dashboard' },
      { label: 'Class Schedules', path: '/schedules', icon: CalendarDays, id: 'sidebar-schedules' },
      { label: 'Faculty', path: '/faculty', icon: GraduationCap, id: 'sidebar-faculty' },
      { label: 'Subjects', path: '/subjects', icon: BookOpen },
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
