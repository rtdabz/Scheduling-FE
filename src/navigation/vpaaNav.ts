import {
  LayoutDashboard,
  CalendarDays,
  Calendar,
  GraduationCap,
  DoorOpen,
  FileBarChart,
  ClipboardList,
  History,
  Users,
  Settings,
  Building2,
  BookOpen,
  Archive
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
      { label: 'Master Calendar', path: '/calendar', icon: Calendar, id: 'sidebar-calendar' },
      { label: 'Faculty', path: '/faculty', icon: GraduationCap, id: 'sidebar-faculty' },
      { label: 'Rooms', path: '/rooms', icon: DoorOpen, id: 'sidebar-rooms' },
      { label: 'Curriculum', path: '/curriculum', icon: BookOpen, id: 'sidebar-curriculum' },
    ]
  },
  {
    section: 'SYSTEM',
    items: [
      { label: 'Reports', path: '/reports', icon: FileBarChart, id: 'sidebar-reports' },
      { label: 'Activity Log', path: '/activity-log', icon: ClipboardList, id: 'sidebar-activity-log' },
      { label: 'User Management', path: '/users', icon: Users, id: 'sidebar-users' },
      { label: 'Department Management', path: '/departments', icon: Building2, id: 'sidebar-departments' },
      { label: 'Schedule History', path: '/schedule-history', icon: History, id: 'sidebar-schedule-history' },
      { label: 'Archive', path: '/archive', icon: Archive, id: 'sidebar-archive' },
      { label: 'Settings', path: '/settings', icon: Settings, id: 'sidebar-settings' },
    ]
  }
]
