import {
  LayoutDashboard,
  CalendarDays,
  GraduationCap,
  DoorOpen,
  FileBarChart,
  ClipboardList,
  Users,
  Calendar,
  ClipboardCheck
} from 'lucide-react'
import type { NavSection } from '../navigation/types'

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
      { label: 'Reports', path: '/dean/reports', icon: FileBarChart },
      { label: 'Activity Log', path: '/dean/activity-log', icon: ClipboardList },
      { label: 'User Management', path: '/dean/users', icon: Users, id: 'sidebar-users' },
    ]
  }
]
