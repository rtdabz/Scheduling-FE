import type { LucideIcon } from 'lucide-react'

export interface NavItem {
  label: string
  path?: string
  icon?: LucideIcon
  id?: string
  children?: NavItem[]
  requiredCapability?: string | string[]
  /**
   * Locks the item (and its children) while the user's department has no program
   * (`scheduling_ready === false`), whatever capability gates it. Used for modules
   * that only make sense once a program exists; see docs/plan/department_module_locking_plan.md.
   */
  requiresProgram?: boolean
  /** Program room allocation is only needed between multiple department programs. */
  requiresMultiplePrograms?: boolean
  isLocked?: boolean
  /** Shown instead of the permission message when a workflow, not a capability, locks the item. */
  lockedMessage?: string
  badge?: string
}

export interface NavSection {
  section: string
  items: NavItem[]
}
