// Nonmutating browser acceptance. Credentials are read from AUTH_FILE and never written to artifacts.
// Example: node docs/tour-guide-repair/verify-page-guides.mjs
// Optional: APP_URL, API_URL, AUTH_FILE, PLAYWRIGHT_MODULE, CHROME_PATH, CASE_FILTER, OUTPUT_DIR.
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const appUrl = process.env.APP_URL ?? 'http://127.0.0.1:5173';
const apiUrl = process.env.API_URL ?? 'http://127.0.0.1:8000/api';
const playwrightModule = process.env.PLAYWRIGHT_MODULE ?? 'playwright';
const { chromium } = await import(playwrightModule);
const auth = JSON.parse(await readFile(process.env.AUTH_FILE ?? path.join(tmpdir(), 'wicars-tour-auth.json'), 'utf8'));
const outputDir = process.env.OUTPUT_DIR ?? path.join(path.dirname(fileURLToPath(import.meta.url)), 'page-guides');
await mkdir(outputDir, { recursive: true });
const users = new Map();
for (const account of auth) {
  const response = await fetch(apiUrl + '/me', { headers: { Authorization: 'Bearer ' + account.token, Accept: 'application/json' } });
  assert.equal(response.status, 200, 'Temporary local account must be usable');
  const payload = await response.json();
  users.set(account.id, { token: account.token, user: payload.user ?? payload.data ?? payload });
}

const cases = [
  { name: 'rooms-list', account: 30, guide: 'rooms', route: '/secretary/facilities', area: '#rooms-workspace' },
  { name: 'rooms-grid', account: 30, guide: 'rooms', route: '/secretary/facilities', area: '#rooms-workspace', setup: 'grid' },
  { name: 'rooms-open-building', account: 30, guide: 'rooms', route: '/secretary/facilities', area: '#rooms-workspace', setup: 'building' },
  { name: 'rooms-empty-fixture', account: 30, guide: 'rooms', route: '/secretary/facilities', area: '#rooms-workspace', fixture: 'rooms-empty' },
  { name: 'rooms-mobile-320', account: 30, guide: 'rooms', route: '/secretary/facilities', area: '#rooms-workspace', viewport: { width: 320, height: 568 } },
  { name: 'instructors-list', account: 30, guide: 'instructors', route: '/secretary/instructors', area: '#instructors-workspace' },
  { name: 'instructors-grid', account: 30, guide: 'instructors', route: '/secretary/instructors', area: '#instructors-workspace', setup: 'grid' },
  { name: 'instructors-filtered-empty', account: 30, guide: 'instructors', route: '/secretary/instructors', area: '#instructors-workspace', setup: 'faculty-empty' },
  { name: 'instructors-open-details', account: 30, guide: 'instructors', route: '/secretary/instructors', area: '#instructors-workspace', setup: 'faculty-details' },
  { name: 'sections-create', account: 30, guide: 'sections', route: '/secretary/sections', area: '#sections-table' },
  { name: 'sections-read-only', account: 28, guide: 'sections', route: '/dean/sections', area: '#sections-table' },
  { name: 'sections-open-form', account: 30, guide: 'sections', route: '/secretary/sections', area: '#sections-table', setup: 'section-form' },
  { name: 'sections-mobile-390', account: 30, guide: 'sections', route: '/secretary/sections', area: '#sections-table', viewport: { width: 390, height: 844 } },
  { name: 'course-list', account: 30, guide: 'course-list', route: '/secretary/courses', area: '#course-list-table' },
  { name: 'course-list-filtered-empty', account: 29, guide: 'course-list', route: '/program_head/courses', area: '#course-list-table', setup: 'course-empty' },
  { name: 'course-list-keyboard', account: 28, guide: 'course-list', route: '/dean/courses', area: '#course-list-table', keyboard: true },
  { name: 'curriculum-import', account: 30, guide: 'curriculum', route: '/secretary/curriculum', area: '#curriculum-list' },
  { name: 'curriculum-create-form', account: 29, guide: 'curriculum', route: '/program_head/curriculum', area: '#curriculum-list' },
  { name: 'curriculum-read-only-vpaa', account: 1, guide: 'curriculum', route: '/curriculum', area: '#curriculum-review-list' },
  { name: 'curriculum-read-only-dean', account: 28, guide: 'curriculum', route: '/dean/curriculum', area: '#curriculum-review-list' },
  { name: 'curriculum-mobile-320', account: 29, guide: 'curriculum', route: '/program_head/curriculum', area: '#curriculum-list', viewport: { width: 320, height: 568 } },
  { name: 'course-teaching-live', account: 17, guide: 'course-teaching', route: '/secretary/course-assignments', area: '#course-teaching-courses', setup: 'course-selection' },
  { name: 'course-teaching-locked', account: 30, guide: 'course-teaching', route: '/secretary/course-assignments', locked: true },
  { name: 'course-teaching-mobile-unlock-fixture', account: 30, guide: 'course-teaching', route: '/secretary/course-assignments', area: '#course-teaching-courses', fixture: 'unlock', viewport: { width: 390, height: 844 } },
  { name: 'course-teaching-no-curriculum-fixture', account: 17, guide: 'course-teaching', route: '/secretary/course-assignments', area: '#course-teaching-courses', fixture: 'no-curriculum' },
  { name: 'instructor-assignment-list', account: 30, guide: 'instructor-assignment', route: '/secretary/instructor-assignment', area: '#instructor-assignment-page' },
  { name: 'instructor-assignment-deep-grid', account: 30, guide: 'instructor-assignment', route: '/secretary/instructor-assignment?department=6', area: '#instructor-assignment-workspace', savedGrid: true },
  { name: 'instructor-assignment-empty-fixture', account: 30, guide: 'instructor-assignment', route: '/secretary/instructor-assignment', area: '#instructor-assignment-page', fixture: 'assignments-empty' },
  { name: 'cross-department-list', account: 30, guide: 'cross-department-assignment', route: '/secretary/cross-department-assignments', area: '#instructor-assignment-page' },
  { name: 'cross-department-program-head-deep-grid', account: 29, guide: 'cross-department-assignment', route: '/program_head/cross-department-assignments?department=6', area: '#instructor-assignment-workspace', savedGrid: true },
];

async function tabTo(page, locator) {
  for (let i = 0; i < 100; i++) {
    if (await locator.evaluate((element) => element === document.activeElement)) return i;
    await page.keyboard.press('Tab');
  }
  throw new Error('Control was not reachable through the keyboard Tab sequence');
}

async function runGuide(page, config, result) {
  const help = page.locator('[data-wicars-guide-help="' + config.guide + '"]');
  await help.waitFor({ state: 'visible', timeout: 25000 });
  if (config.keyboard) {
    await help.focus();
    await page.keyboard.press('Enter');
  } else await help.click();
  for (let index = 0; index < 20; index++) {
    const tooltip = page.locator('[data-wicars-task-tooltip]:visible').last();
    await tooltip.waitFor({ state: 'visible', timeout: 20000 });
    const stepId = await tooltip.getAttribute('data-wicars-step-id');
    const action = await tooltip.getAttribute('data-wicars-task-action');
    if (process.env.VERBOSE) console.log(JSON.stringify({ case: config.name, step: stepId, action }));
    await page.waitForTimeout(180);
    const bounds = await tooltip.boundingBox();
    const viewport = page.viewportSize();
    assert(bounds && bounds.x >= -2 && bounds.y >= -2 && bounds.x + bounds.width <= viewport.width + 2 && bounds.y + bounds.height <= viewport.height + 2, 'Tooltip must fit the viewport at ' + stepId);
    const exitBounds = await tooltip.locator('.wicars-task-tip-exit').boundingBox();
    assert(exitBounds && exitBounds.y + exitBounds.height <= viewport.height + 2, 'Exit must remain visible');
    result.steps.push({ stepId, action, bounds: Object.fromEntries(Object.entries(bounds).map(([key, value]) => [key, Math.round(value)])) });
    if (index === 0) await page.screenshot({ path: path.join(outputDir, config.name + '-start.png') });
    if (action !== 'complete') {
      assert.equal(action, 'click', 'Only nonmutating opening actions are expected');
      const focusButton = tooltip.getByRole('button', { name: 'Go to control', exact: true });
      if (config.keyboard) { await tabTo(page, focusButton); await page.keyboard.press('Enter'); await page.keyboard.press('Enter'); }
      else {
        await focusButton.click();
        result.steps.at(-1).focusHit = await page.evaluate(() => {
          const element = document.activeElement;
          const box = element.getBoundingClientRect();
          const hit = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2);
          return { tag: element.tagName, tour: element.getAttribute('data-tour'), id: element.id, x: Math.round(box.x), y: Math.round(box.y), width: Math.round(box.width), height: Math.round(box.height), hitTag: hit?.tagName, hitClass: typeof hit?.className === 'string' ? hit.className : null, receivesClick: !!hit && element.contains(hit) };
        });
        await page.locator(':focus').click();
      }
    } else {
      const next = tooltip.locator('.wicars-task-tip-next');
      const finishing = (await next.textContent()) === 'Finish';
      if (finishing) await page.screenshot({ path: path.join(outputDir, config.name + '-finish.png') });
      if (config.keyboard) { await tabTo(page, next); await page.keyboard.press('Enter'); }
      else await next.click();
      if (finishing) {
        await page.locator('[data-wicars-task-tooltip], [data-wicars-guide-recovery]').waitFor({ state: 'hidden', timeout: 10000 });
        const outcomes = await page.evaluate((guideId) => Object.entries(localStorage).filter(([key]) => key.startsWith('wicars_workflow_guide_v4_' + guideId + '_')).map(([, value]) => JSON.parse(value).outcome), config.guide);
        assert(outcomes.includes('completed'), 'Finishing applicable help must record completed');
        return;
      }
    }
    await page.waitForFunction((previous) => {
      const current = document.querySelector('[data-wicars-task-tooltip]');
      return !current || current.getAttribute('data-wicars-step-id') !== previous;
    }, stepId, { timeout: 15000 });
  }
  throw new Error('Guide exceeded expected step limit');
}

const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
const results = [];
for (const config of cases.filter((entry) => !process.env.CASE_FILTER || new RegExp(process.env.CASE_FILTER).test(entry.name))) {
  const credentials = users.get(config.account);
  assert(credentials, 'Temporary account is required for this acceptance case');
  const result = { name: config.name, guide: config.guide, role: credentials.user.role, route: config.route, viewport: config.viewport ?? { width: 1440, height: 900 }, input: config.keyboard ? 'keyboard' : 'mouse', evidence: config.fixture ? 'browser-only response fixture: ' + config.fixture : 'authenticated live local API', steps: [], writes: [], pageErrors: [], passed: false };
  const context = await browser.newContext({ viewport: result.viewport, reducedMotion: 'reduce' });
  await context.addInitScript(({ token, user, savedGrid }) => {
    localStorage.setItem('token', token); localStorage.setItem('user', JSON.stringify(user)); localStorage.setItem('wicars:last-activity', String(Date.now()));
    if (savedGrid) localStorage.setItem('instructor-assignment:view', 'grid');
  }, { ...credentials, savedGrid: config.savedGrid });
  await context.route('**/api/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method()) && !/broadcasting\/auth|\/auth\//.test(url.pathname)) {
      result.writes.push({ method: request.method(), path: url.pathname });
      return route.abort('blockedbyclient');
    }
    let change;
    if (config.fixture === 'unlock' && /\/departments\/\d+\/schedule-status$/.test(url.pathname)) change = (payload) => ({ ...payload, cross_department_unlocked: true });
    if (config.fixture === 'rooms-empty' && url.pathname.endsWith('/initial-data')) change = (payload) => ({ ...payload, rooms: [] });
    if (config.fixture === 'no-curriculum' && url.pathname.endsWith('/course-teaching-assignments')) change = (payload) => ({ ...payload, courses: [], has_active_curriculum: false });
    if (config.fixture === 'assignments-empty' && url.pathname.endsWith('/instructor-assignments')) change = (payload) => ({ ...payload, schedules: [], incoming_courses: [] });
    if (!change) return route.continue();
    const response = await route.fetch();
    return route.fulfill({ response, json: change(await response.json()) });
  });
  const page = await context.newPage();
  page.on('pageerror', (error) => result.pageErrors.push(error.message));
  if (process.env.DEBUG_TOUR) { await context.addInitScript(() => localStorage.setItem('wicars_tour_debug','1')); page.on('console', (message) => { if (message.text().startsWith('[tour]')) console.log(message.text()); }); }
  try {
    await page.goto(appUrl + config.route, { waitUntil: 'domcontentloaded', timeout: 45000 });
    if (config.locked) {
      await page.getByText('Cross-Department assignments will be available once all schedules are approved by the VPAA.').waitFor({ timeout: 25000 });
      assert.equal(await page.locator('[data-wicars-guide-help="course-teaching"]').count(), 0, 'Locked module must not expose a guide to inaccessible controls');
      await page.screenshot({ path: path.join(outputDir, config.name + '-locked.png') });
    } else {
      await page.waitForFunction((selector) => { const area = document.querySelector(selector); return area && area.getAttribute('aria-busy') !== 'true'; }, config.area, { timeout: 30000 });
      await page.waitForLoadState('networkidle', { timeout: 20000 }).catch(() => {});
      await page.waitForTimeout(350);
      if (config.setup === 'grid') await page.getByRole('button', { name: 'Grid View', exact: true }).click();
      if (config.setup === 'building') await page.locator('[data-tour="building-card"]').first().click();
      if (config.setup === 'faculty-empty') await page.locator('#instructors-search').fill('TourAcceptanceNoInstructor987654321');
      if (config.setup === 'faculty-details') await page.locator('[data-tour="view-details"]').first().click();
      if (config.setup === 'section-form') await page.locator('#sections-add-button').click();
      if (config.setup === 'course-empty') await page.locator('#course-list-search').fill('TourAcceptanceNoCourse987654321');
      let selected;
      if (config.setup === 'course-selection') {
        selected = page.locator('#course-teaching-courses tbody input[type="checkbox"]:not(:disabled)').first();
        if (await selected.count()) await selected.check();
      }
      await runGuide(page, config, result);
      if (selected && await selected.count()) assert(await selected.isChecked(), 'Reviewing help must preserve unsaved course selection');
      if (config.savedGrid) assert.equal(await page.evaluate(() => localStorage.getItem('instructor-assignment:view')), 'grid', 'Help must preserve the saved view');
    }
    assert.equal(result.writes.length, 0, 'Help must not attempt domain writes');
    assert.equal(result.pageErrors.length, 0, 'Guide must not raise browser page errors');
    result.passed = true;
  } catch (error) {
    result.error = String(error.message).slice(0, 3500);
    result.outcomes = await page.evaluate(() => Object.entries(localStorage).filter(([key]) => key.startsWith('wicars_workflow_guide_v4_')).map(([key,value]) => ({key, ...JSON.parse(value)})));
    result.recovery = await page.locator('[data-wicars-guide-recovery]').textContent().catch(() => null);
    await page.screenshot({ path: path.join(outputDir, config.name + '-failure.png') }).catch(() => {});
  }
  results.push(result);
  await context.close();
  console.log(JSON.stringify({ name: result.name, passed: result.passed, steps: result.steps.length, error: result.error, writes: result.writes.length }));
  await writeFile(path.join(outputDir, 'results.json'), JSON.stringify({ generatedAt: new Date().toISOString(), appUrl, apiUrl, summary: { passed: results.filter((entry) => entry.passed).length, failed: results.filter((entry) => !entry.passed).length }, results }, null, 2));
}
await browser.close();
if (results.some((entry) => !entry.passed)) process.exitCode = 1;
