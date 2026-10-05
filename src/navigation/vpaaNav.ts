import {
  LayoutDashboard,
  CalendarDays,
  Calendar,
  GraduationCap,
  Award,
  DoorOpen,
  FileBarChart,
  ClipboardList,
  History,
  Users,
  Settings,
  Building2,
  BookOpen,
  Archive,
} from 'lucide-react'
import type { NavSection } from './types'

export const vpaaNav: NavSection[] = [
  {
    section: 'MAIN MENU',
    items: [
      { label: 'Dashboard', path: '/dashboard', icon: LayoutDashboard, id: 'sidebar-dashboard' },
      { label: 'Users', path: '/users', icon: Users, id: 'sidebar-users' },
      { label: 'Departments', path: '/departments', icon: Building2, id: 'sidebar-departments' },
      // Room borrowing is between departments; the VPAA has no Room Requests page.
      { label: 'Facility Management', path: '/facilities', icon: DoorOpen, id: 'sidebar-rooms' },
      {
        label: 'Instructors',
        path: '/instructors',
        icon: GraduationCap,
        id: 'sidebar-faculty',
      },
      { label: 'Designations', path: '/designations', icon: Award, id: 'sidebar-designations' },
      { label: 'Curriculum', path: '/curriculum', icon: BookOpen, id: 'sidebar-curriculum' },
      {
        label: 'Academic Scheduling',
        icon: CalendarDays,
        id: 'sidebar-schedules',
        children: [
          {
            label: 'Schedule Approval',
            path: '/schedules/approval',
            id: 'sidebar-schedule-approval'
          },
          {
            label: 'Master Calendar',
            path: '/calendar',
            icon: Calendar,
            id: 'sidebar-calendar'
          },
        ]
      },
    ]
  },
  {
    section: 'SYSTEM & MONITORING',
    items: [
      { label: 'Reports', path: '/reports', icon: FileBarChart, id: 'sidebar-reports' },
      { label: 'Activity Log', path: '/activity-log', icon: ClipboardList, id: 'sidebar-activity-log' },
      { label: 'Schedule History', path: '/schedule-history', icon: History, id: 'sidebar-schedule-history' },
      { label: 'Archive', path: '/archive', icon: Archive, id: 'sidebar-archive' },
      { label: 'Settings', path: '/settings', icon: Settings, id: 'sidebar-settings' },
    ]
  }
]

