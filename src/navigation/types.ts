import type { LucideIcon } from 'lucide-react'

export interface NavItem {
  label: string
  path?: string
  icon?: LucideIcon
  id?: string
  children?: NavItem[]
  requiredCapability?: string | string[]
  isLocked?: boolean
  /** Shown instead of the permission message when a workflow, not a capability, locks the item. */
  lockedMessage?: string
  badge?: string
}

export interface NavSection {
  section: string
  items: NavItem[]
}
