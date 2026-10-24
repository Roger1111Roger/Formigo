import { chromium } from 'playwright-core';
import http from 'node:http';
import { readFileSync } from 'node:fs';
import path from 'node:path';
const site = path.resolve('test/site');
const server = http.createServer((req, res) => { try { res.end(readFileSync(path.join(site, req.url.split('?')[0]))); } catch { res.statusCode = 404; res.end(); } }).listen(8771);
const ext = path.resolve('dist');
const ctx = await chromium.launchPersistentContext('', { executablePath: process.argv[2], headless: true, args: [`--disable-extensions-except=${ext}`, `--load-extension=${ext}`, '--headless=new'] });
let [sw] = ctx.serviceWorkers(); if (!sw) sw = await ctx.waitForEvent('serviceworker');
const page = await ctx.newPage();
page.on('pageerror', (e) => console.log('pageerror', e.message));
const bc = (action) => sw.evaluate(async (a) => { const [t] = await chrome.tabs.query({ url: 'http://localhost:8771/*' }); return self.__ffp.broadcast(t.id, { action: a }); }, action);
const focused = (action) => sw.evaluate(async (a) => { const [t] = await chrome.tabs.query({ url: 'http://localhost:8771/*' }); return self.__ffp.sendFocused(t.id, a); }, action);
await sw.evaluate(async () => { await chrome.storage.local.set({ settings: { checkboxMode: 'check' } }); });
// 1. checkboxes with a hidden input
await page.goto('http://localhost:8771/watu-tech.html'); await page.waitForTimeout(500);
await bc('fillAll'); await page.waitForTimeout(2500);
console.log('чекбоксы:', JSON.stringify(await page.evaluate(() => ({ model: window.model, tech: document.getElementById('ng').checked, admin: document.querySelector('[name=isAdmin]').checked }))));
// 2. "Current form" when focus is on the modal window itself (as ngb does)
await page.goto('http://localhost:8771/watu-insurance.html'); await page.waitForTimeout(500);
await page.evaluate(() => document.querySelector('ngb-modal-window').focus());
await focused('fillForm'); await page.waitForTimeout(2500);
console.log('страховая, текущая форма:', JSON.stringify(await page.evaluate(() => [...document.querySelectorAll('input')].map((i) => (i.name || i.dataset.test) + '=' + i.value))));
// 3. type badges disappear when the page changes
await bc('debug'); await page.waitForTimeout(300);
const n1 = await page.locator('[data-ffp-badge]').count();
await page.evaluate(() => document.body.append(document.createElement('div')));
await page.waitForTimeout(200);
console.log('подписи до/после изменения DOM:', n1, await page.locator('[data-ffp-badge]').count());
await bc('debug'); await page.waitForTimeout(300);
const n2 = await page.locator('[data-ffp-badge]').count();
await page.waitForTimeout(10500);
console.log('подписи до/через 10 с:', n2, await page.locator('[data-ffp-badge]').count());
await ctx.close(); server.close();
