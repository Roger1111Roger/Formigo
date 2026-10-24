// Popup and settings in different UI languages (including RTL)
import { chromium } from 'playwright-core';
import path from 'node:path';
const ext = path.resolve('dist');
const ctx = await chromium.launchPersistentContext('', { executablePath: process.argv[2], headless: true, args: [`--disable-extensions-except=${ext}`, `--load-extension=${ext}`, '--headless=new'], viewport: { width: 1200, height: 800 } });
let [sw] = ctx.serviceWorkers(); if (!sw) sw = await ctx.waitForEvent('serviceworker');
const id = sw.url().split('/')[2];
for (const lang of process.argv.slice(3)) {
  await sw.evaluate(async (l) => { const { settings = {} } = await chrome.storage.local.get('settings'); await chrome.storage.local.set({ settings: { ...settings, uiLang: l, theme: 'light' } }); }, lang);
  const pop = await ctx.newPage(); await pop.setViewportSize({ width: 288, height: 300 });
  pop.on('pageerror', (e) => console.log('pageerror', e.message));
  await pop.goto(`chrome-extension://${id}/popup.html`); await pop.waitForTimeout(400);
  const h = await pop.evaluate(() => document.body.scrollHeight);
  await pop.setViewportSize({ width: 288, height: h });
  await pop.screenshot({ path: `test/popup-${lang}.png` }); await pop.close();
  const p = await ctx.newPage(); await p.goto(`chrome-extension://${id}/options.html#settings`); await p.waitForTimeout(500);
  await p.screenshot({ path: `test/opt-${lang}.png` });
  console.log(lang, 'высота попапа', h, '| заголовок:', await p.title());
  await p.close();
}
const menu = await sw.evaluate(() => new Promise((r) => chrome.contextMenus.update('pick', {}, () => r(chrome.runtime.lastError ? 'нет' : 'есть'))));
console.log('пункт меню pick:', menu);
await ctx.close();
