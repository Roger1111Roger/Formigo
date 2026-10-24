import LOCALES from './locales.json';

export function fillLocaleSelect(select, value) {
  select.textContent = '';
  for (const l of LOCALES) {
    const o = document.createElement('option');
    o.value = l.code;
    o.textContent = l.endonym && l.endonym !== l.title ? `${l.title} — ${l.endonym}` : l.title;
    select.append(o);
  }
  select.value = value;
}
