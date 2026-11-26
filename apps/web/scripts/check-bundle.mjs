// Strażnik rozmiaru początkowego pakietu (NFR-2, zadanie [040]). Uruchamiany po `vite build`.
// Liczy pliki JS i CSS, które przeglądarka pobiera przed pierwszym renderem widoku Klubu:
// skrypt wejściowy z `index.html` z jego statycznymi importami oraz arkusze CSS. Kończy się
// błędem, gdy suma po gzip przekracza limit albo gdy do tych plików trafia Three.js, notes
// lub edytor notesów (muszą być ładowane leniwie, `import()`).
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';

const DIST = join(import.meta.dirname, '..', 'dist');
/**
 * Limit JS po gzip (KB). Pomiar [040]: ≈ 182 KB (przed podziałem 240 KB); zapas na rozwój bez cofnięcia
 * podziału. Po przejściu na Solid 2.0: ≈ 167 KB.
 */
const JS_LIMIT_KB = 215;
/** Limit CSS po gzip (KB). Pomiar [040]: ≈ 15 KB. */
const CSS_LIMIT_KB = 30;
/** Moduły, które nie mogą trafić do początkowego pakietu (źródła z mapy). */
const FORBIDDEN = [/node_modules\/three\//, /packages\/score-pad\/src\/(pad|editor)\//];

const html = readFileSync(join(DIST, 'index.html'), 'utf8');
const attr = (re) => [...html.matchAll(re)].map((m) => m[1].replace(/^\//, ''));
const entries = attr(/<script[^>]+type="module"[^>]+src="([^"]+)"/g);
const styles = attr(/<link[^>]+rel="stylesheet"[^>]+href="([^"]+)"/g);
if (entries.length === 0) throw new Error('check-bundle: brak skryptu wejściowego w index.html');

// Statyczne importy (`import … from "./x.js"`, `import "./x.js"`), bez dynamicznych `import()`.
const STATIC_IMPORT = /(?:^|[;\s}])import\s*(?:[\w$*{},\s]+from\s*)?["'](\.\/[^"']+\.js)["']/g;
const seen = new Set();
const queue = [...entries];
while (queue.length > 0) {
  const file = queue.pop();
  if (seen.has(file)) continue;
  seen.add(file);
  const code = readFileSync(join(DIST, file), 'utf8');
  const dir = file.slice(0, file.lastIndexOf('/') + 1);
  for (const [, spec] of code.matchAll(STATIC_IMPORT)) queue.push(dir + spec.slice(2));
}

const gz = (file) => gzipSync(readFileSync(join(DIST, file))).length / 1024;
const sum = (files) => files.reduce((total, file) => total + gz(file), 0);
const js = [...seen];
const jsKb = sum(js);
const cssKb = sum(styles);

const leaks = js.flatMap((file) => {
  const map = JSON.parse(readFileSync(join(DIST, `${file}.map`), 'utf8'));
  return map.sources
    .filter((src) => FORBIDDEN.some((re) => re.test(src)))
    .map((src) => `${file}: ${src}`);
});

console.log(`check-bundle: początkowy JS ${jsKb.toFixed(1)} KB gzip (limit ${JS_LIMIT_KB})`);
for (const file of js) console.log(`  ${file} ${gz(file).toFixed(1)} KB`);
console.log(`check-bundle: początkowy CSS ${cssKb.toFixed(1)} KB gzip (limit ${CSS_LIMIT_KB})`);

const errors = [];
if (jsKb > JS_LIMIT_KB) errors.push(`JS ${jsKb.toFixed(1)} KB > ${JS_LIMIT_KB} KB`);
if (cssKb > CSS_LIMIT_KB) errors.push(`CSS ${cssKb.toFixed(1)} KB > ${CSS_LIMIT_KB} KB`);
if (leaks.length > 0)
  errors.push(`moduły ładowane leniwie w pakiecie startowym:\n${leaks.join('\n')}`);
if (errors.length > 0) {
  console.error(`check-bundle: ${errors.join('\n')}`);
  process.exit(1);
}
