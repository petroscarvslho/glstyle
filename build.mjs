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

// demo da página do cliente com horários de exemplo embutidos
{
  const core = await import('./src/core.js');
  const { createStore } = await import('./src/store.js');
  const st = createStore(null).state, t = core.startOfDay(new Date()), d = {};
  const svc = id => st.services.find(s => s.id === id);
  for (let i = 0; i < 7; i++) {
    const day = core.ymd(core.addDays(t, i)); d[day] = {};
    for (const p of st.pros) d[day][p.id] = st.appointments.filter(a => a.proId === p.id && a.start.startsWith(day) && !['canceled', 'noshow'].includes(a.status))
      .map(a => { const s0 = core.parseLocal(a.start), m = s0.getHours() * 60 + s0.getMinutes(); return [m, m + svc(a.serviceId).durationMin]; });
  }
  const data = { s: st.settings.shopName, w: core.normPhone(st.pros[0].phone), o: st.settings.openHour, c: st.settings.closeHour, sl: st.settings.slotMin,
    sv: st.services.map(x => [x.id, x.name, x.price, x.durationMin]), pr: st.pros.map(p => [p.id, p.name.replace(/\s*\(.*\)/, '').split(' ')[0]]), d, g: Date.now() };
  const html = readFileSync(new URL('./dist/index.html', import.meta.url), 'utf8')
    .replace('<script>', () => `<script>window.GL_DEMO=${JSON.stringify(core.encodeAvailability(data))};</script>\n<script>`);
  writeFileSync(new URL('./dist/cliente-demo.html', import.meta.url), html);
  console.log('dist/cliente-demo.html');
}
