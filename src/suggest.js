// Suggestions for the «What to insert» field: the user types in plain words («city», «6 digits», «from 1 to 100»),
// and we offer a ready value — a Faker method, Formigo type, RegExp or template — with a live example
import { TYPE_INFO, NO_VALUE } from './types-info.js';
import { getFaker } from './generators.js';

// [faker value, in Russian, in English, search synonyms]
const FAKER = [
  ['person.firstName', 'Имя', 'First name', 'name given'],
  ['person.lastName', 'Фамилия', 'Last name', 'surname family'],
  ['person.middleName', 'Отчество / второе имя', 'Middle name', 'patronymic'],
  ['person.fullName', 'Имя и фамилия', 'Full name', 'фио name'],
  ['person.jobTitle', 'Должность', 'Job title', 'профессия position occupation'],
  ['person.sex', 'Пол', 'Sex', 'gender'],
  ['person.bio', 'Коротко о себе', 'Short bio', 'about описание'],
  ['internet.email', 'E-mail', 'E-mail', 'почта email mail'],
  ['internet.username', 'Логин', 'Username', 'login ник nickname user'],
  ['internet.password', 'Пароль', 'Password', 'pass secret'],
  ['internet.url', 'Ссылка (URL)', 'URL', 'сайт site link website'],
  ['internet.domainName', 'Домен', 'Domain name', 'host сайт'],
  ['internet.ipv4', 'IP-адрес (v4)', 'IPv4 address', 'ip'],
  ['internet.ipv6', 'IP-адрес (v6)', 'IPv6 address', 'ip'],
  ['internet.mac', 'MAC-адрес', 'MAC address', 'mac'],
  ['internet.userAgent', 'User-Agent браузера', 'User agent', 'браузер browser'],
  ['phone.number', 'Телефон', 'Phone number', 'мобильный mobile tel'],
  ['phone.imei', 'IMEI', 'IMEI', 'imei'],
  ['location.city', 'Город', 'City', 'town населенный'],
  ['location.streetAddress', 'Адрес (улица и дом)', 'Street address', 'address адрес'],
  ['location.street', 'Улица', 'Street', 'street'],
  ['location.buildingNumber', 'Номер дома', 'Building number', 'дом house'],
  ['location.secondaryAddress', 'Квартира / офис', 'Apartment / suite', 'кв офис apt'],
  ['location.zipCode', 'Почтовый индекс', 'Postal code', 'zip индекс postcode'],
  ['location.state', 'Регион / область', 'State / region', 'область штат province'],
  ['location.country', 'Страна', 'Country', 'country'],
  ['location.countryCode', 'Код страны', 'Country code', 'iso'],
  ['location.latitude', 'Широта', 'Latitude', 'координаты coordinates gps'],
  ['location.longitude', 'Долгота', 'Longitude', 'координаты coordinates gps'],
  ['location.timeZone', 'Часовой пояс', 'Time zone', 'timezone'],
  ['company.name', 'Компания', 'Company', 'организация фирма organization employer'],
  ['company.catchPhrase', 'Слоган', 'Catch phrase', 'slogan девиз'],
  ['commerce.productName', 'Название товара', 'Product name', 'товар продукт product item'],
  ['commerce.price', 'Цена', 'Price', 'стоимость cost сумма'],
  ['commerce.department', 'Отдел / категория', 'Department', 'категория category'],
  ['commerce.isbn', 'ISBN', 'ISBN', 'книга book'],
  ['finance.amount', 'Сумма', 'Amount', 'деньги money доход income'],
  ['finance.iban', 'IBAN', 'IBAN', 'счет account bank'],
  ['finance.bic', 'БИК / SWIFT', 'BIC / SWIFT', 'swift bank банк'],
  ['finance.creditCardNumber', 'Номер карты', 'Card number', 'карта credit card'],
  ['finance.creditCardCVV', 'CVV карты', 'Card CVV', 'cvc'],
  ['finance.accountNumber', 'Номер счёта', 'Account number', 'счет bank'],
  ['finance.currencyCode', 'Код валюты', 'Currency code', 'валюта currency usd'],
  ['finance.transactionDescription', 'Описание платежа', 'Transaction description', 'платеж payment'],
  ['date.past', 'Дата в прошлом', 'Past date', 'дата date прошлое'],
  ['date.future', 'Дата в будущем', 'Future date', 'дата date будущее срок'],
  ['date.recent', 'Недавняя дата', 'Recent date', 'дата date вчера'],
  ['date.birthdate', 'Дата рождения', 'Birth date', 'рождения birthday др'],
  ['date.month', 'Название месяца', 'Month name', 'месяц'],
  ['date.weekday', 'День недели', 'Weekday', 'неделя'],
  ['string.uuid', 'UUID', 'UUID', 'guid id идентификатор'],
  ['string.alphanumeric(10)', 'Буквы и цифры (10)', 'Letters and digits (10)', 'код code токен token'],
  ['string.numeric(6)', 'Цифры (6)', 'Digits (6)', 'число number код code'],
  ['string.alpha(8)', 'Буквы (8)', 'Letters (8)', 'буквы letters'],
  ['number.int({"min":1,"max":100})', 'Целое от 1 до 100', 'Integer 1–100', 'число number количество quantity'],
  ['number.float({"min":0,"max":100,"fractionDigits":2})', 'Дробное число', 'Decimal number', 'число number float'],
  ['datatype.boolean', 'Да / нет', 'True / false', 'boolean bool true false'],
  ['lorem.word', 'Слово', 'Word', 'текст text'],
  ['lorem.words(3)', 'Несколько слов', 'A few words', 'текст text'],
  ['lorem.sentence', 'Предложение', 'Sentence', 'текст text фраза'],
  ['lorem.paragraph', 'Абзац текста', 'Paragraph', 'текст комментарий описание comment description'],
  ['color.human', 'Цвет (название)', 'Color name', 'цвет colour'],
  ['color.rgb', 'Цвет HEX', 'Color HEX', 'цвет hex colour'],
  ['image.url', 'Ссылка на картинку', 'Image URL', 'изображение фото photo picture'],
  ['vehicle.vin', 'VIN', 'VIN', 'авто машина car'],
  ['vehicle.manufacturer', 'Марка авто', 'Car make', 'машина car brand'],
  ['vehicle.model', 'Модель авто', 'Car model', 'машина car'],
  ['vehicle.vrm', 'Госномер', 'License plate', 'номер машины plate'],
  ['vehicle.fuel', 'Топливо', 'Fuel', 'бензин'],
  ['animal.dog', 'Порода собаки', 'Dog breed', 'животное animal'],
  ['book.title', 'Название книги', 'Book title', 'книга'],
  ['food.dish', 'Блюдо', 'Dish', 'еда food'],
  ['word.noun', 'Существительное', 'Noun', 'слово word'],
  ['system.fileName', 'Имя файла', 'File name', 'файл file'],
  ['system.mimeType', 'MIME-тип', 'MIME type', 'файл file'],
  ['git.commitSha', 'Хеш коммита', 'Commit hash', 'sha hash'],
  ['airline.flightNumber', 'Номер рейса', 'Flight number', 'рейс flight'],
];

const norm = (s) => String(s).toLowerCase().replace(/ё/g, 'е');
// camelCase → words: zipCode → zip code
const words = (s) => norm(String(s).replace(/([a-z])([A-Z])/g, '$1 $2').replace(/[._()]/g, ' '));

let catalog = null;
function getCatalog() {
  if (catalog) return catalog;
  catalog = [
    ...FAKER.map(([v, ru, en, kw]) => ({ valueType: 'faker', value: v, ru, en, hay: words([v, ru, en, kw].join(' ')), w: 3 })),
    ...TYPE_INFO.filter(([id]) => !NO_VALUE.has(id) && id !== 'text').map(([id, ru, en]) => ({ valueType: 'type', value: id, ru, en, hay: words([id, ru, en].join(' ')), w: 2 })),
    { valueType: 'template', value: 'qa+{{string.alphanumeric(6)}}@example.com', ru: 'Тестовая почта qa+…@example.com', en: 'Test e-mail qa+…@example.com', hay: words('email почта mail тест test qa'), w: 2 },
    { valueType: 'template', value: '{{profile.firstName}} {{profile.lastName}}', ru: 'Имя и фамилия из одного профиля', en: 'First and last name of one profile', hay: words('имя фамилия фио name profile профиль'), w: 1 },
    { valueType: 'template', value: 'Тест {{date.recent}}', ru: 'Текст с датой: «Тест 2026-…»', en: 'Text with a date: “Test 2026-…”', hay: words('тест test дата date метка'), w: 1 },
  ];
  return catalog;
}

// all faker methods as a fallback: «zip» finds location.zipCode, «location.» — all methods of the module
let methods = null;
function fakerMethods(f) {
  if (methods) return methods;
  methods = [];
  for (const mod of Object.keys(f)) {
    if (mod.startsWith('_') || ['helpers', 'fakerCore', 'rawDefinitions', 'definitions'].includes(mod)) continue;
    const obj = f[mod];
    if (!obj || typeof obj !== 'object') continue;
    let proto = obj;
    const names = new Set();
    while (proto && proto !== Object.prototype) {
      Object.getOwnPropertyNames(proto).forEach((n) => { if (n !== 'constructor' && !n.startsWith('_') && typeof obj[n] === 'function') names.add(n); });
      proto = Object.getPrototypeOf(proto);
    }
    for (const n of names) methods.push({ valueType: 'faker', value: `${mod}.${n}`, ru: `${mod}.${n}`, en: `${mod}.${n}`, hay: words(`${mod} ${n}`), w: 0 });
  }
  return methods;
}

const N_RE = /^(\d{1,3})\s*(цифр\S*|digits?|чисел|знак\S*|символ\S*|chars?|characters?|букв\S*|letters?)$/;
const RANGE_RE = /^(?:от\s*|from\s*)?(-?\d+)\s*(?:-|–|—|до|to|\.\.)\s*(-?\d+)$/;

// Suggestions built from the query itself: «6 digits», «from 1 to 100», «@company.com», «a, b, c»
function parsed(q, lang) {
  const ru = lang === 'ru';
  const out = [];
  let m = N_RE.exec(q);
  if (m) {
    const n = Number(m[1]);
    if (/^(букв|letter)/.test(m[2])) out.push({ valueType: 'faker', value: `string.alpha(${n})`, ru: `${n} букв`, en: `${n} letters` });
    else if (/^(знак|символ|char)/.test(m[2])) out.push({ valueType: 'faker', value: `string.alphanumeric(${n})`, ru: `${n} символов (буквы и цифры)`, en: `${n} characters (letters and digits)` });
    else {
      out.push({ valueType: 'regex', value: `[1-9][0-9]{${Math.max(0, n - 1)}}`, ru: `${n} цифр, без нуля в начале`, en: `${n} digits, no leading zero` });
      out.push({ valueType: 'faker', value: `string.numeric(${n})`, ru: `${n} цифр`, en: `${n} digits` });
    }
  }
  m = RANGE_RE.exec(q);
  if (m) {
    const [a, b] = [Number(m[1]), Number(m[2])].sort((x, y) => x - y);
    out.push({ valueType: 'faker', value: `number.int({"min":${a},"max":${b}})`, ru: `Целое от ${a} до ${b}`, en: `Integer from ${a} to ${b}` });
  }
  m = /^@?([\w-]+(\.[\w-]+)+)$/.exec(q);
  if (m && q.includes('@')) out.push({ valueType: 'template', value: `qa+{{string.alphanumeric(6)}}@${m[1]}`, ru: `Почта на домене ${m[1]}`, en: `E-mail at ${m[1]}` });
  if (/[,;]/.test(q) && q.split(/[,;]/).filter((s) => s.trim()).length > 1) {
    out.push({ valueType: 'list', value: q.split(/[,;]/).map((s) => s.trim()).filter(Boolean).join('\n'), ru: 'Случайно одно из перечисленных', en: 'One of these, at random' });
  }
  return out.map((x) => ({ ...x, title: ru ? x.ru : x.en }));
}

// Main function: up to limit suggestions for the query text
export function suggest(query, { lang = 'en', locale = 'en', limit = 7, fieldType = '' } = {}) {
  const q = norm(query).trim();
  const ru = lang === 'ru';
  const title = (x) => (ru ? x.ru : x.en);
  if (!q) {
    // empty field: the type Formigo detects for the field, plus the most common options
    const base = getCatalog();
    const first = fieldType ? base.filter((x) => x.valueType === 'type' && x.value === fieldType) : [];
    const pop = ['person.firstName', 'internet.email', 'phone.number', 'location.city', 'string.numeric(6)', 'lorem.sentence']
      .map((v) => base.find((x) => x.value === v));
    return [...first, ...pop].slice(0, limit).map((x) => ({ ...x, title: title(x) }));
  }
  const out = parsed(q, lang);
  const tokens = q.split(/\s+/).filter(Boolean);
  const score = (x) => {
    let s = 0;
    for (const tk of tokens) {
      if (x.value.toLowerCase() === q) s += 6;
      else if (new RegExp('(^|\\s)' + tk.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).test(x.hay)) s += 3;
      else if (x.hay.includes(tk)) s += 1;
      else return 0;
    }
    return s * 10 + x.w;
  };
  let pool = getCatalog();
  // looks like a faker path («location.z») — add all methods
  if (/^[a-z]+(\.[a-z]*)?$/i.test(q)) pool = pool.concat(fakerMethods(getFaker(locale)));
  const seen = new Set(out.map((x) => x.valueType + x.value));
  const ranked = pool.map((x) => [score(x) + (x.value.toLowerCase().startsWith(q) ? 5 : 0), x]).filter(([s]) => s > 0).sort((a, b) => b[0] - a[0]);
  for (const [, x] of ranked) {
    const k = x.valueType + x.value;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push({ ...x, title: title(x) });
    if (out.length >= limit) break;
  }
  return out.slice(0, limit);
}

export const SUGGEST_CSS = `
.sg{display:grid;gap:2px;margin-top:4px;padding:4px;border:1px solid var(--border);border-radius:8px;background:var(--surface);max-height:260px;overflow:auto}
.sg[hidden]{display:none}
.sg.sg-pop{position:absolute;right:0;top:100%;z-index:20;width:min(420px,90vw);box-shadow:0 6px 24px #0000002a}
.sg-hint{font:11.5px/1.4 var(--font);color:var(--muted);padding:2px 6px 4px}
.sg-it{display:grid;grid-template-columns:1fr auto;gap:0 8px;align-items:baseline;text-align:left;border:0;border-radius:6px;background:transparent;color:var(--text);padding:5px 6px;cursor:pointer;font:12.5px/1.35 var(--font);width:100%}
.sg-it:hover,.sg-it.on{background:var(--surface2,var(--surface-2))}
.sg-it .k{font:600 10px/1 var(--font);text-transform:uppercase;letter-spacing:.04em;color:var(--muted)}
.sg-it code{grid-column:1/-1;font:11px/1.4 var(--mono);color:var(--muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.sg-it .ex{grid-column:1/-1;font:11px/1.4 var(--mono);color:var(--success,var(--ok));overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
`;

// Attaches a suggestion list under the «What to insert» textarea.
// opts: { lang, locale, labels: {hint, none, types}, fieldType, example(rule) → string, onPick({valueType, value}) }
export function attachSuggest(textarea, opts) {
  const root = textarea.getRootNode();
  const styleHost = root instanceof ShadowRoot ? root : document.head;
  if (!styleHost.querySelector('style[data-ffp-sg]')) {
    const st = document.createElement('style');
    st.setAttribute('data-ffp-sg', '');
    st.textContent = SUGGEST_CSS;
    styleHost.appendChild(st);
  }
  const box = document.createElement('div');
  box.className = opts.overlay ? 'sg sg-pop' : 'sg';
  if (opts.overlay && textarea.parentElement) textarea.parentElement.style.position = 'relative';
  box.hidden = true;
  textarea.insertAdjacentElement('afterend', box);
  let items = [];
  let on = -1;
  const lab = opts.labels || {};
  const typeName = (vt) => (lab.types && lab.types[vt]) || vt;

  function render() {
    const text = textarea.value;
    // multiline list — the user is listing options themselves, stay out of the way
    if (text.includes('\n')) { close(); return; }
    items = suggest(text, { lang: opts.lang(), locale: opts.locale(), fieldType: opts.fieldType ? opts.fieldType() : '' });
    on = -1;
    box.textContent = '';
    const hint = document.createElement('div');
    hint.className = 'sg-hint';
    hint.textContent = items.length ? lab.hint : lab.none;
    box.appendChild(hint);
    items.forEach((x, i) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'sg-it';
      const tt = document.createElement('span'); tt.textContent = x.title;
      const k = document.createElement('span'); k.className = 'k'; k.textContent = typeName(x.valueType);
      const code = document.createElement('code'); code.textContent = x.value.replace(/\n/g, ' · ');
      b.append(tt, k);
      if (x.title !== x.value) b.append(code);
      try {
        const ex = opts.example ? opts.example({ valueType: x.valueType, value: x.value }) : '';
        if (ex !== '' && ex != null) { const e = document.createElement('span'); e.className = 'ex'; e.textContent = '→ ' + String(ex).slice(0, 60); b.append(e); }
      } catch { /* method didn't fit — no example */ }
      // mousedown so the click lands before the textarea's blur
      b.addEventListener('mousedown', (ev) => { ev.preventDefault(); pick(i); });
      box.appendChild(b);
    });
    box.hidden = false;
  }
  function highlight() { [...box.querySelectorAll('.sg-it')].forEach((b, i) => b.classList.toggle('on', i === on)); }
  function close() { box.hidden = true; on = -1; }
  function pick(i) {
    const x = items[i];
    if (!x) return;
    textarea.value = x.value;
    opts.onPick({ valueType: x.valueType, value: x.value });
    close();
  }
  textarea.addEventListener('focus', render);
  textarea.addEventListener('input', render);
  textarea.addEventListener('blur', () => setTimeout(close, 120));
  textarea.addEventListener('keydown', (e) => {
    if (box.hidden || !items.length) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); on = (on + 1) % items.length; highlight(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); on = (on - 1 + items.length) % items.length; highlight(); }
    else if (e.key === 'Enter' && on >= 0) { e.preventDefault(); pick(on); }
    else if (e.key === 'Escape') { e.stopPropagation(); close(); }
  });
  return { close, refresh: render };
}
