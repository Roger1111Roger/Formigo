// Content script: finds fields (including shadow DOM), detects their type and fills them.
import { detectType, matchKeywords, setTypePatterns } from './detect.js';
import { makeProfile, generate, valueFromRule, getFaker, fromRegExp, ensureFakers, setTypeValues } from './generators.js';
import { loadSettings } from './settings.js';
import { KINDS, expectedKinds, isImageKind, canvasImage, documentFile } from './files.js';
import { createPicker } from './picker.js';
import { useUiLang, t } from './i18n.js';

// After an extension update the old script in the tab becomes «orphaned» (chrome.runtime disappears):
// such an instance doesn't block the new one from starting and disables its own handlers
const ffpAlive = () => { try { return !!chrome.runtime?.id; } catch { return false; } };
if (!(window.__fakeFillerPlus && window.__fakeFillerPlus.alive && window.__fakeFillerPlus.alive())) {
  const ffpToken = {};
  window.__fakeFillerPlus = { alive: () => ffpAlive() && window.__fakeFillerPlus?.token === ffpToken, token: ffpToken };
  const current = () => window.__fakeFillerPlus?.token === ffpToken && ffpAlive();

  const FIELD_SEL = 'input, textarea, select, [contenteditable=""], [contenteditable="true"]';
  let lastTarget = null;
  // last field that had focus/click (and when) — «Current field» uses it to pick the frame and element
  let lastFocus = { el: null, t: 0 };

  const deepTarget = (e) => (e.composedPath && e.composedPath()[0]) || e.target;
  document.addEventListener('contextmenu', (e) => { lastTarget = deepTarget(e); }, true);
  document.addEventListener('focusin', (e) => {
    if (!current()) return;
    const t = deepTarget(e);
    lastTarget = t;
    if (t && t.nodeType === 1 && closestField(t)) lastFocus = { el: t, t: Date.now() };
  }, true);
  // click on a custom list or dropzone (they don't receive focus)
  document.addEventListener('pointerdown', (e) => {
    if (!current()) return;
    const t = deepTarget(e);
    if (!t || t.nodeType !== 1 || t.closest?.('[data-ffp-badge]')) return;
    if (closestField(t) || t.closest?.(CUSTOM_DD)) lastFocus = { el: t, t: Date.now() };
  }, true);

  // --- DOM traversal through open shadow roots and same-origin iframes ---
  function collectFields(root, out = []) {
    if (!root) return out;
    root.querySelectorAll(FIELD_SEL).forEach((el) => out.push(el));
    root.querySelectorAll('*').forEach((el) => {
      if (el.shadowRoot) collectFields(el.shadowRoot, out);
    });
    return out;
  }

  function closestField(el) {
    while (el && el.nodeType === 1) {
      if (el.matches(FIELD_SEL)) return el;
      if (el.isContentEditable && el.parentElement && !el.parentElement.isContentEditable) return el;
      el = el.parentElement || (el.getRootNode && el.getRootNode().host) || null;
    }
    return null;
  }

  // Nearest form, crossing shadow DOM boundaries. Without a <form>, take a container with 2+ fields.
  function closestFormRoot(el) {
    let node = el;
    while (node) {
      if (node.tagName === 'FORM') return node;
      const parent = node.parentElement || (node.getRootNode && node.getRootNode().host);
      node = parent || null;
    }
    node = el.parentElement;
    while (node && node !== document.body) {
      if (collectFields(node).length >= 2) return node;
      node = node.parentElement || (node.getRootNode && node.getRootNode().host);
    }
    return document;
  }

  // The element itself is visible: has size, not display:none/visibility:hidden/opacity:0 and not shrunk to 1px
  function styleVisible(el) {
    const r = el.getBoundingClientRect();
    if (!el.getClientRects().length || r.width <= 1 || r.height <= 1) return false;
    const cs = getComputedStyle(el);
    return cs.visibility !== 'hidden' && cs.display !== 'none' && Number(cs.opacity) > 0.01 && !/rect\(0/.test(cs.clip);
  }

  function isVisible(el) {
    if (el.type === 'checkbox' || el.type === 'radio') {
      // custom checkboxes often hide the input itself — check the associated label
      if (el.labels && [...el.labels].some((l) => l.getClientRects().length)) return true;
      // <div class="form-check"><input class="hidden"><label></label><span>Is technician</span></div>
      const p = el.parentElement;
      if (!styleVisible(el) && p && p.getClientRects().length && getComputedStyle(p).visibility !== 'hidden'
        && (p.textContent.trim() || p.querySelector('label'))) return true;
    }
    if (!el.getClientRects().length) return false;
    const cs = getComputedStyle(el);
    return cs.visibility !== 'hidden' && cs.display !== 'none' && Number(cs.opacity) > 0.01;
  }

  function matchesSelectorList(el, list) {
    for (const sel of list) {
      try { if (el.matches(sel)) return true; } catch { /* invalid selector */ }
    }
    return false;
  }

  function matchesXPath(el, xpath) {
    try {
      const doc = el.ownerDocument;
      const res = doc.evaluate(xpath, doc, null, XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null);
      for (let i = 0; i < res.snapshotLength; i++) if (res.snapshotItem(i) === el) return true;
    } catch { /* invalid xpath */ }
    return false;
  }

  function findRule(el, signature, rules) {
    for (const r of rules || []) {
      if (!r.enabled || !r.pattern) continue;
      try {
        if (r.match === 'css' && el.matches(r.pattern)) return r;
        if (r.match === 'xpath' && matchesXPath(el, r.pattern)) return r;
        if (r.match === 'regex' && new RegExp(r.pattern, 'i').test(signature)) return r;
      } catch { /* skip invalid rule */ }
    }
    return null;
  }

  // --- set the value so that React/Vue/Angular notice the change ---
  function nativeSet(el, value) {
    const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype
      : el.tagName === 'SELECT' ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, 'value').set;
    setter.call(el, value);
  }

  const fire = (el, type, Ctor = Event, init = {}) =>
    el.dispatchEvent(new Ctor(type, { bubbles: true, cancelable: true, composed: true, ...init }));

  function setText(el, value, settings) {
    el.focus({ preventScroll: true });
    if (el.isContentEditable && !('value' in el)) {
      el.textContent = value;
      fire(el, 'input', InputEvent, { inputType: 'insertText', data: value });
    } else if (settings.typeChars) {
      nativeSet(el, '');
      fire(el, 'input');
      let cur = '';
      for (const ch of value) {
        fire(el, 'keydown', KeyboardEvent, { key: ch });
        fire(el, 'keypress', KeyboardEvent, { key: ch });
        cur += ch;
        nativeSet(el, cur);
        fire(el, 'input', InputEvent, { inputType: 'insertText', data: ch });
        fire(el, 'keyup', KeyboardEvent, { key: ch });
      }
    } else {
      nativeSet(el, value);
      fire(el, 'input', InputEvent, { inputType: 'insertText', data: value });
    }
    fire(el, 'change');
    // if the window is unfocused (a popup is open), blur() fires no events — Angular won't mark the field touched
    let blurred = false;
    const onBlur = () => { blurred = true; };
    el.addEventListener('blur', onBlur, { once: true });
    el.blur();
    el.removeEventListener('blur', onBlur);
    if (!blurred) fire(el, 'blur', FocusEvent, { bubbles: false });
    fire(el, 'focusout', FocusEvent);
  }

  // --- files: user's test files from settings or generated ones (PNG 15×15, PDF, TXT) ---
  // input[type=file] in dropzones is usually hidden — check whether the zone itself is visible
  function fileZoneVisible(el) {
    let n = el;
    for (let i = 0; i < 4 && n; i++, n = n.parentElement) if (n.getClientRects().length && getComputedStyle(n).visibility !== 'hidden') return true;
    return false;
  }

  function acceptMatches(accept, type, name) {
    if (!accept) return true;
    return accept.split(',').map((a) => a.trim().toLowerCase()).some((a) => a === '*/*' || (a.endsWith('/*') ? type.startsWith(a.slice(0, -1)) : a.startsWith('.') ? name.toLowerCase().endsWith(a) : a === type));
  }

  function dataUrlToFile(f) {
    const [meta, b64] = f.dataUrl.split(',');
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new File([bytes], f.name, { type: f.type || meta.slice(5, meta.indexOf(';')) });
  }

  // «Document» image: draw a card with data from the current fill profile (no network)
  async function documentImage(profile, mime) {
    const c = document.createElement('canvas');
    c.width = 640; c.height = 400;
    const g = c.getContext('2d');
    const hue = Math.floor(Math.random() * 360);
    g.fillStyle = `hsl(${hue} 45% 92%)`; g.fillRect(0, 0, 640, 400);
    g.fillStyle = `hsl(${hue} 50% 35%)`; g.fillRect(0, 0, 640, 64);
    g.fillStyle = '#fff'; g.font = 'bold 28px sans-serif'; g.fillText('IDENTITY CARD', 24, 43);
    g.fillStyle = '#cbd5e1'; g.fillRect(24, 96, 170, 210);
    g.fillStyle = '#94a3b8'; g.beginPath(); g.arc(109, 170, 42, 0, 7); g.fill(); g.fillRect(52, 230, 114, 76);
    g.fillStyle = '#111827'; g.font = '16px sans-serif';
    const rows = [['Surname', profile.lastName], ['Given names', profile.firstName], ['Date of birth', profile.birthDate.toISOString().slice(0, 10)],
      ['Sex', profile.sex === 'male' ? 'M' : 'F'], ['Document No', String(Math.floor(1e9 + Math.random() * 9e9))], ['Expiry', `${new Date().getFullYear() + 5}-12-31`]];
    rows.forEach(([k, v], i) => { g.fillStyle = '#6b7280'; g.font = '13px sans-serif'; g.fillText(k.toUpperCase(), 220, 110 + i * 46); g.fillStyle = '#111827'; g.font = 'bold 19px sans-serif'; g.fillText(v, 220, 130 + i * 46); });
    g.save(); g.translate(430, 330); g.rotate(-0.25); g.fillStyle = 'rgba(220,38,38,.35)'; g.font = 'bold 40px sans-serif'; g.fillText('SPECIMEN', 0, 0); g.restore();
    const blob = await new Promise((r) => c.toBlob(r, mime, 0.9));
    return new File([blob], `test-document-${Math.random().toString(36).slice(2, 6)}.${mime === 'image/png' ? 'png' : 'jpg'}`, { type: mime });
  }

  const FACE_RE = /selfie|face|portrait|avatar|userpic|profile.?(photo|pic|image)|client.{0,10}photo|photo of|фото(графи)?|аватар|лиц[оа]|селфи/i;
  const DOC_RE = /document|passport|(?<![a-z])id(?![a-z])|identity|licen[cs]e|front|back.?side|reverse|card|certificate|паспорт|документ|удостовер|права|разворот|лицевая|оборот|скан/i;

  // Dropzone text near the input (inputs often share the same id, and label[for] is unreliable)
  function zoneText(el) {
    let local = '';
    for (let n = el.parentElement, i = 0; n && i < 3 && !local; n = n.parentElement, i++) {
      if (n.querySelectorAll('input[type=file]').length > 1) break;
      local = (n.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 300);
    }
    return local;
  }

  // Re-encode the image to the needed format (network photos arrive as JPEG, but the field expects PNG)
  async function reencode(file, mime) {
    if (file.type === mime) return file;
    const bmp = await createImageBitmap(file);
    const c = document.createElement('canvas');
    c.width = bmp.width; c.height = bmp.height;
    c.getContext('2d').drawImage(bmp, 0, 0);
    const blob = await new Promise((r) => c.toBlob(r, mime, 0.9));
    return new File([blob], file.name.replace(/\.[^.]+$/, '.' + mime.split('/')[1].replace('jpeg', 'jpg')), { type: mime });
  }

  async function smartImage(el, profile, mime) {
    const local = zoneText(el);
    const sig = detectType(el).signature;
    const isFace = FACE_RE.test(local) || (!DOC_RE.test(local) && FACE_RE.test(sig) && !DOC_RE.test(sig));
    const isDoc = !isFace && (DOC_RE.test(local) || DOC_RE.test(sig));
    if (isDoc) return reencode(await documentImage(profile, mime === 'image/png' ? 'image/png' : 'image/jpeg'), mime);
    const url = isFace
      ? `https://randomuser.me/api/portraits/${profile.sex === 'male' ? 'men' : 'women'}/${Math.floor(Math.random() * 99)}.jpg`
      : `https://picsum.photos/seed/${Math.floor(Math.random() * 1e6)}/640/480.jpg`;
    const res = await chrome.runtime.sendMessage({ fetchImage: url });
    if (!res || res.error) throw new Error(res?.error || 'нет ответа');
    return reencode(dataUrlToFile({ name: `test-photo-${Math.random().toString(36).slice(2, 6)}.jpg`, type: res.type, dataUrl: res.dataUrl }), mime);
  }

  const fileIsKind = (f, k) => f.type === KINDS[k].mime || new RegExp(`\\.(${k === 'jpg' ? 'jpe?g' : k === 'docx' ? 'docx?' : k === 'xlsx' ? 'xlsx?' : KINDS[k].ext})$`, 'i').test(f.name);

  // Detect the expected format (accept, dropzone text, label) and supply a file in exactly that format
  async function pickFile(el, settings, profile) {
    const accept = el.accept;
    const kinds = expectedKinds(accept, `${zoneText(el)} ${detectType(el).signature}`);
    const { testFiles = [] } = await chrome.storage.local.get('testFiles');
    for (const k of kinds) {
      const own = k === 'any' ? testFiles : testFiles.filter((f) => fileIsKind(f, k));
      if (own.length) return dataUrlToFile(own[Math.floor(Math.random() * own.length)]);
    }
    const ownAny = testFiles.filter((f) => accept && acceptMatches(accept, f.type || '', f.name));
    if (ownAny.length) return dataUrlToFile(ownAny[Math.floor(Math.random() * ownAny.length)]);
    const kind = kinds.find((k) => k !== 'any') || 'jpg';
    if (isImageKind(kind)) {
      if (settings.imageMode === 'smart' && ['jpg', 'png', 'webp'].includes(kind)) {
        try { return await smartImage(el, profile, KINDS[kind].mime); } catch (e) { console.warn('[Formigo] осмысленная картинка недоступна, беру простую', e); }
      }
      return canvasImage(kind);
    }
    return documentFile(kind, profile);
  }

  // A file is already there: in the input itself, in the dropzone list/preview, or we attached it earlier
  // (Angular dropzones often clear the input after upload, so check the nearby list too)
  const attachedByUs = new WeakSet();
  const ATTACHED_SEL = '[class*="upload-list"] > *, [class*="file-list"] > *, [class*="files-list"] > *, [class*="preview"] img, [class*="thumb"], .dz-preview, img[src^="blob:"], img[src^="data:"], [class*="file-item"], [class*="uploaded"]';
  function hasAttachedFile(el) {
    if (el.files && el.files.length) return true;
    if (attachedByUs.has(el)) return true;
    let zone = el.parentElement;
    for (let i = 0; i < 4 && zone; i++) {
      const parent = zone.parentElement;
      if (!parent || parent.querySelectorAll('input[type=file]').length > 1) break;
      zone = parent;
    }
    if (!zone) return false;
    return [...zone.querySelectorAll(ATTACHED_SEL)].some((n) => n.getClientRects().length && (n.tagName === 'IMG' || n.textContent.trim() || n.querySelector('img')));
  }

  async function attachFile(el, settings, shared) {
    const file = await pickFile(el, settings, shared.profile);
    const dt = new DataTransfer();
    dt.items.add(file);
    el.files = dt.files;
    attachedByUs.add(el);
    fire(el, 'input');
    fire(el, 'change');
    return true;
  }

  // Hints like «Exactly 13 digits required», «10 digits», «6 characters» next to the field
  function applyLengthHint(value, signature, ctx) {
    const m = /(?:exactly|ровно|must be|должен быть|только)?\s*(\d{1,3})\s*(digits?|numbers?|цифр[аы]?|chars?|characters?|символ(?:а|ов)?|letters?|букв)/i.exec(signature);
    if (!m) return value;
    const n = Number(m[1]);
    if (!n || n > 200) return value;
    const f = getFaker(ctx.locale);
    if (/digit|number|цифр/i.test(m[2])) {
      const d = value.replace(/\D/g, '');
      return d.length >= n ? d.slice(0, n) : d + f.string.numeric({ length: n - d.length, allowLeadingZeros: true });
    }
    return value.length >= n ? value.slice(0, n) : value + f.string.alphanumeric(n - value.length);
  }

  const NATIONAL_LEN = { 1: 10, 7: 10, 20: 10, 27: 9, 33: 9, 34: 9, 39: 10, 44: 10, 49: 11, 52: 10, 55: 11, 62: 10, 91: 10, 233: 9, 234: 10, 254: 9, 255: 9, 256: 9, 260: 9, 263: 9, 375: 9, 380: 9, 998: 9 };
  function callCodeNear(el) {
    let n = el.parentElement;
    for (let i = 0; i < 5 && n && n !== document.body; i++, n = n.parentElement) {
      const fields = collectFields(n).filter((x) => x !== el && x.type !== 'hidden');
      if (fields.length > 3) break;
      const own = el.closest('.form-group, [class*="form-item"], [class*="field"]');
      const text = [...n.childNodes].filter((c) => !(own && c.contains && c.contains(own))).map((c) => c.textContent || '').join(' ');
      const m = /(?:^|[\s(])\+\s?(\d{1,3})(?!\d)/.exec(text);
      if (m && /code|код|country|стран|prefix|flag/i.test(n.innerHTML)) return Number(m[1]);
    }
    return 0;
  }
  function nationalNumber(f, cc) {
    const len = NATIONAL_LEN[cc] || 9;
    const first = cc === 7 ? '9' : len === 9 ? f.helpers.arrayElement(['6', '7', '8']) : String(f.number.int({ min: 2, max: 9 }));
    return first + f.string.numeric({ length: len - 1, allowLeadingZeros: true });
  }

  // Text of validation hints next to the field (including hidden ng-show ones), e.g. «Must be numeric»
  function numericHint(el) {
    const group = el.closest('.form-group, .form-row, [class*="form-item"], [class*="field"]');
    if (!group || collectFields(group).filter((x) => x.type !== 'hidden').length > 1) return '';
    // only visible hints count: hidden ng-show/ng-hide ones («Must be numeric» for a name) don't
    return [...group.querySelectorAll('small, .help-block, .error, .invalid-feedback, .message, .hint')].filter((n) => n.getClientRects().length).map((n) => n.textContent).join(' ');
  }

  function fitConstraints(el, value, ctx, type) {
    const f = getFaker(ctx.locale);
    // pattern or AngularJS ng-pattern="/^[0-9]+$/"
    let pattern = el.getAttribute && (el.getAttribute('pattern') || el.getAttribute('ng-pattern') || el.getAttribute('data-ng-pattern'));
    if (pattern) { const m = /^\/(.*)\/[a-z]*$/s.exec(pattern.trim()); if (m) pattern = m[1].replace(/^\^/, '').replace(/\$$/, ''); else if (el.hasAttribute('ng-pattern') && !/^[\^\[(\\]/.test(pattern)) pattern = null; }
    if (pattern && el.tagName === 'INPUT') {
      try {
        // first try the same value without formatting: «(733) 223-1367» → «7332231367» for [0-9]+
        const bare = value.replace(/\D/g, '');
        if (!new RegExp(`^(?:${pattern})$`, 'v').test(value)) value = bare && new RegExp(`^(?:${pattern})$`, 'v').test(bare) ? bare : fromRegExp(f, pattern);
      } catch {
        try { if (!new RegExp(`^(?:${pattern})$`).test(value)) value = fromRegExp(f, pattern); } catch { /* ignore */ }
      }
    }
    // numeric keyboard / type=number / «Must be numeric» hint: digits only (phone without country code or formatting)
    const numericOnly = el.inputMode === 'numeric' || el.inputMode === 'decimal' || el.type === 'number'
      || /must be numeric|numbers? only|digits? only|only (numbers|digits)|только цифр/i.test(ctx.signature || '') || /must be numeric|только цифр/i.test(numericHint(el));
    if (numericOnly && /\D/.test(value)) {
      if (type === 'phone') value = value.replace(/^\+\d{1,3}[\s-]?/, '');
      if (!/^-?\d+([.,]\d+)?$/.test(value)) value = value.replace(/\D/g, '');
    }
    if (type === 'phone') {
      // country code is picked separately (a «Call code +27» dropdown) — give a national number of the right length
      const cc = callCodeNear(el);
      if (cc) value = nationalNumber(f, cc);
    }
    if (el.type === 'tel' || type === 'phone') {
      if (el.inputMode === 'tel' && el.maxLength > 0 && el.maxLength < 12) value = value.replace(/\D/g, '');
    }
    const max = el.maxLength;
    if (max > 0 && value.length > max) {
      // for phones/codes with a short maxlength keep digits only
      if (['phone', 'cardNumber', 'snils', 'passport', 'zip'].includes(type)) value = value.replace(/\D/g, '');
      value = value.slice(0, max);
    }
    const min = el.minLength;
    if (min > 0 && value.length < min) {
      while (value.length < min) value += type === 'password' ? 'a1' : ' ' + f.lorem.word();
      if (max > 0) value = value.slice(0, max);
    }
    return value;
  }

  function optionLabel(o) { return (o.textContent + ' ' + o.value).trim().toLowerCase(); }
  const PLACEHOLDER_OPT = /^(select|choose|pick|выбер|выбрать|не выбран|please|all$|все$|любой|none|нет данных|not selected)/i;
  const isPlaceholderOpt = (o) => {
    const t = o.textContent.replace(/[-—–_\s*.]+/g, ' ').trim();
    return o.disabled || o.hidden || o.value === '' || o.value === 'null' || o.value === 'undefined' || t === '' || PLACEHOLDER_OPT.test(t);
  };
  const realOptions = (el) => [...el.options].filter((o) => !isPlaceholderOpt(o));
  const isUnselected = (el) => el.tagName === 'SELECT' && !el.multiple && (el.selectedIndex < 0 || isPlaceholderOpt(el.options[el.selectedIndex])) && realOptions(el).length > 0;

  function fillSelect(el, type, ctx) {
    const f = getFaker(ctx.locale);
    const opts = realOptions(el);
    if (!opts.length) return false;
    let pick = null;
    if (type === 'gender') {
      const re = ctx.profile.sex === 'male' ? /(^|[^a-zа-яё])(m|male|man|муж|м)/i : /(fe|жен|ж(?![a-zа-яё])|^f$|woman)/i;
      pick = opts.find((o) => re.test(optionLabel(o)));
    } else if (type === 'country') {
      const wanted = ctx.locale === 'ru' ? /россия|russia|^ru$/i : /united states|usa|^us$/i;
      pick = f.datatype.boolean(0.5) ? opts.find((o) => wanted.test(optionLabel(o))) : null;
    }
    if (el.multiple) {
      opts.forEach((o) => { o.selected = false; });
      f.helpers.arrayElements(opts, { min: 1, max: Math.min(3, opts.length) }).forEach((o) => { o.selected = true; });
    } else {
      pick = pick || f.helpers.arrayElement(opts);
      nativeSet(el, pick.value);
    }
    fire(el, 'input');
    fire(el, 'change');
    fire(el, 'blur', FocusEvent, { bubbles: false });
    return true;
  }

  const AGREE = /agree|terms|consent|accept|privacy|policy|gdpr|соглас|принима|услови|политик|оферт|персональн/i;
  const DATE_TYPES = new Set(['date', 'birthDate', 'pastDate', 'futureDate', 'recentDate', 'datetime', 'cardExpiry', 'month', 'time']);
  const DATEPICKER_HINT = /date|picker|calendar|flatpickr|datetimepicker/i;

  function looksLikeDatepicker(el, type) {
    if (DATE_TYPES.has(type)) return true;
    const attrs = [...el.attributes].map((a) => a.name + '=' + a.value).join(' ');
    return DATEPICKER_HINT.test(attrs) || DATEPICKER_HINT.test(el.parentElement?.className || '');
  }

  // A hidden input (class="hidden") is often toggled by clicking a visible «box» next to it (label/span)
  // that the framework listens to: click it first, wait for a re-render, and only then the input itself
  function checkboxProxy(el) {
    if (styleVisible(el)) return null;
    if (el.labels && el.labels.length) return null; // label[for] toggles the input itself
    const p = el.parentElement;
    if (!p) return null;
    return [...p.children].find((c) => c !== el && c.getClientRects().length && /^(LABEL|SPAN|I|DIV)$/.test(c.tagName)) || null;
  }
  async function setChecked(el, want) {
    if (el.checked === want) return;
    const proxy = checkboxProxy(el);
    if (proxy) {
      clickLike(proxy);
      await sleep(60);
      if (el.checked === want) return;
    }
    el.click();
    await sleep(0);
    if (el.checked !== want) { el.checked = want; fire(el, 'input'); fire(el, 'change'); }
  }

  function flash(el) {
    const prev = el.style.outline;
    el.style.outline = '2px solid #6f9a78';
    setTimeout(() => { el.style.outline = prev; }, 1200);
  }

  // Open modal (Bootstrap/ngb, MUI, Ant, <dialog>) — fill only it, not the page beneath
  const MODAL_SEL = '[aria-modal="true"], dialog[open], [role="dialog"], [role="alertdialog"], .modal.show, ngb-modal-window, .ant-modal-wrap, .MuiDialog-root, .el-dialog__wrapper, .v-dialog--active';
  const OVERLAY_CLASS = /(^|[\s_-])(modal|dialog|drawer|offcanvas|popup|overlay|sidebar-right|side-panel|lightbox)([\s_-]|$)/i;

  function deepElementFromPoint(x, y) {
    let n = document.elementFromPoint(x, y);
    while (n && n.shadowRoot) { const d = n.shadowRoot.elementFromPoint(x, y); if (!d || d === n) break; n = d; }
    return n;
  }
  const containsDeep = (box, n) => { while (n) { if (box.contains(n)) return true; n = n.getRootNode && n.getRootNode().host; } return false; };

  // How many visible fields of the container are really «on top» (not covered by another window/backdrop) and how many were checked
  function onTopScore(box) {
    const fields = collectFields(box).filter(isVisible).slice(0, 8);
    let tested = 0;
    let top = 0;
    for (const el of fields) {
      const target = el.getClientRects().length ? el : el.parentElement;
      const r = target.getBoundingClientRect();
      const x = r.left + Math.min(r.width / 2, 10);
      const y = r.top + r.height / 2;
      if (r.width < 1 || x < 0 || y < 0 || x >= innerWidth || y >= innerHeight) continue;
      tested++;
      const hit = deepElementFromPoint(x, y);
      if (hit && containsDeep(box, hit)) top++;
    }
    return { tested, top, fields: fields.length };
  }

  function zIndexOf(el) {
    let z = 0;
    for (let n = el; n && n.nodeType === 1; n = n.parentElement) {
      const cs = getComputedStyle(n);
      if (cs.position !== 'static' && cs.zIndex !== 'auto') z = Math.max(z, Number(cs.zIndex) || 0);
    }
    return z;
  }

  // Window open over the page: candidates by roles/classes and fixed layers; the one whose fields aren't covered wins
  function activeModal() {
    const cands = new Set(document.querySelectorAll(MODAL_SEL));
    for (const el of document.body ? document.body.querySelectorAll('div, section, aside, form') : []) {
      const cls = typeof el.className === 'string' ? el.className : '';
      if (!OVERLAY_CLASS.test(cls) && !OVERLAY_CLASS.test(el.id || '')) continue;
      const pos = getComputedStyle(el).position;
      if (pos === 'fixed' || pos === 'absolute' || /modal|dialog/i.test(cls)) cands.add(el);
    }
    let best = null;
    for (const m of cands) {
      if (!m.getClientRects().length || m === document.body) continue;
      const cs = getComputedStyle(m);
      if (cs.visibility === 'hidden' || cs.display === 'none' || Number(cs.opacity) < 0.05) continue;
      const sc = onTopScore(m);
      if (!sc.fields) continue;
      // all checked fields are covered — the window is under another window (or moved off-screen)
      if (sc.tested && !sc.top) continue;
      const rank = [sc.tested ? sc.top / sc.tested : 0.5, zIndexOf(m), -sc.fields];
      if (!best || rank[0] > best.rank[0] || (rank[0] === best.rank[0] && (rank[1] > best.rank[1]
        || (rank[1] === best.rank[1] && (m.contains(best.m) || (!best.m.contains(m) && best.m.compareDocumentPosition(m) & Node.DOCUMENT_POSITION_FOLLOWING))))))
        best = { m, rank };
    }
    if (!best) return null;
    // skip a «window» that contains all fields of the page (an app wrapper) — that's not a modal
    const all = collectFields(document).filter(isVisible).length;
    const inBox = collectFields(best.m).filter(isVisible).length;
    if (inBox >= all && !best.m.matches(MODAL_SEL)) return null;
    return best.m;
  }

  // --- custom dropdowns (ngbDropdown, ng-select, mat-select, Ant, MUI, role=combobox) ---
  const CUSTOM_DD = '.chosen-container, .select2-container, .bootstrap-select, [ngbdropdown], [role="combobox"]:not(input), ng-select, mat-select, .ant-select, .MuiSelect-select, .v-select, .vs__dropdown-toggle, .p-dropdown, .el-select, .choices';
  const CUSTOM_OPT = '.chosen-results li.active-result, .select2-results__option, .bootstrap-select .dropdown-menu li:not(.disabled) a, [role="option"], .dropdown-menu li, .dropdown-item, .ng-option, mat-option, .ant-select-item-option, .MuiMenuItem-root, .vs__dropdown-option, .p-dropdown-item, .el-select-dropdown__item, .choices__item--choice';
  const DD_PLACEHOLDER = /^(select( all)?|clear( all)?|not selected|none|all|выбрать( все)?|очистить|не выбрано|все|--.*)$/i;

  const inCustomDropdown = (el) => !!(el.closest && el.closest(CUSTOM_DD));

  function customDropdowns(scope) {
    const root = scope.querySelectorAll ? scope : document;
    return [...root.querySelectorAll(CUSTOM_DD)].filter((c) => {
      if (c.parentElement && c.parentElement.closest(CUSTOM_DD)) return false; // nested
      if (!c.getClientRects().length) return false;
      if (c.querySelector('select')) return false; // native select is handled separately
      // only «fields»: containing an input or a selection area, not a navigation menu of links
      return !!c.querySelector('input, .select-input, [class*="select"], [class*="placeholder"], [class*="value"]') || c.matches('mat-select, [role="combobox"], .MuiSelect-select');
    });
  }

  function clickLike(el) {
    for (const t of ['pointerdown', 'mousedown', 'pointerup', 'mouseup']) fire(el, t, t.startsWith('pointer') ? PointerEvent : MouseEvent);
    el.click();
  }

  function visibleOptions(c) {
    let opts = [...c.querySelectorAll(CUSTOM_OPT)];
    const ctl = c.getAttribute('aria-controls') || c.querySelector('[aria-controls]')?.getAttribute('aria-controls');
    if (ctl) { const lb = document.getElementById(ctl); if (lb) opts = opts.concat([...lb.querySelectorAll(CUSTOM_OPT + ', li')]); }
    if (!opts.filter((o) => o.getClientRects().length).length) {
      // menu portaled to body (overlay): take the last visible listbox
      const boxes = [...document.querySelectorAll('.select2-container--open .select2-results, [role="listbox"], .cdk-overlay-pane, .ant-select-dropdown, .MuiPopover-paper, .dropdown-menu.show, .p-dropdown-panel, .el-select-dropdown')].filter((b) => b.getClientRects().length);
      if (boxes.length) opts = [...boxes[boxes.length - 1].querySelectorAll(CUSTOM_OPT + ', li')];
    }
    return [...new Set(opts)].filter((o) => o.getClientRects().length && !o.querySelector('a[href]') && !o.closest('a[href]')
      && o.getAttribute('aria-disabled') !== 'true' && !/disabled/.test(o.className) && !DD_PLACEHOLDER.test(o.textContent.trim()));
  }

  async function fillCustomDropdowns(scope, settings, shared, list = null) {
    let count = 0;
    for (const c of list || customDropdowns(scope)) {
      if (!list && shared.processed.has(c)) continue;
      shared.processed.add(c);
      try {
        const input = c.querySelector('input');
        if (input && matchesSelectorList(input, shared.ignore)) continue;
        let shown = (c.querySelector('.label, [class*="value"], [class*="selected"], .chosen-single:not(.chosen-default) span, .select2-selection__rendered')?.textContent || input?.value || '').trim();
        if (DD_PLACEHOLDER.test(shown) || /^-*\s*(select|выбер)/i.test(shown)) shown = '';
        if (settings.ignoreFilled && shown && !list) continue;
        const toggle = c.querySelector('.chosen-single, .chosen-choices, .select2-selection, [ngbdropdowntoggle], [ngbdropdownanchor], .dropdown-toggle, [aria-haspopup], .ng-select-container, .ant-select-selector, .vs__dropdown-toggle, .p-dropdown-trigger') || c;
        clickLike(toggle);
        await sleep(200);
        const opts = visibleOptions(c);
        if (!opts.length) { if (toggle.getAttribute('aria-expanded') === 'true') clickLike(toggle); continue; }
        const sig = input ? detectType(input).signature : sectionTextOf(c);
        let pick = null;
        if (/gender|sex|(?<![a-zа-яё])пол(?![а-яё])/i.test(sig)) {
          const re = shared.profile.sex === 'male' ? /^(m|male|man|муж.*|мужской)$/i : /^(f|female|woman|жен.*|женский)$/i;
          pick = opts.find((o) => re.test(o.textContent.trim()));
        }
        pick = pick || opts[Math.floor(Math.random() * opts.length)];
        pick.scrollIntoView?.({ block: 'nearest' });
        clickLike(pick);
        await sleep(80);
        if (toggle.getAttribute('aria-expanded') === 'true') clickLike(toggle);
        if (settings.highlight) flash(c);
        count++;
      } catch (err) {
        console.warn('[Formigo] кастомный список', c, err);
      }
    }
    return count;
  }
  const sectionTextOf = (c) => (c.closest('.form-group, [class*="field"], [class*="form-item"]')?.textContent || '').slice(0, 200);

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  // Fill a list of fields. shared: common profile and tracking of already processed fields
  async function fillList(fields, settings, shared, single) {
    const { profile, locale, ignore, processed } = shared;
    const radioGroups = new Map();
    let count = 0;

    for (const el of fields) {
      try {
        processed.add(el);
        if (el.disabled) continue;
        if (el.type === 'file') {
          if (settings.fillFiles && (single || !hasAttachedFile(el)) && !matchesSelectorList(el, ignore) && (single || fileZoneVisible(el))) {
            if (await attachFile(el, settings, shared)) { count++; if (settings.highlight) flash(el.parentElement || el); }
          }
          continue;
        }
        if (!single && el.tagName === 'INPUT' && !['checkbox', 'radio'].includes(el.type) && inCustomDropdown(el)) continue;
        if (!single && settings.ignoreHidden && !isVisible(el)) continue;
        if (matchesSelectorList(el, ignore)) continue;
        const { type: detected, signature, dateFormat } = detectType(el);
        const ctx = { el, profile, locale, signature, dateFormat, inputType: (el.type || '').toLowerCase() };
        if (el.readOnly && !(settings.fillReadonlyDates && el.tagName === 'INPUT' && looksLikeDatepicker(el, detected))) continue;
        const rule = findRule(el, signature, settings.rules);
        if (rule && rule.valueType === 'skip') continue;

        if (detected === 'radio') {
          if (!el.name && !single) continue;
          const key = el.name || '__single';
          if (!radioGroups.has(key)) radioGroups.set(key, []);
          radioGroups.get(key).push({ el, rule, ctx });
          continue;
        }
        if (detected === 'checkbox') {
          let want;
          if (rule) want = /^(1|true|yes|on|да)$/i.test(valueFromRule(rule, ctx));
          else if (settings.agreeAlways && AGREE.test(signature)) want = true;
          else if (single) want = !el.checked;
          else want = settings.checkboxMode === 'check' ? true : settings.checkboxMode === 'uncheck' ? false : Math.random() < 0.5;
          await setChecked(el, want);
          if (settings.highlight) flash(el);
          count++;
          continue;
        }
        if (el.tagName === 'SELECT') {
          if (!single && settings.ignoreFilled && !isUnselected(el) && el.value) continue;
          let ok = false;
          if (rule) {
            const v = String(valueFromRule(rule, ctx)).toLowerCase();
            const o = [...el.options].find((x) => x.value.toLowerCase() === v || x.textContent.trim().toLowerCase() === v);
            if (o) { nativeSet(el, o.value); fire(el, 'input'); fire(el, 'change'); ok = true; }
          }
          if (!ok) ok = fillSelect(el, detected, ctx);
          if (ok) { count++; if (settings.highlight) flash(el); }
          continue;
        }
        if (!single && settings.ignoreFilled && (el.value || (el.isContentEditable && el.textContent.trim()))) continue;

        let type = detected;
        if (type === 'skip' && !rule) continue;
        if (type === 'select') type = 'text';
        let value = rule ? String(valueFromRule(rule, ctx)) : generate(type, ctx);
        if (!rule) value = applyLengthHint(value, signature, ctx);
        if (!rule) value = fitConstraints(el, value, ctx, type);
        setText(el, value, settings);
        if (settings.highlight) flash(el);
        count++;
      } catch (err) {
        console.warn('[Formigo] не удалось заполнить', el, err);
      }
    }

    // radio buttons: one per group
    for (const items of radioGroups.values()) {
      const avail = items.filter((i) => !i.el.disabled);
      if (!avail.length) continue;
      let choice = avail.find((i) => i.rule && /^(1|true|yes|on|да)$/i.test(valueFromRule(i.rule, i.ctx)));
      if (!choice && matchKeywords(avail.map((i) => i.ctx.signature).join(' ')) === 'gender') {
        const re = profile.sex === 'male' ? /(?<!fe)male|муж|(?<![a-zа-яё])m(?![a-zа-яё])/i : /female|жен|(?<![a-zа-яё])f(?![a-zа-яё])/i;
        choice = avail.find((i) => re.test(i.el.value + ' ' + i.ctx.signature.split(' | ')[0]));
      }
      choice = choice || avail[Math.floor(Math.random() * avail.length)];
      await setChecked(choice.el, true);
      if (settings.highlight) flash(choice.el);
      count++;
    }
    return count;
  }

  async function fill(scope, settings, { useModal = false } = {}) {
    await ensureFakers(settings.locale);
    const locale = settings.locale;
    if (useModal && settings.modalOnly) {
      const modal = activeModal();
      if (modal) { console.info('[Formigo] открыто окно, заполняю только его:', modal); scope = modal; }
    }
    const shared = {
      locale,
      profile: makeProfile(locale, settings),
      ignore: settings.ignoreSelectors.split('\n').map((s) => s.trim()).filter(Boolean),
      processed: new Set(),
    };
    const single = scope.nodeType === 1 && scope.matches(FIELD_SEL) && scope.tagName !== 'FORM';
    const fields = single ? [scope] : collectFields(scope);
    let count = await fillList(fields, settings, shared, single);
    if (!single) count += await fillCustomDropdowns(scope, settings, shared);
    if (!single) count += await fillChoiceLists(scope, settings);

    // Dependent lists and fields that appear after a choice (make → model, category → body type)
    if (!single && settings.selectRetries) {
      for (let round = 0; round < 4; round++) {
        await sleep(450);
        const more = collectFields(scope).filter((el) => el.isConnected && !el.disabled && isVisible(el)
          && ((el.tagName === 'SELECT' && isUnselected(el)) || (!shared.processed.has(el) && el.tagName !== 'SELECT')));
        const c = (more.length ? await fillList(more, settings, shared, false) : 0) + await fillCustomDropdowns(scope, settings, shared);
        count += c;
        if (!c) break;
      }
    }
    return count;
  }

  // --- tile lists without inputs: a «Let's select all» of divs selected by clicking ---
  const SELECTED = /(^|[\s_-])(selected|active|checked|is-selected|is-active|chosen|picked|on)([\s_-]|$)/i;
  const isChosen = (n) => SELECTED.test(typeof n.className === 'string' ? n.className : '')
    || ['aria-selected', 'aria-checked', 'aria-pressed'].some((a) => n.getAttribute(a) === 'true');
  function choiceLists(scope) {
    const root = scope.querySelectorAll ? scope : document;
    const lists = [];
    for (const c of root.querySelectorAll('div, ul, ol, section')) {
      const items = [...c.children].filter((n) => n.getClientRects().length);
      if (items.length < 3 || items.length > 40) continue;
      const tag = items[0].tagName;
      if (!items.every((n) => n.tagName === tag && !/^(A|BUTTON|INPUT|LABEL|SELECT|TEXTAREA)$/.test(n.tagName))) continue;
      if (!items.every((n) => { const tx = n.textContent.trim(); return tx && tx.length < 60 && !n.querySelector('a, button, input, select, textarea, img, svg'); })) continue;
      if (!items.every((n) => getComputedStyle(n).cursor === 'pointer')) continue;
      if (c.closest('nav, header, footer, menu, [role=menu], [role=tablist], [role=navigation]') || c.closest(CUSTOM_DD)) continue;
      // needs a label like a form field: a label nearby or a .field/.form-group container
      let labelled = false;
      for (let n = c, i = 0; n && i < 4 && !labelled; n = n.parentElement, i++) {
        labelled = !!(n.matches('.field, .form-group, .form-field, fieldset, [role=listbox], [role=group]')
          || [...n.parentElement?.children || []].some((s) => s !== n && s.tagName === 'LABEL'));
      }
      if (labelled && !lists.some((l) => l.contains(c) || c.contains(l))) lists.push(c);
    }
    return lists;
  }
  async function fillChoiceLists(scope, settings) {
    let count = 0;
    for (const list of choiceLists(scope)) {
      const items = [...list.children].filter((n) => n.getClientRects().length);
      const label = (list.closest('.field, .form-group, fieldset') || list.parentElement)?.querySelector('label, legend')?.textContent || '';
      const all = settings.checkboxMode === 'check' || /\b(all|every)\b|все|всё/i.test(label);
      const want = settings.checkboxMode === 'uncheck' ? new Set()
        : new Set(all ? items : items.filter(() => Math.random() < 0.5));
      if (!want.size && settings.checkboxMode !== 'uncheck') want.add(items[Math.floor(Math.random() * items.length)]);
      for (const it of items) {
        if (isChosen(it) === want.has(it)) continue;
        // ctrl/meta — for lists where multi-select requires holding a key
        const init = { ctrlKey: all || want.size > 1, metaKey: false };
        for (const ty of ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click']) fire(it, ty, ty.startsWith('pointer') ? PointerEvent : MouseEvent, init);
        await sleep(30);
      }
      // check that the selection actually changed
      if (items.some(isChosen) || !want.size) { count++; if (settings.highlight) flash(list); }
    }
    return count;
  }

  // --- debug mode: type label above each field ---
  // Labels live in their own layer. The layer is a popover so it lands in the top layer above dialogs
  // that are themselves opened as popover/<dialog> (Angular CDK 19+, native modals): z-index can't get above them.
  let badges = [];
  let badgeLayer = null;
  let badgeTimer = 0;
  let badgeObserver = null;
  let badgeFrame = 0;
  function hideBadges() {
    clearTimeout(badgeTimer);
    cancelAnimationFrame(badgeFrame);
    if (badgeObserver) { badgeObserver.disconnect(); badgeObserver = null; }
    removeEventListener('scroll', scheduleBadgeLayout, true);
    removeEventListener('resize', scheduleBadgeLayout);
    if (badgeLayer) badgeLayer.remove();
    badgeLayer = null;
    badges = [];
  }
  const isBadge = (n) => !!(n && n.nodeType === 1 && n.closest && n.closest('[data-ffp-badge]'));
  function layoutBadges() {
    for (const { b, el } of badges) {
      const host = el.getClientRects().length ? el : el.parentElement;
      const r = host ? host.getBoundingClientRect() : null;
      if (!r || !el.isConnected) { b.style.display = 'none'; continue; }
      b.style.display = '';
      // in the field's top-right corner so it doesn't cover the label on the left
      b.style.left = `${Math.max(0, r.right - b.offsetWidth - 6)}px`;
      b.style.top = `${r.top - 9}px`;
    }
  }
  function scheduleBadgeLayout() {
    cancelAnimationFrame(badgeFrame);
    badgeFrame = requestAnimationFrame(layoutBadges);
  }
  function makeBadgeLayer() {
    const layer = document.createElement('div');
    layer.setAttribute('data-ffp-badge', '');
    Object.assign(layer.style, {
      position: 'fixed', inset: '0', width: '100vw', height: '100vh', maxWidth: 'none', maxHeight: 'none',
      margin: '0', padding: '0', border: '0', background: 'transparent', overflow: 'hidden',
      pointerEvents: 'none', zIndex: 2147483647, color: 'inherit',
    });
    const canPop = typeof layer.showPopover === 'function';
    if (canPop) layer.setAttribute('popover', 'manual');
    (document.body || document.documentElement).appendChild(layer);
    if (canPop) { try { layer.showPopover(); } catch { /* page without top layer */ } }
    return layer;
  }
  function isCovered(el) {
    const host = el.getClientRects().length ? el : el.parentElement;
    const r = host.getBoundingClientRect();
    const x = r.left + Math.min(r.width / 2, 20), y = r.top + r.height / 2;
    if (x < 0 || y < 0 || x > innerWidth || y > innerHeight) return false;
    let hit = document.elementFromPoint(x, y);
    while (hit && hit.shadowRoot) { const inner = hit.shadowRoot.elementFromPoint(x, y); if (!inner || inner === hit) break; hit = inner; }
    if (!hit) return false;
    if (hit === el || containsDeep(el, hit) || containsDeep(hit, el)) return false;
    const lab = hit.closest && hit.closest('label');
    return !(lab && (lab.control === el || containsDeep(lab, el)));
  }
  function toggleDebug() {
    if (badges.length) { hideBadges(); return 0; }
    badgeLayer = makeBadgeLayer();
    for (const el of collectFields(document)) {
      if (!isVisible(el)) continue;
      const { type, debug } = detectType(el);
      const b = document.createElement('div');
      b.textContent = type;
      b.title = debug;
      // field is covered by a window or another layer — label is paler and below visible ones so it isn't mistaken for the window's fields
      const covered = isCovered(el);
      Object.assign(b.style, {
        position: 'absolute', left: '0', top: '0', zIndex: covered ? '1' : '2', opacity: covered ? '0.35' : '1',
        font: '11px/14px monospace', background: /^(skip|text)$/.test(type) ? '#8a8f96' : '#34465a', color: '#fff',
        padding: '0 4px', borderRadius: '3px', pointerEvents: 'auto', cursor: 'help', whiteSpace: 'nowrap',
      });
      badgeLayer.appendChild(b);
      badges.push({ b, el });
    }
    layoutBadges();
    // labels disappear after 10 seconds or on any page change (except our own highlighting)
    badgeTimer = setTimeout(hideBadges, 10000);
    badgeObserver = new MutationObserver((records) => {
      const real = records.some((r) => {
        if (isBadge(r.target)) return false;
        if (r.type === 'childList') return [...r.addedNodes, ...r.removedNodes].some((n) => !isBadge(n));
        return !(r.type === 'attributes' && r.attributeName === 'style');
      });
      if (real) hideBadges();
    });
    badgeObserver.observe(document.documentElement, { subtree: true, childList: true, characterData: true, attributes: true });
    addEventListener('scroll', scheduleBadgeLayout, { capture: true, passive: true });
    addEventListener('resize', scheduleBadgeLayout);
    return badges.length;
  }

  // What exactly to fill for the element under the cursor: a field, a custom list or a file dropzone
  function resolveTarget(t) {
    if (!t || t.nodeType !== 1) return null;
    if (t.hasAttribute && t.hasAttribute('data-ffp-badge')) return null;
    const dd = t.closest && t.closest(CUSTOM_DD);
    if (dd && customDropdowns(dd.parentElement || document).includes(dd)) return { kind: 'dropdown', el: dd };
    const field = closestField(t);
    if (field) return { kind: 'field', el: field };
    let n = t;
    for (let i = 0; i < 5 && n; i++, n = n.parentElement) {
      const files = n.querySelectorAll ? n.querySelectorAll('input[type=file]') : [];
      if (files.length === 1) return { kind: 'field', el: files[0] };
      if (files.length > 1) break;
    }
    return null;
  }

  async function fillOne(target, settings) {
    if (!target) return 0;
    await ensureFakers(settings.locale);
    const shared = {
      locale: settings.locale,
      profile: makeProfile(settings.locale, settings),
      ignore: [],
      processed: new Set(),
    };
    if (target.kind === 'dropdown') return fillCustomDropdowns(document, settings, shared, [target.el]);
    return fillList([target.el], settings, shared, true);
  }

  // Field that has focus/cursor now; if focus moved away (a popup is open) — the last field that had it
  function deepActive() {
    let a = document.activeElement;
    while (a && a.shadowRoot && a.shadowRoot.activeElement) a = a.shadowRoot.activeElement;
    return a && a !== document.body && a !== document.documentElement && a.tagName !== 'IFRAME' ? a : null;
  }
  function focusedTarget() {
    const a = deepActive();
    const t = a && resolveTarget(a);
    if (t) return t;
    return lastFocus.el && lastFocus.el.isConnected ? resolveTarget(lastFocus.el) : null;
  }
  function focusInfo() {
    const a = deepActive();
    const active = !!(a && resolveTarget(a));
    const t = active ? Math.max(lastFocus.t, 1) : lastFocus.el && lastFocus.el.isConnected ? lastFocus.t : 0;
    return { t, active, focused: document.hasFocus() };
  }

  function applyTypeSettings(settings) {
    setTypePatterns(settings.typePatterns);
    setTypeValues(settings.typeValues);
  }

  async function run(action, settings, opts = {}) {
    settings = settings || (await loadSettings());
    // from the context menu — the element under the right click
    const menuEl = opts.fromMenu && lastTarget && lastTarget.isConnected ? lastTarget : null;
    applyTypeSettings(settings);
    // «Fill all» — the whole page, even with a window open; only «Current form» respects the window
    if (action === 'fillAll') return fill(document, settings);
    if (action === 'fillForm') {
      // focus is on the window itself (ngb puts it on ngb-modal-window) or on body — that's not a field
      const act = deepActive();
      const a = menuEl || (act && resolveTarget(act) ? act : null) || (lastFocus.el && lastFocus.el.isConnected ? lastFocus.el : null);
      const modal = settings.modalOnly ? activeModal() : null;
      // focus stayed on the page beneath an open window — fill the window
      if (!a || (modal && !containsDeep(modal, a))) return fill(modal || document, settings, { useModal: true });
      const root = closestFormRoot(a);
      return fill(root, settings, { useModal: root === document });
    }
    if (action === 'fillField') return fillOne((menuEl && resolveTarget(menuEl)) || focusedTarget(), settings);
    if (action === 'debug') return toggleDebug();
    if (action === 'pick') {
      await useUiLang(settings.uiLang);
      const t = menuEl && resolveTarget(menuEl);
      await picker.start(t ? (t.kind === 'dropdown' ? t.el.parentElement?.querySelector('select') || t.el : t.el) : undefined);
      return 1;
    }
    if (action === 'pickStop') { picker.stop(); return 0; }
    return 0;
  }

  const picker = createPicker({ resolveTarget, collectFields: (r) => collectFields(r), fillOne, loadSettings, onStop: () => chrome.runtime.sendMessage({ cmd: 'pickStop' }).catch(() => {}) });

  // --- in-page hotkeys (user-configurable) ---
  let cachedSettings = null;
  loadSettings().then((s) => { cachedSettings = s; });
  chrome.storage.onChanged.addListener((ch) => { if (current() && ch.settings) loadSettings().then((s) => { cachedSettings = s; }); });

  function comboFromEvent(e) {
    // autofill events and synthetic keydowns may lack key/code
    const code = typeof e.code === 'string' ? e.code : '';
    const k = typeof e.key === 'string' ? e.key : '';
    if (!code && !k) return '';
    if (['Control', 'Alt', 'Shift', 'Meta'].includes(k)) return '';
    const key = code.startsWith('Key') ? code.slice(3) : code.startsWith('Digit') ? code.slice(5) : k.length === 1 ? k.toUpperCase() : k || code;
    const mods = [e.ctrlKey && 'Ctrl', e.altKey && 'Alt', e.shiftKey && 'Shift', e.metaKey && 'Meta'].filter(Boolean);
    return [...mods, key].join('+');
  }

  window.addEventListener('keydown', (e) => {
    if (!cachedSettings || !e.isTrusted || !(e instanceof KeyboardEvent) || !current()) return;
    let combo = '';
    try { combo = comboFromEvent(e); } catch { return; }
    if (!combo) return;
    const action = Object.entries(cachedSettings.hotkeys || {}).find(([, v]) => v && v.toLowerCase() === combo.toLowerCase())?.[0];
    if (!action) return;
    e.preventDefault();
    e.stopPropagation();
    // «all fields» and «field types» — in every frame of the tab via background; form and field — in the current frame
    if (action === 'fillAll' || action === 'debug') chrome.runtime.sendMessage({ cmd: action }).catch(() => run(action, cachedSettings));
    else run(action, cachedSettings);
  }, true);

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    (async () => {
      if (msg.focusInfo) return sendResponse(focusInfo());
      if (msg.onlyFocused && !document.hasFocus()) return sendResponse({ count: 0 });
      sendResponse({ count: await run(msg.action, null, { fromMenu: msg.fromMenu }) });
    })();
    return true;
  });
}
