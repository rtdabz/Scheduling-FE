import {
  LayoutDashboard,
  Building2,
  CalendarDays,
  CalendarRange,
  DoorOpen,
  BookOpen,
  Users,
  UserPlus,
  GraduationCap,
  UserRoundCheck,
  Layers,
  History,
  FileBarChart,
  DoorClosed,
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
      {
        label: 'Rooms',
        icon: DoorOpen,
        id: 'sidebar-rooms',
        requiredCapability: ['schedule.view', 'room.request'],
        children: [
          { label: 'Room List', path: '/secretary/rooms', icon: DoorOpen, id: 'sidebar-rooms-list', requiredCapability: 'schedule.view' },
          { label: 'Room Requests', path: '/secretary/room-requests', icon: DoorClosed, id: 'sidebar-room-requests', requiredCapability: 'room.request' },
        ],
      },
      { label: 'Sections', path: '/secretary/sections', icon: Users, id: 'sidebar-sections', requiredCapability: 'schedule.view' },
      {
        label: 'Academic Scheduling',
        icon: CalendarDays,
        id: 'sidebar-schedules',
        requiredCapability: ['schedule.view', 'schedule.create', 'schedule.assign_instructor'],
        children: [
          { label: 'Schedule Management', path: '/secretary/schedule-builder', icon: CalendarRange, id: 'sidebar-schedule-builder', requiredCapability: 'schedule.create' },
          { label: 'Schedules', path: '/secretary/schedules', icon: CalendarDays, id: 'sidebar-section-timetables', requiredCapability: 'schedule.view' },
          { label: 'Course Assignment', path: '/secretary/course-teaching-assignments', icon: Building2, id: 'sidebar-course-teaching-assignments', requiredCapability: 'schedule.assign_instructor_cross_department' },
          { label: 'Cross-Department', path: '/secretary/cross-department-assignments', icon: UserRoundCheck, id: 'sidebar-cross-department-assignments', requiredCapability: 'schedule.assign_instructor_cross_department' },
        ],
      },
      {
        label: 'Faculty Management',
        icon: GraduationCap,
        id: 'sidebar-faculty',
        requiredCapability: 'schedule.view',
        children: [
          { label: 'Instructors', path: '/secretary/instructors', icon: UserPlus, id: 'sidebar-instructors', requiredCapability: 'schedule.view' },
        ],
      },
    ]
  },
  {
    section: 'SYSTEM',
    items: [
      { label: 'Reports', path: '/secretary/reports', icon: FileBarChart, id: 'sidebar-reports', requiredCapability: 'schedule.view' },
      { label: 'Schedule History', path: '/secretary/schedule-history', icon: History, id: 'sidebar-schedule-history', requiredCapability: 'schedule.view' },
    ]
  }
]
