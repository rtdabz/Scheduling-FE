import type { LucideIcon } from 'lucide-react'

export interface NavItem {
  label: string
  path?: string
  icon?: LucideIcon
  id?: string
  children?: NavItem[]
  requiredCapability?: string | string[]
  isLocked?: boolean
  badge?: string
}

export interface NavSection {
  section: string
  items: NavItem[]
}
