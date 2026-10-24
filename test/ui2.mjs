// Screenshots of the new settings and popup in light and dark themes, in two languages
import { chromium } from 'playwright-core';
import path from 'node:path';
const ext = path.resolve('dist');
const ctx = await chromium.launchPersistentContext('', { executablePath: process.argv[2], headless: true, args: [`--disable-extensions-except=${ext}`, `--load-extension=${ext}`, '--headless=new'], viewport: { width: 1200, height: 860 } });
let [sw] = ctx.serviceWorkers(); if (!sw) sw = await ctx.waitForEvent('serviceworker');
const id = sw.url().split('/')[2];
const page = await ctx.newPage();
page.on('pageerror', (e) => console.log('pageerror', e.message));
page.on('console', (m) => { if (m.type() === 'error') console.log('console', m.text()); });
const set = (s) => sw.evaluate(async (x) => { const { settings = {} } = await chrome.storage.local.get('settings'); await chrome.storage.local.set({ settings: { ...settings, ...x } }); }, s);
for (const [theme, lang] of [['light', 'ru'], ['dark', 'en']]) {
  await set({ theme, uiLang: lang });
  for (const tab of ['settings', 'data', 'rules', 'share', 'about']) {
    await page.goto(`chrome-extension://${id}/options.html#${tab}`); await page.reload(); await page.waitForTimeout(500);
    await page.screenshot({ path: `test/ui-${theme}-${tab}.png` });
  }
  const pop = await ctx.newPage(); await pop.setViewportSize({ width: 310, height: 380 });
  await pop.goto(`chrome-extension://${id}/popup.html`); await pop.waitForTimeout(400);
  await pop.screenshot({ path: `test/ui-${theme}-popup.png` }); await pop.close();
}
// autosave: toggle a checkbox and change the UI language
await page.goto(`chrome-extension://${id}/options.html#settings`); await page.waitForTimeout(400);
await page.click('#highlight'); await page.selectOption('#uiLang', 'ru'); await page.waitForTimeout(700);
console.log('сохранено:', JSON.stringify(await sw.evaluate(async () => { const { settings } = await chrome.storage.local.get('settings'); return { highlight: settings.highlight, uiLang: settings.uiLang, theme: settings.theme }; })));
console.log('заголовок вкладки:', await page.textContent('nav a.active'));
await set({ theme: 'dark' }); await page.waitForTimeout(300);
console.log('живое обновление темы:', await page.evaluate(() => document.documentElement.dataset.theme));
console.log('меню:', JSON.stringify(await sw.evaluate(() => new Promise((r) => setTimeout(r, 300)).then(() => 'ok'))));
await ctx.close();
