import type { NavItem, NavSection } from './types';
import { MULTIPLE_PROGRAMS_LOCK_MESSAGE, NO_PROGRAM_LOCK_MESSAGE } from '../lib/storedUser';

export interface NavLockContext {
  /** The user's department has no program (`scheduling_ready === false` on /api/me). */
  noProgram: boolean;
  departmentProgramCount?: number;
  hasCapability: (capability: string | string[]) => boolean;
}

/**
 * Marks nav items locked when their capability is missing, when they are program-bound
 * (`requiresProgram`) and the department has no program, or when every child is locked.
 * A program-bound parent locks its children too. Workflow locks (e.g. Course Assignment waiting
 * on VPAA approval) are applied afterwards by the Sidebar.
 */
export const annotateNavItems = (items: NavItem[], context: NavLockContext, parentProgramLocked = false): NavItem[] =>
  items.map((item) => {
    const programLocked = parentProgramLocked || Boolean(item.requiresProgram && context.noProgram);
    const capabilityLocked = Boolean(item.requiredCapability && !context.hasCapability(item.requiredCapability));
    const allocationLocked = Boolean(item.requiresMultiplePrograms && (context.departmentProgramCount ?? 0) <= 1);
    const children = item.children ? annotateNavItems(item.children, context, programLocked) : undefined;
    const allChildrenLocked = Boolean(children && children.length > 0 && children.every((child) => child.isLocked));
    return {
      ...item,
      isLocked: programLocked || capabilityLocked || allocationLocked || allChildrenLocked,
      lockedMessage: programLocked ? NO_PROGRAM_LOCK_MESSAGE : allocationLocked ? MULTIPLE_PROGRAMS_LOCK_MESSAGE : item.lockedMessage,
      children,
    };
  });

export const annotateNav = (nav: NavSection[], context: NavLockContext): NavSection[] =>
  nav.map((section) => ({ ...section, items: annotateNavItems(section.items, context) }));
