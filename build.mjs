import { build } from 'esbuild';
import { cpSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { allLocales } from '@faker-js/faker';

rmSync('dist', { recursive: true, force: true });
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
console.log('ok', codes.length, 'locales');
