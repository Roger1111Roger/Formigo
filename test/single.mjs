import { chromium } from 'playwright-core';
import http from 'node:http';
import { readFileSync } from 'node:fs';
import path from 'node:path';
const site = path.resolve('test/site');
const server = http.createServer((req, res) => { try { res.end(readFileSync(path.join(site, req.url.split('?')[0]))); } catch { res.statusCode = 404; res.end(); } }).listen(8769);
const ext = path.resolve('dist');
const ctx = await chromium.launchPersistentContext('', { executablePath: process.argv[2], headless: true, args: [`--disable-extensions-except=${ext}`, `--load-extension=${ext}`, '--headless=new'] });
let [sw] = ctx.serviceWorkers(); if (!sw) sw = await ctx.waitForEvent('serviceworker');
const page = await ctx.newPage();
const call = (msg) => sw.evaluate(async (m) => { const [t] = await chrome.tabs.query({ url: 'http://localhost:8769/*' }); return m.action === 'fillAll' ? self.__ffp.broadcast(t.id, m) : self.__ffp.send(t.id, m, 0); }, msg);
const model = () => page.evaluate(() => JSON.stringify(window.model));
await page.goto('http://localhost:8769/watu-client.html'); await page.waitForTimeout(600);

// 1. "Current field": focus the phone, then click the "Gender" list (as from the popup: frame with the last focus)
const popup = (a) => sw.evaluate(async (act) => { const [t] = await chrome.tabs.query({ url: 'http://localhost:8769/*' }); return self.__ffp.sendFocused(t.id, act); }, a);
await page.focus('[name="mainData.primPhoneNumber"]');
console.log('текущее поле (телефон):', await popup('fillField'), await model());
await page.click('#mainData\\.genderId .select-input'); await page.waitForTimeout(300);
await page.click('#mainData\\.genderId .select-input'); await page.waitForTimeout(200);
console.log('текущее поле (пол):', await popup('fillField'), await model());
// a synthetic keydown without code/key must not crash the handler
await page.evaluate(() => { const e = new Event('keydown', { bubbles: true }); document.dispatchEvent(e); });
// Alt+Shift+H hotkey in a field
await page.focus('[name="mainData.idNumber"], input[name*="ocument"]').catch(() => {});
// 2. Right-click the dropzone + "Fill only this field"
await page.click('#clientPhotoDocFiles .form-upload', { button: 'right' });
await call({ action: 'fillField', fromMenu: true }); await page.waitForTimeout(500);
console.log('после фото через контекстное меню:', await model());
// 3. "Fill all" twice: the photo must not be replaced
await call({ action: 'fillAll' }); await page.waitForTimeout(2500);
const m1 = JSON.parse(await model());
await call({ action: 'fillAll' }); await page.waitForTimeout(2500);
const m2 = JSON.parse(await model());
console.log('file0 после 1-го:', m1.file0, '| после 2-го:', m2.file0);
console.log('file1 после 1-го:', m1.file1, '| после 2-го:', m2.file1);
// 4. iframe: focus in a frame field, "Current field" fills it, not the main page
await page.goto('http://localhost:8769/index.html'); await page.waitForTimeout(600);
const fr = page.frameLocator('#fr');
await fr.locator('[name=company]').focus();
console.log('iframe:', await popup('fillField'), await page.frame({ url: /frame.html/ }).evaluate(() => document.querySelector('[name=company]').value), '| главная lastName:', await page.evaluate(() => document.querySelector('input').value));
// 5. Refill disabled: a filled field stays unchanged
await sw.evaluate(async () => { const { settings = {} } = await chrome.storage.local.get('settings'); settings.refillFilled = false; await chrome.storage.local.set({ settings }); });
await page.evaluate(() => { document.querySelector('input').value = 'KEEP'; });
await call({ action: 'fillAll' }); await page.waitForTimeout(2500);
console.log('refill=off, первое поле:', await page.evaluate(() => document.querySelector('input').value));
await sw.evaluate(async () => { const { settings = {} } = await chrome.storage.local.get('settings'); settings.refillFilled = true; settings.typeValues = { lastName: 'Иванов\nПетров' }; settings.typePatterns = { imei: 'imei|имей' }; await chrome.storage.local.set({ settings }); });
await call({ action: 'fillAll' }); await page.waitForTimeout(2500);
console.log('refill=on + своё значение lastName:', await page.evaluate(() => document.querySelector('input').value));
await ctx.close(); server.close();
