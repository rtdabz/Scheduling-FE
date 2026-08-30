import {
  LayoutDashboard,
  Building2,
  CalendarDays,
  CalendarRange,
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
      { label: 'Rooms', path: '/secretary/rooms', icon: DoorOpen, id: 'sidebar-rooms' },
      { label: 'Sections', path: '/secretary/sections', icon: Users, id: 'sidebar-sections' },
      {
        label: 'Scheduling',
        icon: CalendarDays,
        id: 'sidebar-schedules',
        children: [
          { label: 'Schedule Builder', path: '/secretary/schedules', icon: CalendarRange, id: 'sidebar-schedule-builder' },
          { label: 'Section Timetables', path: '/secretary/section-timetables', icon: CalendarDays, id: 'sidebar-section-timetables' },
          { label: 'Course Teaching', path: '/secretary/course-teaching-assignments', icon: Building2, id: 'sidebar-course-teaching-assignments' },
          { label: 'Cross-Department', path: '/secretary/cross-department-assignments', icon: UserRoundCheck, id: 'sidebar-cross-department-assignments' },
        ],
      },
      { label: 'Instructors', path: '/secretary/instructors', icon: UserPlus, id: 'sidebar-instructors' },
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
