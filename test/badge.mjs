// prints the debug hint (why a type was chosen) for page fields: node test/badge.mjs <chrome> page.html [filter]
import { chromium } from 'playwright-core';
import http from 'node:http';
import { readFileSync } from 'node:fs';
import path from 'node:path';
const site = path.resolve('test/site');
const server = http.createServer((req, res) => { try { res.end(readFileSync(path.join(site, req.url.split('?')[0]))); } catch { res.statusCode = 404; res.end(); } }).listen(8773);
const ext = path.resolve('dist');
const ctx = await chromium.launchPersistentContext('', { executablePath: process.argv[2], headless: true, args: [`--disable-extensions-except=${ext}`, `--load-extension=${ext}`, '--headless=new'], viewport: { width: 1280, height: 900 } });
let [sw] = ctx.serviceWorkers(); if (!sw) sw = await ctx.waitForEvent('serviceworker');
const page = await ctx.newPage();
await page.goto('http://localhost:8773/' + process.argv[3]); await page.waitForTimeout(500);
await sw.evaluate(async () => { const [t] = await chrome.tabs.query({ url: 'http://localhost:8773/*' }); return self.__ffp.broadcast(t.id, { action: 'debug' }); });
await page.waitForTimeout(200);
const f = new RegExp(process.argv[4] || '.', 'i');
for (const t of await page.evaluate(() => [...document.querySelectorAll('[data-ffp-badge]')].map((b) => b.title))) if (f.test(t)) console.log(t + '\n---');
await ctx.close(); server.close();
