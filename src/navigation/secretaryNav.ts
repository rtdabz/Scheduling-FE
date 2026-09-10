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
          { label: 'Course List', path: '/secretary/courses', icon: BookOpen, id: 'sidebar-courses-list', requiredCapability: 'schedule.view' },
          { label: 'Curriculum', path: '/secretary/curriculum', icon: Layers, id: 'sidebar-curriculum', requiredCapability: 'schedule.view' },
        ],
      },
      { label: 'Rooms', path: '/secretary/rooms', icon: DoorOpen, id: 'sidebar-rooms', requiredCapability: 'schedule.view' },
      { label: 'Sections', path: '/secretary/sections', icon: Users, id: 'sidebar-sections', requiredCapability: 'schedule.view' },
      {
        label: 'Timetabling',
        icon: CalendarDays,
        id: 'sidebar-schedules',
        requiredCapability: ['schedule.view', 'schedule.create', 'schedule.assign_instructor'],
        children: [
          { label: 'Schedule Builder', path: '/secretary/schedule-builder', icon: CalendarRange, id: 'sidebar-schedule-builder', requiredCapability: 'schedule.create' },
          { label: 'Schedules', path: '/secretary/schedules', icon: CalendarDays, id: 'sidebar-section-timetables', requiredCapability: 'schedule.view' },
          { label: 'Course Teaching', path: '/secretary/course-teaching-assignments', icon: Building2, id: 'sidebar-course-teaching-assignments', requiredCapability: 'schedule.assign_instructor_cross_department' },
          { label: 'Cross-Department', path: '/secretary/cross-department-assignments', icon: UserRoundCheck, id: 'sidebar-cross-department-assignments', requiredCapability: 'schedule.assign_instructor_cross_department' },
        ],
      },
      { label: 'Instructors', path: '/secretary/instructors', icon: UserPlus, id: 'sidebar-instructors', requiredCapability: 'schedule.view' },
    ]
  },
  {
    section: 'SYSTEM',
    items: [
      { label: 'Schedule History', path: '/secretary/schedule-history', icon: History, id: 'sidebar-schedule-history', requiredCapability: 'schedule.view' },
      { label: 'Settings', path: '/secretary/settings', icon: Settings, id: 'sidebar-settings' },
    ]
  }
]
