import {
  LayoutDashboard,
  CalendarDays,
  Calendar,
  GraduationCap,
  UserPlus,
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
  DoorClosed,
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
            label: 'Schedule Approval',
            path: '/schedules/approval',
            id: 'sidebar-schedule-approval'
          },
          {
            label: 'All Schedules',
            path: '/schedules',
            id: 'sidebar-all-schedules'
          },
        ]
      },
      { label: 'Master Calendar', path: '/calendar', icon: Calendar, id: 'sidebar-calendar' },
      { label: 'Curriculum', path: '/curriculum', icon: BookOpen, id: 'sidebar-curriculum' },
      {
        label: 'Instructor',
        icon: GraduationCap,
        id: 'sidebar-faculty',
        children: [
          { label: 'Instructor List', path: '/faculty', icon: UserPlus, id: 'sidebar-instructors' },
          { label: 'Instructor Designations', path: '/designations', icon: Award, id: 'sidebar-designations' },
        ],
      },
      {
        label: 'Facility',
        icon: DoorOpen,
        id: 'sidebar-rooms',
        children: [
          { label: 'Facility List', path: '/rooms', icon: DoorOpen, id: 'sidebar-rooms-list' },
          { label: 'Room Requests', path: '/room-requests', icon: DoorClosed, id: 'sidebar-room-requests', requiredCapability: 'room.view_all_requests' },
        ],
      },
    ]
  },
  {
    section: 'SYSTEM',
    items: [
      { label: 'Department Management', path: '/departments', icon: Building2, id: 'sidebar-departments' },
      { label: 'User Management', path: '/users', icon: Users, id: 'sidebar-users' },
      { label: 'Reports', path: '/reports', icon: FileBarChart, id: 'sidebar-reports' },
      { label: 'Activity Log', path: '/activity-log', icon: ClipboardList, id: 'sidebar-activity-log' },
      { label: 'Schedule History', path: '/schedule-history', icon: History, id: 'sidebar-schedule-history' },
      { label: 'Archive', path: '/archive', icon: Archive, id: 'sidebar-archive' },
      { label: 'Settings', path: '/settings', icon: Settings, id: 'sidebar-settings' },
    ]
  }
]
