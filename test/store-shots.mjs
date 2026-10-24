// Raw screenshots for the store listing: demo form, type badges, field rule, files, settings, popup
import { chromium } from 'playwright-core';
import http from 'node:http';
import { readFileSync } from 'node:fs';
import path from 'node:path';
const site = path.resolve('test/site');
const server = http.createServer((req, res) => { try { res.end(readFileSync(path.join(site, req.url.split('?')[0]))); } catch { res.statusCode = 404; res.end(); } }).listen(8790);
const ext = path.resolve('dist');
const out = 'test/store/raw';
const ctx = await chromium.launchPersistentContext('', { executablePath: process.argv[2], headless: true, args: [`--disable-extensions-except=${ext}`, `--load-extension=${ext}`, '--headless=new'], viewport: { width: 1180, height: 760 }, deviceScaleFactor: 2 });
let [sw] = ctx.serviceWorkers(); if (!sw) sw = await ctx.waitForEvent('serviceworker');
const id = sw.url().split('/')[2];
const set = (s) => sw.evaluate(async (x) => { const { settings = {} } = await chrome.storage.local.get('settings'); await chrome.storage.local.set({ settings: { ...settings, ...x } }); }, s);
const act = (a) => sw.evaluate(async (a) => { const [t] = await chrome.tabs.query({ url: 'http://localhost:8790/*' }); return self.__ffp.broadcast(t.id, { action: a }); }, a);
for (const lang of ['ru', 'en']) {
  await set({ uiLang: lang, locale: lang, theme: 'light', highlight: false, imageMode: 'simple', checkboxMode: 'check' });
  const page = await ctx.newPage();
  await page.goto(`http://localhost:8790/demo.html?lang=${lang}`); await page.waitForTimeout(500);
  await page.screenshot({ path: `${out}/${lang}-empty.png` });
  await act('fillAll'); await page.waitForTimeout(2500);
  await page.evaluate(() => scrollTo(0, 0));
  await page.screenshot({ path: `${out}/${lang}-filled.png` });
  await act('debug'); await page.waitForTimeout(300);
  await page.screenshot({ path: `${out}/${lang}-types.png` });
  await act('debug');
  await page.evaluate(() => document.querySelectorAll('.card')[2].scrollIntoView({ block: 'start' }));
  await page.evaluate(() => scrollBy(0, -20)); await page.waitForTimeout(200);
  await page.screenshot({ path: `${out}/${lang}-files.png` });
  await page.evaluate(() => scrollTo(0, 0)); await page.waitForTimeout(100);
  await act('pick'); await page.waitForTimeout(300);
  const b = await page.locator('#em').boundingBox();
  await page.mouse.move(b.x + 20, b.y + 10); await page.waitForTimeout(150);
  await page.mouse.click(b.x + 20, b.y + 10); await page.waitForTimeout(500);
  await page.screenshot({ path: `${out}/${lang}-pick.png` });
  await page.keyboard.press('Escape');
  await page.close();
  await set({ highlight: true, imageMode: 'smart', checkboxMode: 'random' });
  for (const th of ['light', 'dark']) {
    await set({ theme: th });
    const o = await ctx.newPage(); await o.setViewportSize({ width: 1180, height: 760 });
    await o.goto(`chrome-extension://${id}/options.html#settings`); await o.reload(); await o.waitForTimeout(600);
    await o.screenshot({ path: `${out}/${lang}-options-${th}.png` });
    await o.goto(`chrome-extension://${id}/options.html#rules`); await o.reload(); await o.waitForTimeout(500);
    await o.screenshot({ path: `${out}/${lang}-rules-${th}.png` });
    await o.close();
    const p = await ctx.newPage(); await p.setViewportSize({ width: 288, height: 300 });
    await p.goto(`chrome-extension://${id}/popup.html`); await p.waitForTimeout(400);
    const h = await p.evaluate(() => document.body.scrollHeight); await p.setViewportSize({ width: 288, height: h });
    await p.screenshot({ path: `${out}/${lang}-popup-${th}.png` }); await p.close();
  }
}
await ctx.close(); server.close();
