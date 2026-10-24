import { chromium } from 'playwright-core';
import http from 'node:http';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const site = path.resolve('test/site');
const server = http.createServer((req, res) => {
  try { res.end(readFileSync(path.join(site, req.url === '/' ? 'index.html' : req.url))); } catch { res.statusCode = 404; res.end(); }
}).listen(8765);

const ext = path.resolve('dist');
const ctx = await chromium.launchPersistentContext('', {
  executablePath: process.argv[2], headless: true,
  args: [`--disable-extensions-except=${ext}`, `--load-extension=${ext}`, '--headless=new'],
});
let [sw] = ctx.serviceWorkers();
if (!sw) sw = await ctx.waitForEvent('serviceworker');
const page = await ctx.newPage();
page.on('console', (m) => { if (m.type() !== 'log') console.log('console:', m.text()); });
await page.goto('http://localhost:8765/');
await page.waitForTimeout(1000);

// Rule: CSS #promo -> fixed value (checks custom rules)
await sw.evaluate(async () => {
  const s = (await chrome.storage.local.get('settings')).settings || {};
  s.rules = [{ enabled: true, match: 'css', pattern: '#promo', valueType: 'fixed', value: 'TEST2026' },
             { enabled: true, match: 'regex', pattern: 'nick|ник', valueType: 'template', value: 'qa_{{string.numeric(3)}}' }];
  await chrome.storage.local.set({ settings: s });
});
const count = await sw.evaluate(async () => {
  const [tab] = await chrome.tabs.query({ url: 'http://localhost:8765/*' });
  return self.__ffp.broadcast(tab.id, { action: 'fillAll' });
});
console.log('filled:', count);
await page.waitForTimeout(500);

const values = await page.evaluate(() => {
  const out = {};
  document.querySelectorAll('input,select,textarea').forEach((el, i) => {
    const k = el.name || el.id || el.getAttribute('placeholder') || el.className || 'f' + i;
    out[k + (el.type === 'radio' ? ':' + el.value : '')] = el.type === 'checkbox' || el.type === 'radio' ? el.checked : el.value;
  });
  out.contenteditable = document.getElementById('ce').textContent.slice(0, 40);
  const sr = document.querySelector('x-field').shadowRoot;
  out.shadowLast = sr.querySelector('[name=shadowLast]').value;
  out.shadowMail = sr.querySelector('[name=shadowMail]').value;
  out.reactState = document.getElementById('react-state').textContent;
  return out;
});
const fr = page.frames().find((f) => f.url().includes('frame.html'));
values.iframe = await fr.evaluate(() => [...document.querySelectorAll('input')].map((i) => i.name + '=' + i.value).join('; '));
console.log(JSON.stringify(values, null, 1));
await page.screenshot({ path: 'test/after-fill.png', fullPage: true });

// Debug type badges
await sw.evaluate(async () => { const [t] = await chrome.tabs.query({ url: 'http://localhost:8765/*' }); return self.__ffp.broadcast(t.id, { action: 'debug' }); });
await page.screenshot({ path: 'test/debug.png', fullPage: true });

// Fill a single field (by focus)
await page.goto('http://localhost:8765/'); await page.waitForTimeout(500);
await page.focus('[name=city]');
await sw.evaluate(async () => { const [t] = await chrome.tabs.query({ url: 'http://localhost:8765/*' }); return self.__ffp.broadcast(t.id, { action: 'fillField', onlyFocused: true }); });
console.log('single field:', await page.evaluate(() => [...document.querySelectorAll('#main input')].filter((i) => i.value && i.type !== 'hidden').map((i) => i.name + '=' + i.value)));
// Fill the current form (EN)
await page.focus('#en [name=a]');
await sw.evaluate(async () => { const [t] = await chrome.tabs.query({ url: 'http://localhost:8765/*' }); return self.__ffp.send(t.id, { action: 'fillForm' }, 0); });
console.log('form EN filled:', await page.evaluate(() => [...document.querySelectorAll('#en input')].filter((i) => i.value).length), 'main filled:', await page.evaluate(() => [...document.querySelectorAll('#main input:not([type=hidden])')].filter((i) => i.value && i.type!=='radio' && i.type!=='checkbox').length));

// Settings page: export
const opt = await ctx.newPage();
const id = sw.url().split('/')[2];
await opt.goto(`chrome-extension://${id}/options.html`);
await opt.waitForTimeout(500);
await opt.screenshot({ path: 'test/options.png', fullPage: true });
const [dl] = await Promise.all([opt.waitForEvent('download'), opt.click('#exportFile')]);
const p = await dl.path();
const txt = readFileSync(p, 'utf8');
console.log('export file', dl.suggestedFilename(), txt.length, 'bytes');
// importing the same file in merge mode -> 0 new
await opt.setInputFiles('#fileInput', { name: 'x.ffp.json', mimeType: 'application/json', buffer: Buffer.from(txt) });
await opt.waitForTimeout(300);
console.log('import:', await opt.textContent('#importMsg'));
const t2 = JSON.parse(txt); t2.settings.rules = [{ enabled: true, match: 'regex', pattern: 'promo', valueType: 'faker', value: 'string.alpha(5)' }];
await opt.setInputFiles('#fileInput', { name: 'y.ffp.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(t2)) });
await opt.waitForTimeout(300);
console.log('import2:', await opt.textContent('#importMsg'), 'previews:', await opt.$$eval('.preview', (n) => n.map((x) => x.textContent)));
await ctx.close(); server.close();
