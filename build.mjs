import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
const strip = s => s.replace(/^import .*$/gm, '').replace(/^export (?=(const|function|let|async))/gm, '').replace(/^export \{[^}]*\};?$/gm, '');
const r = f => readFileSync(new URL('./src/' + f, import.meta.url), 'utf8');
let html = r('index.html');
for (const [tag, f] of [['CSS', 'style.css'], ['CORE', 'core.js'], ['STORE', 'store.js'], ['BOOKING', 'booking.js'], ['APP', 'app.js']])
  html = html.replace(`/*${tag}*/`, () => (f.endsWith('.js') ? strip(r(f)) : r(f)));
mkdirSync(new URL('./dist/', import.meta.url), { recursive: true });
writeFileSync(new URL('./dist/index.html', import.meta.url), html);
console.log('dist/index.html', (html.length / 1024).toFixed(1) + ' KB');
