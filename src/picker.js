// Element picker mode: the user clicks a field on the page, Formigo suggests locators
// and actions, and the result is saved to «Custom rules»
import { detectType, getSources } from './detect.js';
import { makeProfile, valueFromRule, ensureFakers } from './generators.js';
import { t, uiLang } from './i18n.js';
import { attachSuggest } from './suggest.js';

const VALUES = ['type', 'fixed', 'list', 'template', 'regex', 'faker', 'skip'];
// mui-12, :r3:, ember123, ext-gen45, a1b2c3d4e5, uuid, input_17 — change from load to load
const GENERATED = /^(:?r\d+:?|mui-\d+|ember\d+|ext-gen\d+|ng-\w+-\d+|react-\w+-\d+|el-id-\d+-\d+|[a-z]+[-_]?\d{2,}|.*[a-f0-9]{8,}.*|[a-f0-9-]{20,}|\d+)$/i;
const isGenerated = (s) => !s || GENERATED.test(s);
const cssStr = (s) => '"' + String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"';
const xpStr = (s) => (s.includes('"') ? `'${s}'` : `"${s}"`);
const reEsc = (s) => s.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');

const CSS = `
:host{all:initial}
*{box-sizing:border-box}
.box{position:fixed;pointer-events:none;border:2px solid var(--accent);background:var(--hl);border-radius:4px;transition:all .06s;z-index:1}
.tag{position:fixed;pointer-events:none;background:var(--accent);color:var(--on);font:500 11px/1 var(--mono);padding:4px 6px;border-radius:4px;white-space:nowrap;z-index:2}
.bar{position:fixed;top:12px;left:50%;transform:translateX(-50%);background:var(--surface);color:var(--text);border:1px solid var(--border);box-shadow:var(--shadow);font:13px/1.4 var(--font);padding:8px 14px;border-radius:8px;display:flex;gap:10px;align-items:center;z-index:3}
.bar b{font-weight:600}
.panel{position:fixed;width:400px;max-width:calc(100vw - 24px);max-height:calc(100vh - 24px);overflow:auto;background:var(--surface);color:var(--text);border:1px solid var(--border);border-radius:10px;box-shadow:var(--shadow);font:13px/1.45 var(--font);z-index:4}
.hd{display:flex;align-items:center;gap:8px;padding:12px 14px;border-bottom:1px solid var(--border);cursor:move;user-select:none}
.hd b{font-size:14px;font-weight:600;flex:1}
.hd .x{border:0;background:transparent;color:var(--muted);font-size:16px;padding:2px 6px}
.bd{padding:12px 14px;display:grid;gap:12px}
.sum{color:var(--muted);font-size:12px}
.sum code{font:11px var(--mono);background:var(--surface2);padding:1px 4px;border-radius:3px;color:var(--text)}
h4{margin:0 0 6px;font-size:12px;font-weight:600;color:var(--muted);text-transform:uppercase;letter-spacing:.04em}
.loc{display:grid;gap:4px}
.opt{display:grid;grid-template-columns:auto 1fr auto;gap:2px 8px;align-items:center;text-align:left;border:1px solid var(--border);background:var(--surface);color:var(--text);border-radius:7px;padding:7px 9px;cursor:pointer;font:inherit}
.opt:hover{background:var(--surface2)}
.opt.on{border-color:var(--accent);box-shadow:0 0 0 1px var(--accent) inset}
.opt .k{font:600 10px/1 var(--font);text-transform:uppercase;color:var(--muted);letter-spacing:.04em}
.opt code{font:11.5px var(--mono);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.opt .why{grid-column:1/-1;color:var(--muted);font-size:11.5px}
.pill{font-size:10.5px;padding:2px 6px;border-radius:999px;background:var(--okbg);color:var(--ok);white-space:nowrap}
.pill.warn{background:var(--warnbg);color:var(--warn)}
.pill.rec{background:var(--accent);color:var(--on)}
.warnline{background:var(--warnbg);color:var(--warn);border-radius:6px;padding:6px 8px;font-size:12px}
.row{display:grid;grid-template-columns:110px 1fr;gap:8px;align-items:center}
label{color:var(--muted);font-size:12px}
input,select,textarea{font:12px var(--mono);color:var(--text);background:var(--surface);border:1px solid var(--borders);border-radius:6px;padding:6px 8px;width:100%}
select{font-family:var(--font)}
textarea{min-height:34px;resize:vertical}
input:focus,select:focus,textarea:focus{outline:none;border-color:var(--accent);box-shadow:0 0 0 3px var(--focus)}
.count{font-size:11.5px;color:var(--muted)}
.chips{display:flex;flex-wrap:wrap;gap:6px}
.chip{border:1px solid var(--borders);background:var(--surface);color:var(--text);border-radius:999px;padding:4px 10px;font:12px var(--font);cursor:pointer}
.chip:hover{background:var(--surface2)}
.prev{font:11.5px var(--mono);color:var(--ok)}
.tips{margin:0;padding-left:16px;color:var(--muted);font-size:12px}
.ft{display:flex;gap:8px;justify-content:flex-end;padding:12px 14px;border-top:1px solid var(--border);position:sticky;bottom:0;background:var(--surface)}
button{font:13px var(--font);cursor:pointer}
.btn{border:1px solid var(--borders);background:var(--surface);color:var(--text);border-radius:6px;padding:7px 12px}
.btn:hover{background:var(--surface2)}
.btn.pri{background:var(--accent);border-color:var(--accent);color:var(--on)}
.toast{position:fixed;bottom:18px;left:50%;transform:translateX(-50%);background:var(--accent);color:var(--on);font:13px var(--font);padding:9px 14px;border-radius:8px;box-shadow:var(--shadow);z-index:5}
`;
const LIGHT = '--bg:#f4f2ed;--surface:#fff;--surface2:#eeebe4;--border:#e1ddd4;--borders:#cdc8bd;--text:#262b31;--muted:#6f737a;--accent:#34465a;--on:#f3efe6;--hl:#34465a1f;--focus:#34465a40;--ok:#4f6e56;--okbg:#e6eee7;--warn:#9a5a3e;--warnbg:#f6ebe4;--shadow:0 6px 24px #262b3126,0 1px 3px #262b311a;';
const DARK = '--bg:#191d22;--surface:#21262c;--surface2:#282e35;--border:#323941;--borders:#424a54;--text:#e4e0d8;--muted:#9aa0a8;--accent:#a9bccf;--on:#191d22;--hl:#a9bccf26;--focus:#a9bccf55;--ok:#8fae94;--okbg:#26322a;--warn:#d3a088;--warnbg:#3a2f2a;--shadow:0 6px 24px #0008;';
const FONTS = "--font:Inter,system-ui,-apple-system,'Segoe UI',sans-serif;--mono:'JetBrains Mono',ui-monospace,Menlo,Consolas,monospace;";

export function createPicker({ resolveTarget, collectFields, fillOne, loadSettings, onStop }) {
  let host = null; let root = null; let state = null;

  const h = (tag, props = {}, ...kids) => {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(props)) {
      if (k === 'class') n.className = v; else if (k.startsWith('on')) n.addEventListener(k.slice(2), v); else if (k in n) n[k] = v; else n.setAttribute(k, v);
    }
    n.append(...kids.flat().filter((x) => x != null && x !== false));
    return n;
  };

  function layer(settings) {
    const hst = document.createElement('formigo-picker');
    hst.setAttribute('data-ffp-badge', '');
    // popover — so the layer sits in the top layer above dialogs opened as popover/<dialog>
    hst.style.cssText = 'position:fixed;inset:0;width:100vw;height:100vh;max-width:none;max-height:none;margin:0;padding:0;border:0;background:transparent;overflow:visible;z-index:2147483647;pointer-events:none';
    const canPop = typeof hst.showPopover === 'function';
    if (canPop) hst.setAttribute('popover', 'manual');
    const rt = hst.attachShadow({ mode: 'open' });
    const dark = settings.theme === 'dark' || (settings.theme !== 'light' && matchMedia('(prefers-color-scheme: dark)').matches);
    rt.append(h('style', { textContent: `:host{${FONTS}${dark ? DARK : LIGHT}}` + CSS }));
    document.documentElement.append(hst);
    if (canPop) { try { hst.showPopover(); } catch { /* no top layer */ } }
    return [hst, rt];
  }
  function mount(settings) { [host, root] = layer(settings); }

  const isOurs = (e) => host && e.composedPath().includes(host);
  const deep = (x, y) => {
    let el = document.elementFromPoint(x, y);
    while (el && el.shadowRoot) { const inner = el.shadowRoot.elementFromPoint(x, y); if (!inner || inner === el) break; el = inner; }
    return el;
  };
  function targetAt(x, y) {
    host.style.display = 'none';
    let el = deep(x, y);
    host.style.display = '';
    if (!el) return null;
    if (el.tagName === 'LABEL' && el.control) el = el.control;
    const r = resolveTarget(el);
    if (!r) return null;
    if (r.kind === 'dropdown') return r.el.parentElement?.querySelector('select') || r.el;
    return r.el;
  }

  // --- hover ---
  function onMove(e) {
    if (!state || state.panel || isOurs(e)) return;
    const el = targetAt(e.clientX, e.clientY);
    state.hover = el;
    if (!el) { state.box.style.display = state.tag.style.display = 'none'; return; }
    const r = el.getBoundingClientRect();
    Object.assign(state.box.style, { display: 'block', left: r.left - 3 + 'px', top: r.top - 3 + 'px', width: r.width + 6 + 'px', height: r.height + 6 + 'px' });
    let type = 'text';
    try { type = detectType(el).type; } catch { /* nothing */ }
    state.tag.textContent = `${el.tagName.toLowerCase()}${el.type && el.tagName === 'INPUT' ? '[' + el.type + ']' : ''} · ${type}`;
    Object.assign(state.tag.style, { display: 'block', left: Math.max(4, r.left) + 'px', top: (r.top > 26 ? r.top - 24 : r.bottom + 6) + 'px' });
  }
  function swallow(e) {
    if (!state || isOurs(e)) return;
    e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation();
    if (e.type === 'click' && !state.panel) {
      const el = targetAt(e.clientX, e.clientY) || state.hover;
      if (el) openPanel(el);
    }
  }
  function onKey(e) {
    if (!state) return;
    // Esc in a field with open suggestions closes only the suggestions
    const sg = e.composedPath()[0]?.nextElementSibling;
    if (sg && sg.classList?.contains('sg') && !sg.hidden) return;
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); cancel(); }
  }
  const EV = ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click', 'dblclick', 'contextmenu'];

  async function start(el) {
    stop();
    const settings = await loadSettings();
    await ensureFakers(settings.locale);
    mount(settings);
    state = { settings, box: h('div', { class: 'box' }), tag: h('div', { class: 'tag' }) };
    state.box.style.display = state.tag.style.display = 'none';
    root.append(state.box, state.tag);
    if (el) return openPanel(el);
    if (window === window.top) root.append(state.bar = h('div', { class: 'bar' }, h('b', { textContent: 'Formigo' }), h('span', { textContent: t('pick.bar') })));
    addEventListener('mousemove', onMove, true);
    EV.forEach((n) => addEventListener(n, swallow, true));
    addEventListener('keydown', onKey, true);
  }
  function unhook() {
    removeEventListener('mousemove', onMove, true);
    EV.forEach((n) => removeEventListener(n, swallow, true));
  }
  // closed by the user — cancel picking in the tab's other frames too
  function cancel() { stop(); onStop?.(); }
  function stop() {
    unhook();
    removeEventListener('keydown', onKey, true);
    host?.remove(); host = root = state = null;
  }

  // --- locators ---
  function count(match, pattern, el) {
    try {
      if (match === 'css') return document.querySelectorAll(pattern).length;
      if (match === 'xpath') return document.evaluate(pattern, document, null, XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null).snapshotLength;
      const re = new RegExp(pattern, 'i');
      if (!state.sigs) state.sigs = collectFields(document).map((f) => { try { return detectType(f).signature; } catch { return ''; } });
      return state.sigs.filter((s) => re.test(s)).length || (re.test(detectType(el).signature) ? 1 : 0);
    } catch { return -1; }
  }

  function locators(el) {
    const a = (n) => el.getAttribute(n);
    const tag = el.tagName.toLowerCase();
    const out = [];
    const add = (match, pattern, why, fragile = false) => { if (pattern && !out.some((o) => o.pattern === pattern)) out.push({ match, pattern, why, fragile }); };
    for (const n of ['data-testid', 'data-test', 'data-qa', 'data-cy', 'data-test-id']) if (a(n)) add('css', `[${n}=${cssStr(a(n))}]`, 'pick.why.test');
    if (a('id') && !isGenerated(a('id'))) add('css', '#' + window.CSS.escape(a('id')), 'pick.why.id');
    if (a('name') && !isGenerated(a('name'))) add('css', `${tag}[name=${cssStr(a('name'))}]`, 'pick.why.name');
    for (const n of ['formcontrolname', 'ng-model', 'v-model', 'data-ng-model']) if (a(n)) add('css', `[${n}=${cssStr(a(n))}]`, 'pick.why.bind');
    if (a('aria-label')) add('css', `${tag}[aria-label=${cssStr(a('aria-label'))}]`, 'pick.why.aria');
    const label = getSources(el).label;
    if (label) add('regex', `^${reEsc(label)}( \\||$)`, 'pick.why.label');
    const lab = el.labels?.[0] || (a('aria-labelledby') && document.getElementById(a('aria-labelledby').split(' ')[0]));
    const labTxt = lab?.textContent.replace(/\s+/g, ' ').trim();
    if (labTxt && labTxt.length < 60) add('xpath', `//label[normalize-space()=${xpStr(labTxt)}]/following::${tag}[1]`, 'pick.why.xpath');
    if (a('placeholder')) add('css', `${tag}[placeholder=${cssStr(a('placeholder'))}]`, 'pick.why.ph');
    if (a('id') && isGenerated(a('id'))) add('css', '#' + window.CSS.escape(a('id')), 'pick.why.genId', true);
    add('css', domPath(el), 'pick.why.path', true);
    for (const o of out) o.n = count(o.match, o.pattern, el);
    const rec = out.find((o) => o.n === 1 && !o.fragile) || out.find((o) => o.n === 1) || out[0];
    if (rec) rec.rec = true;
    return out;
  }
  function domPath(el) {
    const parts = [];
    let n = el;
    while (n && n.nodeType === 1 && n !== document.documentElement && parts.length < 6) {
      let p = n.tagName.toLowerCase();
      if (n.id && !isGenerated(n.id)) { parts.unshift('#' + window.CSS.escape(n.id)); break; }
      const sib = n.parentElement ? [...n.parentElement.children].filter((c) => c.tagName === n.tagName) : [];
      if (sib.length > 1) p += `:nth-of-type(${sib.indexOf(n) + 1})`;
      parts.unshift(p);
      try { if (document.querySelectorAll(parts.join(' > ')).length === 1) break; } catch { break; }
      n = n.parentElement;
    }
    return parts.join(' > ');
  }

  // --- value recommendations ---
  function actions(el, type) {
    const out = [];
    const kind = el.tagName === 'SELECT' ? 'select' : el.type === 'checkbox' ? 'checkbox' : el.type === 'radio' ? 'radio' : 'text';
    if (kind === 'checkbox') {
      out.push({ label: t('pick.act.check'), valueType: 'fixed', value: 'true' }, { label: t('pick.act.uncheck'), valueType: 'fixed', value: 'false' });
    } else if (kind === 'select') {
      const opts = [...el.options].filter((o) => o.value && !o.disabled).map((o) => o.text.trim()).filter(Boolean);
      if (el.value && el.selectedOptions[0]) out.push({ label: t('pick.act.keep', { v: el.selectedOptions[0].text.trim().slice(0, 24) }), valueType: 'fixed', value: el.selectedOptions[0].text.trim() });
      if (opts.length > 1) out.push({ label: t('pick.act.some'), valueType: 'list', value: opts.slice(0, 3).join('\n') });
    } else {
      if (type && !['text', 'skip', 'paragraph', 'radio', 'select'].includes(type)) out.push({ label: t('pick.act.type', { type }), valueType: 'type', value: type });
      if (el.value) out.push({ label: t('pick.act.keep', { v: el.value.slice(0, 24) }), valueType: 'fixed', value: el.value });
      if (type === 'email') out.push({ label: t('pick.act.qaMail'), valueType: 'template', value: 'qa+{{string.alphanumeric(6)}}@example.com' });
      if (/phone/.test(type)) out.push({ label: t('pick.act.digits'), valueType: 'regex', value: '[1-9][0-9]{9}' });
      if (type === 'text' || type === 'paragraph') out.push({ label: t('pick.act.words'), valueType: 'faker', value: 'lorem.words(3)' });
      out.push({ label: t('pick.act.list'), valueType: 'list', value: el.value ? el.value + '\n' : '' });
    }
    out.push({ label: t('pick.act.skip'), valueType: 'skip', value: '' });
    return out;
  }

  function openPanel(el) {
    unhook();
    state.bar?.remove();
    state.tag.style.display = 'none';
    const r0 = el.getBoundingClientRect();
    Object.assign(state.box.style, { display: 'block', left: r0.left - 3 + 'px', top: r0.top - 3 + 'px', width: r0.width + 6 + 'px', height: r0.height + 6 + 'px' });
    host.style.pointerEvents = 'none';
    const det = detectType(el);
    const src = getSources(el);
    const locs = locators(el);
    const rec = locs.find((o) => o.rec) || { match: 'css', pattern: '' };
    const acts = actions(el, det.type);
    const firstAct = acts[0];
    const labText = el.labels?.[0]?.textContent.replace(/[*:]/g, '').replace(/\s+/g, ' ').trim();
    const rule = { enabled: true, note: (labText || src.label || el.name || el.id || el.tagName.toLowerCase()).slice(0, 40), match: rec.match, pattern: rec.pattern, valueType: firstAct.valueType, value: firstAct.value };

    const note = h('input', { value: rule.note });
    const match = h('select', {}, ['regex', 'css', 'xpath'].map((m) => h('option', { value: m, textContent: t('pick.m.' + m), selected: m === rule.match })));
    const pattern = h('textarea', { value: rule.pattern, rows: 1 });
    const cnt = h('div', { class: 'count' });
    const vtype = h('select', {}, VALUES.map((v) => h('option', { value: v, textContent: t('v.' + v), selected: v === rule.valueType })));
    const value = h('textarea', { value: rule.value, rows: 2, placeholder: t('sg.ph') });
    const prev = h('div', { class: 'prev' });
    const locBox = h('div', { class: 'loc' });

    const ctx = () => ({ el, profile: state.profile || (state.profile = makeProfile(state.settings.locale, state.settings)), locale: state.settings.locale, signature: det.signature, dateFormat: det.dateFormat, inputType: (el.type || '').toLowerCase() });
    function refresh() {
      Object.assign(rule, { note: note.value, match: match.value, pattern: pattern.value.trim(), valueType: vtype.value, value: value.value });
      const n = rule.pattern ? count(rule.match, rule.pattern, el) : 0;
      cnt.textContent = n < 0 ? t('pick.bad') : n === 0 ? t('pick.none') : n === 1 ? t('pick.unique') : t('pick.many', { n });
      cnt.style.color = n === 1 ? 'var(--ok)' : 'var(--warn)';
      value.disabled = rule.valueType === 'skip';
      if (rule.valueType === 'skip') prev.textContent = t('skipped');
      else { try { prev.textContent = t('example') + ': ' + String(valueFromRule(rule, ctx())).slice(0, 80); } catch (e) { prev.textContent = t('error') + ': ' + e.message; } }
      locBox.querySelectorAll('.opt').forEach((b, i) => b.classList.toggle('on', locs[i].pattern === rule.pattern && locs[i].match === rule.match));
    }
    for (const o of locs) {
      locBox.append(h('button', { class: 'opt', onclick: () => { match.value = o.match; pattern.value = o.pattern; refresh(); } },
        h('span', { class: 'k', textContent: o.match === 'regex' ? t('pick.m.regex') : o.match.toUpperCase() }),
        h('code', { textContent: o.pattern, title: o.pattern }),
        o.rec ? h('span', { class: 'pill rec', textContent: t('pick.rec') }) : h('span', { class: 'pill' + (o.n === 1 ? '' : ' warn'), textContent: o.n === 1 ? t('pick.uniqueShort') : o.n < 1 ? t('pick.noneShort') : '×' + o.n }),
        h('span', { class: 'why', textContent: t(o.why) })));
    }
    [note, pattern, value].forEach((n) => n.addEventListener('input', refresh));
    [match, vtype].forEach((n) => n.addEventListener('change', refresh));

    const tips = [];
    if (el.id && isGenerated(el.id)) tips.push(t('pick.tip.genId', { id: el.id }));
    if (!locs.some((o) => o.n === 1 && !o.fragile)) tips.push(t('pick.tip.noStable'));
    if (rec.match === 'regex') tips.push(t('pick.tip.label'));
    tips.push(t('pick.tip.order'));

    const summary = h('div', { class: 'sum' }, h('code', { textContent: el.tagName.toLowerCase() + (el.type && el.tagName === 'INPUT' ? `[${el.type}]` : '') }), ' ',
      src.label ? `«${src.label.slice(0, 50)}» · ` : '', t('pick.detected'), ' ', h('code', { textContent: det.type }));
    const panel = h('div', { class: 'panel' },
      h('div', { class: 'hd' }, h('b', { textContent: t('pick.title') }), h('button', { class: 'x', textContent: '✕', title: t('pick.cancel'), onclick: cancel })),
      h('div', { class: 'bd' },
        summary,
        h('div', {}, h('h4', { textContent: t('pick.locators') }), locBox),
        h('div', { class: 'row' }, h('label', { textContent: t('rules.match') }), match),
        h('div', { class: 'row' }, h('label', { textContent: t('rules.pattern') }), h('div', {}, pattern, cnt)),
        h('div', {}, h('h4', { textContent: t('pick.actions') }), h('div', { class: 'chips' }, acts.map((x) => h('button', { class: 'chip', textContent: x.label, onclick: () => { vtype.value = x.valueType; value.value = x.value; refresh(); } })))),
        h('div', { class: 'row' }, h('label', { textContent: t('rules.vtype') }), vtype),
        h('div', { class: 'row' }, h('label', { textContent: t('rules.value') }), h('div', {}, value, prev)),
        h('div', { class: 'row' }, h('label', { textContent: t('rules.note') }), note),
        tips.length ? h('div', {}, h('h4', { textContent: t('pick.tips') }), h('ul', { class: 'tips' }, tips.map((x) => h('li', { textContent: x })))) : null),
      h('div', { class: 'ft' },
        h('button', { class: 'btn', textContent: t('pick.again'), onclick: () => start() }),
        h('button', { class: 'btn pri', textContent: t('pick.save'), onclick: save })));
    panel.style.pointerEvents = 'auto';
    root.append(panel);
    state.panel = panel;
    attachSuggest(value, {
      lang: () => uiLang(), locale: () => state.settings.locale, fieldType: () => det.type,
      labels: { hint: t('sg.hint'), none: t('sg.none'), types: Object.fromEntries(VALUES.map((v) => [v, t('v.' + v)])) },
      example: (r) => valueFromRule(r, ctx()),
      onPick: (x) => { vtype.value = x.valueType; refresh(); },
    });
    place(panel, r0);
    drag(panel);
    refresh();

    async function save() {
      refresh();
      if (!rule.pattern) { pattern.focus(); return; }
      const { settings = {} } = await chrome.storage.local.get('settings');
      const rules = Array.isArray(settings.rules) ? settings.rules : [];
      // a new rule is more specific than general ones — put it first
      rules.unshift({ ...rule });
      await chrome.storage.local.set({ settings: { ...settings, rules } });
      const fresh = await loadSettings();
      cancel();
      await fillOne({ kind: 'field', el }, { ...fresh, refillFilled: true, ignoreFilled: false }).catch(() => 0);
      toast(t('pick.saved'));
    }
  }

  function place(panel, r) {
    const W = Math.min(400, innerWidth - 24); const H = panel.offsetHeight;
    let left = Math.min(Math.max(12, r.left), innerWidth - W - 12);
    let top = r.bottom + 10;
    if (top + H > innerHeight - 12) top = r.top - H - 10;
    if (top < 12) { top = 12; left = r.right + 12 + W < innerWidth ? r.right + 12 : Math.max(12, r.left - W - 12); }
    Object.assign(panel.style, { left: left + 'px', top: top + 'px' });
  }
  function drag(panel) {
    const hd = panel.querySelector('.hd');
    hd.addEventListener('pointerdown', (e) => {
      if (e.target.closest('button')) return;
      const sx = e.clientX - panel.offsetLeft; const sy = e.clientY - panel.offsetTop;
      const mv = (ev) => { panel.style.left = ev.clientX - sx + 'px'; panel.style.top = Math.max(0, ev.clientY - sy) + 'px'; };
      const up = () => { removeEventListener('pointermove', mv, true); removeEventListener('pointerup', up, true); };
      addEventListener('pointermove', mv, true); addEventListener('pointerup', up, true);
    });
  }
  function toast(msg) {
    const [hst, rt] = layer({ theme: 'auto' });
    rt.append(h('div', { class: 'toast', textContent: msg }));
    setTimeout(() => hst.remove(), 2600);
  }

  return { start, stop, active: () => !!state };
}
