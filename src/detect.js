// Detects the field type from name/id/placeholder/label/aria/autocomplete/type and surrounding text.

// Word boundary for Cyrillic (\b in JS works only with Latin)
const W = (s) => `(?<![a-zа-яё])(?:${s})(?![a-zа-яё])`;
const R = (s) => new RegExp(s, 'i');

// Order matters: more specific types go before general ones.
const DEFAULT_KEYWORD_RULES = [
  ['skip', R(`captcha|капч|recaptcha|csrf|token`)],
  ['divisionCode', R(`код подразд|division.?code|subdivision`)],
  ['issuedBy', R(`кем выдан|issued.?by|issuing.?authority|орган.{0,10}выдав`)],
  ['passportSeries', R(`серия|series`)],
  ['passport', R(`паспорт|passport`)],
  ['idNumber', R(`external.?id|reference.?(id|no|number)|id.?number|national.?id|identity.?(number|card|book)|id.?card|${W('id')} ?(number|no|#)|document.?number|номер документа|удостоверен`)],
  ['birthPlace', R(`место рождения|place.?of.?birth|birth.?place`)],
  ['confirmEmail', R(`(confirm|repeat|retype|verify|again|повтор|подтвер).{0,20}(e-?mail|почт)|(e-?mail|почт).{0,20}(confirm|repeat|again|повтор|подтвер)`)],
  ['email', R(`e-?mail|почт|электронн|${W('mail')}`)],
  ['confirmPassword', R(`(confirm|repeat|retype|verify|again|повтор|подтвер).{0,20}(pass|pwd|парол)|(pass|pwd|парол).{0,20}(confirm|repeat|again|повтор|подтвер|${W('2')})`)],
  ['password', R(`pass(word)?|pwd|парол`)],
  ['otp', R(`one.?time|${W('otp')}|sms.?code|код из смс|код подтвержд|verification code|${W('pin')}`)],
  ['cardNumber', R(`card.?(number|num|no)|cc.?(num|number)|номер карты|${W('pan')}|credit.?card`)],
  ['cardCvv', R(`cvv|cvc|csc|cvn|security.?code|код безопасн`)],
  ['cardExpiry', R(`expir|${W('exp')}|срок действ|mm ?/ ?yy|мм ?/ ?гг`)],
  ['cardHolder', R(`card.?holder|name on card|владел.{0,10}карт|держател`)],
  ['iban', R(`iban`)],
  ['bic', R(`${W('bic')}|${W('бик')}|swift`)],
  ['inn', R(`${W('инн')}|${W('inn')}|tax.?id|${W('tin')}|${W('vat')}`)],
  ['snils', R(`снилс|snils`)],
  ['ogrn', R(`огрн|ogrn`)],
  ['kpp', R(`${W('кпп')}|${W('kpp')}`)],
  ['imei', R(`imei`)],
  ['serialNumber', R(`serial|s/n|${W('sn')}|серийн`)],
  ['macAddress', R(`mac.?addr|${W('mac')}`)],
  ['colorHex', R(`${W('hex')}|#[0-9a-f]{3,6}(?![0-9a-z])|colou?r.?code|код цвета`)],
  ['modelCode', R(`model.?code|product.?code|${W('sku')}|article.?(no|number|code)|артикул|part.?(no|number)|код модели|код товара`)],
  // vehicles
  ['vin', R(`${W('vin')}|chassis|шасси|vehicle.?id|номер кузова|${W('vin.?code')}`)],
  ['carPlate', R(`registration\\s?(#|№|no|num|number|plate)|plate|госномер|гос\\.?\\s?номер|рег.{0,15}знак|${W('vrm')}|licen[cs]e.?plate|номерной знак`)],
  ['engineNumber', R(`engine\\s?(#|№|no|num|number)|номер двигат`)],
  ['engineVolume', R(`engine.?(vol(ume)?|capacity|size|displacement)|объ[её]м двигат|${W('ccm')}|${W('cm3')}|см3|куб`)],
  ['odometer', R(`odometer|mileage|пробег`)],
  ['hour', R(`${W('hours?')}|${W('hh')}|${W('час(ы|ов|а)?')}`)],
  ['minute', R(`${W('minutes?')}|${W('mins?')}|${W('минут[аы]?')}|${W('мин')}`)],
  ['dateDay', R(`${W('day')}|${W('dd')}|${W('день')}|${W('дд')}|birth.?date.?day|date.?day`)],
  ['dateMonth', R(`${W('month')}|${W('mm')}|${W('месяц')}|birth.?date.?month|date.?month`)],
  ['year', R(`${W('year')}|год выпуска|${W('год')}|model.?year|${W('yr')}`)],
  ['make', R(`${W('make')}|brand|manufacturer|${W('марк[аи]')}|производител`)],
  ['carModel', R(`${W('model')}|${W('модел[ьи]')}`)],
  ['bodyType', R(`body.?type|тип кузова|${W('кузов')}`)],
  ['fuel', R(`fuel|топлив`)],
  ['transmission', R(`transmission|gear.?box|кпп авто|коробк|трансмисс`)],
  ['color', R(`colou?r|цвет`)],
  ['entityName', R(`(task|project|item|product|template|rule|group|role|category|campaign|report|job|automation|classifier|status|type|department|team|branch|office|tag|label|title)\\s?name|название|наименование`)],
  ['recentDate', R(`submitted|submission|opened.?on|activation.?date|activated.?on|joined.?on|application.?date|дата подачи|дата заявки|дата активац`)],
  ['futureDate', R(`end.?date|valid.?(until|till|thru|to)|действител.{0,10}до|окончан|due.?date|deadline|expiry.?date|expiration.?date|${W('to.?date')}|дата по`)],
  ['pastDate', R(`registration.?date|issue.?date|issued.?(on|date)|дата выдачи|дата регистрац|start.?date|дата начала|${W('from.?date')}|purchase.?date|дата покупки`)],
  ['fullName', R(`full.?name|${W('фио')}|ф\\.\\s?и\\.\\s?о|имя и фамил|фамилия,? имя|your.?name|contact.?name|${W('name surname')}`)],
  ['middleName', R(`middle.?name|patronymic|отчеств|${W('mname')}`)],
  ['lastName', R(`last.?name|surname|family.?name|${W('lname')}|фамил`)],
  ['firstName', R(`first.?name|given.?name|${W('fname')}|forename|${W('имя')}`)],
  ['username', R(`user.?name|login|логин|никнейм|${W('nick')}|nickname|имя пользовател|учетн|${W('user')}`)],
  ['company', R(`legal.?name|registered.?name|trading.?name|(dealer\\w*|shop|store|merchant|vendor|supplier|partner|agent)\\s?name|company|organi[sz]ation|employer|компани|организац|фирм|business.?name|${W('org')}`)],
  ['jobTitle', R(`job.?title|position|occupation|должност|профессия`)],
  ['birthDate', R(`birth|${W('dob')}|рожден|${W('bday')}|д\\.\\s?р`)],
  ['age', R(`${W('age')}|возраст`)],
  ['gender', R(`gender|${W('sex')}|${W('пол')}`)],
  ['zip', R(`zip|postal|post.?code|postcode|индекс`)],
  ['country', R(`country|стран`)],
  ['state', R(`${W('state')}|region|province|област|регион|${W('край')}`)],
  ['city', R(`city|town|locality|город|населен`)],
  ['street', R(`street|address.?line.?1|addr.?1|улиц`)],
  ['apartment', R(`apart|${W('apt')}|suite|${W('flat')}|квартир|${W('кв')}|address.?line.?2|addr.?2`)],
  ['house', R(`house|building|${W('дом')}|строен|корпус`)],
  ['address', R(`address|адрес`)],
  ['phone', R(`alt\\.?\\s?(number|no)|alternative.?(number|no)|mobile.?no|contact.?(number|no)|whats.?app|phone|${W('tel')}|mobile|${W('cell')}|телеф|мобил|${W('тел')}|msisdn`)],
  ['url', R(`${W('url')}|website|web.?site|homepage|сайт|ссылк|${W('link')}`)],
  ['paragraph', R(`comment|message|description|${W('about')}|${W('bio')}|${W('notes?')}|коммент|сообщен|описан|о себе|отзыв|примечан|${W('текст')}|details|provide|explain|подробн|поясн`)],
  ['subject', R(`subject|${W('title')}|${W('тема')}|заголов`)],
  ['search', R(`search|поиск|${W('query')}|${W('q')}`)],
  ['amount', R(`amount|price|${W('sum')}|сумм|цен[аы]|стоимост|salary|зарплат|${W('cost')}|income|expens|repayment|instal+ment|payment.?for|monthly.?payment|${W('fee')}|turnover|revenue|earnings|доход|расход|платеж|платёж|выручк`)],
  ['quantity', R(`${W('qty')}|quantity|количеств|${W('count')}|${W('кол-во')}|duration|${W('period')}|${W('days')}|${W('term')}|длительн|${W('срок')}|${W('дней')}`)],
  ['date', R(`${W('date')}|${W('дата')}`)],
  ['time', R(`${W('time')}|${W('время')}`)],
  ['fullName', R(`${W('name')}|${W('имя')}|назван|${W('название')}|${W('наименование')}`)],
  // generic words: the final type depends on the form section (card, passport, address…)
  ['genericNumber', R(`номер|number|${W('no')}|№|${W('num')}`)],
  ['genericCode', R(`${W('код')}|${W('code')}`)],
];

// Signs that the form is about a person (then «Name» = full name)
const PERSON_CTX = /user|client|customer|person|contact|employee|member|owner|holder|driver|guarantor|applicant|borrower|profile|sign.?up|account holder|клиент|пользоват|сотрудник|контакт|владел|заём|заем|анкет|получател|отправител/i;

// «Generic word» types: they get lower weight and are refined by section context
const GENERIC = new Set(['fullName', 'genericNumber', 'genericCode', 'date', 'text', 'number']);
const DEFAULT_GENERIC_INDEX = DEFAULT_KEYWORD_RULES.findIndex(([t, re]) => t === 'fullName' && re.source.includes('назван'));
const ruleId = (t, i) => (i === DEFAULT_GENERIC_INDEX ? 'nameGeneric' : t);

// In settings the word boundary is written as \b and internally becomes a Cyrillic-aware check
const WB_START = '(?<![a-zа-яё])(?:';
const WB_END = ')(?![a-zа-яё])';
export function toFriendly(src) {
  let out = '';
  let i = 0;
  while (i < src.length) {
    const at = src.indexOf(WB_START, i);
    if (at < 0) { out += src.slice(i); break; }
    out += src.slice(i, at);
    let depth = 1;
    let j = at + WB_START.length;
    for (; j < src.length && depth; j++) {
      if (src[j] === '\\') { j++; continue; }
      if (src[j] === '(') depth++;
      else if (src[j] === ')') depth--;
    }
    const inner = src.slice(at + WB_START.length, j - 1);
    if (src.startsWith(WB_END.slice(1), j)) {
      let d = 0;
      const topAlt = [...inner].some((c, k) => { if (inner[k - 1] === '\\') return false; if (c === '(') d++; else if (c === ')') d--; return c === '|' && d === 0; });
      out += '\\b' + (topAlt ? `(?:${inner})` : inner) + '\\b';
      i = j + WB_END.length - 1;
    } else { out += src.slice(at, j); i = j; }
  }
  return out;
}
export function fromFriendly(src) {
  return src.replace(/\\b/g, (m, off) => (off === 0 || /[(|]/.test(src[off - 1]) ? '(?<![a-zа-яё])' : '(?![a-zа-яё])'));
}

// Default recognition patterns (for the settings page): id, type, RegExp in readable form
export const DEFAULT_PATTERNS = DEFAULT_KEYWORD_RULES.map(([type, re], i) => ({ id: ruleId(type, i), type, source: toFriendly(re.source) }));
const DEFAULT_FRIENDLY = Object.fromEntries(DEFAULT_PATTERNS.map((p) => [p.id, p.source]));

// Effective rules: defaults + user patterns from settings (typePatterns)
export let KEYWORD_RULES = DEFAULT_KEYWORD_RULES;
let GENERIC_INDEX = DEFAULT_GENERIC_INDEX;
let patternsKey = '';
// map: { id: 'regexp' }. An empty string disables keyword detection; a type without its own rule is added before the generic words
export function setTypePatterns(map) {
  map = map || {};
  const key = JSON.stringify(map);
  if (key === patternsKey) return;
  patternsKey = key;
  const compile = (src, fallback) => { if (src === '') return /(?!)/; try { return R(fromFriendly(src)); } catch { return fallback; } };
  const rules = DEFAULT_KEYWORD_RULES.map(([t, re], i) => {
    const id = ruleId(t, i);
    const src = map[id];
    return [t, src == null || src === DEFAULT_FRIENDLY[id] ? re : compile(src, re)];
  });
  const known = new Set(DEFAULT_PATTERNS.map((p) => p.id));
  const extra = Object.entries(map).filter(([id, src]) => !known.has(id) && src).map(([id, src]) => [id, compile(src, /(?!)/)]);
  rules.splice(DEFAULT_GENERIC_INDEX, 0, ...extra);
  KEYWORD_RULES = rules;
  GENERIC_INDEX = DEFAULT_GENERIC_INDEX + extra.length;
}

const AUTOCOMPLETE = {
  'given-name': 'firstName', 'family-name': 'lastName', 'additional-name': 'middleName', name: 'fullName',
  'honorific-prefix': 'skip', nickname: 'username', username: 'username', email: 'email',
  'new-password': 'password', 'current-password': 'password', 'one-time-code': 'otp',
  organization: 'company', 'organization-title': 'jobTitle',
  'street-address': 'address', 'address-line1': 'street', 'address-line2': 'apartment', 'address-line3': 'apartment',
  'address-level1': 'state', 'address-level2': 'city', country: 'country', 'country-name': 'country',
  'postal-code': 'zip', 'cc-name': 'cardHolder', 'cc-number': 'cardNumber', 'cc-csc': 'cardCvv',
  'cc-exp': 'cardExpiry', bday: 'birthDate', sex: 'gender', url: 'url', tel: 'phone',
  'tel-national': 'phone', 'tel-local': 'phone', 'transaction-amount': 'amount',
};

// Split camelCase / snake_case / kebab-case into words: "userFirstName" -> "user first name"
export function splitWords(s) {
  return String(s || '')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/([A-Za-z])(\d)/g, '$1 $2')
    .replace(/[_\-[\].:]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

// Service/generated parts of id and name say nothing about the field's meaning: mui-12, :r3:, input_5, a1b2c3d4…
const NOISE = /^(\d+|[a-f0-9]{6,}|[a-z]*\d+[a-z\d]*|input|field|form|control|value|text|txt|fld|inp|item|el|ng|mui|ant|v|r|id|auto|generated|basic|default|ctrl|data|form ?item)$/i;
function meaningful(s) {
  return splitWords(s).split(' ').filter((t) => t && !NOISE.test(t)).join(' ');
}

const UI_NOISE = /(^|\s)(clear|очистить|required|обязательно|optional|необязательно|\*)(?=\s|$)/gi;
const clean = (s) => String(s || '').replace(/\*/g, ' ').replace(UI_NOISE, ' ').replace(/\s+/g, ' ').trim().toLowerCase().slice(0, 150);
const FIELD_TAGS = /^(INPUT|SELECT|TEXTAREA|BUTTON|OPTION)$/;

// Node text without field contents, select options, scripts and our labels
function textOf(node, max = 200) {
  if (!node) return '';
  if (node.nodeType === 3) return node.nodeValue;
  let out = '';
  const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT, {
    acceptNode: (n) => (n.nodeType === 1 && (FIELD_TAGS.test(n.tagName) || /^(SCRIPT|STYLE|SVG|NOSCRIPT)$/.test(n.tagName) || n.hasAttribute('data-ffp-badge'))
      ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT),
  });
  while (walker.nextNode() && out.length < max) if (walker.currentNode.nodeType === 3) out += ' ' + walker.currentNode.nodeValue;
  return clean(out);
}

function rootOf(el) { return el.getRootNode ? el.getRootNode() : el.ownerDocument; }
function parentOf(n) { return n.parentElement || (n.getRootNode && n.getRootNode().host) || null; }
function countFields(n) { return n.querySelectorAll ? n.querySelectorAll('input:not([type=hidden]),select,textarea').length : 0; }

export function labelText(el) {
  const out = [];
  const root = rootOf(el);
  if (el.labels && el.labels.length) for (const l of el.labels) out.push(textOf(l));
  else if (el.id && root.querySelector) {
    try { const l = root.querySelector(`label[for="${CSS.escape(el.id)}"]`); if (l) out.push(textOf(l)); } catch { /* ignore */ }
  }
  const lb = el.getAttribute('aria-labelledby');
  if (lb && root.getElementById) {
    for (const id of lb.split(/\s+/)) { const n = root.getElementById(id); if (n) out.push(textOf(n)); }
  }
  return clean(out.join(' '));
}

// «Nearby» label: text in the field wrapper and before it (div grids, Ant/MUI without for, tables)
export function nearbyText(el) { return nearbyInfo(el).text; }

// Returns { text, label }: label=true if the text came from a nearby <label> (label without for, as in Bootstrap/ngb form-group-head)
export function nearbyInfo(el) {
  let node = el;
  const hasLabel = (n) => n.tagName === 'LABEL' || !!(n.querySelector && n.querySelector('label'));
  for (let depth = 0; depth < 5 && node; depth++) {
    // previous siblings without fields
    let sib = node.previousElementSibling;
    const found = [];
    let label = false;
    for (let i = 0; i < 3 && sib; i++, sib = sib.previousElementSibling) {
      if (FIELD_TAGS.test(sib.tagName) || countFields(sib)) break;
      const t = textOf(sib, 160);
      // a long caption in <label> is still a label («Please, tell if you or your close relatives…»)
      if (t && /[a-zа-яё0-9]{2}/i.test(t) && (t.length < 80 || hasLabel(sib))) { found.unshift(t); label = label || hasLabel(sib); }
    }
    if (found.length) return { text: found.join(' | '), label };
    // table cell: column header or the adjacent cell on the left
    if (node.tagName === 'TD') {
      const prev = node.previousElementSibling;
      if (prev && !countFields(prev)) { const t = textOf(prev, 100); if (t) return { text: t, label: false }; }
      const table = node.closest('table');
      const th = table && table.querySelectorAll('thead th')[node.cellIndex];
      if (th) return { text: textOf(th, 100), label: true };
    }
    const parent = parentOf(node);
    if (!parent || parent.tagName === 'FORM' || parent === document.body) break;
    if (countFields(parent) > 1) break; // beyond here are other fields
    const t = textOf(parent, 100);
    // icons and badges next to the field («!», «*», «₽») are not a label — go higher
    if (t && t.length < 80 && /[a-zа-яё0-9]{2}/i.test(t)) return { text: t, label: hasLabel(parent) };
    node = parent;
  }
  return { text: '', label: false };
}

// Hint after the field (aria-describedby, error/help text)
function hintText(el) {
  const root = rootOf(el);
  const ids = (el.getAttribute('aria-describedby') || '').split(/\s+/).filter(Boolean);
  const out = ids.map((id) => textOf(root.getElementById && root.getElementById(id), 100));
  // help/error text right after the field: <div class="message error">Please enter color in HEX format</div>
  let node = el;
  for (let depth = 0; depth < 3 && node; depth++) {
    for (let sib = node.nextElementSibling, i = 0; sib && i < 3; sib = sib.nextElementSibling, i++) {
      if (countFields(sib) || FIELD_TAGS.test(sib.tagName)) break;
      if (/message|hint|help|error|invalid|feedback|description|note/i.test(typeof sib.className === 'string' ? sib.className : '')) out.push(textOf(sib, 120));
    }
    const parent = parentOf(node);
    if (!parent || countFields(parent) > 2) break;
    node = parent;
  }
  return clean(out.join(' '));
}

const HEADING = /^(H[1-6]|LEGEND|CAPTION)$/;
const HEADING_CLASS = /title|header|heading|caption|section|group.?label|subtitle/i;

// Section context: legend, nearest heading above, group aria-label, «telling» container classes
export function sectionText(el) {
  const parts = [];
  let node = el;
  for (let depth = 0; depth < 10 && node && parts.length < 4; depth++) {
    const parent = parentOf(node);
    if (!parent || parent === document.body || parent === document.documentElement) break;
    if (parent.tagName === 'FIELDSET') {
      const lg = parent.querySelector(':scope > legend');
      if (lg) parts.push(textOf(lg, 80));
    }
    const role = parent.getAttribute('role');
    if (parent.getAttribute('aria-label') && (role === 'group' || role === 'region' || role === 'dialog' || parent.tagName === 'SECTION' || parent.tagName === 'FORM')) {
      parts.push(clean(parent.getAttribute('aria-label')));
    }
    // heading among previous siblings
    let sib = node.previousElementSibling;
    for (let i = 0; i < 6 && sib; i++, sib = sib.previousElementSibling) {
      const isHead = HEADING.test(sib.tagName) || sib.getAttribute('role') === 'heading'
        || (HEADING_CLASS.test(sib.className && sib.className.baseVal === undefined ? sib.className : '') && !countFields(sib));
      if (isHead) { const t = textOf(sib, 80); if (t && t.length < 70) { parts.push(t); break; } }
    }
    const cls = meaningful(`${parent.id || ''} ${typeof parent.className === 'string' ? parent.className : ''}`);
    if (SECTION_RE.test(cls)) parts.push(cls.slice(0, 60));
    if (parent.tagName === 'FORM') break;
    node = parent;
  }
  // «whose» form this is: form data-test/id and the modal title (asset-colour-classif, user-add-modal…)
  const form = el.closest && el.closest('form');
  if (form) parts.push(meaningful(`${form.getAttribute('data-test') || ''} ${form.id || ''} ${form.getAttribute('name') || ''}`));
  const dlg = el.closest && el.closest('[role="dialog"], .modal, dialog, ngb-modal-window, .modal-content');
  const title = dlg && dlg.querySelector('.modal-title, [class*="modal-header"] h1, [class*="modal-header"] h2, [class*="modal-header"] h3, [class*="modal-header"] h4, [class*="dialog-title"], h1, h2, h3, h4');
  if (title) parts.push(textOf(title, 80));
  return clean([...new Set(parts.filter(Boolean))].join(' | '));
}

// Section families and how «generic» fields are refined in them
const SECTIONS = [
  ['card', /карт[аыуе]|card|payment|оплат|billing|плат[её]ж/i, { fullName: 'cardHolder', genericNumber: 'cardNumber', date: 'cardExpiry', genericCode: 'cardCvv', number: 'cardNumber' }],
  ['passport', /паспорт|passport|удостоверен|документ|document|identity/i, { genericNumber: 'passportNumber', number: 'passportNumber', date: 'pastDate', genericCode: 'divisionCode' }],
  ['company', /компани|организац|company|organi[sz]ation|юр\.?\s?лиц|юридическ|employer|business|работодател|контрагент|реквизит/i, { fullName: 'company', genericNumber: 'inn', number: 'inn' }],
  ['address', /адрес|address|доставк|shipping|delivery|прожив|регистрац/i, { genericNumber: 'house', number: 'house', fullName: 'street', genericCode: 'zip' }],
  ['contact', /контакт|contact|связ/i, { genericNumber: 'phone', number: 'phone' }],
  ['bank', /банк|bank|счет|счёт|account/i, { genericNumber: 'accountNumber', number: 'accountNumber', genericCode: 'bic', fullName: 'company' }],
  ['vehicle', /автомоб|машин|vehicle|car\b|транспорт/i, { genericNumber: 'carPlate', number: 'carPlate' }],
];
const SECTION_RE = new RegExp(SECTIONS.map(([, re]) => re.source).join('|'), 'i');

// Placeholder masks: "+7 (___) ___-__-__", "dd.mm.yyyy", "0000 0000 0000 0000"
function maskType(ph) {
  if (!ph) return null;
  const p = ph.trim().toLowerCase();
  if (/^(\+\d{1,3}|8)?\s?\(?[_x#9*0]{3}\)?[\s-]?[_x#9*0]{3}[\s-]?[_x#9*0]{2}[\s-]?[_x#9*0]{2}$/.test(p) || /^\+\d[\d\s()-]{8,}$/.test(p)) return { type: 'phone' };
  if (/^(дд|dd|__|00)\.(мм|mm|__|00)\.(гггг|yyyy|____|0000)$/.test(p)) return { type: 'date', dateFormat: 'dd.mm.yyyy' };
  if (/^(мм|mm)\/(дд|dd)\/(гггг|yyyy)$/.test(p)) return { type: 'date', dateFormat: 'mm/dd/yyyy' };
  if (/^(дд|dd)\/(мм|mm)\/(гггг|yyyy)$/.test(p)) return { type: 'date', dateFormat: 'dd/mm/yyyy' };
  if (/^(гггг|yyyy)-(мм|mm)-(дд|dd)$/.test(p)) return { type: 'date', dateFormat: 'yyyy-mm-dd' };
  if (/^[_0x#*]{4}([ -][_0x#*]{4}){3}$/.test(p)) return { type: 'cardNumber' };
  if (/^(mm|мм|__)\s?\/\s?(yy|гг|__)$/.test(p)) return { type: 'cardExpiry' };
  if (/^[_0-9]{3}-[_0-9]{3}-[_0-9]{3}\s[_0-9]{2}$/.test(p)) return { type: 'snils' };
  if (/^\S+@\S+\.\S+$/.test(p)) return { type: 'email' };
  return null;
}

const isSentence = (s) => !!s && (/\?\s*$/.test(s.trim()) || s.trim().split(/\s+/).length > 7);
export function getSources(el) {
  const a = (n) => el.getAttribute(n) || '';
  const near = nearbyInfo(el);
  return {
    label: clean(`${labelText(el)} ${a('aria-label')}`) || (near.label ? near.text : ''),
    attr: meaningful(`${a('name')} ${a('id')} ${a('formcontrolname')} ${a('data-testid') || a('data-test') || a('data-qa') || a('data-cy')} ${a('ng-model') || a('v-model')}`),
    // a question or full sentence as placeholder («Does DevTools ctl+f gives the right count?») isn't a type hint
    placeholder: isSentence(a('placeholder')) ? '' : clean(a('placeholder')),
    title: clean(a('title')),
    nearby: near.label && !clean(`${labelText(el)} ${a('aria-label')}`) ? '' : near.text,
    hint: hintText(el),
    section: sectionText(el),
  };
}

const WEIGHTS = { label: 10, attr: 5, placeholder: 7, nearby: 7, title: 5, hint: 3 };

// Score all types across all sources: the first (most specific) match in a source gets full weight
export function scoreTypes(sources) {
  const scores = {};
  for (const [src, w] of Object.entries(WEIGHTS)) {
    const text = sources[src];
    if (!text) continue;
    let first = true;
    KEYWORD_RULES.forEach(([type, re], idx) => {
      if (!re.test(text)) return;
      const generic = GENERIC.has(type) || idx >= GENERIC_INDEX;
      const v = w * (first ? 1 : 0.25) * (generic ? 0.5 : 1) + (KEYWORD_RULES.length - idx) * 0.001;
      scores[type] = (scores[type] || 0) + v;
      first = false;
    });
  }
  return Object.entries(scores).sort((x, y) => y[1] - x[1]);
}

export function matchKeywords(text) {
  if (!text) return null;
  for (const [type, re] of KEYWORD_RULES) if (re.test(text)) return type;
  return null;
}

function refineBySection(type, section) {
  if (!section) return type;
  for (const [, re, map] of SECTIONS) if (re.test(section) && map[type]) return map[type];
  return type;
}

// Date format from datepicker attributes: datepicker-pop="dd MMMM yyyy", uib-datepicker-popup, data-date-format
function attrDateFormat(el) {
  for (const n of ['datepicker-pop', 'uib-datepicker-popup', 'datepicker-popup', 'data-date-format', 'date-format', 'data-format']) {
    const v = el.getAttribute(n);
    if (v && /(yy|dd|MM)/i.test(v) && !/[{}]/.test(v)) return v.trim();
  }
  return undefined;
}

// Main function: returns { type, signature, debug, dateFormat }
export function detectType(el) {
  const tag = el.tagName;
  const inputType = (el.getAttribute('type') || (tag === 'TEXTAREA' ? 'textarea' : 'text')).toLowerCase();
  const src = getSources(el);
  const signature = [src.label, src.attr, src.placeholder, src.title, src.nearby, src.hint, src.section].filter(Boolean).join(' | ');
  const mask = maskType(el.getAttribute('placeholder'));
  // placeholder mask («yyyy-mm-dd», «+7 (___)») is a format, not meaning: ignored for keywords
  const ranked = scoreTypes(mask ? { ...src, placeholder: '' } : src);
  const out = (type, why) => ({
    type, signature, dateFormat: mask?.dateFormat || attrDateFormat(el),
    debug: `${type} ← ${why}\n` + Object.entries(src).filter(([, v]) => v).map(([k, v]) => `${k}: ${v}`).join('\n')
      + (ranked.length ? '\nоценки: ' + ranked.slice(0, 4).map(([t, s]) => `${t} ${s.toFixed(1)}`).join(', ') : ''),
  });

  if (['hidden', 'submit', 'button', 'reset', 'image', 'file'].includes(inputType)) return out('skip', 'служебный тип');

  // 1. autocomplete — the most reliable signal
  const acTokens = (el.getAttribute('autocomplete') || '').toLowerCase().split(/\s+/).filter((t) => !/^(section-|shipping|billing|home|work|mobile|fax|pager|on|off)/.test(t));
  const ac = acTokens.map((t) => AUTOCOMPLETE[t] || (t.startsWith('tel') ? 'phone' : t.startsWith('cc-exp') ? 'cardExpiry' : null)).find(Boolean);

  // 2. keywords from all sources + mask + section context
  let kw = ranked.length ? ranked[0][0] : null;
  const best = ranked.length ? ranked[0][1] : 0;
  const DATEISH = ['futureDate', 'pastDate', 'recentDate', 'birthDate', 'cardExpiry', 'date', 'dateDay', 'dateMonth', 'year'];
  if (mask && (!kw || GENERIC.has(kw) || (best < 7 && !(mask.type === 'date' && DATEISH.includes(kw))))) kw = mask.type;
  if (!kw || GENERIC.has(kw)) kw = refineBySection(kw || (inputType === 'number' ? 'number' : null), src.section) || kw;
  if (kw === 'genericNumber') kw = inputType === 'number' ? 'number' : 'text';
  if (kw === 'genericCode') kw = /sms|otp|verif|confirm|подтвер|смс/.test(signature) ? 'otp' : 'code';

  // «Registration number» without vehicle signs — an organization/document registration number, not a license plate
  if (kw === 'carPlate' && !/plate|госномер|гос\.?\s?номер|знак|vrm|licen[cs]e/.test(signature)
    && !/vehicle|car(?![a-z])|auto|motor|asset|bike|truck|авто|машин|транспорт|мото/.test(signature)) kw = 'code';

  // «Name» without person signs (color, task, directory form) — it's a title, not a full name
  const SPECIFIC_FULLNAME = KEYWORD_RULES.find(([t]) => t === 'fullName')[1];
  if (kw === 'fullName' && !SPECIFIC_FULLNAME.test(signature) && !PERSON_CTX.test(signature)) kw = 'entityName';

  // color picker or a HEX hint
  const attrNames = [...el.attributes].map((x) => x.name).join(' ');
  if (/(^|\s)cp[a-z]|colorpicker|color-picker/i.test(attrNames) || (el.closest && el.closest('.cp-input-wrapper, color-picker, .color-picker, .pickr'))
    || (kw === 'color' && (/hex|#[0-9a-f]{3,6}/i.test(signature) || el.closest?.('.form-group, form')?.querySelector('[cpoutputformat], .cp-input, input[type=color]')))) kw = 'colorHex';

  // datepicker without the word «date» in the label: «Loan disbursed from / to»
  const pickerHint = `${attrNames} ${typeof el.className === 'string' ? el.className : ''}`;
  if (/datepicker|date-?picker|flatpickr|matdatepicker|daterange/i.test(pickerHint) && !DATEISH.includes(kw)) {
    kw = /(?<![a-z])(from|start|since|begin)(?![a-z])|(?<![а-яё])(с|от)(?![а-яё])|начал/.test(signature) ? 'pastDate'
      : /(?<![a-z])(to|end|until|till)(?![a-z])|(?<![а-яё])(до|по)(?![а-яё])|оконч/.test(signature) ? 'recentDate' : 'date';
  }

  // 3. HTML field type
  switch (inputType) {
    case 'email': return out(kw === 'confirmEmail' ? 'confirmEmail' : 'email', 'type=email');
    case 'password': return out(kw === 'confirmPassword' ? 'confirmPassword' : kw === 'otp' ? 'otp' : 'password', 'type=password');
    case 'tel': return out(['otp', 'cardNumber', 'cardCvv', 'inn', 'snils', 'zip', 'passportNumber', 'passportSeries', 'divisionCode'].includes(kw) ? kw : 'phone', 'type=tel');
    case 'url': return out('url', 'type=url');
    case 'date': return out(['birthDate', 'pastDate', 'recentDate', 'futureDate'].includes(kw) ? kw : 'date', 'type=date');
    case 'datetime-local': return out('datetime', 'type');
    case 'time': return out('time', 'type');
    case 'month': return out('month', 'type');
    case 'week': return out('week', 'type');
    case 'color': return out('color', 'type');
    case 'range': return out('number', 'type');
    case 'checkbox': return out('checkbox', 'type');
    case 'radio': return out('radio', 'type');
    case 'number': return out(['phone', 'age', 'amount', 'quantity', 'zip', 'house', 'apartment', 'otp', 'cardCvv', 'inn', 'passportNumber', 'passportSeries', 'accountNumber', 'cardNumber', 'snils', 'idNumber', 'imei', 'year'].includes(kw) ? kw : 'number', 'type=number');
    default: break;
  }
  if (tag === 'SELECT') return out(ac || kw || 'select', ac ? 'autocomplete' : 'контекст');
  if (ac) return out(ac, 'autocomplete');
  if (kw) return out(kw, mask && kw === mask.type ? 'маска placeholder' : 'подписи и контекст');
  if (tag === 'TEXTAREA' || el.isContentEditable) return out('paragraph', 'многострочное поле');
  return out('text', 'нет подсказок');
}
