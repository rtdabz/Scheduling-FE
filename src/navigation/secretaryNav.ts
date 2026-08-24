import {
  LayoutDashboard,
  Building2,
  CalendarDays,
  DoorOpen,
  BookOpen,
  Users,
  UserPlus,
  UserRoundCheck,
  Settings,
  Layers,
  History,
} from 'lucide-react'
import type { NavSection } from './types'

export const secretaryNav: NavSection[] = [
  {
    section: 'MAIN MENU',
    items: [
      { label: 'Dashboard', path: '/secretary/dashboard', icon: LayoutDashboard, id: 'sidebar-dashboard' },
      {
        label: 'Courses',
        icon: BookOpen,
        id: 'sidebar-courses',
        children: [
          { label: 'Course List', path: '/secretary/courses', icon: BookOpen, id: 'sidebar-courses-list' },
          { label: 'Curriculum', path: '/secretary/curriculum', icon: Layers, id: 'sidebar-curriculum' },
        ],
      },
      {
        label: 'Scheduling',
        icon: CalendarDays,
        id: 'sidebar-schedules',
        children: [
          { label: 'Schedule Builder', path: '/secretary/schedules', icon: CalendarDays, id: 'sidebar-schedule-builder' },
          { label: 'Course Teaching', path: '/secretary/course-teaching-assignments', icon: Building2, id: 'sidebar-course-teaching-assignments' },
          { label: 'Cross-Department', path: '/secretary/cross-department-assignments', icon: UserRoundCheck, id: 'sidebar-cross-department-assignments' },
        ],
      },
      { label: 'Sections', path: '/secretary/sections', icon: Users, id: 'sidebar-sections' },
      { label: 'Instructors', path: '/secretary/instructors', icon: UserPlus, id: 'sidebar-instructors' },
      { label: 'Rooms', path: '/secretary/rooms', icon: DoorOpen, id: 'sidebar-rooms' },
    ]
  },
  {
    section: 'SYSTEM',
    items: [
      { label: 'Schedule History', path: '/secretary/schedule-history', icon: History, id: 'sidebar-schedule-history' },
      { label: 'Settings', path: '/secretary/settings', icon: Settings, id: 'sidebar-settings' },
    ]
  }
]
