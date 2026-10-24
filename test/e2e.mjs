// End-to-end checks of the extension on a single test page, test/site/bench.html.
// Run: node build.mjs && node test/e2e.mjs [path to chromium]
// Without a path, uses $CHROMIUM or Playwright's Chromium (npx playwright-core install chromium).
// Each check prints ✓ or ✗; on failures the exit code is 1.
import { chromium } from 'playwright-core';
import http from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';

const exe = process.argv[2] || process.env.CHROMIUM
  || [chromium.executablePath(), '/opt/pw-browsers/chromium'].find(p => existsSync(p));
const site = path.resolve('test/site');
const PORT = 8790;
const server = http.createServer((req, res) => {
  try { res.setHeader('content-type', req.url.endsWith('.html') ? 'text/html; charset=utf-8' : 'text/plain'); res.end(readFileSync(path.join(site, req.url.split('?')[0]))); } catch { res.statusCode = 404; res.end(); }
}).listen(PORT);
const BENCH = `http://localhost:${PORT}/bench.html`;
const ext = path.resolve('dist');

const ctx = await chromium.launchPersistentContext('', {
  executablePath: exe, headless: true, viewport: { width: 1280, height: 900 },
  args: [`--disable-extensions-except=${ext}`, `--load-extension=${ext}`, '--headless=new'],
});
let [sw] = ctx.serviceWorkers();
if (!sw) sw = await ctx.waitForEvent('serviceworker');
const extId = new URL(sw.url()).host;

const results = [];
async function check(name, fn) {
  try { await fn(); results.push([true, name]); console.log('✓', name); } catch (e) { results.push([false, name]); console.log('✗', name, '\n   ', e.message); }
}
function expect(cond, msg) { if (!cond) throw new Error(msg); }

async function setSettings(patch) {
  await sw.evaluate(async (p) => { await chrome.storage.local.set({ settings: p }); }, patch);
}
async function patchSettings(patch) {
  await sw.evaluate(async (p) => { const { settings = {} } = await chrome.storage.local.get('settings'); await chrome.storage.local.set({ settings: { ...settings, ...p } }); }, patch);
}
const getSettings = () => sw.evaluate(async () => (await chrome.storage.local.get('settings')).settings);
async function act(action) {
  return sw.evaluate(async (a) => { const [t] = await chrome.tabs.query({ url: 'http://localhost:*/*' }); return self.__ffp.broadcast(t.id, { action: a }); }, action);
}

const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
async function fresh(settings = {}) {
  await setSettings({ uiLang: 'en', locale: 'en', settingsVersion: 3, ...settings });
  await page.goto(BENCH);
  await page.waitForTimeout(500);
}
const val = (sel) => page.inputValue(sel);
const filled = async (sels) => {
  const out = {};
  for (const s of sels) out[s] = await val(s);
  return out;
};
const PAGE_FIELDS = ['#f-user', '#r-first', '#r-email', '#r-city'];
const DLG_FIELDS = ['#d-user', '#d-first', '#d-email'];

// --- filling ---
await check('“Fill everything” fills the page and the form', async () => {
  await fresh();
  await act('fillAll');
  await page.waitForTimeout(800);
  const v = await filled([...PAGE_FIELDS, '#r-phone', '#r-dob']);
  for (const [s, x] of Object.entries(v)) expect(x, `${s} is empty`);
  expect(/@/.test(v['#r-email']), 'e-mail without @: ' + v['#r-email']);
  expect(await page.isChecked('#r-agree'), 'consent checkbox not ticked');
  expect(await page.$eval('#r-country', (s) => s.value !== ''), 'country not selected');
});

await check('“Fill everything” with a popover dialog open fills both the page and the dialog', async () => {
  await fresh();
  await page.evaluate(() => window.openPopover());
  await act('fillAll');
  await page.waitForTimeout(800);
  const v = await filled([...PAGE_FIELDS, ...DLG_FIELDS]);
  for (const [s, x] of Object.entries(v)) expect(x, `${s} is empty`);
});

await check('“Current form” with a dialog open fills only the dialog', async () => {
  await fresh();
  await page.evaluate(() => window.openPopover());
  await act('fillForm');
  await page.waitForTimeout(800);
  const d = await filled(DLG_FIELDS);
  for (const [s, x] of Object.entries(d)) expect(x, `${s} in the dialog is empty`);
  const p = await filled(PAGE_FIELDS);
  for (const [s, x] of Object.entries(p)) expect(!x, `${s} on the page was filled: ${x}`);
});

await check('“Current form” with focus in a form fills only that form', async () => {
  await fresh();
  await page.focus('#r-first');
  await act('fillForm');
  await page.waitForTimeout(800);
  expect(await val('#r-last'), 'form field is empty');
  expect(!(await val('#f-user')), 'filter outside the form was filled');
});

await check('“Current field” fills only the focused field', async () => {
  await fresh();
  await page.focus('#r-city');
  await act('fillField');
  await page.waitForTimeout(500);
  expect(await val('#r-city'), 'field is empty');
  expect(!(await val('#r-first')), 'neighbouring field was filled');
});

await check('Tile list: all items selected for “select all”', async () => {
  await fresh({ checkboxMode: 'check' });
  await act('fillAll');
  await page.waitForTimeout(800);
  const n = await page.$$eval('#langs .selected', (l) => l.length);
  expect(n === 3, `${n} of 3 selected`);
});

await check('Custom CSS rule inserts its value', async () => {
  await fresh({ rules: [{ enabled: true, note: 'emp', match: 'css', pattern: '[data-testid="employee-id"]', valueType: 'fixed', value: 'EMP-777' }] });
  await act('fillAll');
  await page.waitForTimeout(800);
  expect((await val('#r-emp')) === 'EMP-777', 'value: ' + (await val('#r-emp')));
});

// --- default hotkeys ---
await check('Alt+Z fills everything', async () => {
  await fresh();
  await page.click('h1');
  await page.keyboard.press('Alt+KeyZ');
  await page.waitForTimeout(900);
  expect(await val('#r-first') && await val('#f-user'), 'fields are empty');
});

await check('Alt+C fills the current field', async () => {
  await fresh();
  await page.focus('#r-last');
  await page.keyboard.press('Alt+KeyC');
  await page.waitForTimeout(600);
  expect(await val('#r-last'), 'field is empty');
  expect(!(await val('#r-first')), 'neighbouring field was filled');
});

await check('Alt+X fills the current form', async () => {
  await fresh();
  await page.focus('#r-first');
  await page.keyboard.press('Alt+KeyX');
  await page.waitForTimeout(900);
  expect(await val('#r-city'), 'form not filled');
  expect(!(await val('#f-user')), 'filter outside the form was filled');
});

await check('Alt+A shows field types, Alt+V opens the field rule picker', async () => {
  await fresh();
  await page.click('h1');
  await page.keyboard.press('Alt+KeyA');
  await page.waitForTimeout(500);
  expect(await page.$$eval('[data-ffp-badge] div', (l) => l.length) > 5, 'no labels');
  await page.keyboard.press('Alt+KeyA');
  await page.waitForTimeout(300);
  await page.keyboard.press('Alt+KeyV');
  await page.waitForTimeout(400);
  expect(await page.locator('formigo-picker').count() === 1, 'picker mode did not open');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
});

await check('Old default shortcuts migrate to Alt+Z/X/C/V/A, custom ones are kept', async () => {
  await setSettings({ settingsVersion: 2, hotkeys: { fillAll: 'Alt+Shift+F', fillForm: 'Ctrl+Shift+1', fillField: 'Alt+Shift+H', debug: 'Alt+Shift+D', pick: 'Alt+Shift+L' } });
  const hk = await sw.evaluate(async () => { const { normalizeSettings } = self.__ffp; const { settings } = await chrome.storage.local.get('settings'); return normalizeSettings(settings).hotkeys; });
  expect(hk.fillAll === 'Alt+Z' && hk.fillField === 'Alt+C' && hk.debug === 'Alt+A' && hk.pick === 'Alt+V', JSON.stringify(hk));
  expect(hk.fillForm === 'Ctrl+Shift+1', 'custom shortcut lost: ' + hk.fillForm);
});

// --- "Show field types" ---
await check('Field types are shown on every field, including in a popover dialog', async () => {
  await fresh();
  await page.evaluate(() => window.openPopover());
  await act('debug');
  await page.waitForTimeout(500);
  const info = await page.evaluate(() => {
    const layer = document.querySelector('[data-ffp-badge]');
    const badges = [...layer.children];
    // a badge over a dialog field must be the topmost element at its point
    const top = badges.filter((b) => { const r = b.getBoundingClientRect(); const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return hit === b; }).length;
    return { n: badges.length, open: layer.matches(':popover-open'), top };
  });
  expect(info.open, 'label layer is not in the top layer');
  expect(info.n >= 15, 'labels: ' + info.n);
  expect(info.top >= 4, 'labels visible above the dialog: ' + info.top);
});

// --- field rule and "what to insert" suggestions ---
await check('Field rule in a dialog: panel above the dialog and word-based suggestions', async () => {
  await fresh();
  await page.evaluate(() => window.openPopover());
  await act('pick');
  await page.waitForTimeout(300);
  const box = await page.locator('#d-first').boundingBox();
  await page.mouse.click(box.x + 10, box.y + box.height / 2);
  await page.waitForTimeout(500);
  const r = await page.evaluate(async () => {
    const host = document.querySelector('formigo-picker');
    const sr = host.shadowRoot;
    const ta = [...sr.querySelectorAll('textarea')].pop();
    ta.focus();
    ta.value = 'город';
    ta.dispatchEvent(new Event('input', { bubbles: true }));
    await new Promise((res) => setTimeout(res, 50));
    const items = [...sr.querySelectorAll('.sg-it')].map((b) => b.textContent);
    return { open: host.matches(':popover-open'), items };
  });
  expect(r.open, 'panel is not in the top layer');
  expect(r.items.some((x) => /location\.city/.test(x)), 'no location.city: ' + r.items.slice(0, 3).join(' | '));
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
});

const opt = await ctx.newPage();
opt.on('pageerror', (e) => errors.push('options: ' + e.message));
await check('Settings: “What to insert” suggestions in custom rules', async () => {
  await setSettings({ uiLang: 'ru', settingsVersion: 3, rules: [{ enabled: true, note: '', match: 'regex', pattern: 'id', valueType: 'fixed', value: '' }] });
  await opt.goto(`chrome-extension://${extId}/options.html#rules`);
  await opt.waitForTimeout(600);
  const ta = opt.locator('#rules textarea').first();
  await ta.click();
  await ta.fill('6 цифр');
  await opt.waitForTimeout(100);
  const items = await opt.$$eval('#rules .sg-it', (l) => l.map((b) => b.textContent));
  expect(items.some((x) => /\[1-9\]\[0-9\]\{5\}/.test(x)), 'no 6-digit RegExp: ' + items.join(' | '));
  await opt.locator('#rules .sg-it').first().dispatchEvent('mousedown');
  await opt.waitForTimeout(900);
  const s = await getSettings();
  expect(s.rules[0].valueType === 'regex' && s.rules[0].value === '[1-9][0-9]{5}', 'rule: ' + JSON.stringify(s.rules[0]));
  await ta.fill('от 5 до 10');
  await opt.waitForTimeout(100);
  const r2 = await opt.$$eval('#rules .sg-it', (l) => l.map((b) => b.textContent));
  expect(r2.some((x) => /number\.int/.test(x)), 'no range: ' + r2.join(' | '));
});

await check('About: store link and hotkeys update immediately', async () => {
  await setSettings({ uiLang: 'ru', settingsVersion: 3 });
  await opt.goto(`chrome-extension://${extId}/options.html#settings`);
  await opt.waitForTimeout(600);
  const link = await opt.getAttribute('#storeLink', 'href');
  expect(/chromewebstore\.google\.com\/detail\/.*nihgcabaembfhcogajfjjgbnhmbbgpkc/.test(link), 'link: ' + link);
  const keysBefore = await opt.textContent('#aboutKeys');
  expect(keysBefore.includes('Alt+Z'), 'Alt+Z missing from defaults: ' + keysBefore);
  const inp = opt.locator('#hotkeys input').first();
  await inp.click();
  await opt.keyboard.press('Control+Shift+KeyY');
  await opt.waitForTimeout(200);
  const keysAfter = await opt.textContent('#aboutKeys');
  expect(keysAfter.includes('Ctrl+Shift+Y'), 'not updated: ' + keysAfter);
});

expect.toString();
if (errors.length) { results.push([false, 'JS errors']); console.log('✗ JS errors on pages:\n   ' + errors.join('\n   ')); }
const bad = results.filter(([ok]) => !ok).length;
console.log(`\n${results.length - bad} of ${results.length} checks passed`);
await ctx.close();
server.close();
process.exit(bad ? 1 : 0);
