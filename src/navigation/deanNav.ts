import {
  LayoutDashboard,
  CalendarDays,
  GraduationCap,
  DoorOpen,
  FileBarChart,
  Calendar,
  ClipboardCheck
} from 'lucide-react'
import type { NavSection } from './types'

export const deanNav: NavSection[] = [
  {
    section: 'MAIN MENU',
    items: [
      { label: 'Dashboard', path: '/dean/dashboard', icon: LayoutDashboard, id: 'sidebar-dashboard' },
      {
        label: 'Schedules',
        icon: CalendarDays,
        id: 'sidebar-schedules',
        children: [
          {
            label: 'All Schedules',
            path: '/dean/schedules',
            icon: Calendar,
            id: 'sidebar-all-schedules'
          },
          {
            label: 'Schedule Approval',
            path: '/dean/schedules/approval',
            icon: ClipboardCheck,
            id: 'sidebar-schedule-approval'
          },
        ]
      },
      { label: 'Faculty', path: '/dean/faculty', icon: GraduationCap, id: 'sidebar-faculty' },
      { label: 'Rooms', path: '/dean/rooms', icon: DoorOpen, id: 'sidebar-rooms' },
    ]
  },
  {
    section: 'SYSTEM',
    items: [
      { label: 'Reports', path: '/dean/reports', icon: FileBarChart, id: 'sidebar-reports' },
    ]
  }
]
