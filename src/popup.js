import { loadSettings, saveSettings } from './settings.js';
import { fillLocaleSelect } from './popup-locales.js';
import { t, useUiLang, applyI18n, applyTheme } from './i18n.js';

const $ = (id) => document.getElementById(id);
const status = $('status');
const THEMES = ['auto', 'light', 'dark'];

async function update(fn, msg) {
  const s = await loadSettings();
  fn(s);
  await saveSettings(s);
  if (msg) status.textContent = msg;
  return s;
}

loadSettings().then(async (s) => {
  await useUiLang(s.uiLang);
  applyTheme(s.theme);
  applyI18n();
  fillLocaleSelect($('locale'), s.locale);
  document.querySelectorAll('kbd[data-k]').forEach((k) => { k.textContent = s.hotkeys[k.dataset.k] || ''; });
  $('refill').checked = s.refillFilled;
  $('theme').title = t('theme') + ': ' + t('theme.' + (s.theme || 'auto'));
});

$('locale').addEventListener('change', () => update((s) => { s.locale = $('locale').value; }, t('popup.langSaved')));
$('refill').addEventListener('change', () => update((s) => { s.refillFilled = $('refill').checked; }, $('refill').checked ? t('popup.refillOn') : t('popup.refillOff')));
// cycle theme toggle: system → light → dark
$('theme').addEventListener('click', async () => {
  const s = await update((x) => { x.theme = THEMES[(THEMES.indexOf(x.theme || 'auto') + 1) % THEMES.length]; });
  applyTheme(s.theme);
  $('theme').title = t('theme') + ': ' + t('theme.' + s.theme);
  status.textContent = t('theme') + ': ' + t('theme.' + s.theme);
});

document.querySelectorAll('button[data-a]').forEach((b) => b.addEventListener('click', async () => {
  // element picking happens on the page: close the popup so it doesn't get in the way
  if (b.dataset.a === 'pick') { chrome.runtime.sendMessage({ popup: 'pick' }); return setTimeout(() => window.close(), 50); }
  const res = await chrome.runtime.sendMessage({ popup: b.dataset.a });
  status.textContent = t(b.dataset.a === 'debug' ? 'popup.labeled' : 'popup.filled', { n: res?.count ?? 0 });
}));

$('opts').addEventListener('click', () => chrome.runtime.openOptionsPage());
