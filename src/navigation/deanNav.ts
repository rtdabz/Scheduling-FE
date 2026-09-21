import {
  LayoutDashboard,
  CalendarDays,
  GraduationCap,
  UserPlus,
  DoorOpen,
  FileBarChart,
  Calendar,
  ClipboardCheck,
  History
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
        requiredCapability: ['schedule.view', 'schedule.approve_dean'],
        children: [
          {
            label: 'All Schedules',
            path: '/dean/schedules',
            icon: Calendar,
            id: 'sidebar-all-schedules',
            requiredCapability: 'schedule.view',
          },
          {
            label: 'Schedule Approval',
            path: '/dean/schedules/approval',
            icon: ClipboardCheck,
            id: 'sidebar-schedule-approval',
            requiredCapability: 'schedule.approve_dean',
          },
        ]
      },
      {
        label: 'Faculty',
        icon: GraduationCap,
        id: 'sidebar-faculty',
        requiredCapability: 'schedule.view',
        children: [
          { label: 'Instructors', path: '/dean/faculty', icon: UserPlus, id: 'sidebar-instructors', requiredCapability: 'schedule.view' },
        ],
      },
      { label: 'Rooms', path: '/dean/rooms', icon: DoorOpen, id: 'sidebar-rooms', requiredCapability: 'schedule.view' },
    ]
  },
  {
    section: 'SYSTEM',
    items: [
      { label: 'Reports', path: '/dean/reports', icon: FileBarChart, id: 'sidebar-reports', requiredCapability: 'schedule.view' },
      { label: 'Schedule History', path: '/dean/schedule-history', icon: History, id: 'sidebar-schedule-history', requiredCapability: 'schedule.view' },
    ]
  }
]
