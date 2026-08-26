import { describe, expect, it } from 'vitest';
import { resolveOnboardingRole, roleOnboardingFlows } from './roleOnboarding';

describe('role onboarding flows', () => {
  it('resolves only supported roles', () => {
    expect(resolveOnboardingRole('VPAA')).toBe('vpaa');
    expect(resolveOnboardingRole('dean')).toBe('dean');
    expect(resolveOnboardingRole('secretary')).toBe('secretary');
    expect(resolveOnboardingRole('PROGRAM_HEAD')).toBe('program_head');
    expect(resolveOnboardingRole('admin')).toBeNull();
  });

  it('keeps the Dean flow review-only', () => {
    const deanTaskText = roleOnboardingFlows.dean.tasks
      .map((task) => `${task.title} ${task.description}`)
      .join(' ')
      .toLowerCase();

    expect(deanTaskText).not.toMatch(/create|edit|delete|generate|assign instructor/);
    expect(roleOnboardingFlows.dean.tasks.some((task) => task.path.endsWith('/schedules/approval'))).toBe(true);
  });

  it('keeps Secretary and Program Head flows separate from VPAA and Dean', () => {
    expect(roleOnboardingFlows.secretary).not.toBe(roleOnboardingFlows.program_head);
    expect(roleOnboardingFlows.secretary.tasks.some((task) => task.path === '/secretary/curriculum')).toBe(true);
    expect(roleOnboardingFlows.program_head.tasks.some((task) => task.path === '/program_head/curriculum')).toBe(true);
    expect(roleOnboardingFlows.vpaa.tasks.some((task) => task.path === '/departments')).toBe(true);
    expect(roleOnboardingFlows.dean.tasks.some((task) => task.path === '/dean/schedules/approval')).toBe(true);
  });
});
