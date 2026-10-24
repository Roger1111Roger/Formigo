import { DEFAULT_SETTINGS, SETTINGS_VERSION, loadSettings, saveSettings, normalizeSettings } from './settings.js';
import { attachSuggest } from './suggest.js';
import { makeProfile, valueFromRule, ensureFakers, generate, valueFromOverride, setTypeValues } from './generators.js';
import { DEFAULT_PATTERNS, setTypePatterns, scoreTypes } from './detect.js';
import { TYPE_INFO, NO_VALUE } from './types-info.js';
import { fillLocaleSelect } from './popup-locales.js';
import { t, useUiLang, uiLang, applyI18n, applyTheme, UI_LANGS } from './i18n.js';

const $ = (id) => document.getElementById(id);
const BOOL = ['ignoreHidden', 'refillFilled', 'agreeAlways', 'typeChars', 'highlight', 'modalOnly', 'fillReadonlyDates', 'selectRetries', 'fillFiles'];
const TEXT = ['imageMode', 'locale', 'checkboxMode', 'passwordMode', 'fixedPassword', 'emailDomain', 'ignoreSelectors'];
const MATCH = [['regex', 'RegExp'], ['css', 'CSS'], ['xpath', 'XPath']];
const VALUES = ['faker', 'template', 'regex', 'list', 'type', 'fixed', 'skip'];
const HOTKEYS = ['fillAll', 'fillForm', 'fillField', 'pick', 'debug'];
const PAGES = ['settings', 'data', 'rules', 'share', 'about'];

let settings;

function el(tag, props = {}, children = []) {
  const n = document.createElement(tag);
  Object.assign(n, props);
  children.forEach((c) => n.append(c));
  return n;
}
const selectOf = (opts, value) => el('select', {}, opts.map(([v, txt]) => el('option', { value: v, textContent: txt, selected: v === value })));

// --- saving: automatic, with a short notice ---
let toastTimer = 0;
function toast(msg) {
  const n = $('toast');
  n.textContent = msg;
  n.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => n.classList.remove('show'), 1600);
}
let saveTimer = 0;
function scheduleSave(msg) {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(async () => { saveTimer = 0; await saveSettings(settings); toast(msg || t('saved')); }, 350);
}

// --- tabs ---
function showPage() {
  const id = PAGES.includes(location.hash.slice(1)) ? location.hash.slice(1) : 'settings';
  PAGES.forEach((p) => $('page-' + p).classList.toggle('active', p === id));
  document.querySelectorAll('nav a').forEach((a) => a.classList.toggle('active', a.getAttribute('href') === '#' + id));
}
addEventListener('hashchange', showPage);

// --- interface: language and theme ---
function renderInterface() {
  const sel = $('uiLang');
  sel.textContent = '';
  UI_LANGS.forEach(([v, name]) => sel.append(el('option', { value: v, textContent: name, selected: v === uiLang() })));
  document.querySelectorAll('#themeSeg button').forEach((b) => b.classList.toggle('on', b.dataset.v === (settings.theme || 'auto')));
}
$('uiLang').addEventListener('change', async () => {
  settings.uiLang = $('uiLang').value;
  await useUiLang(settings.uiLang);
  render();
  scheduleSave();
});
document.querySelectorAll('#themeSeg button').forEach((b) => b.addEventListener('click', () => {
  settings.theme = b.dataset.v;
  applyTheme(settings.theme);
  renderInterface();
  scheduleSave();
}));

// --- general settings ---
function readForm() {
  BOOL.forEach((k) => { settings[k] = $(k).checked; });
  TEXT.forEach((k) => { settings[k] = $(k).value; });
  $('fixedPasswordBox').hidden = settings.passwordMode !== 'fixed';
}
[...BOOL, ...TEXT].forEach((k) => $(k).addEventListener(TEXT.includes(k) && $(k).tagName !== 'SELECT' ? 'input' : 'change', async () => {
  readForm();
  if (k === 'locale') { await ensureFakers(settings.locale); renderRules(); renderTypes(); }
  scheduleSave();
}));

// --- hotkeys ---
function comboFromEvent(e) {
  const code = typeof e.code === 'string' ? e.code : '';
  const k = typeof e.key === 'string' ? e.key : '';
  if (!code && !k) return null;
  if (['Control', 'Alt', 'Shift', 'Meta'].includes(k)) return null;
  const key = code.startsWith('Key') ? code.slice(3) : code.startsWith('Digit') ? code.slice(5) : k.length === 1 ? k.toUpperCase() : k || code;
  return [e.ctrlKey && 'Ctrl', e.altKey && 'Alt', e.shiftKey && 'Shift', e.metaKey && 'Meta', key].filter(Boolean).join('+');
}
function renderHotkeys() {
  const box = $('hotkeys');
  box.textContent = '';
  for (const k of HOTKEYS) {
    const inp = el('input', { type: 'text', readOnly: true, value: settings.hotkeys[k] || '', placeholder: t('hk.none') });
    inp.addEventListener('keydown', (e) => {
      if (e.key === 'Tab') return;
      e.preventDefault();
      if ((e.key === 'Backspace' || e.key === 'Delete') && !e.ctrlKey && !e.altKey) { settings.hotkeys[k] = ''; inp.value = ''; scheduleSave(); renderAbout(); return; }
      const combo = comboFromEvent(e);
      if (!combo) return;
      if (!/(Ctrl|Alt|Meta)\+/.test(combo) && !/^F\d+$/.test(combo.split('+').pop())) { toast(t('hk.needMod')); return; }
      settings.hotkeys[k] = combo;
      inp.value = combo;
      scheduleSave();
      renderAbout();
    });
    box.append(el('label', { className: 'field' }, [el('span', { textContent: t('hk.' + k) }), inp]));
  }
}

// --- test files (stored separately from settings, not included in export) ---
async function renderFiles() {
  const { testFiles = [] } = await chrome.storage.local.get('testFiles');
  const ul = $('filesList');
  ul.textContent = '';
  testFiles.forEach((f, i) => {
    const kb = Math.max(1, Math.round((f.dataUrl.length * 0.75) / 1024));
    ul.append(el('li', {}, [
      el('span', {}, [el('span', { textContent: f.name + ' ' }), el('span', { className: 'muted', textContent: `${f.type || '?'} · ${kb} KB` })]),
      el('button', { className: 'ghost danger', textContent: t('remove'), onclick: async () => { testFiles.splice(i, 1); await chrome.storage.local.set({ testFiles }); renderFiles(); } }),
    ]));
  });
  if (!testFiles.length) ul.append(el('li', { className: 'muted', textContent: t('files.none') }));
}
$('addFiles').onclick = () => $('filesInput').click();
$('filesInput').onchange = async (e) => {
  const { testFiles = [] } = await chrome.storage.local.get('testFiles');
  for (const file of e.target.files) {
    const dataUrl = await new Promise((r) => { const fr = new FileReader(); fr.onload = () => r(fr.result); fr.readAsDataURL(file); });
    testFiles.push({ name: file.name, type: file.type, dataUrl });
  }
  await chrome.storage.local.set({ testFiles });
  e.target.value = '';
  toast(t('files.added'));
  renderFiles();
};

// --- field types: custom detection RegExps and custom values ---
const DEF_SRC = Object.fromEntries(DEFAULT_PATTERNS.map((p) => [p.id, p.source]));
const typeTitle = (row) => (uiLang() === 'ru' ? row[1] : row[2]);
function sampleValue(type) {
  const locale = settings.locale;
  const ctx = { locale, profile: makeProfile(locale, settings), el: null, signature: '', inputType: 'text' };
  const ov = settings.typeValues[type];
  return ov ? valueFromOverride(ov, { ...ctx, noOverride: type }) : generate(type, ctx);
}
function applyTypeOverrides() {
  setTypePatterns(settings.typePatterns);
  setTypeValues(settings.typeValues);
}
function renderTypes() {
  const tb = $('types');
  tb.textContent = '';
  const q = $('typeFilter').value.trim().toLowerCase();
  const changedOnly = $('typeChangedOnly').checked;
  for (const row of TYPE_INFO) {
    const [id] = row;
    const title = typeTitle(row);
    const pat = settings.typePatterns[id];
    const val = settings.typeValues[id];
    const changed = pat != null || !!val;
    if (q && !(id.toLowerCase().includes(q) || title.toLowerCase().includes(q) || row[1].toLowerCase().includes(q))) continue;
    if (changedOnly && !changed) continue;
    const hasDefault = id in DEF_SRC;
    const pin = el('textarea', { rows: 1, value: pat ?? DEF_SRC[id] ?? '', placeholder: hasDefault ? t('types.off') : t('types.ctxOnly') });
    const vin = NO_VALUE.has(id) ? el('span', { className: 'muted', textContent: '—' }) : el('textarea', { rows: 1, value: val || '', placeholder: t('types.builtin') });
    const pv = el('div', { className: 'preview' });
    const tr = el('tr', { className: changed ? 'changed' : '' });
    const mark = () => { tr.className = settings.typePatterns[id] != null || settings.typeValues[id] ? 'changed' : ''; };
    const showSample = () => {
      if (NO_VALUE.has(id)) return;
      try { pv.textContent = `${t('example')}: ${sampleValue(id)}`; pv.classList.remove('bad'); } catch (e) { pv.textContent = `${t('error')}: ${e.message}`; pv.classList.add('bad'); }
    };
    pin.addEventListener('input', () => {
      const v = pin.value;
      let ok = true;
      try { if (v) new RegExp(v, 'i'); } catch { ok = false; }
      pin.classList.toggle('err', !ok);
      pin.title = ok ? '' : t('types.badRe');
      if (v === (DEF_SRC[id] ?? '')) delete settings.typePatterns[id]; else settings.typePatterns[id] = v;
      mark();
      applyTypeOverrides();
      testSignature();
      scheduleSave();
    });
    if (vin.tagName === 'TEXTAREA') vin.addEventListener('input', () => {
      if (vin.value.trim()) settings.typeValues[id] = vin.value; else delete settings.typeValues[id];
      mark();
      applyTypeOverrides();
      showSample();
      scheduleSave();
    });
    const reset = el('button', { className: 'ghost', textContent: '↺', title: t('types.reset'), onclick: () => { delete settings.typePatterns[id]; delete settings.typeValues[id]; applyTypeOverrides(); renderTypes(); scheduleSave(); } });
    tr.append(el('td', { className: 'type-id' }, [el('code', { textContent: id }), el('div', { className: 'muted', textContent: title })]), el('td', {}, [pin]), el('td', {}, [vin, pv]), el('td', {}, [reset]));
    tb.append(tr);
    showSample();
  }
}
function testSignature() {
  const v = $('typeTest').value.trim().toLowerCase();
  if (!v) { $('typeTestOut').textContent = ''; return; }
  const ranked = scoreTypes({ label: v });
  $('typeTestOut').textContent = '→ ' + (ranked.length ? ranked.slice(0, 3).map(([k]) => k).join(', ') : t('types.none'));
}
$('typeFilter').addEventListener('input', renderTypes);
$('typeChangedOnly').addEventListener('change', renderTypes);
$('typeTest').addEventListener('input', testSignature);

// --- custom rules ---
function preview(rule, out) {
  if (!rule.value && rule.valueType !== 'skip') { out.textContent = ''; return; }
  try {
    const locale = settings.locale;
    const ctx = { locale, profile: makeProfile(locale, settings), el: null, signature: '' };
    out.textContent = rule.valueType === 'skip' ? `(${t('skipped')})` : `${t('example')}: ${valueFromRule(rule, ctx)}`;
    out.classList.remove('bad');
  } catch (e) {
    out.textContent = `${t('error')}: ${e.message}`;
    out.classList.add('bad');
  }
}
function renderRules() {
  const tb = $('rules');
  tb.textContent = '';
  $('rulesEmpty').hidden = settings.rules.length > 0;
  settings.rules.forEach((r, i) => {
    const en = el('input', { type: 'checkbox', checked: !!r.enabled });
    const note = el('input', { type: 'text', value: r.note || '' });
    const match = selectOf(MATCH, r.match);
    const pattern = el('input', { type: 'text', value: r.pattern || '', placeholder: 'phone|телефон' });
    const vtype = selectOf(VALUES.map((v) => [v, t('v.' + v)]), r.valueType);
    const value = el('textarea', { value: r.value || '', rows: 1, placeholder: t('sg.ph') });
    const pv = el('div', { className: 'preview' });
    const sync = () => {
      Object.assign(r, { enabled: en.checked, note: note.value, match: match.value, pattern: pattern.value, valueType: vtype.value, value: value.value });
      preview(r, pv);
      scheduleSave();
    };
    [en, note, match, pattern, vtype, value].forEach((n) => n.addEventListener('input', sync));
    const btn = (txt, fn, title) => el('button', { className: 'ghost', textContent: txt, title, onclick: fn });
    tb.append(el('tr', {}, [
      el('td', {}, [en]), el('td', {}, [note]), el('td', {}, [match]), el('td', {}, [pattern]), el('td', {}, [vtype]),
      el('td', {}, [value, pv]),
      el('td', { className: 'row-actions' }, [
        btn('↑', () => move(i, -1), t('up')), btn('↓', () => move(i, 1), t('down')),
        btn('✕', () => { settings.rules.splice(i, 1); renderRules(); scheduleSave(); }, t('remove')),
      ]),
    ]));
    preview(r, pv);
    attachSuggest(value, {
      overlay: true, lang: () => uiLang(), locale: () => settings.locale, labels: suggestLabels(),
      example: (rule) => valueFromRule(rule, { locale: settings.locale, profile: makeProfile(settings.locale, settings), el: null, signature: '' }),
      onPick: (x) => { vtype.value = x.valueType; sync(); },
    });
  });
}
function suggestLabels() {
  return { hint: t('sg.hint'), none: t('sg.none'), types: Object.fromEntries(VALUES.map((v) => [v, t('v.' + v)])) };
}
function move(i, d) {
  const j = i + d;
  if (j < 0 || j >= settings.rules.length) return;
  [settings.rules[i], settings.rules[j]] = [settings.rules[j], settings.rules[i]];
  renderRules();
  scheduleSave();
}
$('addRule').onclick = () => {
  settings.rules.push({ enabled: true, note: '', match: 'regex', pattern: '', valueType: 'faker', value: '' });
  renderRules();
};

$('reset').onclick = async () => {
  if (!confirm(t('reset.confirm'))) return;
  settings = normalizeSettings({ uiLang: settings.uiLang, theme: settings.theme });
  applyTypeOverrides();
  render();
  await saveSettings(settings);
  toast(t('reset.done'));
};

// --- export / import ---
function exportPayload() {
  const onlyRules = $('exportRulesOnly').checked;
  const { ignoreFilled, ...all } = settings;
  const data = onlyRules ? { rules: settings.rules, typePatterns: settings.typePatterns, typeValues: settings.typeValues } : all;
  return { app: 'formigo', version: SETTINGS_VERSION, exportedAt: new Date().toISOString().slice(0, 10), settings: data };
}
$('exportFile').onclick = () => {
  const blob = new Blob([JSON.stringify(exportPayload(), null, 1)], { type: 'application/json' });
  const a = el('a', { href: URL.createObjectURL(blob), download: `formigo-${new Date().toISOString().slice(0, 10)}.formigo.json` });
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
};
$('copyJson').onclick = async () => {
  await navigator.clipboard.writeText(JSON.stringify(exportPayload()));
  toast(t('export.copied'));
};

const ruleKey = (r) => [r.match, r.pattern, r.valueType, r.value].join('\u0001');
async function applyImport(text) {
  let data;
  try { data = JSON.parse(text); } catch { $('importMsg').textContent = t('import.notJson'); return; }
  // legacy Fake Filler+ files are accepted too
  const incoming = data && (data.app === 'formigo' || data.app === 'fake-filler-plus') ? data.settings : data;
  if (!incoming || typeof incoming !== 'object') { $('importMsg').textContent = t('import.empty'); return; }
  const rules = Array.isArray(incoming.rules) ? incoming.rules.filter((r) => r && typeof r.pattern === 'string') : [];
  if ($('importMode').value === 'replace') {
    const clean = Object.fromEntries([...Object.keys(DEFAULT_SETTINGS), 'ignoreFilled'].filter((k) => k in incoming).map((k) => [k, incoming[k]]));
    settings = normalizeSettings({ ...structuredClone(DEFAULT_SETTINGS), ...clean, rules });
    $('importMsg').textContent = t('import.replaced', { n: rules.length });
  } else {
    const have = new Set(settings.rules.map(ruleKey));
    const added = rules.filter((r) => !have.has(ruleKey(r)));
    settings.rules.push(...added);
    const obj = (x) => (x && typeof x === 'object' && !Array.isArray(x) ? x : {});
    Object.assign(settings.typePatterns, obj(incoming.typePatterns));
    Object.assign(settings.typeValues, obj(incoming.typeValues));
    $('importMsg').textContent = t('import.merged', { n: added.length, d: rules.length - added.length });
  }
  applyTypeOverrides();
  await useUiLang(settings.uiLang);
  applyTheme(settings.theme);
  render();
  await saveSettings(settings);
  toast(t('saved'));
}
$('importFile').onclick = () => $('fileInput').click();
$('fileInput').onchange = async (e) => {
  const file = e.target.files[0];
  if (file) await applyImport(await file.text());
  e.target.value = '';
};
$('importPaste').onclick = () => {
  const text = prompt(t('import.prompt'));
  if (text) applyImport(text);
};

// --- about ---
function renderAbout() {
  const v = chrome.runtime.getManifest().version;
  $('ver').textContent = 'v' + v;
  $('aboutVer').textContent = v;
  const box = $('aboutKeys');
  box.textContent = '';
  for (const k of HOTKEYS) box.append(el('span', { className: 'muted', textContent: t('hk.' + k) }), el('span', { className: 'mono', textContent: settings.hotkeys[k] || '—' }));
  $('typesList').innerHTML = '';
  $('typesList').append(t('v.type') + ': ', ...TYPE_INFO.filter(([id]) => !NO_VALUE.has(id)).flatMap(([id]) => [el('code', { textContent: id }), ' ']));
}

function render() {
  applyI18n();
  document.title = 'Formigo · ' + t('tab.' + (PAGES.includes(location.hash.slice(1)) ? location.hash.slice(1) : 'settings'));
  renderInterface();
  fillLocaleSelect($('locale'), settings.locale);
  BOOL.forEach((k) => { $(k).checked = !!settings[k]; });
  TEXT.forEach((k) => { $(k).value = settings[k] ?? ''; });
  $('fixedPasswordBox').hidden = settings.passwordMode !== 'fixed';
  renderHotkeys();
  renderFiles();
  renderTypes();
  renderRules();
  renderAbout();
}
addEventListener('hashchange', () => { document.title = 'Formigo · ' + t('tab.' + (location.hash.slice(1) || 'settings')); });

loadSettings().then(async (s) => {
  settings = s;
  await useUiLang(settings.uiLang);
  applyTheme(settings.theme);
  applyTypeOverrides();
  await ensureFakers(settings.locale);
  showPage();
  render();
});

// Settings changed in the popup or another tab: pick them up if we have no unsaved edits
chrome.storage.onChanged.addListener(async (ch, area) => {
  if (area !== 'local' || !ch.settings || saveTimer || !settings) return;
  const s = await loadSettings();
  if (JSON.stringify({ ...s, ignoreFilled: 0 }) === JSON.stringify({ ...settings, ignoreFilled: 0 })) return;
  settings = s;
  await useUiLang(settings.uiLang);
  applyTheme(settings.theme);
  applyTypeOverrides();
  await ensureFakers(settings.locale);
  render();
});
