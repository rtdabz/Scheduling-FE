import type { LucideIcon } from 'lucide-react'

export interface NavItem {
  label: string
  path: string
  icon: LucideIcon
  id?: string  // optional, used for onboarding tour targeting
}

export interface NavSection {
  section: string
  items: NavItem[]
}
