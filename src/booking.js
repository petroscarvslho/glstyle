const diasTxt = wd => { const n = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'], s = [...wd].sort(); const seq = s.every((d, i) => i === 0 || d === s[i - 1] + 1); return s.length === 7 ? 'Todos os dias' : seq ? `${n[s[0]]} a ${n[s[s.length - 1]]}` : s.map(d => n[d]).join(', '); };
// GL Style — página pública de agendamento (lê os dados do link).
let nomeSalvo = ''; try { nomeSalvo = localStorage.getItem('gl.nome') || ''; } catch (e) {}
const bk = { sv: null, pr: null, day: null, time: null, name: nomeSalvo, phone: '', sent: false };
function bookingPage(code) {
  const D = decodeAvailability(code);
  document.body.classList.add('cliente');
  const main = document.querySelector('main');
  if (!D) { main.innerHTML = '<h1>Agendamento</h1><p class="sub">Este link está incompleto ou expirou. Peça ao salão o link de agendamento atualizado pelo WhatsApp.</p>'; return; }
  const days = Object.keys(D.d).filter(d => d >= ymd(new Date())).sort();
  const openD = d => !Array.isArray(D.wd) || D.wd.includes(parseLocal(d + 'T12:00').getDay());
  bk.sv = bk.sv || D.sv[0][0]; bk.pr = bk.pr || D.pr[0][0]; bk.day = days.includes(bk.day) ? bk.day : (days.find(openD) || days[0]);
  const svc = D.sv.find(x => x[0] === bk.sv) || D.sv[0];
  const st = { settings: { openHour: D.o, closeHour: D.c, slotMin: D.sl, workDays: D.wd, minAdvanceH: D.ma || 0 }, services: [], appointments: [] };
  const slotsFor = (day, pr) => {
    const busy = (D.d[day] && D.d[day][pr]) || [];
    st.services = busy.map((b, i) => ({ id: 'b' + i, durationMin: b[1] - b[0] }));
    st.appointments = busy.map((b, i) => ({ proId: pr, serviceId: 'b' + i, status: 'scheduled', start: `${day}T${pad2(Math.floor(b[0] / 60))}:${pad2(b[0] % 60)}` }));
    return freeSlots(st, day, pr, svc[3], new Date());
  };
  const slots = bk.day ? slotsFor(bk.day, bk.pr) : [];
  if (!slots.includes(bk.time)) bk.time = null;
  const old = Math.round((Date.now() - (D.g || Date.now())) / 3600000);
  const hojeS = ymd(new Date()), amanhaS = ymd(addDays(new Date(), 1));
  const nomeDia = d => d === hojeS ? 'hoje' : d === amanhaS ? 'amanhã' : parseLocal(d + 'T00:00').toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', '');
  const turnos = [['Manhã', h => h < '12:00'], ['Tarde', h => h >= '12:00' && h < '18:00'], ['Noite', h => h >= '18:00']].map(([n, f]) => [n, slots.filter(f)]).filter(t => t[1].length);
  const mes = bk.day ? parseLocal(bk.day + 'T00:00').toLocaleDateString('pt-BR', { month: 'long' }) : '';
  const pr = D.pr.find(x => x[0] === bk.pr) || D.pr[0];
  const pronto = bk.time && bk.name.trim().length > 1;
  const resumo = bk.time ? `<b>${esc(svc[1])} · ${brl(svc[2])}</b>${esc(nomeDia(bk.day))}, ${dataBR(parseLocal(bk.day + 'T00:00'))} às ${bk.time}${D.pr.length > 1 ? ' com ' + esc(pr[1]) : ''}` : '<b>Escolha um horário</b>sem cadastro, pelo WhatsApp';
  const enviado = bk.sent ? `<div class="cli-ok"><strong>Pedido enviado ✓</strong><span>Agora é só aguardar a confirmação do ${esc(D.s)} no seu WhatsApp.</span></div>` : '';
  main.innerHTML = `${window.GL_DEMO && code === window.GL_DEMO ? '<div class="faixa-demo" style="margin-top:12px">Demonstração com horários de exemplo. O pedido vai para o WhatsApp do salão.</div>' : ''}
  <div class="cli-grid">
  <div class="cli-a">
    <div class="cli-hero"><div class="mono-g">${esc((D.s || 'GL').split(' ')[0].slice(0, 2).toUpperCase())}</div><h1>${esc(D.s)}</h1><div class="mini" style="align-self:start">Barbearia${D.a ? ' · ' + esc(D.a) : ''}</div>
    <div class="cli-fatos"><span><b>${Array.isArray(D.wd) ? diasTxt(D.wd) : 'Todos os dias'}</b></span><span><b>${pad2(D.o)}h às ${pad2(D.c)}h</b></span><span>sem cadastro</span></div>
    <p>Escolha o serviço e o horário. A confirmação chega no seu WhatsApp.${old >= 24 ? ' Horários de ' + Math.floor(old / 24) + ' dia(s) atrás: podem ter mudado.' : ''}</p>
    <div class="cli-links">${D.a ? `<a href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(D.a + ' ' + (D.s || ''))}" target="_blank" rel="noopener">Como chegar</a>` : ''}${D.ig ? `<a href="https://instagram.com/${encodeURIComponent(D.ig)}" target="_blank" rel="noopener">@${esc(D.ig)}</a>` : ''}<a href="${waLink(D.w, 'Olá! Tenho uma dúvida.')}" target="_blank" rel="noopener">Falar no WhatsApp</a></div></div>
    ${(D.n || []).map(t => `<div class="aviso-cli">📣 ${esc(t)}</div>`).join('')}
    <h2><span class="passo">1</span>Serviço</h2><div class="svc-lista">${D.sv.map(x => `<button class="svc-row ${bk.sv === x[0] ? 'on' : ''}" data-bk="sv" data-id="${esc(x[0])}"><span class="rd"></span><span><b>${esc(x[1])}</b><small>${x[3]} min</small></span><span class="p num">${brl(x[2])}</span></button>`).join('')}</div>
    ${D.pr.length > 1 ? `<h2>Com quem</h2><div class="chips">${D.pr.map(x => `<button class="chip ${bk.pr === x[0] ? 'on' : ''}" data-bk="pr" data-id="${esc(x[0])}">${esc(x[1])}</button>`).join('')}</div>` : ''}
  </div>
  <div class="cli-b"><div class="cli-caixa">
    <h2><span class="passo">2</span>Dia <small>${esc(mes)}</small></h2><div class="dias">${days.map(d => { const dt = parseLocal(d + 'T00:00'); const n = openD(d) ? slotsFor(d, bk.pr).length : 0; return `<button class="dia ${bk.day === d ? 'on' : ''}" data-bk="day" data-id="${esc(d)}" ${n ? '' : 'style="opacity:.4"'}>${esc(nomeDia(d))}<b>${dt.getDate()}</b></button>`; }).join('')}</div>
    <h2><span class="passo">3</span>Horário <small>${slots.length ? slots.length + ' livres' : ''}</small></h2>${!openD(bk.day) ? '<div class="vazio">Fechado nesse dia. Escolha outro.</div>' : slots.length ? turnos.map(([n, hs]) => `<div class="turno">${n}</div><div class="slots-grade">${hs.map(h => `<button class="chip ${bk.time === h ? 'on' : ''}" data-bk="time" data-id="${h}">${h}</button>`).join('')}</div>`).join('') : '<div class="vazio">Sem horário livre nesse dia. Tente outro dia' + (D.pr.length > 1 ? ' ou outro profissional' : '') + '.</div>'}
    <h2><span class="passo">4</span>Seu nome</h2><input data-bkin="name" value="${esc(bk.name)}" placeholder="Como o ${esc((D.pr[0] && D.pr[0][1]) || 'barbeiro')} te conhece" autocomplete="name" enterkeyhint="send">
    ${enviado}
    <div class="barra-pedido"><div class="in"><div class="res">${resumo}</div><button class="bt" data-bk="send" ${pronto ? '' : 'disabled'}>${bk.sent ? 'Enviar de novo' : 'Pedir horário'}</button></div></div>
    <p class="mini cli-nota">Sem cadastro: o pedido sai do seu WhatsApp. O horário só fica garantido quando o ${esc(D.s)} confirmar.</p>
  </div></div>
  ${D.pol ? `<div class="cartao cli-c"><strong>Regras do salão</strong><p class="mini" style="white-space:pre-line;margin:6px 0 0">${esc(D.pol)}</p></div>` : ''}
  </div>
`;
  main.onclick = e => {
    const el = e.target.closest('[data-bk]'); if (!el || el.disabled) return;
    const k = el.dataset.bk;
    if (k === 'send') {
      try { localStorage.setItem('gl.nome', bk.name.trim()); } catch (e) {}
      const pr = D.pr.find(x => x[0] === bk.pr), dt = parseLocal(`${bk.day}T${bk.time}`);
      const msg = `Olá! Quero marcar ${svc[1]}${D.pr.length > 1 ? ` com ${pr[1]}` : ''} ${dataBR(dt)} às ${bk.time}.\nNome: ${bk.name.trim()}\n#GL[${bk.day}T${bk.time}|${svc[0]}|${pr[0]}|${bk.name.trim()}]`;
      const lk = document.createElement('a'); lk.href = waLink(D.w, msg); lk.target = '_blank'; lk.rel = 'noopener'; document.body.appendChild(lk); lk.click(); lk.remove(); bk.sent = true; bookingPage(code); return;
    }
    bk[k] = el.dataset.id; bk.sent = false; bookingPage(code);
    if (k === 'time' && innerWidth < 760) { const n = main.querySelector('[data-bkin="name"]'); if (n && !bk.name.trim()) n.scrollIntoView({ behavior: 'smooth', block: 'center' }); }
  };
  main.oninput = e => { const k = e.target.dataset.bkin; if (k) { bk[k] = e.target.value; const b = main.querySelector('[data-bk="send"]'); b.disabled = !(bk.time && bk.name.trim().length > 1); } };
}

function bootBooking() { const h = location.hash.replace(/^#(agendar=)?/, ''); bookingPage(h || window.GL_DEMO || ''); }
if (document.body.classList.contains('cliente')) window.addEventListener('hashchange', bootBooking);
if (document.body.classList.contains('cliente')) bootBooking();
