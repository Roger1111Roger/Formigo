// like run2, but prints window.model and types, with checkbox mode "always check"
import { chromium } from 'playwright-core';
import http from 'node:http';
import { readFileSync } from 'node:fs';
import path from 'node:path';
const site = path.resolve('test/site');
const server = http.createServer((req, res) => { try { res.end(readFileSync(path.join(site, req.url.split('?')[0]))); } catch { res.statusCode = 404; res.end(); } }).listen(8772);
const ext = path.resolve('dist');
const ctx = await chromium.launchPersistentContext('', { executablePath: process.argv[2], headless: true, args: [`--disable-extensions-except=${ext}`, `--load-extension=${ext}`, '--headless=new'], viewport: { width: 1280, height: 900 } });
let [sw] = ctx.serviceWorkers(); if (!sw) sw = await ctx.waitForEvent('serviceworker');
await sw.evaluate(async () => { await chrome.storage.local.set({ settings: { checkboxMode: 'check' } }); });
const page = await ctx.newPage();
page.on('pageerror', (e) => console.log('pageerror', e.message));
const bc = (a) => sw.evaluate(async (x) => { const [t] = await chrome.tabs.query({ url: 'http://localhost:8772/*' }); return self.__ffp.broadcast(t.id, { action: x }); }, a);
for (const p of process.argv.slice(3)) {
  await page.goto('http://localhost:8772/' + p); await page.waitForTimeout(500);
  console.log('\n=== ' + p, 'заполнено:', await bc('fillAll')); await page.waitForTimeout(2500);
  console.log(JSON.stringify(await page.evaluate(() => window.model), null, 1));
  await bc('debug'); await page.waitForTimeout(200);
  console.log('types:', (await page.evaluate(() => [...document.querySelectorAll('[data-ffp-badge]')].map((b) => b.textContent))).join(', '));
}
await ctx.close(); server.close();
