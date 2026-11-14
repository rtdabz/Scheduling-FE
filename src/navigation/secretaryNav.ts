import {
  LayoutDashboard,
  Building2,
  CalendarDays,
  CalendarRange,
  DoorOpen,
  BookOpen,
  Users,
  GraduationCap,
  UserRoundCheck,
  Layers,
  History,
  FileBarChart,
  DoorClosed,
  Split,
} from 'lucide-react'
import type { NavSection } from './types'

export const secretaryNav: NavSection[] = [
  {
    section: 'MAIN MENU',
    items: [
      { label: 'Dashboard', path: '/secretary/dashboard', icon: LayoutDashboard, id: 'sidebar-dashboard' },
      { label: 'Department', path: '/secretary/departments', icon: Building2, id: 'sidebar-departments', requiredCapability: 'schedule.view' },
      {
        label: 'Facilities',
        icon: DoorOpen,
        id: 'sidebar-facility',
        requiredCapability: ['schedule.view', 'room.assign_program'],
        requiresProgram: true,
        children: [
          { label: 'Rooms', path: '/secretary/facilities', icon: DoorOpen, id: 'sidebar-rooms', requiredCapability: 'schedule.view', requiresProgram: true },
          { label: 'Program Rooms', path: '/secretary/program-rooms', icon: Split, id: 'sidebar-program-rooms', requiredCapability: 'room.assign_program', requiresProgram: true, requiresMultiplePrograms: true },
        ],
      },
      {
        label: 'Instructors',
        path: '/secretary/instructors',
        icon: GraduationCap,
        id: 'sidebar-faculty',
        requiredCapability: 'schedule.view',
      },
      { label: 'Sections', path: '/secretary/sections', icon: Users, id: 'sidebar-sections', requiredCapability: 'schedule.view', requiresProgram: true },
      { label: 'Curriculum', path: '/secretary/curriculum', icon: Layers, id: 'sidebar-curriculum', requiredCapability: 'schedule.view', requiresProgram: true },
      { label: 'Courses', path: '/secretary/courses', icon: BookOpen, id: 'sidebar-courses', requiredCapability: 'schedule.view', requiresProgram: true },
      {
        label: 'Academic Scheduling',
        icon: CalendarDays,
        id: 'sidebar-schedules',
        requiredCapability: ['schedule.view', 'schedule.create', 'schedule.assign_instructor'],
        requiresProgram: true,
        children: [
          { label: 'Schedule Management', path: '/secretary/schedule-management', icon: CalendarRange, id: 'sidebar-schedule-builder', requiredCapability: 'schedule.create', requiresProgram: true },
          { label: 'Schedules', path: '/secretary/schedules', icon: CalendarDays, id: 'sidebar-section-timetables', requiredCapability: 'schedule.view', requiresProgram: true },
        ],
      },
      {
        label: 'Cross-Department',
        icon: UserRoundCheck,
        id: 'sidebar-cross-department',
        // The group stays open without a program: the receiving Cross-Department page only
        // assigns instructors (schedule.assign_instructor). Course Assignment keeps the
        // program-bound capability and also waits on VPAA approval (Sidebar).
        requiredCapability: 'schedule.assign_instructor',
        children: [
          { label: 'Course Assignment', path: '/secretary/course-assignments', icon: Building2, id: 'sidebar-course-teaching-assignments', requiredCapability: 'schedule.assign_instructor_cross_department' },
          { label: 'Cross-Department', path: '/secretary/cross-department-assignments', icon: UserRoundCheck, id: 'sidebar-cross-department-assignments', requiredCapability: 'schedule.assign_instructor' },
        ],
      },
      { label: 'Room Requests', path: '/secretary/room-requests', icon: DoorClosed, id: 'sidebar-room-requests', requiredCapability: 'room.request' },
    ]
  },
  {
    section: 'SYSTEM',
    items: [
      { label: 'Reports', path: '/secretary/reports', icon: FileBarChart, id: 'sidebar-reports', requiredCapability: 'schedule.view' },
      { label: 'Schedule History', path: '/secretary/schedule-history', icon: History, id: 'sidebar-schedule-history', requiredCapability: 'schedule.view', requiresProgram: true },
    ]
  }
]


