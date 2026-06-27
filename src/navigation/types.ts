import type { LucideIcon } from 'lucide-react'

export interface NavItem {
  label: string
  path?: string         // optional when item has children
  icon?: LucideIcon     // optional for child items
  id?: string           // optional, used for onboarding tour targeting
  children?: NavItem[]  // optional submenu items
}

export interface NavSection {
  section: string
  items: NavItem[]
}
