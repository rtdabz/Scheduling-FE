import { describe, expect, it } from 'vitest';
import { dashboardPathForRole, isDepartmentOfficeRole, officePath, roleLabel, roleWorkspaceBase } from './roles';

describe('account roles', () => {
  it('treats Secretary and Director as the department office', () => {
    expect(isDepartmentOfficeRole('secretary')).toBe(true);
    expect(isDepartmentOfficeRole('Director')).toBe(true);
    expect(isDepartmentOfficeRole('program_head')).toBe(false);
    expect(isDepartmentOfficeRole('dean')).toBe(false);
    expect(isDepartmentOfficeRole(undefined)).toBe(false);
  });

  it('keeps the Director identity in labels and routes', () => {
    expect(roleLabel('director')).toBe('Director');
    expect(roleLabel('secretary')).toBe('Secretary');
    expect(roleWorkspaceBase('director')).toBe('/director');
    expect(dashboardPathForRole('director')).toBe('/director/dashboard');
    expect(dashboardPathForRole('secretary')).toBe('/secretary/dashboard');
    expect(dashboardPathForRole('vpaa')).toBe('/dashboard');
  });

  it('re-roots Secretary workspace paths for a Director only', () => {
    expect(officePath('director', '/secretary/facilities')).toBe('/director/facilities');
    expect(officePath('secretary', '/secretary/facilities')).toBe('/secretary/facilities');
    expect(officePath('director', '/secretary-notes')).toBe('/secretary-notes');
  });
});
