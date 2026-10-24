// Formigo icon (variant C5): an ant carrying a form with a checkmark, on an "ink" colored tile
import { chromium } from 'playwright-core';
import { readFileSync } from 'node:fs';
const svg = readFileSync('static/icons/logo.svg', 'utf8');
const b = await chromium.launch({ executablePath: process.argv[2] });
const p = await b.newPage();
for (const s of [16, 32, 48, 128]) {
  await p.setViewportSize({ width: s, height: s });
  await p.setContent(`<body style="margin:0;background:transparent">${svg.replace('<svg ', `<svg width="${s}" height="${s}" `)}</body>`);
  await p.screenshot({ path: `static/icons/${s}.png`, omitBackground: true });
}
await b.close();
