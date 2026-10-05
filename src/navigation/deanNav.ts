import {
  LayoutDashboard,
  CalendarDays,
  GraduationCap,
  DoorOpen,
  FileBarChart,
  Calendar,
  ClipboardCheck,
  History,
  BookOpen,
  Building2,
  Users
} from 'lucide-react'
import type { NavSection } from './types'

export const deanNav: NavSection[] = [
  {
    section: 'MAIN MENU',
    items: [
      { label: 'Dashboard', path: '/dean/dashboard', icon: LayoutDashboard, id: 'sidebar-dashboard' },
      { label: 'Departments', path: '/dean/departments', icon: Building2, id: 'sidebar-departments', requiredCapability: 'schedule.view' },
      { label: 'Facility', path: '/dean/facilities', icon: DoorOpen, id: 'sidebar-rooms', requiredCapability: 'schedule.view' },
      {
        label: 'Instructors',
        path: '/dean/instructors',
        icon: GraduationCap,
        id: 'sidebar-faculty',
        requiredCapability: 'schedule.view',
      },
      {
        label: 'Sections',
        path: '/dean/sections',
        icon: Users,
        id: 'sidebar-sections',
        requiredCapability: 'schedule.view',
      },
      { label: 'Curriculum', path: '/dean/curriculum', icon: BookOpen, id: 'sidebar-curriculum', requiredCapability: 'schedule.view' },
      {
        label: 'Courses',
        path: '/dean/courses',
        icon: BookOpen,
        id: 'sidebar-courses',
        requiredCapability: 'schedule.view',
      },
      {
        label: 'Academic Scheduling',
        icon: CalendarDays,
        id: 'sidebar-schedules',
        requiredCapability: ['schedule.view', 'schedule.approve_dean'],
        children: [
          {
            label: 'Schedule Approval',
            path: '/dean/schedules/approval',
            icon: ClipboardCheck,
            id: 'sidebar-schedule-approval',
            requiredCapability: 'schedule.approve_dean',
          },
          {
            label: 'All Schedules',
            path: '/dean/schedules',
            icon: Calendar,
            id: 'sidebar-all-schedules',
            requiredCapability: 'schedule.view',
          },
        ]
      },

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

