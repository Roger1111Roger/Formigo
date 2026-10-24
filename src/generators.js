// Value generators built on Faker + valid Russian business/ID numbers.
// Faker instances are loaded on demand from faker/<locale>.js (so every page doesn't pull in all languages)
const FAKERS = {};

export async function loadFaker(locale) {
  if (!FAKERS[locale]) {
    const url = chrome.runtime.getURL(`faker/${locale}.js`);
    FAKERS[locale] = (await import(url)).faker;
  }
  return FAKERS[locale];
}

export async function ensureFakers(locale) {
  await loadFaker('en');
  try { await loadFaker(locale); } catch (e) { console.warn('[Formigo] нет локали', locale, e); }
}

// faker.helpers.fromRegExp doesn't understand \d \w \s or anchors — convert to a supported form
export function fromRegExp(f, pattern) {
  const src = String(pattern)
    .replace(/^\^|\$$/g, '')
    .replace(/\\d/g, '[0-9]').replace(/\\w/g, '[a-zA-Z0-9_]').replace(/\\s/g, ' ')
    .replace(/\(\?:/g, '(');
  return f.helpers.fromRegExp(src);
}

export function getFaker(locale) {
  return FAKERS[locale] || FAKERS.en;
}
const fakerEN = { get internet() { return FAKERS.en.internet; } };

const digits = (f, n) => f.string.numeric({ length: n, allowLeadingZeros: true });

function checksum(nums, weights) {
  return (weights.reduce((s, w, i) => s + w * nums[i], 0) % 11) % 10;
}

// INN for an individual (12 digits) or a company (10 digits) with correct check digits
export function inn(f, legal = false) {
  const region = f.helpers.arrayElement(['77', '78', '50', '66', '16', '52', '54', '23']);
  if (legal) {
    const n = (region + digits(f, 7)).split('').map(Number);
    n.push(checksum(n, [2, 4, 10, 3, 5, 9, 4, 6, 8]));
    return n.join('');
  }
  const n = (region + digits(f, 8)).split('').map(Number);
  n.push(checksum(n, [7, 2, 4, 10, 3, 5, 9, 4, 6, 8]));
  n.push(checksum(n, [3, 7, 2, 4, 10, 3, 5, 9, 4, 6, 8]));
  return n.join('');
}

export function snils(f, formatted = true) {
  let base;
  do { base = digits(f, 9); } while (Number(base) <= 1001998);
  const sum = base.split('').reduce((s, d, i) => s + Number(d) * (9 - i), 0);
  let c = sum % 101;
  if (c === 100) c = 0;
  const cs = String(c).padStart(2, '0');
  return formatted ? `${base.slice(0, 3)}-${base.slice(3, 6)}-${base.slice(6, 9)} ${cs}` : base + cs;
}

export function ogrn(f) {
  const base = f.helpers.arrayElement(['1', '5']) + digits(f, 11);
  return base + String((BigInt(base) % 11n) % 10n);
}

export function kpp(f) {
  return f.helpers.arrayElement(['77', '78', '50']) + digits(f, 2) + '01' + digits(f, 3);
}

export function passportRu(f) {
  return `${digits(f, 2)} ${digits(f, 2)} ${digits(f, 6)}`;
}

function phoneRu(f) {
  return `+7 (9${digits(f, 2)}) ${digits(f, 3)}-${digits(f, 2)}-${digits(f, 2)}`;
}

function pad(n) { return String(n).padStart(2, '0'); }
export function isoDate(d) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
// Format from placeholder («dd.mm.yyyy») or from an Angular-style datepicker attribute («dd MMMM yyyy», «MM/dd/yy»)
function formatDate(d, fmt) {
  const angular = /M/.test(fmt);
  const m = d.getMonth();
  return fmt.replace(/yyyy|yy|MMMM|MMM|MM|M|mm|dd|d/g, (t) => {
    switch (t) {
      case 'yyyy': return d.getFullYear();
      case 'yy': return String(d.getFullYear()).slice(2);
      case 'MMMM': return MONTHS[m];
      case 'MMM': return MONTHS[m].slice(0, 3);
      case 'MM': return pad(m + 1);
      case 'M': return m + 1;
      case 'mm': return angular ? '00' : pad(m + 1);
      case 'dd': return pad(d.getDate());
      default: return d.getDate();
    }
  });
}
function ruDate(d) { return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()}`; }

// Consistent «profile» per fill: first name, last name, e-mail and login match across fields
export function makeProfile(locale, settings = {}) {
  const f = getFaker(locale);
  const sex = f.helpers.arrayElement(['male', 'female']);
  const firstName = f.person.firstName(sex);
  const lastName = f.person.lastName(sex);
  const middleName = locale === 'ru' ? f.person.middleName(sex) : f.person.middleName(sex);
  const birth = f.date.birthdate({ min: 18, max: 65, mode: 'age' });
  let email = f.internet.email({ firstName, lastName }).toLowerCase();
  if (settings.emailDomain) email = email.split('@')[0] + '@' + settings.emailDomain.replace(/^@/, '');
  const password = settings.passwordMode === 'fixed' && settings.fixedPassword
    ? settings.fixedPassword
    : f.internet.password({ length: 10, memorable: false }) + 'Aa1!';
  return {
    sex, firstName, lastName, middleName,
    fullName: locale === 'ru' ? `${lastName} ${firstName} ${middleName}` : `${firstName} ${lastName}`,
    email,
    username: f.internet.username({ firstName, lastName }).toLowerCase(),
    password,
    phone: locale === 'ru' ? phoneRu(f) : f.phone.number({ style: 'national' }),
    birthDate: birth,
    company: f.company.name(),
    city: f.location.city(),
    country: f.location.country(),
  };
}

// Generate a value for a field type. ctx: { el, profile, locale, inputType }
export function generate(type, ctx) {
  const ov = VALUE_OVERRIDES[type];
  if (ov && ctx.noOverride !== type) return valueFromOverride(ov, { ...ctx, noOverride: type });
  const f = getFaker(ctx.locale);
  const p = ctx.profile;
  const el = ctx.el;
  const html5Date = ctx.inputType === 'date';
  const dateOut = (d) => (html5Date ? isoDate(d) : ctx.dateFormat ? formatDate(d, ctx.dateFormat) : ctx.locale === 'ru' ? ruDate(d) : isoDate(d));

  switch (type) {
    case 'firstName': return p.firstName;
    case 'lastName': return p.lastName;
    case 'middleName': return p.middleName;
    case 'fullName': return p.fullName;
    case 'username': return p.username;
    case 'email': case 'confirmEmail': return p.email;
    case 'password': case 'confirmPassword': return p.password;
    case 'phone':
      // a second/additional number must not match the primary one
      if (/alt|additional|second|other|extra|альтернатив|дополнит|втор|друг/i.test(ctx.signature || '')) return ctx.locale === 'ru' ? phoneRu(f) : f.phone.number({ style: 'national' });
      return p.phone;
    case 'company': return p.company;
    case 'jobTitle': return f.person.jobTitle();
    case 'street': return f.location.street();
    case 'house': return String(f.number.int({ min: 1, max: 150 }));
    case 'apartment': return String(f.number.int({ min: 1, max: 400 }));
    case 'address': return ctx.locale === 'ru' ? `${f.location.street()}, ${f.number.int({ min: 1, max: 150 })}` : f.location.streetAddress(false);
    case 'city': return p.city;
    case 'state': return f.location.state();
    case 'zip': return ctx.locale === 'ru' ? digits(f, 6) : ctx.locale === 'en' ? f.location.zipCode('#####') : f.location.zipCode();
    case 'country': return p.country;
    case 'birthDate': return dateOut(p.birthDate);
    case 'age': return String(new Date().getFullYear() - p.birthDate.getFullYear());
    case 'gender': return p.sex === 'male' ? (ctx.locale === 'ru' ? 'Мужской' : 'Male') : (ctx.locale === 'ru' ? 'Женский' : 'Female');
    case 'date': return dateOut(f.date.soon({ days: 30 }));
    case 'futureDate': return dateOut(f.date.soon({ days: 365 * 2 }));
    case 'pastDate': return dateOut(f.date.past({ years: 5, refDate: Date.now() - 31 * 864e5 }));
    case 'recentDate': return dateOut(f.date.recent({ days: 30 }));
    case 'imei': return luhnDigits(f, 14);
    case 'serialNumber': return f.string.alphanumeric({ length: 12, casing: 'upper' });
    case 'macAddress': return f.internet.mac().toUpperCase();
    case 'colorHex': return f.color.rgb({ format: 'hex', casing: 'upper' });
    case 'modelCode': return f.helpers.fromRegExp('[A-Z]{2}-[A-Z][0-9]{3}[A-Z]');
    case 'code': return f.string.alphanumeric({ length: 8, casing: 'upper' });
    case 'entityName': {
      const n = f.number.int({ min: 100, max: 999 });
      const cap = (x) => x.charAt(0).toUpperCase() + x.slice(1);
      if (/colou?r|цвет/i.test(ctx.signature || '')) return `${cap(FAKERS.en.color.human())} ${n}`;
      return `${cap(f.word.adjective())} ${f.word.noun()} ${n}`;
    }
    // vehicles
    case 'vin': return FAKERS.en.vehicle.vin();
    case 'carPlate': return ctx.locale === 'ru'
      ? f.helpers.fromRegExp('[АВЕКМНОРСТУХ][0-9]{3}[АВЕКМНОРСТУХ]{2}[0-9]{2,3}')
      : FAKERS.en.vehicle.vrm();
    case 'engineNumber': return f.string.alphanumeric({ length: 10, casing: 'upper' });
    case 'engineVolume': return String(f.number.int({ min: 8, max: 50 }) * 100);
    case 'odometer': return String(f.number.int({ min: 0, max: 300000 }));
    case 'year': return String(birthCtx(ctx) ? p.birthDate.getFullYear() : sharedDate(ctx).getFullYear());
    case 'dateDay': return pad((birthCtx(ctx) ? p.birthDate : sharedDate(ctx)).getDate());
    case 'dateMonth': return pad((birthCtx(ctx) ? p.birthDate : sharedDate(ctx)).getMonth() + 1);
    case 'make': return FAKERS.en.vehicle.manufacturer();
    case 'carModel': return FAKERS.en.vehicle.model();
    case 'bodyType': return FAKERS.en.vehicle.type();
    case 'fuel': return FAKERS.en.vehicle.fuel();
    case 'transmission': return f.helpers.arrayElement(ctx.locale === 'ru' ? ['Механика', 'Автомат', 'Робот', 'Вариатор'] : ['Manual', 'Automatic', 'CVT']);
    case 'color': return ctx.inputType === 'color' ? f.color.rgb() : /hex|#[0-9a-f]{3,6}/i.test(ctx.signature || '') ? f.color.rgb({ format: 'hex', casing: 'upper' }) : f.color.human();
    // documents
    case 'passportSeries': return digits(f, 4);
    case 'passportNumber': return digits(f, 6);
    case 'divisionCode': return `${digits(f, 3)}-${digits(f, 3)}`;
    case 'issuedBy': return ctx.locale === 'ru' ? `ГУ МВД России по г. ${f.location.city()}` : `${f.location.city()} Registry Office`;
    case 'birthPlace': return f.location.city();
    case 'accountNumber': return ctx.locale === 'ru' ? '40817810' + digits(f, 12) : f.finance.accountNumber(12);
    case 'datetime': return isoDate(f.date.soon({ days: 30 })) + 'T' + pad(f.number.int(23)) + ':' + pad(f.number.int(59));
    case 'hour': return pad(f.number.int({ min: 8, max: 20 }));
    case 'minute': return pad(f.number.int({ min: 0, max: 11 }) * 5);
    case 'time': return pad(f.number.int(23)) + ':' + pad(f.number.int(59));
    case 'month': { const d = f.date.soon({ days: 365 }); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`; }
    case 'week': return `${new Date().getFullYear()}-W${pad(f.number.int({ min: 1, max: 52 }))}`;
    case 'url': return fakerEN.internet.url();
    case 'cardNumber': return f.finance.creditCardNumber(f.helpers.arrayElement(['4### #### #### ###L', '5[1-5]## #### #### ###L', '2200 #### #### ###L']));
    case 'cardCvv': return f.finance.creditCardCVV();
    case 'cardExpiry': { const d = f.date.future({ years: 4 }); return `${pad(d.getMonth() + 1)}/${String(d.getFullYear()).slice(2)}`; }
    case 'cardHolder': return `${p.firstName} ${p.lastName}`.toUpperCase();
    case 'iban': return f.finance.iban({ formatted: false });
    case 'bic': return ctx.locale === 'ru' ? '04' + digits(f, 7) : f.finance.bic();
    case 'inn': return inn(f, /юр|орган|company|legal|10/i.test(ctx.signature || '') || Number(el?.maxLength) === 10);
    case 'snils': return snils(f, !(Number(el?.maxLength) > 0 && Number(el?.maxLength) <= 11));
    case 'ogrn': return ogrn(f);
    case 'kpp': return kpp(f);
    case 'passport': return passportRu(f);
    case 'idNumber': return digits(f, 10);
    case 'otp': return digits(f, Number(el?.maxLength) > 0 && Number(el?.maxLength) < 10 ? Number(el.maxLength) : 6);
    case 'number': return String(numberInRange(f, el));
    case 'amount': return String(numberInRange(f, el, 100, 100000));
    case 'quantity': return String(numberInRange(f, el, 1, 10));
    case 'search': return f.word.noun();
    case 'subject': return f.lorem.sentence({ min: 3, max: 6 }).replace(/\.$/, '');
    case 'paragraph': return f.lorem.paragraph();
    case 'word': return f.word.words(2);
    case 'text': default: return f.lorem.words({ min: 2, max: 4 });
  }
}

// Date split into day/month/year fields: in a «birth» context use the profile's birth date
const birthCtx = (ctx) => /birth|рожд|dob/i.test(ctx.signature || '');
function sharedDate(ctx) {
  if (!ctx.profile.sharedDate) ctx.profile.sharedDate = getFaker(ctx.locale).date.past({ years: 10 });
  return ctx.profile.sharedDate;
}

// Digits + Luhn check digit (IMEI: 14 digits + 1)
function luhnDigits(f, n) {
  const d = digits(f, n).split('').map(Number);
  const sum = d.reverse().reduce((acc, x, i) => acc + (i % 2 === 0 ? (x * 2 > 9 ? x * 2 - 9 : x * 2) : x), 0);
  return d.reverse().join('') + ((10 - (sum % 10)) % 10);
}

function numberInRange(f, el, defMin = 1, defMax = 100) {
  const min = el && el.min !== '' && !isNaN(Number(el.min)) ? Number(el.min) : defMin;
  let max = el && el.max !== '' && !isNaN(Number(el.max)) ? Number(el.max) : Math.max(defMax, min + 10);
  if (max < min) max = min;
  const step = el && el.step && el.step !== 'any' && !isNaN(Number(el.step)) ? Number(el.step) : 1;
  const n = Math.floor((max - min) / step);
  const v = min + f.number.int({ min: 0, max: Math.max(0, n) }) * step;
  return Number.isInteger(step) ? v : Number(v.toFixed(String(step).split('.')[1]?.length || 2));
}

// --- Custom expressions: "person.firstName", "number.int({\"min\":1,\"max\":5})" ---
function parseArgs(s) {
  if (s == null || s.trim() === '') return [];
  try { return JSON.parse('[' + s + ']'); } catch { return [s]; }
}

export function callFaker(f, expr) {
  const m = /^\s*([a-zA-Z_][\w.]*)\s*(?:\(([\s\S]*)\))?\s*$/.exec(expr);
  if (!m) throw new Error('Неверное выражение: ' + expr);
  const path = m[1].split('.');
  let obj = f;
  let parent = null;
  for (const k of path) {
    if (obj == null || !(k in obj)) throw new Error('Нет метода faker.' + m[1]);
    parent = obj;
    obj = obj[k];
  }
  const out = typeof obj === 'function' ? obj.apply(parent, parseArgs(m[2])) : obj;
  return out instanceof Date ? isoDate(out) : String(out);
}

// Template: "{{profile.firstName}}_{{string.numeric(4)}}@{{type.email}}"
export function renderTemplate(tpl, ctx) {
  const f = getFaker(ctx.locale);
  return tpl.replace(/\{\{\s*([\s\S]+?)\s*\}\}/g, (_, expr) => {
    if (expr.startsWith('profile.')) {
      const v = ctx.profile[expr.slice(8)];
      return v instanceof Date ? isoDate(v) : (v ?? '');
    }
    if (expr.startsWith('type.')) return generate(expr.slice(5), ctx);
    return callFaker(f, expr);
  });
}

// Custom values for types (Settings → Field types): /RegExp/, a {{…}} template, or a list of options, one per line
let VALUE_OVERRIDES = {};
export function setTypeValues(map) {
  VALUE_OVERRIDES = Object.fromEntries(Object.entries(map || {}).filter(([, v]) => v && String(v).trim()));
}
export function valueFromOverride(v, ctx) {
  const f = getFaker(ctx.locale);
  const s = String(v).trim();
  if (/^\/.+\/$/s.test(s)) return fromRegExp(f, s.slice(1, -1));
  if (s.includes('{{')) return renderTemplate(s, ctx);
  return f.helpers.arrayElement(s.split('\n').map((x) => x.trim()).filter(Boolean));
}

export function valueFromRule(rule, ctx) {
  const f = getFaker(ctx.locale);
  switch (rule.valueType) {
    case 'faker': return callFaker(f, rule.value);
    case 'template': return renderTemplate(rule.value, ctx);
    case 'regex': return fromRegExp(f, rule.value);
    case 'list': return f.helpers.arrayElement(rule.value.split('\n').map((s) => s.trim()).filter(Boolean));
    case 'type': return generate(rule.value.trim(), ctx);
    case 'fixed': default: return rule.value;
  }
}
