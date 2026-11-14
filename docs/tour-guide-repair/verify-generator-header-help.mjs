// Render the real generator with browser-only API fixtures; no credentials or backend writes.
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? 'playwright');
const app = process.env.APP_URL ?? 'http://127.0.0.1:5173';
const output = process.env.OUTPUT_DIR ?? path.join(path.dirname(fileURLToPath(import.meta.url)), 'generator-header-help');
await mkdir(output, { recursive: true });
const course = { id: '20', code: 'IT 101', name: 'Introduction to Computing', units: 3, lectureHours: 3, labHours: 0, category: 'major', semester: '1st', departmentId: 2, yearLevel: 1, roomTypeRequired: 'lecture', status: 'active' };
const section = { id: '10', name: 'BSIT 1A', programCode: 'BSIT', yearLevel: 1, semester: '1st', departmentId: 2, curriculumId: 7, curriculumName: 'BSIT 2026', semesterId: 1, status: 'active' };
const responses = {
  '/scheduling-settings': { forced_day_rules: [], field_course_codes: [] },
  '/rooms': [],
  '/curriculum': [{ id: 7, name: 'BSIT 2026', code: 'BSIT-2026', department_id: 2, status: 'active' }],
  '/courses': [{ id: 20, course_code: course.code, course_name: course.name, units: 3, lecture_hours: 3, lab_hours: 0, course_category: 'major', semester: '1st', department_id: 2, year_level: '1', room_type_required: 'lecture', status: 'active' }],
  '/schedule-recommendations/active-generation-run': { run: null },
};
const preview = `<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"></head><body><div id="root"></div><script type="module">
import RefreshRuntime from '/@react-refresh';
RefreshRuntime.injectIntoGlobalHook(window);
window.$RefreshReg$ = () => {};
window.$RefreshSig$ = () => (type) => type;
window.__vite_plugin_react_preamble_installed__ = true;
await import('/src/index.css');
const { default: React } = await import('/node_modules/.vite/deps/react.js');
const { default: ReactDOM } = await import('/node_modules/.vite/deps/react-dom_client.js');
const { ToastProvider } = await import('/src/context/ToastContext.tsx');
const { GenerationRunProvider } = await import('/src/pages/ClassSchedules/SchedulerPanel/hooks/useGenerationRun.tsx');
const { default: Workflow } = await import('/src/pages/ClassSchedules/SchedulerPanel/GenerateSchedule/YearLevelGenerateScheduleWorkflow.tsx');
const h = React.createElement;
ReactDOM.createRoot(document.getElementById('root')).render(h(ToastProvider, null, h(GenerationRunProvider, { departmentId: 2, semesterId: 1 },
  h('div', { role: 'dialog', 'aria-modal': true, 'aria-label': 'Generate schedule', className: 'fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 p-2 sm:p-4' },
    h('div', { className: 'flex max-h-[calc(100dvh-1rem)] max-w-full overflow-hidden bg-white shadow-2xl sm:rounded-lg' },
      h(Workflow, { onClose() {}, sections: [${JSON.stringify(section)}], courses: [${JSON.stringify(course)}], activeSemester: { id: 1, academic_year: '2026-2027', semester: '1st', is_active: true }, departmentId: 2, existingSchedules: [], onAccepted() {} })
    )
  )
)));
</script></body></html>`;

const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
const results = [];
try {
  for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }, { width: 320, height: 568 }]) {
    for (const stage of [1, 2, 3, 4]) {
      const result = { stage, viewport, errors: [], writeAttempts: [], passed: false };
      const context = await browser.newContext({ viewport, reducedMotion: 'reduce' });
      await context.addInitScript((step) => {
        localStorage.setItem('user', JSON.stringify({ id: 999999, role: 'secretary', department_id: 2 }));
        localStorage.setItem('wicars.year-level-wizard.v5.2.1', JSON.stringify({ step, yearLevel: 1, activeSectionId: '10', configs: {}, setupDraft: { completed: true, preferredDays: ['Monday'] } }));
      }, stage);
      await context.route('**/__generator-help-check', (route) => route.fulfill({ contentType: 'text/html', body: preview }));
      await context.route('**/api/**', (route) => {
        const request = route.request();
        if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method())) {
          result.writeAttempts.push(request.method() + ' ' + new URL(request.url()).pathname);
          return route.abort('blockedbyclient');
        }
        const endpoint = new URL(request.url()).pathname.replace(/^\/api/, '');
        return route.fulfill({ json: responses[endpoint] ?? {}, headers: { 'access-control-allow-origin': '*' } });
      });
      const page = await context.newPage();
      page.on('pageerror', (error) => result.errors.push(error.message));
      try {
        await page.goto(app + '/__generator-help-check');
        const help = page.getByRole('button', { name: /^Help:/ });
        await help.waitFor({ timeout: 30000 });
        if (stage === 2) await page.getByRole('button', { name: 'Default Settings', exact: true }).waitFor();
        await page.waitForLoadState('networkidle');
        assert.equal(await help.getAttribute('aria-label'), 'Help: ' + ['Configuration', 'Setup Courses', 'Review & Generate', 'Schedule Summary'][stage - 1]);
        await help.click();
        assert.equal(await help.getAttribute('aria-expanded'), 'true');
        const popup = page.locator('[id="' + await help.getAttribute('aria-controls') + '"]');
        await popup.waitFor({ state: 'visible' });
        result.geometry = await popup.evaluate((element) => {
          const box = element.getBoundingClientRect();
          const clippedBy = [];
          for (let parent = element.parentElement; parent && parent !== document.body && parent !== document.documentElement; parent = parent.parentElement) {
            const style = getComputedStyle(parent);
            const bounds = parent.getBoundingClientRect();
            if ((/hidden|clip|auto|scroll/.test(style.overflowX) && (box.left < bounds.left - 1 || box.right > bounds.right + 1)) || (/hidden|clip|auto|scroll/.test(style.overflowY) && (box.top < bounds.top - 1 || box.bottom > bounds.bottom + 1))) clippedBy.push(parent.tagName);
          }
          const cornersVisible = [[box.left + 12, box.top + 12], [box.right - 12, box.top + 12], [box.left + 12, box.bottom - 12], [box.right - 12, box.bottom - 12]].every(([x, y]) => element.contains(document.elementFromPoint(x, y)));
          return { x: box.x, y: box.y, width: box.width, height: box.height, clippedBy, cornersVisible, fitsViewport: box.left >= 0 && box.top >= 0 && box.right <= innerWidth && box.bottom <= innerHeight, textFits: element.scrollWidth <= element.clientWidth };
        });
        assert(result.geometry.fitsViewport && result.geometry.textFits && result.geometry.cornersVisible && result.geometry.clippedBy.length === 0, 'Header help is clipped');
        await page.screenshot({ path: path.join(output, `stage-${stage}-${viewport.width}.png`) });
        await help.click();
        assert.equal(await help.getAttribute('aria-expanded'), 'false');
        assert.equal(await popup.count(), 0);
        assert.deepEqual(result.errors, []);
        assert.deepEqual(result.writeAttempts, []);
        result.passed = true;
      } catch (error) { result.failure = error.message; }
      finally { await context.close(); }
      results.push(result);
      console.log(JSON.stringify(result));
      await writeFile(path.join(output, 'results.json'), JSON.stringify({ fixture: 'Real generator and modal structure; browser-only API data, no credentials.', results }, null, 2));
      if (result.errors.length) throw new Error(result.errors.join('; '));
    }
  }
} finally { await browser.close(); }
if (results.some((result) => !result.passed)) process.exitCode = 1;
