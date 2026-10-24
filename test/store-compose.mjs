// Chrome Web Store listing: 5 screenshots 1280×800 per language, promo 440×280 and 1400×560, icon 128
import { chromium } from 'playwright-core';
import { readFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
const root = path.resolve('.');
const out = path.resolve(process.argv[3] || 'test/store/out');
// about:blank can't load file:// — embed images and fonts as data URIs
const raw = (f) => 'data:image/png;base64,' + readFileSync(path.join(root, 'test/store/raw', f)).toString('base64');
const font = (f) => 'data:font/woff2;base64,' + readFileSync(path.join(root, 'static/fonts', f)).toString('base64');
const logo = readFileSync('static/icons/logo.svg', 'utf8');
const CSS = `
@font-face{font-family:Inter;font-weight:400;src:url(${font('inter-latin-400-normal.woff2')})}
@font-face{font-family:Inter;font-weight:400;src:url(${font('inter-cyrillic-400-normal.woff2')});unicode-range:U+0400-045F}
@font-face{font-family:Inter;font-weight:600;src:url(${font('inter-latin-600-normal.woff2')})}
@font-face{font-family:Inter;font-weight:600;src:url(${font('inter-cyrillic-600-normal.woff2')});unicode-range:U+0400-045F}
*{box-sizing:border-box;margin:0}
body{font-family:Inter,sans-serif;-webkit-font-smoothing:antialiased;overflow:hidden}
.shot{width:1280px;height:800px;background:#f4f2ed;position:relative;overflow:hidden}
.shot .cap{position:absolute;left:80px;top:58px;right:80px}
.shot h1{font-size:40px;font-weight:600;color:#262b31;letter-spacing:-.02em}
.shot p{font-size:19px;color:#6f737a;margin-top:10px}
.shot .dot{display:inline-block;width:10px;height:10px;border-radius:50%;background:#c58b6e;margin-right:14px;vertical-align:middle;position:relative;top:-6px}
.win{position:absolute;left:80px;top:196px;width:1120px;height:680px;border-radius:14px;overflow:hidden;box-shadow:0 18px 50px #262b3133,0 2px 6px #262b311a;border:1px solid #e1ddd4;background:#fff}
.win .bar{height:30px;background:#e9e6df;display:flex;gap:7px;align-items:center;padding:0 12px}
.win .bar i{width:11px;height:11px;border-radius:50%;background:#cdc8bd}
.win img.page{width:1120px;display:block}
.pop{position:absolute;right:56px;top:150px;width:300px;border-radius:12px;overflow:hidden;box-shadow:0 20px 50px #262b3140,0 2px 8px #262b3126}
.pop img{width:300px;display:block}
.dark{background:#34465a}.dark h1{color:#f3efe6}.dark p{color:#c9d3dc}.dark .win{border-color:#2a3a4c}
`;
const S = {
  ru: [
    ['Заполняет форму за одно нажатие', 'Правдоподобные и согласованные тестовые данные на 76 языках', 'filled', 'popup-light'],
    ['Понимает смысл каждого поля', 'Подпись, атрибуты, текст рядом и заголовок секции. Больше 85 типов полей', 'types'],
    ['Правило для поля без кода', 'Кликните поле, и Formigo подскажет надёжный локатор и что подставлять', 'pick'],
    ['Файлы нужного формата', 'PDF, DOCX, XLSX, CSV, картинки: ваши тестовые или созданные на лету', 'files'],
    ['Настройки под вашу команду', 'Горячие клавиши, импорт и экспорт, светлая и тёмная тема, 18 языков', 'options-dark', 'popup-dark', true],
  ],
  en: [
    ['Fill any form with one keystroke', 'Realistic, consistent test data in 76 languages', 'filled', 'popup-light'],
    ['Understands what each field means', 'Labels, attributes, nearby text and section headings. 85+ field types', 'types'],
    ['Custom rules without code', 'Click a field and Formigo suggests a stable locator and what to insert', 'pick'],
    ['Files of the right format', 'PDF, DOCX, XLSX, CSV, images: your test files or generated on the fly', 'files'],
    ['Settings that fit your team', 'Hotkeys, import and export, light and dark themes, 18 languages', 'options-dark', 'popup-dark', true],
  ],
};
const TAG = { ru: 'Тестовые данные в формах за одно нажатие', en: 'Test data in your forms with one keystroke' };
const PTS = { ru: ['Умное определение полей', 'Файлы нужного формата', 'Правила без кода'], en: ['Smart field detection', 'Files of the right format', 'Rules without code'] };
const b = await chromium.launch({ executablePath: process.argv[2] });
const page = await b.newPage({ deviceScaleFactor: 1 });
async function render(html, w, h, file) {
  await page.setViewportSize({ width: w, height: h });
  await page.setContent(`<!doctype html><html><head><meta charset="utf-8"><style>${CSS}</style></head><body>${html}</body></html>`);
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(150);
  await page.screenshot({ path: file, type: file.endsWith('.jpg') ? 'jpeg' : 'png', quality: file.endsWith('.jpg') ? 92 : undefined });
}
for (const lang of ['ru', 'en']) {
  mkdirSync(path.join(out, lang), { recursive: true });
  let i = 0;
  for (const [h, sub, img, pop, dark] of S[lang]) {
    i++;
    const html = `<div class="shot${dark ? ' dark' : ''}"><div class="cap"><h1><span class="dot"></span>${h}</h1><p>${sub}</p></div>
      <div class="win"><div class="bar"><i></i><i></i><i></i></div><img class="page" style="margin-top:${img === 'files' ? -110 : 0}px" src="${raw(`${lang}-${img}.png`)}"></div>
      ${pop ? `<div class="pop"><img src="${raw(`${lang}-${pop}.png`)}"></div>` : ''}</div>`;
    await render(html, 1280, 800, path.join(out, lang, `screenshot-${i}.jpg`));
  }
  // promo
  const L = `<div style="width:100%;height:100%">${logo.replace('<svg ', '<svg width="100%" height="100%" ')}</div>`;
  await render(`<div style="width:440px;height:280px;background:#34465a;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;color:#f3efe6">
    <div style="width:84px;height:84px;border-radius:20px;box-shadow:0 0 0 2px #f3efe633">${L}</div>
    <div style="font-size:34px;font-weight:600;letter-spacing:-.02em">Formigo</div>
    <div style="font-size:15px;color:#c9d3dc;text-align:center;max-width:360px">${TAG[lang]}</div></div>`, 440, 280, path.join(out, lang, 'promo-small-440x280.jpg'));
  await render(`<div style="width:1400px;height:560px;background:#34465a;position:relative;overflow:hidden;color:#f3efe6">
    <div style="position:absolute;left:90px;top:120px;width:520px">
      <div style="display:flex;align-items:center;gap:18px"><div style="width:76px;height:76px;border-radius:18px;box-shadow:0 0 0 2px #f3efe633">${L}</div><div style="font-size:52px;font-weight:600;letter-spacing:-.02em">Formigo</div></div>
      <div style="font-size:24px;color:#e3e8ee;margin-top:26px;line-height:1.35">${TAG[lang]}</div>
      <div style="display:flex;flex-wrap:wrap;gap:10px;margin-top:28px">${PTS[lang].map((x) => `<span style="font-size:15px;padding:8px 14px;border-radius:999px;background:#f3efe61a;color:#f3efe6;border:1px solid #f3efe633"><span style="color:#d3a088">●</span> ${x}</span>`).join('')}</div>
    </div>
    <div style="position:absolute;left:680px;top:70px;width:820px;height:560px;border-radius:14px;overflow:hidden;box-shadow:0 24px 60px #0006"><div style="height:28px;background:#e9e6df"></div><img src="${raw(`${lang}-filled.png`)}" style="width:820px;display:block"></div>
    <div style="position:absolute;left:1080px;top:150px;width:270px;border-radius:12px;overflow:hidden;box-shadow:0 20px 50px #0008"><img src="${raw(`${lang}-popup-light.png`)}" style="width:270px;display:block"></div>
  </div>`, 1400, 560, path.join(out, lang, 'promo-marquee-1400x560.jpg'));
}
// store icon: 96×96 artwork with 16 px transparent padding
await page.setViewportSize({ width: 128, height: 128 });
await page.setContent(`<body style="margin:0;background:transparent"><div style="padding:16px">${logo.replace('<svg ', '<svg width="96" height="96" ')}</div></body>`);
await page.screenshot({ path: path.join(out, 'store-icon-128.png'), omitBackground: true });
await b.close();
