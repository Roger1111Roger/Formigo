// Default settings and chrome.storage handling
import { defaultUiLang } from './i18n.js';
export const SETTINGS_VERSION = 3;
// old default shortcuts: on upgrade to v3 replace them with the new ones, leave user-defined shortcuts alone
const OLD_HOTKEYS = { fillAll: 'Alt+Shift+F', fillForm: 'Alt+Shift+G', fillField: 'Alt+Shift+H', debug: 'Alt+Shift+D', pick: 'Alt+Shift+L' };

export const DEFAULT_SETTINGS = {
  locale: 'en', // language of generated data
  uiLang: defaultUiLang(), // extension UI language
  theme: 'auto', // auto | light | dark
  // in-page hotkeys (configurable in settings)
  hotkeys: { fillAll: 'Alt+Z', fillForm: 'Alt+X', fillField: 'Alt+C', pick: 'Alt+V', debug: 'Alt+A' },
  modalOnly: true, // «Current form» fills only the modal when one is open
  fillReadonlyDates: false, // fill readonly date fields (datepicker)
  fillFiles: true, // attach files to input[type=file] (already attached files are not replaced)
  imageMode: 'smart', // smart: face/document/photo based on field meaning; simple: PNG 15×15
  selectRetries: true, // refill dependent lists (make → model)
  ignoreHidden: true,
  refillFilled: true, // refill already filled fields (turn off to fill only empty ones)
  typePatterns: {}, // custom type-detection RegExps: { email: 'e-?mail|почт', ... }
  typeValues: {}, // custom type values: /RegExp/, a {{…}} template, or a list, one per line
  ignoreSelectors: '[name*="captcha" i]\n.g-recaptcha *',
  checkboxMode: 'random', // random | check | uncheck
  agreeAlways: true, // always check «I agree to the terms»
  typeChars: false, // character-by-character input for masked fields
  highlight: true,
  passwordMode: 'random', // random | fixed
  fixedPassword: 'Qwerty123!',
  emailDomain: '',
  rules: [
    { enabled: false, note: 'Пример: тестовый домен почты', match: 'regex', pattern: 'e-?mail|почт', valueType: 'template', value: 'qa+{{string.alphanumeric(6)}}@example.com' },
    { enabled: false, note: 'Пример: поле по CSS', match: 'css', pattern: '#promo', valueType: 'fixed', value: 'TEST2026' },
  ],
};

export function normalizeSettings(raw) {
  raw = { ...(raw || {}) };
  // legacy settings and exports: ignoreFilled → refillFilled
  if (raw.refillFilled === undefined && raw.ignoreFilled !== undefined) raw.refillFilled = !raw.ignoreFilled;
  // v2: readonly dates are off by default — reset the old default value once
  if ((raw.settingsVersion || 1) < 2) raw.fillReadonlyDates = false;
  // v3: new default shortcuts Alt+Z/X/C/V/A
  if ((raw.settingsVersion || 1) < 3 && raw.hotkeys) {
    raw.hotkeys = { ...raw.hotkeys };
    for (const [k, v] of Object.entries(OLD_HOTKEYS)) if (raw.hotkeys[k] === v) delete raw.hotkeys[k];
  }
  const out = { ...DEFAULT_SETTINGS, ...raw };
  out.settingsVersion = SETTINGS_VERSION;
  out.hotkeys = { ...DEFAULT_SETTINGS.hotkeys, ...(out.hotkeys || {}) };
  delete out.hotkeys.pickField;
  out.typePatterns = { ...(out.typePatterns || {}) };
  out.typeValues = { ...(out.typeValues || {}) };
  out.ignoreFilled = !out.refillFilled;
  return out;
}

export async function loadSettings() {
  const s = await chrome.storage.local.get('settings');
  return normalizeSettings(s.settings);
}

export async function saveSettings(settings) {
  const { ignoreFilled, ...rest } = settings;
  await chrome.storage.local.set({ settings: rest });
}
