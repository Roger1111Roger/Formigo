import { build } from 'esbuild';
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { allLocales } from '@faker-js/faker';

rmSync('dist', { recursive: true, force: true });
rmSync('dist-firefox', { recursive: true, force: true });
rmSync('.locales', { recursive: true, force: true });
mkdirSync('dist', { recursive: true });
mkdirSync('.locales', { recursive: true });
cpSync('static', 'dist', { recursive: true });

// Language list for the dropdown, plus one faker/<code>.js module per language (loaded on demand)
const codes = Object.keys(allLocales).filter((c) => c !== 'base');
const list = codes.map((code) => ({ code, title: allLocales[code].metadata?.title || code, endonym: allLocales[code].metadata?.endonym || '' }))
  .sort((a, b) => a.title.localeCompare(b.title));
writeFileSync('src/locales.json', JSON.stringify(list));
for (const code of codes) {
  writeFileSync(`.locales/${code}.js`, `import { Faker, ${code === "en" ? "" : code + ", "}en, base } from '@faker-js/faker';\nexport const faker = new Faker({ locale: [${code === 'en' ? '' : code + ', '}en, base] });\n`);
}

await build({
  entryPoints: ['src/content.js', 'src/background.js', 'src/options.js', 'src/popup.js'],
  bundle: true, format: 'iife', target: 'chrome110', outdir: 'dist', minify: true, legalComments: 'none',
});
await build({
  entryPoints: codes.map((c) => `.locales/${c}.js`),
  bundle: true, format: 'esm', splitting: true, target: 'chrome110', outdir: 'dist/faker', minify: true, legalComments: 'none',
  chunkNames: 'chunks/[hash]',
});
rmSync('.locales', { recursive: true, force: true });

// Firefox build: same code, its own manifest. Chrome keeps dist/ untouched.
cpSync('dist', 'dist-firefox', { recursive: true });
const manifest = JSON.parse(readFileSync('dist/manifest.json', 'utf8'));
writeFileSync('dist-firefox/manifest.json', JSON.stringify(firefoxManifest(manifest), null, 2));
console.log('ok', codes.length, 'locales; dist/ for Chrome, dist-firefox/ for Firefox');

function firefoxManifest(m) {
  const out = structuredClone(m);
  // Firefox MV3 has no service workers for extensions: the background runs as an event page
  out.background = { scripts: [m.background.service_worker] };
  // options open in a tab, like options_page in Chrome
  delete out.options_page;
  out.options_ui = { page: m.options_page, open_in_tab: true };
  // Chrome-only keys that Firefox rejects or warns about
  for (const cs of out.content_scripts) delete cs.match_origin_as_fallback;
  for (const war of out.web_accessible_resources) delete war.use_dynamic_url;
  out.browser_specific_settings = {
    gecko: {
      id: 'formigo@mivagoai.com',
      // 140 (ESR): host permissions are granted at install, popover API and data_collection_permissions are available
      strict_min_version: '140.0',
      // AMO requires a declaration; Formigo collects nothing
      data_collection_permissions: { required: ['none'] },
    },
    gecko_android: { strict_min_version: '142.0' },
  };
  return out;
}
