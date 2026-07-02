import {
  LayoutDashboard,
  CalendarDays,
  GraduationCap,
  DoorOpen,
  FileBarChart,
  ClipboardList,
  Users,
  Settings,
  Building2
} from 'lucide-react'
import type { NavSection } from './types'

export const vpaaNav: NavSection[] = [
  {
    section: 'MAIN MENU',
    items: [
      { label: 'Dashboard', path: '/dashboard', icon: LayoutDashboard, id: 'sidebar-dashboard' },
      {
        label: 'Schedules',
        icon: CalendarDays,
        id: 'sidebar-schedules',
        children: [
          {
            label: 'All Schedules',
            path: '/schedules',
            id: 'sidebar-all-schedules'
          },
          {
            label: 'Schedule Approval',
            path: '/schedules/approval',
            id: 'sidebar-schedule-approval'
          },
        ]
      },
      { label: 'Faculty', path: '/faculty', icon: GraduationCap, id: 'sidebar-faculty' },
      { label: 'Rooms', path: '/rooms', icon: DoorOpen, id: 'sidebar-rooms' },
    ]
  },
  {
    section: 'SYSTEM',
    items: [
      { label: 'Reports', path: '/reports', icon: FileBarChart },
      { label: 'Activity Log', path: '/activity-log', icon: ClipboardList },
      { label: 'User Management', path: '/users', icon: Users, id: 'sidebar-users' },
      { label: 'Department Management', path: '/departments', icon: Building2, id: 'sidebar-departments' },
      { label: 'Settings', path: '/settings', icon: Settings },
    ]
  }
]
