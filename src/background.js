// Service worker: context menu and hotkeys
import { loadSettings, normalizeSettings } from './settings.js';
import { menuTitle, loadUiLang, getDict } from './i18n.js';

const MENU = ['fillAll', 'fillForm', 'fillField', 'pick', 'debug', 'options'];

// Menu items in the UI language; recreated when the language changes in settings
async function buildMenus() {
  const { uiLang } = await loadSettings();
  await loadUiLang(uiLang);
  await chrome.contextMenus.removeAll();
  chrome.contextMenus.create({ id: 'root', title: 'Formigo', contexts: ['all'] });
  for (const id of MENU) chrome.contextMenus.create({ id, parentId: 'root', title: menuTitle('menu.' + id, uiLang), contexts: ['all'] });
}
chrome.runtime.onInstalled.addListener(buildMenus);
chrome.runtime.onStartup.addListener(buildMenus);
chrome.storage.onChanged.addListener((ch) => {
  if (ch.settings && ch.settings.oldValue?.uiLang !== ch.settings.newValue?.uiLang) buildMenus();
});

// If the content script isn't there yet (tab opened before install) — inject it
async function send(tabId, msg, frameId) {
  const opts = frameId != null ? { frameId } : undefined;
  try {
    return await chrome.tabs.sendMessage(tabId, msg, opts);
  } catch {
    await chrome.scripting.executeScript({
      target: frameId != null ? { tabId, frameIds: [frameId] } : { tabId, allFrames: true },
      files: ['content.js'],
    });
    return chrome.tabs.sendMessage(tabId, msg, opts);
  }
}

// Frame that has or last had focus (also finds a field inside an iframe)
async function focusedFrame(tabId) {
  const frames = (await chrome.webNavigation?.getAllFrames({ tabId })) || [{ frameId: 0 }];
  let best = { frameId: 0, score: -1 };
  await Promise.all(frames.map(async (f) => {
    try {
      const r = await send(tabId, { focusInfo: true }, f.frameId);
      if (!r || !r.t) return;
      const score = r.t + (r.active ? 1e13 : 0) + (r.focused ? 1e14 : 0);
      if (score > best.score) best = { frameId: f.frameId, score };
    } catch { /* frame unavailable */ }
  }));
  return best.frameId;
}

async function sendFocused(tabId, action) {
  const frameId = await focusedFrame(tabId);
  return (await send(tabId, { action }, frameId))?.count || 0;
}

async function broadcast(tabId, msg) {
  // Send to each frame separately so nested iframes get filled too
  const frames = (await chrome.webNavigation?.getAllFrames({ tabId })) || [{ frameId: 0 }];
  let total = 0;
  await Promise.all(frames.map(async (f) => {
    try { const r = await send(tabId, msg, f.frameId); total += r?.count || 0; } catch { /* frame unavailable */ }
  }));
  return total;
}

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === 'options') return chrome.runtime.openOptionsPage();
  if (!tab?.id) return;
  if (info.menuItemId === 'fillAll' || info.menuItemId === 'debug') broadcast(tab.id, { action: info.menuItemId });
  else send(tab.id, { action: info.menuItemId, fromMenu: true }, info.frameId ?? 0);
});

chrome.commands.onCommand.addListener(async (command, tab) => {
  tab = tab || (await chrome.tabs.query({ active: true, currentWindow: true }))[0];
  if (!tab?.id) return;
  if (command === 'fill-all') broadcast(tab.id, { action: 'fillAll' });
  if (command === 'fill-form') sendFocused(tab.id, 'fillForm');
  if (command === 'fill-field') sendFocused(tab.id, 'fillField');
});

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  // UI dictionary for the content script (it can't read extension files itself)
  if (msg.cmd === 'i18n') {
    loadUiLang(msg.lang).then(() => sendResponse(getDict(msg.lang) || null));
    return true;
  }
  // in-page hotkeys: «fill all» and «field types» are broadcast to all frames of the tab
  if (msg.cmd && _sender.tab?.id) {
    broadcast(_sender.tab.id, { action: msg.cmd }).then((count) => sendResponse({ count }));
    return true;
  }
  // meaningful images: fetch in the background (no page CORS limits) and return as a data URL
  if (msg.fetchImage) {
    fetch(msg.fetchImage).then(async (r) => {
      if (!r.ok) throw new Error(r.status);
      const blob = await r.blob();
      const buf = new Uint8Array(await blob.arrayBuffer());
      let bin = '';
      for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
      sendResponse({ dataUrl: `data:${blob.type || 'image/jpeg'};base64,${btoa(bin)}`, type: blob.type || 'image/jpeg' });
    }).catch((e) => sendResponse({ error: String(e) }));
    return true;
  }
  if (msg.popup) {
    chrome.tabs.query({ active: true, currentWindow: true }).then(async ([tab]) => {
      if (!tab?.id) return sendResponse({ count: 0 });
      // «current form» and «current field» — in the frame that last had focus
      const count = msg.popup === 'fillForm' || msg.popup === 'fillField'
        ? await sendFocused(tab.id, msg.popup)
        : await broadcast(tab.id, { action: msg.popup });
      sendResponse({ count });
    });
    return true;
  }
});

// for automated tests
self.__ffp = { send, broadcast, sendFocused, normalizeSettings };
