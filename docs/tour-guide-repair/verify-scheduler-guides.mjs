// Read-only browser acceptance. Authentication stays in an external temporary file.
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

const moduleUrl = process.env.PLAYWRIGHT_MODULE ?? 'playwright';
const authFile = process.env.AUTH_FILE ?? path.join(process.env.TEMP, 'wicars-tour-auth.json');
const frontend = process.env.FRONTEND_URL ?? 'http://127.0.0.1:5173';
const api = process.env.API_URL ?? 'http://127.0.0.1:8000/api';
const output = process.env.OUTPUT_DIR ?? path.join(path.dirname(fileURLToPath(import.meta.url)), 'scheduler-guides');
await fs.mkdir(output, { recursive: true });
const { chromium } = await import(moduleUrl);
const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
const profiles = JSON.parse(await fs.readFile(authFile, 'utf8'));
const results = [];

const targets = {
  'selected-section': '#schedule-builder-section button[aria-haspopup="listbox"]',
  workflow: '#schedule-builder-workflow', generator: '#schedule-builder-generate button',
  'open-manual-plotting': '#schedule-builder-course-bank-toggle', 'course-bank': '#schedule-builder-course-bank',
  timetable: '#schedule-builder-timetable', 'next-action': '#schedule-builder-next-step',
  'assign-instructors': '#schedule-builder-auto-assign', 'year-level': '#generator-year-level',
  'section-scope': '#generator-section-target', curriculum: '#generator-curriculum-select',
  'preferred-days': '#generator-preferred-days', 'continue-setup': '#generator-continue',
  'setup-courses': '#generator-setup-head', defaults: '#generator-default-settings',
  'continue-review': '#generator-continue', 'review-selections': '#generator-step-panel',
  generate: '#generator-generate', summary: '#generator-workspace', save: '#generator-save',
  'run-status': '#generator-workspace', 'cancel-run': '#generator-cancel',
  'blocked-result': '#generator-workspace', 'failed-result': '#generator-workspace',
};

async function readApi(profile, endpoint) {
  const response = await fetch(api + endpoint, { headers: { Authorization: 'Bearer ' + profile.token, Accept: 'application/json' } });
  assert(response.ok, `Read failed: ${endpoint} (${response.status})`);
  return response.json();
}

function fixtureRun(kind, initial) {
  const section = initial.sections[0];
  const sample = initial.schedules[0];
  const record = { run_id: 'browser-fixture-only', status: kind, year_level: Number(section.year_level), created_at: new Date().toISOString(), result: null };
  if (kind === 'blocked') return { ...record, status: 'failed', result: { error_code: 'year_level_generation_failed', message: 'Browser-only blocked-run fixture.', stage: 'feasibility', blocking_constraints: [], recommendations: [], attempts: [] } };
  if (kind === 'completed' || kind === 'partial') return { ...record, status: 'completed', result: {
    status: kind === 'partial' ? 'partial' : 'complete',
    schedules: [{ ...sample, id: 990001, section_id: section.id, section, department_id: section.department_id, program_id: section.program_id, status: 'draft' }],
    unplaced_courses: [], recommendations: [],
  } };
  if (kind === 'failed' || kind === 'cancelled') record.error_message = `Browser-only ${kind} run fixture.`;
  return record;
}

async function screenshot(page, name) {
  await page.screenshot({ path: path.join(output, name + '.png'), fullPage: false });
}

async function geometry(page, step) {
  return page.evaluate(({ step, selector }) => {
    const tip = document.querySelector('[data-wicars-task-tooltip]');
    const target = document.querySelector(selector ?? '#generator-progress');
    const a = tip.getBoundingClientRect();
    const b = target?.getBoundingClientRect();
    const overlap = b ? Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left)) * Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top)) : 0;
    return {
      step, tooltip: { x: a.x, y: a.y, width: a.width, height: a.height },
      inViewport: a.left >= -1 && a.top >= -1 && a.right <= innerWidth + 1 && a.bottom <= innerHeight + 1,
      targetVisible: Boolean(b && b.width && b.height),
      targetCoveredPct: b?.width && b?.height ? Math.round(overlap / (b.width * b.height) * 100) : null,
      accessibleNameLinked: Boolean(document.getElementById(tip.getAttribute('aria-labelledby'))),
      accessibleDescriptionLinked: Boolean(document.getElementById(tip.getAttribute('aria-describedby'))),
      exitReachable: (() => { const exit = tip.querySelector('.wicars-task-tip-exit').getBoundingClientRect(); return exit.top >= 0 && exit.bottom <= innerHeight; })(),
    };
  }, { step, selector: targets[step] });
}

async function walk(page, result, guideId) {
  await page.locator('[data-wicars-task-tooltip]').waitFor({ state: 'visible', timeout: 30000 });
  for (let index = 0; index < 18; index++) {
    const tooltip = page.locator('[data-wicars-task-tooltip]');
    await tooltip.waitFor({ state: 'visible', timeout: 20000 });
    await page.waitForTimeout(180);
    const step = await tooltip.getAttribute('data-wicars-step-id');
    const action = await tooltip.getAttribute('data-wicars-task-action');
    assert(!result.steps.includes(step), `Step repeated: ${step}`);
    result.steps.push(step);
    const metric = await geometry(page, step);
    result.geometry.push(metric);
    assert(metric.inViewport && metric.exitReachable, `Tooltip/Exit outside viewport at ${step}`);
    assert(metric.accessibleNameLinked && metric.accessibleDescriptionLinked, `Accessible labels missing at ${step}`);
    if (!index) await screenshot(page, result.name + '-first');
    const next = tooltip.locator('.wicars-task-tip-next');
    const finishing = await next.isVisible() && (await next.textContent()) === 'Finish';
    if (action === 'complete' || await next.isVisible()) {
      await next.click();
    } else {
      assert(step === 'open-manual-plotting', `Unapproved action: ${action} ${step}`);
      await tooltip.getByRole('button', { name: 'Go to control' }).click();
      assert.equal(await page.locator(':focus').getAttribute('id'), 'schedule-builder-course-bank-toggle');
      await page.keyboard.press('Enter');
      result.keyboardTargetActivation = true;
    }
    await page.waitForFunction((previous) => {
      const tip = document.querySelector('[data-wicars-task-tooltip]');
      return !tip || tip.getAttribute('data-wicars-step-id') !== previous;
    }, step);
    if (finishing) break;
  }
  await page.locator('[data-wicars-task-tooltip]').waitFor({ state: 'detached' });
  result.outcomes = await page.evaluate((id) => Object.entries(localStorage)
    .filter(([key]) => key.startsWith('wicars_workflow_guide_v4_' + id + '_'))
    .map(([, value]) => { const parsed = JSON.parse(value); return { variant: parsed.variant, outcome: parsed.outcome }; }), guideId);
  assert(result.outcomes.some((outcome) => outcome.outcome === 'completed'), 'No truthful completion record');
}

async function scenario(spec) {
  const result = { name: spec.name, roleId: spec.profileId ?? 30, viewport: spec.viewport ?? { width: 1440, height: 900 }, fixture: spec.status ? `initial-data status=${spec.status}; browser-only editable-program mapping` : spec.editable ? 'browser-only editable-program mapping; existing section/course data' : spec.run ? `generation result=${spec.run}` : spec.stage ? `browser draft restored to stage ${spec.stage}; live API reads` : 'live data', steps: [], geometry: [], writeViolations: [], interceptedReadValidations: [], errors: [] };
  const profile = profiles.find((item) => item.id === result.roleId);
  const user = await readApi(profile, '/me');
  const initial = await readApi(profile, '/initial-data');
  const run = spec.run ? fixtureRun(spec.run, initial) : null;
  const context = await browser.newContext({ viewport: result.viewport, reducedMotion: 'reduce' });
  const page = await context.newPage();
  page.on('pageerror', (error) => result.errors.push(error.message));
  await context.addInitScript(({ token, user, manualOpen, stage, semester, department }) => {
    localStorage.clear(); sessionStorage.clear();
    localStorage.setItem('token', token); localStorage.setItem('user', JSON.stringify(user));
    localStorage.setItem('wicars:last-activity', String(Date.now()));
    localStorage.setItem('timetable_wide_view', String(!manualOpen));
    if (stage) localStorage.setItem(`wicars.year-level-wizard.v5.${department}.${semester}`, JSON.stringify({ step: stage, yearLevel: 1, activeSectionId: '', configs: {}, setupDraft: { completed: true, preferredDays: ['Monday'], excludedCourseIds: [], customizedCourseIds: [] } }));
  }, { token: profile.token, user, manualOpen: spec.manualOpen ?? false, stage: spec.stage, semester: initial.active_semester.id, department: user.department_id });
  await context.route('**/api/**', async (route) => {
    const request = route.request();
    const pathname = new URL(request.url()).pathname;
    if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method()) && !/broadcasting\/auth|\/login|\/auth\//.test(pathname)) {
      if (spec.run === 'partial' && pathname.endsWith('/schedule-recommendations/draft-review')) {
        result.interceptedReadValidations.push({ method: request.method(), path: pathname, browserFixture: true });
        return route.fulfill({ json: { issues: [] } });
      }
      result.writeViolations.push({ method: request.method(), path: pathname });
      return route.abort('blockedbyclient');
    }
    if (pathname.endsWith('/initial-data') && (spec.status || spec.editable)) {
      const response = await route.fetch(); const body = await response.json();
      body.can_edit_program_ids = [...new Set(body.sections.map((section) => Number(section.program_id)))];
      if (spec.status) {
        const sample = body.schedules[0];
        body.schedules = body.sections.map((section, index) => ({ ...sample, id: 990000 + index, section_id: section.id, section, department_id: section.department_id, program_id: section.program_id, status: spec.status }));
      }
      return route.fulfill({ response, json: body });
    }
    if (pathname.endsWith('/schedule-recommendations/active-generation-run')) return route.fulfill({ json: { run } });
    if (run && pathname.includes('/schedule-recommendations/generation-runs/')) return route.fulfill({ json: run });
    return route.continue();
  });
  try {
    await page.goto(frontend + '/' + user.role + '/schedule-management');
    await page.locator('#schedule-builder-section button[aria-haspopup="listbox"]').waitFor();
    await page.waitForLoadState('networkidle');
    assert.equal(await page.locator('[data-wicars-task-tooltip]').count(), 0, 'Unexpected automatic guide');
    if (spec.generator) {
      await page.locator('#schedule-builder-generate button').click();
      await page.getByRole('dialog', { name: 'Generate schedule', exact: true }).waitFor();
      await page.waitForLoadState('networkidle');
      assert.equal(await page.locator('[data-wicars-guide-help]:visible').count(), 0, 'Parent Help remains inside generator');
      const draftKey = `wicars.year-level-wizard.v5.${user.department_id}.${initial.active_semester.id}`;
      const before = await page.evaluate((key) => localStorage.getItem(key), draftKey);
      await page.getByRole('button', { name: 'Open help for this generator stage', exact: true }).click();
      await walk(page, result, 'schedule-generator');
      result.draftPreserved = before === await page.evaluate((key) => localStorage.getItem(key), draftKey);
      assert(result.draftPreserved, 'Help changed wizard draft');
      result.generatorRemainsOpen = await page.getByRole('dialog', { name: 'Generate schedule', exact: true }).isVisible();
      await screenshot(page, result.name + '-finished');
    } else {
      const guideId = spec.status === 'faculty_assignment' ? 'schedule-builder-faculty-assignment' : spec.status === 'submitted' ? 'schedule-builder-review' : 'schedule-builder-plotting';
      if (spec.pickerOpen) await page.locator('#schedule-builder-section button[aria-haspopup="listbox"]').click();
      await page.locator(`[data-wicars-guide-help="${guideId}"]`).click();
      await walk(page, result, guideId);
      if (spec.manualOpen) assert.equal(await page.locator('#schedule-builder-course-bank-toggle').getAttribute('aria-pressed'), 'true', 'Help closed the already-open panel');
      await screenshot(page, result.name + '-finished');
    }
    assert.equal(result.writeViolations.length, 0, 'A domain write was attempted (blocked by harness)');
    assert.equal(result.errors.length, 0, 'Browser page errors');
    result.passed = true;
  } catch (error) {
    result.passed = false; result.failure = error.message;
    await screenshot(page, result.name + '-failure').catch(() => {});
  } finally {
    await context.close(); results.push(result);
    await fs.writeFile(path.join(output, 'results.json'), JSON.stringify({ generatedAt: new Date().toISOString(), browser: 'Chrome headless', safeMode: 'All domain writes aborted; run/status fixtures are browser-only.', results }, null, 2));
    console.log(JSON.stringify({ name: result.name, passed: result.passed, steps: result.steps, failure: result.failure, writeViolations: result.writeViolations.length, errors: result.errors }));
  }
}

try {
  const scenarios = [
    { name: 'plotting-closed-live' },
    { name: 'plotting-closed-ownership-fixture', editable: true },
    { name: 'plotting-open-ownership-fixture', editable: true, manualOpen: true, viewport: { width: 1366, height: 768 } },
    { name: 'plotting-programhead-empty-live', profileId: 29 },
    { name: 'plotting-picker-open-live', pickerOpen: true },
    { name: 'faculty-assignment-fixture', status: 'faculty_assignment' },
    { name: 'review-submitted-fixture', status: 'submitted' },
    { name: 'generator-empty-live', generator: true },
    ...[1, 2, 3, 4].map((stage) => ({ name: `generator-stage-${stage}`, generator: true, editable: true, stage })),
    ...['queued', 'running', 'blocked', 'failed', 'cancelled', 'completed', 'partial'].map((run) => ({ name: `generator-run-${run}-fixture`, generator: true, editable: true, run })),
    { name: 'plotting-narrow-390', editable: true, viewport: { width: 390, height: 844 } },
    { name: 'generator-narrow-320', generator: true, editable: true, stage: 2, viewport: { width: 320, height: 568 } },
  ];
  for (const spec of scenarios.filter((item) => !process.env.SCENARIO || item.name.includes(process.env.SCENARIO))) await scenario(spec);
} finally { await browser.close(); }
if (results.some((result) => !result.passed)) process.exitCode = 1;
