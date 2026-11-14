// Visual checks use the real components in an isolated, ignored fixture harness.
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

const output = path.dirname(fileURLToPath(import.meta.url));
const modulePath = process.env.PLAYWRIGHT_MODULE ?? 'playwright';
const { chromium } = await import(modulePath);
const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
const page = await browser.newPage({ viewport: { width: 558, height: 697 }, deviceScaleFactor: 1 });
const results = [];
const interactions = [];
const errors = [];
let passed = false;
page.on('pageerror', (error) => errors.push(error.message));
page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
const url = process.env.FRONTEND_URL ?? 'http://127.0.0.1:5173/scheduler-dialog-preview.local/';
const viewports = process.env.VIEWPORTS
  ? process.env.VIEWPORTS.split(',').map((size) => { const [width, height] = size.split('x').map(Number); return { width, height }; })
  : [{ width: 1440, height: 900 }, { width: 390, height: 844 }, { width: 320, height: 568 }, { width: 844, height: 390 }];

async function open(dialog, state = 'ready', extra = '') {
  await page.goto(`${url}?dialog=${dialog}&state=${state}${extra}`, { waitUntil: 'networkidle' });
  await page.locator('[role="dialog"], [role="alertdialog"]').last().waitFor();
  await page.evaluate(() => document.fonts.ready);
}

async function capture(name) {
  await page.screenshot({ path: path.join(output, `${name}.png`) });
}

try {
  for (const dialog of process.env.ONLY_INTERACTIONS ? [] : ['source', 'submit']) {
    await open(dialog);
    await capture(`${dialog}-558`);
  }
  const dialogs = (process.env.DIALOGS ?? 'submit,done,finalize,reassign,reset,recall,faculty,instructor,room,alternatives,conflicts,bulk,generator,configure,confirm,placement').split(',');
  for (const viewport of process.env.ONLY_INTERACTIONS ? [] : viewports) {
    await page.setViewportSize(viewport);
    for (const dialog of dialogs) {
      await open(dialog);
      const geometry = await page.evaluate(() => {
        const dialog = Array.from(document.querySelectorAll('[role="dialog"], [role="alertdialog"]')).at(-1);
        const rect = dialog.getBoundingClientRect();
        const frame = dialog.classList.contains('scheduler-dialog') ? dialog : dialog.querySelector('.scheduler-dialog');
        const controls = Array.from(dialog.querySelectorAll('button')).filter((button) => !button.disabled && button.getClientRects().length);
        return {
          x: rect.x, y: rect.y, width: rect.width, height: rect.height,
          frame: Boolean(frame), pageOverflow: document.documentElement.scrollWidth > innerWidth,
          inViewport: rect.left >= -1 && rect.top >= -1 && rect.right <= innerWidth + 1 && rect.bottom <= innerHeight + 1,
          closeVisible: controls.filter((button) => /Close/.test(button.getAttribute('aria-label') ?? '')).every((button) => {
            const box = button.getBoundingClientRect(); return box.top >= 0 && box.right <= innerWidth && box.bottom <= innerHeight;
          }),
        };
      });
      results.push({ dialog, viewport, ...geometry });
      await capture(`${dialog}-${viewport.width}`);
      assert(geometry.frame, `${dialog}: missing workflow frame`);
      assert(!geometry.pageOverflow, `${dialog}: horizontal viewport overflow at ${viewport.width}`);
      assert(geometry.inViewport, `${dialog}: frame outside viewport at ${viewport.width}`);
      assert(geometry.closeVisible, `${dialog}: close button outside viewport at ${viewport.width}`);
      if (viewport.height < 480) {
        const action = page.locator('.scheduler-dialog-footer button:not(:disabled), .assign-modal-footer button:not(:disabled)').last();
        if (await action.count()) {
          await action.scrollIntoViewIfNeeded();
          const box = await action.boundingBox();
          assert(box.y >= 0 && box.y + box.height <= viewport.height + 1, `${dialog}: short-screen action unreachable`);
        }
        if (dialog === 'generator') {
          const select = page.locator('main select').first();
          await select.scrollIntoViewIfNeeded();
          const box = await select.boundingBox();
          const header = await page.locator('.scheduler-dialog-header').boundingBox();
          const footer = await page.locator('.scheduler-dialog-footer').boundingBox();
          await capture('generator-short-field-visible');
          assert(box.y >= header.y + header.height - 1 && box.y + box.height <= footer.y + 1, `Generator field clipped by short-screen chrome: ${JSON.stringify({ box, header, footer })}`);
        }
      }
    }
    console.log(`Verified ${dialogs.length} dialogs at ${viewport.width}x${viewport.height}`);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  for (const state of ['mixed', 'blocked', 'busy']) {
    await open('submit', state);
    await capture(`submit-${state}-390`);
    const submit = page.getByRole('button', { name: state === 'busy' ? /Submitting/ : 'Submit to Dean', exact: state !== 'busy' });
    assert.equal(await submit.isDisabled(), state !== 'mixed');
    if (state === 'busy') {
      await page.keyboard.press('Escape');
      assert.equal(await page.getByRole('alertdialog').count(), 1);
    }
    interactions.push(`Submit ${state}: protected labels, readiness and busy guard`);
  }

  await open('submit');
  await page.getByText('BSIT 3F', { exact: true }).scrollIntoViewIfNeeded();
  assert(await page.getByText('BSIT 3F', { exact: true }).isVisible());
  const footerPosition = await page.getByRole('button', { name: 'Submit to Dean', exact: true }).boundingBox();
  assert(footerPosition.y + footerPosition.height <= 844);
  interactions.push('Long section list scrolls while submit action remains visible');

  for (const dialog of ['done', 'finalize', 'reassign', 'reset']) {
    await open(dialog);
    const selected = page.locator('button[aria-pressed="true"]');
    assert.equal(await selected.count(), 0);
    assert(await page.locator('footer .scheduler-dialog-button').last().isDisabled());
    await capture(`${dialog}-manual-selection-390`);
    await page.getByRole('checkbox').check();
    await page.getByRole('checkbox').uncheck();
    assert(await page.locator('footer .scheduler-dialog-button').last().isDisabled());
    await page.locator('button[aria-pressed="false"]:not(:disabled)').first().click();
    await page.locator('footer .scheduler-dialog-button').last().click();
    assert((await page.locator('#preview-result').textContent()).includes(`Preview ${dialog}: 1`));
    interactions.push(`${dialog}: starts unchecked, manual selection, empty selection guard, callback`);
  }

  await open('recall', 'ready', '&stage=vpaa_approved');
  assert.equal(await page.locator('button[aria-pressed="true"]').count(), 0);
  assert(await page.getByRole('button', { name: 'Recall Selected', exact: true }).isDisabled());
  await capture('recall-manual-selection-390');
  await page.locator('button[aria-pressed="false"]').first().click();
  assert(await page.getByText('1 instructor assignment in the selected sections will be released.', { exact: false }).isVisible());
  assert(await page.getByRole('button', { name: 'Keep VPAA Approval' }).isVisible());
  await page.getByRole('checkbox').check();
  assert.equal(await page.locator('button[aria-pressed="true"]').count(), 7);
  await page.getByRole('button', { name: 'Recall Selected', exact: true }).click();
  assert((await page.locator('#preview-result').textContent()).includes('1, 2, 3, 4, 5, 6, 7'));
  interactions.push('Recall: stage warning, released instructor count, eligible sections only');

  await page.setViewportSize({ width: 1440, height: 900 });
  await open('generator');
  const selectedMode = page.getByRole('radio', { name: 'Selected sections', exact: true });
  await selectedMode.click();
  const generatorSections = page.getByRole('checkbox', { name: /BSIT/ });
  assert.equal(await generatorSections.count(), 6);
  assert(await generatorSections.evaluateAll((inputs) => inputs.every((input) => !input.checked)));
  await capture('generator-manual-selection-1440');
  await generatorSections.first().check();
  await selectedMode.click();
  assert(await generatorSections.first().isChecked());
  await page.getByRole('radio', { name: 'Whole year level', exact: true }).click();
  await selectedMode.click();
  assert(await generatorSections.evaluateAll((inputs) => inputs.every((input) => !input.checked)));
  interactions.push('Generator section scope: starts unchecked, preserves explicit picks, All-to-Selected resets');

  await open('configure');
  const scope = page.getByRole('radio', { name: 'Selected sections only', exact: true });
  await scope.check();
  const courseSections = page.getByRole('checkbox', { name: /BSIT/ });
  assert.equal(await courseSections.count(), 6);
  assert(await courseSections.evaluateAll((inputs) => inputs.every((input) => !input.checked)));
  await capture('configure-manual-selection-1440');
  await page.getByRole('button', { name: 'All', exact: true }).click();
  assert(await courseSections.evaluateAll((inputs) => inputs.every((input) => input.checked)));
  await page.getByRole('radio', { name: 'All sections (6)', exact: true }).check();
  await scope.check();
  assert(await courseSections.evaluateAll((inputs) => inputs.every((input) => !input.checked)));
  interactions.push('Course section scope: starts unchecked, manual All, All-to-Selected resets');

  await page.setViewportSize({ width: 390, height: 844 });

  await open('faculty');
  await page.locator('button[aria-haspopup="dialog"]').click();
  assert.equal(await page.getByRole('dialog').count(), 2);
  await page.keyboard.press('Escape');
  assert.equal(await page.getByRole('dialog').count(), 1);
  assert(await page.getByRole('heading', { name: 'Assign Instructor', exact: true }).isVisible());
  interactions.push('Nested instructor picker Escape preserves faculty dialog');

  for (const dialog of ['done', 'reset', 'recall', 'faculty', 'bulk', 'confirm']) {
    await open(dialog, 'busy');
    await page.keyboard.press('Escape');
    assert.equal(await page.getByRole('dialog').count(), 1, `${dialog}: busy Escape dismissed dialog`);
    const close = page.locator('button[aria-label^="Close"]').first();
    assert(await close.isDisabled(), `${dialog}: busy close remained active`);
    interactions.push(`${dialog}: busy dismissal blocked`);
  }
  await page.goto(`${url}?dialog=submit&open=0`, { waitUntil: 'networkidle' });
  const opener = page.locator('#preview-open');
  await opener.focus();
  await opener.click();
  await page.getByRole('button', { name: 'Review Again', exact: true }).waitFor();
  assert.equal(await page.getByRole('button', { name: 'Review Again', exact: true }).evaluate((button) => button === document.activeElement), true);
  await page.keyboard.press('Tab');
  await page.keyboard.press('Tab');
  assert.equal(await page.getByRole('button', { name: 'Close submission review' }).evaluate((button) => button === document.activeElement), true);
  await page.keyboard.press('Escape');
  assert.equal(await page.getByRole('alertdialog').count(), 0);
  assert.equal(await opener.evaluate((button) => button === document.activeElement), true);
  interactions.push('Submission dialog autofocus, Tab loop, Escape and opener restoration');
  assert.equal(errors.length, 0, errors.join('\n'));
  passed = true;
} finally {
  await fs.writeFile(path.join(output, process.env.OUTPUT_NAME ?? 'verification.json'), JSON.stringify({ status: passed ? 'passed' : 'failed', results, interactions, errors }, null, 2));
  await browser.close();
}
assert.equal(errors.length, 0, errors.join('\n'));
console.log(JSON.stringify({ checks: results.length, errors }));
