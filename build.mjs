import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
const strip = s => s.replace(/^import .*$/gm, '').replace(/^export (?=(const|function|let|async))/gm, '');
const r = f => readFileSync(new URL('./src/' + f, import.meta.url), 'utf8');
const parts = { CSS: 'style.css', CORE: 'core.js', STORE: 'store.js', BOOKING: 'booking.js', APP: 'app.js' };
mkdirSync(new URL('./dist/', import.meta.url), { recursive: true });
for (const [tpl, out] of [['painel.html', 'painel.html'], ['cliente.html', 'index.html']]) {
  let html = r(tpl);
  for (const [tag, f] of Object.entries(parts)) html = html.replace(`/*${tag}*/`, () => (f.endsWith('.js') ? strip(r(f)) : r(f)));
  writeFileSync(new URL('./dist/' + out, import.meta.url), html);
  console.log('dist/' + out, (html.length / 1024).toFixed(1) + ' KB');
}
