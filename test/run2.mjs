import { chromium } from 'playwright-core';
import http from 'node:http';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const site = path.resolve('test/site');
const server = http.createServer((req, res) => {
  try { res.end(readFileSync(path.join(site, req.url === '/' ? 'index.html' : req.url.split('?')[0]))); } catch { res.statusCode = 404; res.end(); }
}).listen(8766);
const ext = path.resolve('dist');
const ctx = await chromium.launchPersistentContext('', {
  executablePath: process.argv[2], headless: true,
  args: [`--disable-extensions-except=${ext}`, `--load-extension=${ext}`, '--headless=new'],
});
let [sw] = ctx.serviceWorkers();
if (!sw) sw = await ctx.waitForEvent('serviceworker');
const page = await ctx.newPage();
page.on('console', (m) => { if (/Fake Filler|error/i.test(m.text())) console.log('console:', m.text()); });
page.on('pageerror', (e) => console.log('pageerror', e.message));

async function fillAll() {
  return sw.evaluate(async () => { const [t] = await chrome.tabs.query({ url: 'http://localhost:8766/*' }); return self.__ffp.broadcast(t.id, { action: 'fillAll' }); });
}
async function types() {
  return page.evaluate(() => [...document.querySelectorAll('[data-ffp-badge]')].map((b) => b.textContent));
}
for (const p of process.argv.slice(3)) {
  await page.goto('http://localhost:8766/' + p);
  await page.waitForTimeout(700);
  const n = await fillAll();
  await page.waitForTimeout(2500);
  const vals = await page.evaluate(() => {
    const out = {};
    document.querySelectorAll('input:not([type=file]),select').forEach((el, i) => { if (el.value && el.value !== 'null') out[(el.name || el.id || el.dataset.test || i) + (el.closest('[aria-hidden=true]') ? ' (ФОН!)' : '')] = el.tagName === 'SELECT' ? el.options[el.selectedIndex]?.text.trim() : el.value; });
    return { out, model: window.model };
  });
  console.log('\n=== ' + p + ' filled:', n);
  console.log(JSON.stringify(vals, null, 1)); console.log("touched:", JSON.stringify(await page.evaluate(() => window.touched)));
  await sw.evaluate(async () => { const [t] = await chrome.tabs.query({ url: 'http://localhost:8766/*' }); return self.__ffp.broadcast(t.id, { action: 'debug' }); });
  console.log('types:', (await types()).join(', '));
  await page.screenshot({ path: `test/${p.replace('.html', '')}.png`, fullPage: true });
}
await ctx.close(); server.close();
