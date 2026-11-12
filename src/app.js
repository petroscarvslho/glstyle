// GL Style — interface. Usa as funções de core.js e store.js (juntadas no build).
let store; try { store = createStore(window.localStorage); } catch { store = createStore(null); }
const S = () => store.state;
const ui = { cx: 'resumo', aj: 'salao', tab: 'hoje', pro: 'todos', day: ymd(new Date()), month: monthKey(new Date()), q: '', sheet: null, open: {} };
const $ = sel => document.querySelector(sel);
const today = () => startOfDay(new Date());
const byId = (arr, id) => arr.find(x => x.id === id);
const client = id => byId(S().clients, id) || { name: '(cliente removido)', phone: '' };
const service = id => byId(S().services, id) || { name: '?', durationMin: 30, price: 0, materialCost: 0 };
const pro = id => byId(S().pros, id) || S().pros[0];
const plan = id => byId(S().plans, id);
const owner = () => S().pros.find(p => p.owner) || S().pros[0];
const hhmm = iso => iso.slice(11, 16);
const dataCurta = d => d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
const mesNome = mk => { const [y, m] = mk.split('-').map(Number); return new Date(y, m - 1, 1).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }); };
const firstName = n => String(n).split(' ')[0];

function ask(msg, okLabel, act, id) { sheet(`<h2>${esc(msg)}</h2><div class="duas" style="margin-top:12px"><button class="bt leve" data-act="close">Voltar</button><button class="bt mal" style="background:var(--mal);color:#fff" data-act="${act}" data-id="${id || ''}" data-ok="1">${esc(okLabel)}</button></div>`); }
function save() { store.save(); render(); }
function toast(msg) { const t = document.createElement('div'); t.className = 'aviso'; t.textContent = msg; document.body.appendChild(t); setTimeout(() => t.remove(), 2200); }
async function copy(text, msg = 'Copiado') { try { await navigator.clipboard.writeText(text); } catch { const ta = document.createElement('textarea'); ta.value = text; document.body.appendChild(ta); ta.select(); try { document.execCommand('copy'); } catch {} ta.remove(); } toast(msg); }
function openWA(phone, text) { if (normPhone(phone).length < 12) { toast('Cliente sem WhatsApp cadastrado: abra a ficha e preencha'); return false; } const a = document.createElement('a'); a.href = waLink(phone, text); a.target = '_blank'; a.rel = 'noopener'; document.body.appendChild(a); a.click(); a.remove(); return true; }

// ---------- regras de negócio da interface
const mats = () => S().materials || [];
const cpm = () => costPerMinute(S().fixedCosts, (S().settings.hoursPerMonth || 176) * Math.max(1, S().pros.length));
const pixFor = (amount, txid) => pixCode({ key: normPixKey(S().settings.pixKey, S().settings.pixKeyType || 'phone'), name: S().settings.pixName, city: S().settings.pixCity, amount, txid });
function vars(extra) { return { salao: S().settings.shopName, ...extra }; }
function planPaid(c, refDate) { const cyc = cycleRange(c.dueDay || 1, refDate); return S().payments.some(p => p.kind === 'plan' && p.clientId === c.id && p.ref === ymd(cyc.start)); }
function coveredFor(c, serviceId, startIso) {
  const pl = plan(c.planId); if (!pl || !pl.serviceIds.includes(serviceId)) return false;
  if (pl.type === 'unlimited') return true;
  const cyc = cycleRange(c.dueDay || 1, parseLocal(startIso));
  const used = S().appointments.filter(a => a.clientId === c.id && a.covered && a.status !== 'canceled' && a.status !== 'noshow' && (() => { const d = startOfDay(parseLocal(a.start)); return d >= cyc.start && d <= cyc.end; })()).length;
  return used < pl.visitsPerCycle;
}
function openCharges() {
  const t = today(), out = [];
  for (const c of S().clients) {
    const pl = plan(c.planId); if (!pl) continue;
    const cyc = cycleRange(c.dueDay || 1, t);
    if (!planPaid(c, t)) out.push({ id: 'plan:' + c.id + ':' + ymd(cyc.start), kind: 'plan', client: c, clientName: c.name, amount: pl.price, ref: ymd(cyc.start), due: cyc.start, late: daysBetween(cyc.start, t), label: pl.name });
    else {
      const next = addDays(cyc.end, 1), dd = daysBetween(t, next);
      if (dd <= 3) out.push({ id: 'plan:' + c.id + ':' + ymd(next), kind: 'plan', client: c, clientName: c.name, amount: pl.price, ref: ymd(next), due: next, late: -dd, label: pl.name, upcoming: true });
    }
  }
  for (const a of S().appointments) {
    if (a.status === 'done' && !a.paid && !a.covered && pro(a.proId).owner) {
      const c = client(a.clientId);
      out.push({ id: 'appt:' + a.id, kind: 'single', client: c, clientName: c.name, amount: a.price, ref: a.id, due: parseLocal(a.start), late: daysBetween(parseLocal(a.start), t), label: service(a.serviceId).name });
    }
  }
  return out.sort((a, b) => b.late - a.late);
}
function receive(ch, method = 'pix') {
  const now = new Date(), iso = `${ymd(now)}T${pad2(now.getHours())}:${pad2(now.getMinutes())}`;
  if (ch.kind === 'plan') S().payments.push({ id: store.uid(), clientId: ch.client.id, amount: ch.amount, date: iso, kind: 'plan', ref: ch.ref, method });
  else {
    const a = byId(S().appointments, ch.ref); if (a) a.paid = true;
    S().payments.push({ id: store.uid(), clientId: ch.client.id, amount: ch.amount, date: iso, kind: 'single', ref: ch.ref, method, proId: a?.proId });
  }
  if (ch.late > 0 && ch.kind === 'plan') ch.client.lateCount = (ch.client.lateCount || 0) + 1;
}
function chargeText(ch) {
  const pix = pixFor(ch.amount, 'GL' + ch.client.id.slice(0, 6));
  const T = S().settings.templates;
  const tpl = ch.kind === 'single' ? T.charge : ch.late <= 0 && T.renew ? T.renew : (toneFor(ch.client.lateCount || 0) === 'firme' ? T.remindFirme : T.remindLeve);
  const fimDate = ch.due, inicio = cycleRange(ch.client.dueDay || 1, addDays(fimDate, -1)).start;
  return fill(tpl, vars({ nome: firstName(ch.client.name), plano: ch.label, valor: brl(ch.amount), data: ch.late > 0 ? dataCurta(ch.due) : (ch.late === 0 ? 'hoje' : dataCurta(ch.due)), inicio: dataCurta(inicio), fim: ch.late === 0 ? `hoje, ${dataCurta(fimDate)}` : `em ${dataCurta(fimDate)}`, chave: S().settings.pixKey, pix }));
}
function visitsOf(cid) { return S().appointments.filter(a => a.clientId === cid && a.status === 'done').map(a => parseLocal(a.start)); }

// ---------- link de agendamento
function bookingURL() {
  const st = S().settings, t = today(), d = {};
  for (let i = 0; i < 7; i++) {
    const day = ymd(addDays(t, i)); d[day] = {};
    const brk = st.breakStart && Number(st.breakMin) > 0 ? (() => { const [h, mm] = st.breakStart.split(':').map(Number); return [[h * 60 + mm, h * 60 + mm + Number(st.breakMin)]]; })() : [];
    for (const p of S().pros) d[day][p.id] = S().appointments.filter(a => a.proId === p.id && a.start.startsWith(day) && !['canceled', 'noshow'].includes(a.status))
      .map(a => { const s0 = parseLocal(a.start), m = s0.getHours() * 60 + s0.getMinutes(); return [m, m + service(a.serviceId).durationMin]; })
      .concat((S().blocks || []).filter(b => b.proId === p.id && b.start.startsWith(day)).map(b => { const s0 = parseLocal(b.start), m = s0.getHours() * 60 + s0.getMinutes(); return [m, m + Number(b.durationMin)]; }))
      .concat(brk);
  }
  const data = { s: st.shopName, a: st.address || '', w: normPhone(owner().phone), o: st.openHour, c: st.closeHour, sl: st.slotMin, wd: st.workDays, sv: S().services.filter(x => !x.hideOnline).map(x => [x.id, x.name, x.price, x.durationMin]), n: activeNotices(st.notices, new Date()), ig: (st.instagram || '').replace(/^@/, ''), pol: st.policy || '', ma: Number(st.minAdvanceH) || 0, pr: S().pros.map(p => [p.id, firstName(p.name.replace(/\s*\(.*\)/, ''))]), d, g: Date.now() };
  return location.href.split('#')[0].replace(/[^/]*$/, '') + 'index.html#agendar=' + encodeAvailability(data);
}

// ---------- ícones
const I_LOCK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>';
const I = {
  lock: I_LOCK,
  undo: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 7H4V2"/><path d="M4.5 7A8 8 0 1 1 4 13"/></svg>',
  plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14M5 12h14"/></svg>',
  check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
  zap: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9"><path d="M4.5 19.5l1.2-3.6A8 8 0 1 1 8.4 18.6z"/><path d="M9.2 9.3c.3 2.4 2.2 4.4 4.6 4.9l1.1-1.1 1.8.8-.4 1.6c-3.6.2-7.6-3.6-7.6-7.4l1.6-.5.8 1.8z" stroke-width="1.3"/></svg>',
  x: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M7 7l10 10M17 7 7 17"/></svg>',
  copy: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="8" y="8" width="11.5" height="11.5" rx="2.5"/><path d="M15.5 8V6.5A2 2 0 0 0 13.5 4.5H6.5a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2H8"/></svg>',
  hoje: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/></svg>',
  agenda: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3.5" y="5" width="17" height="15" rx="2.5"/><path d="M3.5 10h17M8 3v4M16 3v4"/></svg>',
  clientes: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="9" cy="8.5" r="3.5"/><path d="M2.8 19.5c.7-3.4 3.2-5 6.2-5s5.5 1.6 6.2 5"/><circle cx="17" cy="9.5" r="2.6"/><path d="M16.5 14.6c2.4.1 4 1.5 4.6 4.4"/></svg>',
  cobrancas: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 3.5 20.5 12 12 20.5 3.5 12z"/><path d="M8.5 12h7"/></svg>',
  caixa: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 19.5V11M10 19.5V6M16 19.5v-6M21 19.5H3"/></svg>',
};

// ---------- telas
function proChips() {
  if (S().pros.length < 2) return '';
  return `<div class="chips">${[{ id: 'todos', name: 'Todos' }, ...S().pros].map(p => `<button class="chip ${ui.pro === p.id ? 'on' : ''}" data-act="pro" data-id="${p.id}">${p.color ? `<span class="dot" style="background:${p.color}"></span>` : ''}${esc(firstName(p.name))}</button>`).join('')}</div>`;
}
const fPro = a => ui.pro === 'todos' || a.proId === ui.pro;
const statusTag = a => ({ requested: '<span class="tag av">pedido</span>', scheduled: '<span class="tag mudo">marcado</span>', confirmed: '<span class="tag ok">confirmado</span>', done: '<span class="tag ok">atendido</span>', noshow: '<span class="tag mal">faltou</span>', canceled: '<span class="tag mal">cancelado</span>' }[a.status] || '');

function apptItem(a, actions = true, main = true) {
  const c = client(a.clientId), s = service(a.serviceId), p = pro(a.proId);
  const pago = a.covered ? '<span class="tag plano">plano</span>' : (a.paid ? '<span class="tag ok">pago</span>' : (a.status === 'done' ? `<span class="tag av">deve ${brl(a.price)}</span>` : `<span class="mini">${brl(a.price)}</span>`));
  let bts = '';
  if (actions) {
    if (a.status === 'requested') bts = `<button class="bt ok" data-act="accept" data-id="${a.id}">Aceitar pedido</button><button class="ib mal" data-act="refuse" data-id="${a.id}" aria-label="Recusar pedido">${I.x}</button>`;
    else if ((a.status === 'scheduled' || a.status === 'confirmed') && !main) bts = `<span style="flex:1"></span><button class="ib ok" data-act="done" data-id="${a.id}" aria-label="Marcar atendido">${I.check}</button><button class="ib zap" data-act="confirm" data-id="${a.id}" aria-label="Confirmar no WhatsApp">${I.zap}</button><button class="ib mal" data-act="noshow" data-id="${a.id}" aria-label="Marcar falta">${I.x}</button>`;
    else if (a.status === 'scheduled' || a.status === 'confirmed') bts = `<button class="bt ok" data-act="done" data-id="${a.id}">Atendido</button><button class="ib zap" data-act="confirm" data-id="${a.id}" aria-label="Confirmar no WhatsApp">${I.zap}</button><button class="ib mal" data-act="noshow" data-id="${a.id}" aria-label="Marcar falta">${I.x}</button>`;
    else if (a.status === 'done' && !a.paid && !a.covered) bts = `<button class="bt ouro" data-act="paid" data-id="${a.id}">Recebi ${brl(a.price)}</button><button class="ib zap" data-act="chargeAppt" data-id="${a.id}" aria-label="Cobrar no WhatsApp">${I.zap}</button><button class="desfazer" data-act="undo" data-id="${a.id}">Desfazer</button>`;
    else if (a.status === 'done') bts = `<button class="bt leve" data-act="prod" data-id="${a.id}">+ produto${(a.extras || []).length ? ` (${a.extras.length})` : ''}</button><span style="flex:1"></span><button class="desfazer" data-act="undo" data-id="${a.id}">Desfazer</button>`;
    else if (a.status === 'noshow') bts = `<span style="flex:1"></span><button class="desfazer" data-act="undo" data-id="${a.id}">Desfazer</button>`;
  }
  const cls = a.status === 'requested' ? 'pedido' : (a.status === 'done' || a.status === 'noshow' ? 'feito' : '');
  if (actions && ((a.status === 'done' && (a.paid || a.covered)) || a.status === 'noshow')) return `<div class="item compacto feito">
    <div class="hora">${hhmm(a.start)}</div>
    <div style="min-width:0"><div class="nome" data-act="client" data-id="${c.id}">${esc(c.name)}</div><div class="meta">${esc(s.name)} · ${a.status === 'noshow' ? '<span style="color:var(--mal)">faltou</span>' : `<span style="color:var(--ok)">atendido</span>${a.covered ? ' · plano' : ''}${(a.extras || []).length ? ` · +${a.extras.length} produto` : ''}`}</div></div>
    <div class="acoes-lado">${a.status === 'done' ? `<button class="ib" data-act="prod" data-id="${a.id}" aria-label="Vender produto">${I.plus}</button>` : ''}<button class="ib" data-act="undo" data-id="${a.id}" aria-label="Desfazer">${I.undo}</button></div></div>`;
  if (actions && !main && (a.status === 'scheduled' || a.status === 'confirmed')) return `<div class="item compacto">
    <div class="hora">${hhmm(a.start)}</div>
    <div style="min-width:0"><div class="nome" data-act="client" data-id="${c.id}">${esc(c.name)}</div><div class="meta">${esc(s.name)} · ${a.covered ? 'plano' : brl(a.price)}${a.status === 'confirmed' ? ' · <span style="color:var(--ok)">confirmado</span>' : ''}</div></div>
    <div class="acoes-lado"><button class="ib ok" data-act="done" data-id="${a.id}" aria-label="Marcar atendido">${I.check}</button><button class="ib zap" data-act="confirm" data-id="${a.id}" aria-label="Confirmar no WhatsApp">${I.zap}</button><button class="ib mal" data-act="noshow" data-id="${a.id}" aria-label="Marcar falta">${I.x}</button></div></div>`;
  return `<div class="item ${cls}">
    <div class="hora">${hhmm(a.start)}</div>
    <div style="min-width:0"><div class="nome" data-act="client" data-id="${c.id}">${esc(c.name)}</div>
      <div class="meta">${S().pros.length > 1 ? `<span class="dot" style="background:${p.color}"></span>${esc(firstName(p.name))} · ` : ''}${esc(s.name)} · ${s.durationMin} min</div></div>
    <div style="text-align:right">${statusTag(a)}${['done', 'noshow'].includes(a.status) && (a.covered || a.paid) ? '' : `<div style="margin-top:4px">${pago}</div>`}</div>
    ${bts ? `<div class="acoes" style="display:flex">${bts}</div>` : ''}</div>`;
}

function viewHoje() {
  const t = today(), tk = ymd(t);
  const list = S().appointments.filter(a => a.start.startsWith(tk) && a.status !== 'canceled' && fPro(a)).sort((a, b) => a.start.localeCompare(b.start));
  const recebido = S().payments.filter(p => p.date.startsWith(tk) && (ui.pro === 'todos' || p.proId === ui.pro || (!p.proId && pro(ui.pro)?.owner))).reduce((s, p) => s + p.amount, 0);
  const aReceber = list.filter(a => !a.paid && !a.covered && a.status !== 'noshow').reduce((s, a) => s + a.price, 0);
  const feitos = list.filter(a => a.status === 'done').length;
  const tomorrow = ymd(addDays(t, 1));
  const amanha = S().appointments.filter(a => a.start.startsWith(tomorrow) && a.status === 'scheduled' && fPro(a)).sort((a, b) => a.start.localeCompare(b.start));
  const charges = openCharges().filter(c => c.late > 0).length;
  return `<div class="hoje-topo"><h1>Hoje</h1><span class="data-topo">${esc(new Date().toLocaleDateString('pt-BR', { weekday: 'short', day: 'numeric', month: 'short' }).replace(/\./g, ''))}</span><span class="selo-mini">${feitos}/${list.length} atendidos</span></div>
  ${store.persistent ? '' : '<div class="faixa-demo">Os dados ficam só nesta aba: o navegador não deixa guardar. Use Ajustes → Exportar backup antes de fechar.</div>'}
  ${isOpenDay(S().settings, tk) ? '' : '<div class="faixa-demo">Hoje o salão não abre. Bom descanso! ✂️</div>'}
  <div class="resumo-dia"><div><span>Recebido</span><b class="num">${brl(recebido)}</b></div><div><span>A receber</span><b class="num">${brl(aReceber)}</b></div><div><span>Próximo</span><b class="num">${(() => { const nx = list.find(a => ['scheduled', 'confirmed'].includes(a.status) && a.start.slice(11, 16) >= `${pad2(new Date().getHours())}:${pad2(new Date().getMinutes())}`); return nx ? hhmm(nx.start) + ' ' + esc(firstName(client(nx.clientId).name)) : '—'; })()}</b></div></div>
  ${charges ? `<div class="cartao alerta alerta-cob" data-act="tab" data-id="cobrancas" style="cursor:pointer"><div><strong>${charges} cobrança${charges > 1 ? 's' : ''} em atraso</strong><div class="mini">Cobrar pelo WhatsApp</div></div><span class="seta">›</span></div>` : ''}
  ${(() => { const req = S().appointments.filter(a => a.status === 'requested').sort((a, b) => a.start.localeCompare(b.start)); return req.length ? `<h2>Pedidos de clientes <small>${req.length}</small></h2><div class="lista">${req.map(a => `<div class="mini">${esc(dataBR(parseLocal(a.start)))}</div>${apptItem(a)}`).join('')}</div>` : ''; })()}
  <div class="duas" style="margin-top:12px"><button class="bt ouro" data-act="walkin">⚡ Chegou alguém</button><button class="bt leve" data-act="shareFree">Divulgar livres</button></div>
  <h2>Agenda de hoje <small>${list.filter(a => a.status !== 'requested').length} horários</small></h2>
  ${proChips()}
  <div class="lista">${list.filter(a => a.status !== 'requested').length ? (() => { const ls = list.filter(a => a.status !== 'requested'); const nx = ls.find(a => ['scheduled', 'confirmed'].includes(a.status)); return ls.map(a => apptItem(a, true, a === nx)).join(''); })() : '<div class="vazio">Nenhum horário hoje. Toque em + para marcar.</div>'}</div>
  ${(() => { const bd = birthdaysSoon(S().clients, t); return bd.length ? `<h2>Aniversários da semana <small>${bd.length}</small></h2><div class="grupo">${bd.map(x => `<div class="linha"><div class="cresce"><strong>🎂 ${esc(x.client.name)}</strong><div class="meta">${x.inDays === 0 ? 'hoje!' : x.inDays === 1 ? 'amanhã' : `em ${x.inDays} dias · ${dataCurta(x.date)}`}</div></div><button class="ib zap" data-act="bday" data-id="${x.client.id}" aria-label="Mandar parabéns">${I.zap}</button></div>`).join('')}</div>` : ''; })()}
  <h2>Confirmar amanhã <small>${amanha.length}</small></h2>
  ${amanha.length ? `<div class="grupo">${amanha.map(a => `<div class="linha"><div class="cresce"><strong>${hhmm(a.start)}</strong> ${esc(client(a.clientId).name)}<div class="meta">${esc(service(a.serviceId).name)}${S().pros.length > 1 ? ' · ' + esc(firstName(pro(a.proId).name)) : ''}${a.remindedAt ? ' · mensagem enviada' : ''}</div></div><button class="${a.remindedAt ? 'ib' : 'ib zap'}" data-act="confirm" data-id="${a.id}" aria-label="${a.remindedAt ? 'Reenviar' : 'Enviar'} confirmação">${I.zap}</button></div>`).join('')}</div>` : '<div class="vazio">Nada pendente para amanhã.</div>'}`;
}

function viewAgenda() {
  const base = parseLocal(ui.day + 'T00:00');
  const t = today();
  const days = Array.from({ length: 14 }, (_, i) => addDays(t, i - 3));
  const st = S().settings, slots = [];
  for (let m = st.openHour * 60; m < st.closeHour * 60; m += st.slotMin) slots.push(m);
  const dayAppts = S().appointments.filter(a => a.start.startsWith(ui.day) && a.status !== 'canceled' && fPro(a));
  const rows = slots.map(m => {
    const hh = `${pad2(Math.floor(m / 60))}:${pad2(m % 60)}`;
    const here = dayAppts.filter(a => { const s = parseLocal(a.start); const am = s.getHours() * 60 + s.getMinutes(); return am >= m && am < m + st.slotMin; });
    const busyPros = new Set(dayAppts.filter(a => { const s = parseLocal(a.start); const am = s.getHours() * 60 + s.getMinutes(); return am < m + st.slotMin && am + service(a.serviceId).durationMin > m; }).map(a => a.proId));
    const free = ui.pro === 'todos' ? busyPros.size < S().pros.length : !busyPros.has(ui.pro);
    const blk = (S().blocks || []).filter(b => b.start.startsWith(ui.day) && (ui.pro === 'todos' || b.proId === ui.pro) && (() => { const s0 = parseLocal(b.start); const bm = s0.getHours() * 60 + s0.getMinutes(); return bm >= m && bm < m + st.slotMin; })());
    const b0 = st.breakStart ? (([h0, m0]) => h0 * 60 + m0)(st.breakStart.split(':').map(Number)) : -1;
    const pausa = st.breakStart && m >= b0 && m < b0 + Number(st.breakMin || 0);
    if (pausa && !here.length) return m < b0 + st.slotMin ? `<div class="slot"><div class="h num">${hh}</div><div class="c"><div class="bloq">Pausa · ${Number(st.breakMin || 0)} min</div></div></div>` : '';
    return `<div class="slot"><div class="h num">${hh}</div><div class="c">${blk.map(b => `<div class="bloq">Bloqueado · ${esc(b.reason)} (${b.durationMin} min)<button class="desfazer" data-act="unblock" data-id="${b.id}">tirar</button></div>`).join('')}${here.map(a => `<div class="ocup" style="border-left-color:${pro(a.proId).color}" data-act="appt" data-id="${a.id}"><strong>${esc(client(a.clientId).name)}</strong> ${statusTag(a)}<div class="mini">${esc(service(a.serviceId).name)}${S().pros.length > 1 ? ' · ' + esc(firstName(pro(a.proId).name)) : ''}</div></div>`).join('')}${free && !here.length && !blk.length ? `<div style="display:flex;gap:6px"><button class="livre" style="flex:1" data-act="new" data-time="${hh}">livre</button><button class="ib" data-act="block" data-time="${hh}" aria-label="Bloquear ${hh}">${I.lock}</button></div>` : ''}</div></div>`;
  }).join('');
  const aberto = isOpenDay(st, ui.day);
  return `<h1>Agenda</h1><p class="sub">${esc(dataBR(base))}${aberto ? '' : ' · fechado'}</p>
  <div class="dias">${days.map(d => `<button class="dia ${ymd(d) === ui.day ? 'on' : ''}" data-act="day" data-id="${ymd(d)}" ${isOpenDay(st, ymd(d)) ? '' : 'style="opacity:.45"'}>${d.toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', '')}<b>${d.getDate()}</b></button>`).join('')}</div>
  ${proChips()}${aberto || dayAppts.length ? rows : '<div class="vazio">Dia fechado: sem atendimento. Mude os dias em Ajustes → Salão.</div>'}
  <details class="mais cartao" style="margin-top:18px" ${ui.req ? 'open' : ''}><summary>Link de agendamento para clientes</summary><div class="mini">Mande o link no WhatsApp, status ou Instagram. O cliente vê os horários livres dos próximos 7 dias e pede pelo WhatsApp. Gere de novo quando a agenda mudar.</div>
    <div class="duas" style="margin-top:8px"><button class="bt ouro" data-act="bookLink">Copiar link</button><button class="bt leve" data-act="bookPreview">Ver como cliente</button></div>
    <label class="campo"><span>Chegou um pedido? Cole a mensagem aqui</span><textarea data-input="req" placeholder="Olá! Quero marcar… #GL[…]">${esc(ui.req || '')}</textarea></label>
    <button class="bt ok cheio" data-act="pasteReq">Adicionar pedido</button></details>`;
}

function viewClientes() {
  const t = today(), q = stripAccents(ui.q).toLowerCase();
  const all = [...S().clients].sort((a, b) => a.name.localeCompare(b.name));
  const lastAppt = c => S().appointments.filter(a => a.clientId === c.id && a.status === 'done').sort((a, b) => b.start.localeCompare(a.start))[0];
  const hasFuture = c => S().appointments.some(a => a.clientId === c.id && ['scheduled', 'confirmed', 'requested'].includes(a.status) && parseLocal(a.start) >= t);
  const dueOf = c => { const la = lastAppt(c); if (!la) return null; const rd = service(la.serviceId).returnDays; const d = returnDue(parseLocal(la.start), rd, t); return d !== null ? d : (isMissing(visitsOf(c.id), t, S().settings.missingDays) ? 1 : null); };
  const sumidos = all.filter(c => !hasFuture(c) && (dueOf(c) ?? -1) >= 0).sort((a, b) => dueOf(b) - dueOf(a));
  const list = all.filter(c => !q || stripAccents(c.name).toLowerCase().includes(q) || c.phone.includes(q));
  const last = c => { const v = visitsOf(c.id); return v.length ? daysBetween(v.reduce((a, b) => (a > b ? a : b)), t) : null; };
  const debt = c => S().appointments.filter(a => a.clientId === c.id && a.status === 'done' && !a.paid && !a.covered).reduce((s, a) => s + a.price, 0);
  return `<h1>Clientes</h1><p class="sub">${all.length} cadastrados · ${all.filter(c => c.planId).length} com plano</p>
  <input type="search" placeholder="Buscar por nome ou telefone" value="${esc(ui.q)}" data-input="q" autocomplete="off">
  ${!q && sumidos.length ? `<h2>Hora de chamar <small>passou o dia de voltar</small></h2><div class="grupo">${sumidos.map(c => `<div class="linha"><div class="cresce"><strong data-act="client" data-id="${c.id}">${esc(c.name)}</strong><div class="meta">Última visita há ${last(c)} dia${last(c) === 1 ? '' : 's'} · ${(() => { const la = lastAppt(c), rd = la && service(la.serviceId).returnDays; return rd ? `${esc(service(la.serviceId).name)} volta em ${rd} dias` : `costuma vir a cada ${rhythm(visitsOf(c.id)) ?? '?'} dias`; })()}</div></div><button class="ib zap" data-act="comeback" data-id="${c.id}" aria-label="Chamar no WhatsApp">${I.zap}</button></div>`).join('')}</div><h2>Todos <small>${all.length}</small></h2>` : ''}
  <div class="grupo" id="cliRes" style="margin-top:10px">${list.map(c => { const d = debt(c), l = last(c); return `<div class="linha" data-act="client" data-id="${c.id}" style="cursor:pointer"><div class="cresce"><strong>${esc(c.name)}</strong>${c.planId ? `<span class="tag plano">${esc(plan(c.planId)?.name || '')}</span>` : ''}${d ? `<span class="tag av">deve ${brl(d)}</span>` : ''}<div class="meta">${l === null ? 'Sem visitas' : l === 0 ? 'Veio hoje' : `Última visita há ${l} dia${l === 1 ? '' : 's'}`}</div></div><span class="seta">›</span></div>`; }).join('') || '<div class="vazio">Ninguém com esse nome. Toque em + para cadastrar no agendamento.</div>'}</div>
  <button class="bt cheio leve" style="margin-top:12px" data-act="newClient">Cadastrar cliente</button>`;
}

function viewCobrancas() {
  const ch = openCharges();
  const late = ch.filter(c => c.late > 0), soon = ch.filter(c => c.late <= 0);
  const st8 = c => c.kind === 'single' ? (c.late > 0 ? `<span class="neg">há ${c.late} dia${c.late > 1 ? 's' : ''}</span>` : 'hoje') : c.late > 0 ? `<span class="neg">${c.late} dia${c.late > 1 ? 's' : ''}</span>` : c.late === 0 ? 'vence hoje' : `vence em ${-c.late} dia${c.late < -1 ? 's' : ''}`;
  const row = c => `<div class="linha cob-l"><div class="cresce" data-act="client" data-id="${c.client.id}" style="cursor:pointer"><strong>${esc(c.client.name)}</strong><div class="meta">${esc(c.label)} · ${st8(c)}</div></div><div class="cob-v"><b class="num">${brl(c.amount)}</b><button class="link-mini" data-act="copyPix" data-id="${c.id}">copiar Pix</button></div><button class="ib zap" data-act="charge" data-id="${c.id}" aria-label="Cobrar no WhatsApp">${I.zap}</button><button class="ib ok" data-act="receive" data-id="${c.id}" aria-label="Recebi">${I.check}</button></div>`;
  const pend = ui.pending || [];
  return `<h1>Cobranças</h1>
  <h2>Em atraso <small>${brl(late.reduce((t, c) => t + c.amount, 0))}</small></h2>${late.length ? `<div class="grupo">${late.map(row).join('')}</div>` : '<div class="vazio">Ninguém em atraso.</div>'}
  <h2>Vencendo <small>${brl(soon.reduce((t, c) => t + c.amount, 0))}</small></h2>${soon.length ? `<div class="grupo">${soon.map(row).join('')}</div>` : '<div class="vazio">Nada vencendo nos próximos 3 dias.</div>'}
  <details class="mais" ${ui.notif || pend.length ? 'open' : ''}><summary>Chegou um Pix? Conferir pelo comprovante</summary><div class="mini">Cole a notificação ou o comprovante do banco. O app acha a cobrança pelo nome e valor e marca como paga.</div>
    <textarea data-input="notif" placeholder="Ex.: Você recebeu um Pix de JOAO PEDRO no valor de R$ 100,00">${esc(ui.notif || '')}</textarea>
    <button class="bt ouro cheio" style="margin-top:8px" data-act="parseNotif">Conferir Pix</button>
    ${pend.length ? `<h2>Pix a conferir</h2>${pend.map((p, i) => `<div class="linha" style="background:var(--couro);margin-top:6px"><div class="cresce">${esc(p.name || 'Sem nome')} · <strong>${p.amount != null ? brl(p.amount) : 'valor não lido'}</strong><div class="meta">Não achei uma cobrança só com esses dados. Escolha:</div><select data-pend="${i}"><option value="">Escolher cobrança…</option>${ch.map(c => `<option value="${c.id}">${esc(c.client.name)} — ${brl(c.amount)}</option>`).join('')}</select></div></div>`).join('')}` : ''}</details>`;
}

function viewCaixa() {
  const mk = ui.month, sum = monthSummary(S(), mk), t = today();
  const isCur = mk === monthKey(t);
  const bills = billsStatus(S(), mk, t);
  const fc = forecast30(S(), t);
  const c = cpm();
  const svcRows = S().services.map(s => { const cost = apptCost(s, c, s.price, S().settings.paymentFeePct, mats()); return `<div class="linha"><div class="cresce"><strong>${esc(s.name)}</strong><div class="meta">${s.durationMin} min · material ${brl(materialCostOf(s, mats()))} · cadeira ${brl(s.durationMin * c)} · preço ${brl(s.price)}</div></div><div class="valor num ${s.price - cost >= 0 ? 'pos' : 'neg'}">${brl(s.price - cost)}</div></div>`; }).join('');
  const planRows = S().plans.map(pl => {
    const subs = S().clients.filter(x => x.planId === pl.id);
    const stats = subs.map(x => ({ c: x, ...subscriberStats(x, pl, S().appointments, S().services, c, S().settings.paymentFeePct, t, mats()) }));
    const lucro = stats.reduce((s, x) => s + x.profit, 0);
    const avg = pl.serviceIds.map(id => apptCost(service(id), c, 0, 0, mats())).reduce((a, b) => a + b, 0) / Math.max(1, pl.serviceIds.length);
    const be = breakEven(pl.price, avg);
    const ruins = stats.filter(x => x.profit < 0);
    return `<div class="cartao"><div style="display:flex;justify-content:space-between"><div><strong>${esc(pl.name)}</strong><div class="mini">${brl(pl.price)}/mês · ${subs.length} assinante${subs.length !== 1 ? 's' : ''} · ${pl.type === 'unlimited' ? 'ilimitado' : pl.visitsPerCycle + ' visitas'}</div></div><div class="valor num ${lucro >= 0 ? 'pos' : 'neg'}">${brl(lucro)}</div></div>
      <div class="mini" style="margin-top:6px">Compensa até <strong>${be === Infinity ? '∞' : be} visitas</strong> no mês por cliente. Custo médio por visita: ${brl(avg)}.</div>
      ${stats.map(x => `<div class="mini" style="display:flex;justify-content:space-between;margin-top:4px"><span>${esc(x.c.name)} · ${x.visits} visita${x.visits !== 1 ? 's' : ''}</span><span class="num ${x.profit >= 0 ? 'pos' : 'neg'}">${brl(x.profit)}</span></div>`).join('')}
      ${ruins.length ? `<div class="mini neg" style="margin-top:6px">${ruins.length} assinante(s) dando prejuízo neste ciclo.</div>` : ''}</div>`;
  }).join('');
  const assoc = S().pros.filter(p => !p.owner).map(p => {
    const sh = proShare(p, S().appointments, mk);
    const paid = (S().proPayments || []).filter(x => x.proId === p.id && x.month === mk).reduce((s, x) => s + x.amount, 0);
    const falta = round2(sh.share - paid);
    return `<div class="linha"><div class="cresce"><strong><span class="dot" style="background:${p.color}"></span>${esc(p.name)}</strong><div class="meta">Faturou ${brl(sh.gross)} · repasse ${p.shareType === 'percent' ? p.shareValue + '%' : 'fixo'} = ${brl(sh.share)}${paid ? ` · pago ${brl(paid)}` : ''}</div></div>${falta > 0 ? `<div style="display:flex;gap:6px"><button class="bt zap" data-act="proCharge" data-id="${p.id}" data-v="${falta}">Cobrar</button><button class="bt ok" data-act="proPaid" data-id="${p.id}" data-v="${falta}">Recebi</button></div>` : '<span class="tag ok">em dia</span>'}</div>`;
  }).join('');
  const totalFix = S().fixedCosts.reduce((s, x) => s + x.monthly, 0);
  const sec = {
    resumo: () => `  <div class="cartao"><div class="mini">Lucro do mês</div><div class="grande num ${sum.profit >= 0 ? 'pos' : 'neg'}">${brl(sum.profit)}</div>
    <div class="duas" style="margin-top:8px"><div><div class="mini">Entrou</div><strong class="num">${brl(sum.totalIn)}</strong></div><div><div class="mini">Saiu</div><strong class="num">${brl(sum.totalOut)}</strong></div></div>
    <details class="mais"><summary>Ver detalhes</summary><div class="linha-mini"><span>Avulsos</span><span class="num ">${brl(sum.income.own)}</span></div><div class="linha-mini"><span>Mensalidades</span><span class="num ">${brl(sum.income.plans)}</span></div>${sum.income.shares ? `<div class="linha-mini"><span>Repasses</span><span class="num ">${brl(sum.income.shares)}</span></div>` : ''}<div class="linha-mini"><span>Produtos</span><span class="num ">${brl(sum.income.products)}</span></div><div class="linha-mini"><span>Contas</span><span class="num neg">${brl(-sum.out.fixed)}</span></div><div class="linha-mini"><span>Despesas</span><span class="num neg">${brl(-sum.out.expenses)}</span></div><div class="linha-mini"><span>Custo dos produtos</span><span class="num neg">${brl(-sum.out.productCost)}</span></div></details></div>
  ${isCur ? `<div class="cartao" style="margin-top:10px"><div style="display:flex;justify-content:space-between;align-items:baseline"><div class="mini">Saldo previsto em 30 dias</div><strong class="num ${fc.net >= 0 ? 'pos' : 'neg'}">${brl(fc.net)}</strong></div>${fc.net < 0 ? '<div class="mini neg" style="margin-top:4px">Vai faltar: cobre os atrasados ou segure despesas.</div>' : ''}
    <details class="mais"><summary>Ver lançamentos</summary>${fc.items.map(i => `<div class="linha-mini"><span>${dataCurta(i.date)} · ${esc(i.label)}</span><span class="num ${i.amount >= 0 ? 'pos' : 'neg'}">${brl(i.amount)}</span></div>`).join('')}</details></div>` : ''}
  ${assoc ? `<h2>Barbeiros associados <small>repasse de ${esc(mesNome(mk))}</small></h2><div class="lista">${assoc}</div>` : ''}
`,
    contas: () => `<div class="cartao"><div class="mini">Custo fixo do salão</div><div class="valor num" style="font-size:26px">${brl(costSummary(S().fixedCosts).monthly)}/mês</div><div class="mini">${costSummary(S().fixedCosts).filled} de ${costSummary(S().fixedCosts).total} custos preenchidos</div><div class="duas" style="margin-top:10px"><button class="bt ouro" data-act="costs">Custos fixos</button><button class="bt leve" data-act="cx" data-id="material">Material</button></div></div>  <h2>Contas do mês</h2><div class="grupo">${bills.map(b => `<div class="linha"><div class="cresce"><strong>${esc(b.cost.name)}</strong><div class="meta">vence ${dataCurta(b.due)} ${b.paid ? '<span class="tag ok">paga</span>' : b.overdue ? '<span class="tag mal">vencida</span>' : ''}</div></div><div class="valor num">${brl(b.cost.monthly)}</div>${b.paid ? '' : `<button class="ib ok" data-act="billPaid" data-id="${b.cost.id}" aria-label="Marcar paga">${I.check}</button>`}</div>`).join('')}</div>
  <h2>Despesas avulsas</h2>
  <div class="grupo">${S().expenses.filter(e => e.date.startsWith(mk)).map(e => `<div class="linha"><div class="cresce"><strong>${esc(e.name)}</strong><div class="meta">${dataCurta(parseLocal(e.date))}</div></div><div class="valor num neg">${brl(e.amount)}</div><button class="icone" data-act="delExpense" data-id="${e.id}" aria-label="Apagar despesa">✕</button></div>`).join('')}</div>
  <div class="tres" style="margin-top:8px"><input placeholder="Gasto (ex.: lâminas)" data-new="expName"><input inputmode="decimal" placeholder="R$" data-new="expVal"><button class="bt ouro" data-act="addExpense">Lançar</button></div>
  <h2>Quanto custa cada minuto</h2>
  <div class="cartao"><div class="duas"><div><div class="mini">Gastos fixos/mês</div><strong class="num">${brl(totalFix)}</strong></div><div><div class="mini">Custo do minuto de cadeira</div><strong class="num">${brl(c)}</strong></div></div>
  <div class="mini" style="margin-top:6px">${S().pros.length} cadeira(s) × ${S().settings.hoursPerMonth} h/mês. Cada cadeira custa ${brl(totalFix / Math.max(1, S().pros.length))} por mês. Compare com o repasse de cada associado.</div>
  <button class="bt ouro cheio" style="margin-top:10px" data-act="costs">Preencher custos do salão · ${costSummary(S().fixedCosts).filled} de ${costSummary(S().fixedCosts).total}</button></div>
`,
    dia: () => viewDia(),
    economia: () => viewEconomia(),
    material: () => `<button class="chip" style="margin-top:12px" data-act="cx" data-id="contas">‹ Voltar para Contas</button>  <h2>Material <small>custo por uso</small></h2><p class="sub">Coloque o preço que pagou e quantos atendimentos rende. O custo entra sozinho em cada serviço (Ajustes → Serviços).</p>
  <div class="grupo">${mats().map(m => `<div class="linha mat"><input class="nome-mat" value="${esc(m.name)}" data-mt="${m.id}" data-k="name" aria-label="Nome do material"><label>R$<input inputmode="decimal" value="${m.price}" data-mt="${m.id}" data-k="price" aria-label="Preço pago"></label><label>rende<input inputmode="numeric" value="${m.yield}" data-mt="${m.id}" data-k="yield" aria-label="Rende quantos usos"></label><span class="uso num">${brl(m.yield > 0 ? m.price / m.yield : 0)} <button class="icone" data-act="del" data-kind="mat" data-id="${m.id}" aria-label="Apagar">✕</button></span></div>`).join('')}</div>
  <button class="bt leve" style="margin-top:6px" data-act="addMat">Adicionar material</button>
`,
    lucro: () => `${viewCalc()}
  <h2>Lucro por pacote <small>ciclo atual</small></h2>${planRows}`,
  };
  return `<h1>Caixa</h1>
  <div class="seg" role="tablist">${[['resumo', 'Resumo'], ['dia', 'Dia'], ['contas', 'Contas'], ['economia', 'Economia'], ['lucro', 'Lucro']].map(([k, l]) => `<button role="tab" aria-selected="${ui.cx === k}" class="${ui.cx === k ? 'on' : ''}" data-act="cx" data-id="${k}">${l}</button>`).join('')}</div>
  ${ui.cx === 'resumo' || ui.cx === 'contas' ? `<div class="chips"><button class="chip" data-act="month" data-id="-1" aria-label="Mês anterior">‹</button><button class="chip on" style="flex:1">${esc(mesNome(mk))}</button><button class="chip" data-act="month" data-id="1" aria-label="Próximo mês">›</button></div>` : ''}
${(ui.cx === 'resumo' || ui.cx === 'contas') ? '' : ''}${sec[ui.cx]()}`;
}


// ---------- relatório do dia
function viewDia() {
  if (!ui.rDay) ui.rDay = ymd(new Date());
  const d = parseLocal(ui.rDay + 'T12:00'), r = dayReport(S(), ui.rDay), w = dayReport(S(), ymd(addDays(d, -7)));
  const cmp = (a, b, money = true) => { const df = a - b; if (!b && !a) return ''; return `<span class="mini" style="color:${df >= 0 ? 'var(--ok)' : 'var(--mal)'}">${df >= 0 ? '▲' : '▼'} ${money ? brl(Math.abs(df)) : Math.abs(df)} vs. ${d.toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', '')} passada</span>`; };
  const met = { pix: 'Pix', dinheiro: 'Dinheiro', cartao: 'Cartão' };
  const lista = S().appointments.filter(a => a.start.startsWith(ui.rDay) && a.status !== 'canceled').sort((a, b) => a.start.localeCompare(b.start));
  return `<div class="chips"><button class="chip" data-act="rDay" data-id="-1">‹</button><button class="chip on" style="flex:1">${esc(d.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' }))}</button><button class="chip" data-act="rDay" data-id="1">›</button></div>
  <div class="cartao-preto"><div class="rot">Entrou no dia</div><div class="val num">${brl(r.received)}</div><div>${cmp(r.received, w.received)}</div>
    <div class="linha3"><div><span class="rot">Atendidos</span><b class="num">${r.done}</b><span class="mini">${r.covered ? r.covered + ' do plano · ' : ''}${r.noshow} falta${r.noshow !== 1 ? 's' : ''}</span></div><div><span class="rot">Agenda ocupada</span><b class="num">${Math.round(r.occupancy * 100)}%</b><span class="mini">${Math.round(r.busyMin / 60 * 10) / 10} h de ${Math.round(r.openMin / 60)} h</span></div></div></div>
  <div class="grupo" style="margin-top:12px">
    ${Object.entries(r.byMethod).map(([k, v]) => `<div class="linha"><div class="cresce">${met[k] || k}</div><div class="valor num">${brl(v)}</div></div>`).join('') || '<div class="linha"><div class="cresce mini">Nenhum pagamento nesse dia</div></div>'}
    ${[['Produtos vendidos', r.products], ['Mensalidades recebidas', r.plans], ['Ticket médio', r.ticket], ['Ficou a receber', r.toReceive, 'neg'], ['Despesas do dia', r.expenses]].filter(x => x[1]).map(([n, v, c]) => `<div class="linha"><div class="cresce">${n}</div><div class="valor num ${c || ''}">${brl(v)}</div></div>`).join('')}
  </div>
  <h2>Atendimentos <small>${lista.length}</small></h2>
  <div class="grupo">${lista.map(a => `<div class="linha"><div class="cresce"><strong>${hhmm(a.start)} ${esc(client(a.clientId).name)}</strong><div class="meta">${esc(service(a.serviceId).name)}</div></div>${statusTag(a)}</div>`).join('') || '<div class="linha"><div class="cresce mini">Sem atendimentos</div></div>'}</div>
  <button class="bt leve cheio" style="margin-top:12px" data-act="sendDay">Mandar este resumo no meu WhatsApp</button>`;
}

// ---------- economia: onde cortar e comparação
function viewEconomia() {
  const st = S(), rk = costRanking(st.fixedCosts), tot = rk.reduce((t, c) => t + c.monthly, 0);
  const mk = ui.month, [y, m] = mk.split('-').map(Number), prev = monthKey(new Date(y, m - 2, 1));
  const a = monthSummary(st, mk), b = monthSummary(st, prev);
  const minMes = (st.settings.hoursPerMonth || 176) * 60 * Math.max(1, st.pros.length);
  const corte = st.services[0], lc = lucroServico(corte).lucro;
  const sel = byId(st.fixedCosts, ui.ecoCost) || rk[0], pct = ui.ecoPct || 10;
  const w = sel ? savingWhatIf(sel.monthly, pct, minMes, corte.durationMin, lc) : null;
  const linha = (n, va, vb, bomSubir) => { const df = va - vb, bom = bomSubir ? df >= 0 : df <= 0; return `<div class="linha"><div class="cresce">${n}<div class="meta">antes ${brl(vb)}</div></div><div style="text-align:right"><div class="valor num">${brl(va)}</div>${vb || va ? `<span class="mini" style="color:${df === 0 ? 'var(--mudo)' : bom ? 'var(--ok)' : 'var(--mal)'}">${df > 0 ? '▲' : df < 0 ? '▼' : '='} ${brl(Math.abs(df))}</span>` : ''}</div></div>`; };
  const matTop = (corte.materials || []).map(u => { const mt = byId(mats(), u.id); return mt && mt.yield > 0 ? { n: mt.name, v: u.qty * mt.price / mt.yield } : null; }).filter(Boolean).sort((x, y2) => y2.v - x.v).slice(0, 3);
  return `<h2>Onde está o seu custo <small>${brl(tot)}/mês</small></h2>
  <div class="grupo">${rk.map(c => { const tr = billTrend(st, c.id, mk); return `<button class="linha eco-row" data-act="ecoPick" data-id="${c.id}" style="width:100%;text-align:left;border-left:0;border-right:0;border-bottom:0;font:inherit;color:inherit;background:${sel && sel.id === c.id ? 'var(--sup2)' : 'none'};cursor:pointer"><div class="cresce"><strong>${esc(c.name)}</strong><div class="barra" style="margin-top:6px"><i style="width:${Math.round(c.share * 100)}%;background:var(--verde)"></i></div><div class="meta">${Math.round(c.share * 100)}% dos custos${tr.pct !== null ? ` · ${tr.diff >= 0 ? 'subiu' : 'caiu'} ${Math.abs(Math.round(tr.pct * 100))}% vs. mês passado` : ''}</div></div><div class="valor num">${brl(c.monthly)}</div></button>`; }).join('') || '<div class="linha"><div class="cresce mini">Preencha os custos em Contas.</div></div>'}</div>
  ${w ? `<h2>E se reduzir?</h2><div class="cartao"><div class="mini">${esc(sel.name)} · ${brl(sel.monthly)}/mês</div>
    <div class="chips" style="margin-top:8px">${[5, 10, 20, 30].map(p => `<button class="chip ${pct === p ? 'on' : ''}" data-act="ecoPct" data-id="${p}">−${p}%</button>`).join('')}</div>
    <div class="stats" style="margin-top:6px"><div><div class="k">Economia/mês</div><div class="v num pos">${brl(w.month)}</div></div><div><div class="k">Por ano</div><div class="v num">${brl(w.month * 12)}</div></div><div><div class="k">Igual a</div><div class="v num">${w.cutsEq === null ? '—' : (Math.round(w.cutsEq * 10) / 10).toLocaleString('pt-BR')} cortes</div></div></div>
    <p class="mini" style="margin:8px 0 0">Cada ${esc(corte.name.toLowerCase())} ficaria ${brl(w.perService)} mais barato de fazer.</p></div>` : ''}
  <h2>Este mês x mês passado</h2>
  <div class="grupo">${linha('Entradas', a.totalIn, b.totalIn, true)}${linha('Contas pagas', a.out.fixed, b.out.fixed, false)}${linha('Despesas avulsas', a.out.expenses, b.out.expenses, false)}${linha('Custo dos produtos', a.out.productCost, b.out.productCost, false)}${linha('Lucro', a.profit, b.profit, true)}</div>
  ${matTop.length ? `<h2>Material que mais pesa no ${esc(corte.name.toLowerCase())}</h2><div class="grupo">${matTop.map(x => `<div class="linha"><div class="cresce">${esc(x.n)}<div class="meta">Comprar em quantidade maior ou outra marca reduz aqui</div></div><div class="valor num">${brl(x.v)}</div></div>`).join('')}</div>` : ''}
  <p class="sub" style="margin-top:12px">Dica: compare as contas mês a mês. Se uma subiu sem motivo (luz, internet), vale renegociar ou trocar de plano.</p>`;
}

// ---------- calculadora de lucro por serviço (estilo Calculadora ANESTBOX)
function lucroServico(sv) {
  const st = S(), cadeiras = Math.max(1, st.pros.length), minMes = (st.settings.hoursPerMonth || 176) * 60 * cadeiras;
  const mat = (sv.materials || []).map(u => { const m = byId(mats(), u.id); if (!m || !(m.yield > 0)) return null; const v = u.qty * m.price / m.yield;
    return { key: 'm' + m.id, nome: m.name, meta: `${u.qty} × ${brl(m.price)} ÷ ${m.yield} usos`, v, rows: [[`${u.qty} uso${u.qty !== 1 ? 's' : ''} por atendimento`, `${brl(m.price)} pago ÷ rende ${m.yield} usos = ${brl(m.price / m.yield)} por uso`, v]] }; }).filter(Boolean);
  if (!(sv.materials || []).length && sv.materialCost) mat.push({ key: 'mfix', nome: 'Material (valor fixo)', meta: 'informado no serviço', v: sv.materialCost, rows: [['Valor fixo do serviço', '', sv.materialCost]] });
  const cad = st.fixedCosts.filter(f => Number(f.monthly) > 0).map(f => { const v = f.monthly / minMes * sv.durationMin;
    return { key: 'f' + f.id, nome: f.name, meta: `${brl(f.monthly)}/mês → R$ ${(f.monthly / minMes).toLocaleString('pt-BR', { minimumFractionDigits: 3, maximumFractionDigits: 3 })}/min`, v, rows: [[`${brl(f.monthly)} por mês`, `÷ ${minMes.toLocaleString('pt-BR')} minutos de cadeira no mês (${st.settings.hoursPerMonth} h × ${cadeiras} cadeira${cadeiras > 1 ? 's' : ''})`, f.monthly / minMes], [`× ${sv.durationMin} min deste serviço`, '', v]] }; });
  const fee = (st.settings.paymentFeePct || 0) / 100 * sv.price;
  const tax = fee > 0 ? [{ key: 'tx', nome: 'Taxa do cartão', meta: `${st.settings.paymentFeePct}% de ${brl(sv.price)}`, v: fee, rows: [[`${st.settings.paymentFeePct}% de ${brl(sv.price)}`, 'No Pix não tem taxa', fee]] }] : [];
  const sum = a => a.reduce((t, x) => t + x.v, 0);
  const custo = sum(mat) + sum(cad) + sum(tax), lucro = sv.price - custo;
  return { mat, cad, tax, custo, lucro, margem: sv.price ? lucro / sv.price : 0, sm: sum(mat), sc: sum(cad), st: sum(tax) };
}
function viewCalc() {
  const svs = S().services; if (!ui.calcSvc || !byId(svs, ui.calcSvc)) ui.calcSvc = svs[0].id;
  const sv = byId(svs, ui.calcSvc), r = lucroServico(sv);
  ui.contas = {};
  const fat = [['Material', r.sm, '#3aa57a'], ['Cadeira (custos fixos)', r.sc, '#6b8fbf'], ['Taxa', r.st, '#d39a3a'], ['Lucro', Math.max(0, r.lucro), 'var(--ok)']].filter(f => f[1] > 0.005);
  const tot = fat.reduce((a, f) => a + f[1], 0) || 1;
  const grp = (g, ico, titulo, sub, itens, total) => itens.length ? `<details class="grp" data-g="${g}" ${ui.calcOpen === g ? 'open' : ''} data-grp="${g}"><summary><span class="gico">${ico}</span><span><b>${titulo}</b><small>${sub} · ${itens.length} ${itens.length === 1 ? 'item' : 'itens'}</small></span><span class="gt">${brl(total)}</span></summary><div class="gbody">${itens.map(i => { ui.contas[i.key] = i; return `<button class="gi" data-act="conta" data-id="${i.key}"><span><span class="n">${esc(i.nome)}</span><small>${esc(i.meta)}</small></span><span class="t">${brl(i.v)} ›</span></button>`; }).join('')}</div></details>` : '';
  return `<h2>Quanto sobra em cada serviço</h2>
  <div class="chips" style="flex-wrap:wrap">${svs.map(x => `<button class="chip ${x.id === sv.id ? 'on' : ''}" data-act="calcSvc" data-id="${x.id}">${esc(x.name)}</button>`).join('')}</div>
  <div class="cartao hero ${r.lucro < 0 ? 'neg' : ''}">
    <div><div class="k">${esc(sv.name)} · ${sv.durationMin} min</div><div class="k" style="margin-top:10px">Lucro na mão</div><div class="big num">${brl(r.lucro)}</div><div class="s">por atendimento, já tirando material e a parte das contas do salão</div></div>
    <div class="stats"><div><div class="k">Preço</div><div class="v num">${brl(sv.price)}</div></div><div><div class="k">Custo</div><div class="v num">${brl(r.custo)}</div></div><div><div class="k">Margem</div><div class="v num">${Math.round(r.margem * 100)}%</div></div></div>
    <div class="barra2" aria-hidden="true">${fat.map(f => `<span style="width:${f[1] / tot * 100}%;background:${f[2]}"></span>`).join('')}</div>
    <div class="legenda">${fat.map(f => `<span><i style="background:${f[2]}"></i>${f[0]} ${Math.round(f[1] / (sv.price || 1) * 100)}%</span>`).join('')}</div>
  </div>
  <div style="display:flex;justify-content:space-between;align-items:baseline;margin-top:18px"><h2 style="margin:0">De onde vem o custo</h2><span class="mini">toque para abrir</span></div>
  ${grp('mat', '🧴', 'Material', 'o que gasta no atendimento', r.mat, r.sm)}
  ${grp('cad', '💈', 'Cadeira', 'aluguel, luz e contas por minuto', r.cad, r.sc)}
  ${grp('taxa', '💳', 'Na venda', 'taxa do cartão', r.tax, r.st)}
  ${!r.cad.length ? '<div class="vazio">Preencha os custos do salão (aba Contas) para a cadeira entrar na conta.</div>' : ''}
  <div class="duas" style="margin-top:6px"><button class="bt leve" data-act="settingsSvc">Mudar preço e material</button><button class="bt leve" data-act="costs">Mudar custos</button></div>`;
}
function contaSheet(key) {
  const i = ui.contas && ui.contas[key]; if (!i) return;
  sheet(`<h2>${esc(i.nome)}</h2><div class="total-folha"><span class="mini">Custo neste atendimento</span><b class="num">${brl(i.v)}</b></div>
  <div class="conta num"><table>${i.rows.map(r => `<tr><td>${esc(r[0])}${r[1] ? `<span class="f">${esc(r[1])}</span>` : ''}</td><td>${brl(r[2])}</td></tr>`).join('')}<tr class="t"><td>Total</td><td>${brl(i.v)}</td></tr></table></div>
  <button class="bt leve cheio" style="margin-top:12px" data-act="close">Fechar</button>`);
}

// ---------- folhas (modais)
function sheet(html) { ui.sheet = html; renderSheet(); }
function closeSheet() { ui.sheet = null; renderSheet(); }
function renderSheet() {
  let v = $('.veu'); if (!ui.sheet) { v && v.remove(); return; }
  if (!v) { v = document.createElement('div'); v.className = 'veu'; v.addEventListener('click', e => { if (e.target === v) closeSheet(); }); document.body.appendChild(v); }
  v.innerHTML = `<div class="folha" role="dialog" aria-modal="true"><div class="pega"></div>${ui.sheet}</div>`;
  const f = v.querySelector('[autofocus]'); f && f.focus();
}

function newApptSheet(pre = {}) {
  ui.na = { clientId: pre.clientId || '', serviceId: S().services[0].id, proId: ui.pro !== 'todos' ? ui.pro : owner().id, date: pre.date || ui.day, time: pre.time || '', q: '', newName: '', newPhone: '' };
  drawNA();
}
function naSugs() {
  const q = stripAccents(ui.na.q).toLowerCase();
  const sugs = q.length >= 2 ? S().clients.filter(x => stripAccents(x.name).toLowerCase().includes(q)).slice(0, 5) : [];
  return sugs.length ? `<div class="sugs">${sugs.map(x => `<button data-act="naPick" data-id="${x.id}">${esc(x.name)}</button>`).join('')}</div>` : '';
}
function drawNA() {
  const n = ui.na, c = n.clientId && byId(S().clients, n.clientId);
  const covered = c && coveredFor(c, n.serviceId, `${n.date}T${n.time || '09:00'}`);
  sheet(`<h2>Novo horário</h2>
  ${c ? `<div class="linha" style="background:var(--couro)"><div class="cresce"><strong>${esc(c.name)}</strong>${c.planId ? `<span class="tag plano">${esc(plan(c.planId).name)}</span>` : ''}</div><button class="bt leve" data-act="naClear">Trocar</button></div>`
      : `<div class="busca"><input placeholder="Nome do cliente (2 letras)" data-na="q" value="${esc(n.q)}" autofocus autocomplete="off"><div id="naSugs">${naSugs()}</div></div>
         <div class="duas" style="margin-top:8px"><input placeholder="WhatsApp (se for cliente novo)" inputmode="tel" data-na="newPhone" value="${esc(n.newPhone)}"></div><div class="mini">Não achou na lista? Preencha o WhatsApp e o cliente é cadastrado ao marcar.</div>`}
  <div class="mini" style="margin-top:12px">Serviço</div><div class="chips">${S().services.map(s => `<button class="chip ${n.serviceId === s.id ? 'on' : ''}" data-act="naSvc" data-id="${s.id}">${esc(s.name)} · ${brl(s.price)}</button>`).join('')}</div>
  ${S().pros.length > 1 ? `<div class="mini">Profissional</div>` : ''}<div class="chips" ${S().pros.length > 1 ? '' : 'hidden'}>${S().pros.map(p => `<button class="chip ${n.proId === p.id ? 'on' : ''}" data-act="naPro" data-id="${p.id}"><span class="dot" style="background:${p.color}"></span>${esc(firstName(p.name))}</button>`).join('')}</div>
  <div class="duas"><label class="campo"><span>Dia</span><input type="date" value="${n.date}" data-na="date"></label><label class="campo"><span>Hora</span><input type="time" value="${n.time}" step="${S().settings.slotMin * 60}" data-na="time"></label></div>
  ${c ? `<div class="mini">${covered ? '<span class="tag plano">coberto pelo plano</span> não cobra nada agora.' : `Valor: <strong>${brl(service(n.serviceId).price)}</strong>${c.planId ? ' (fora do plano ou limite do mês atingido)' : ''}`}</div>` : ''}
  <div id="naErr" class="mini neg"></div>
  <button class="bt ouro cheio" style="margin-top:12px" data-act="naSave">Marcar horário</button>`);
}

function clientSheet(id) {
  const c = byId(S().clients, id); if (!c) return;
  const hist = S().appointments.filter(a => a.clientId === id).sort((a, b) => b.start.localeCompare(a.start)).slice(0, 12);
  const debt = S().appointments.filter(a => a.clientId === id && a.status === 'done' && !a.paid && !a.covered).reduce((s, a) => s + a.price, 0);
  const r = rhythm(visitsOf(id));
  sheet(`<h2>${esc(c.name)}</h2>
  <div class="mini">${r ? `Costuma vir a cada ${r} dias · ` : ''}${debt ? `<span class="neg">deve ${brl(debt)}</span>` : 'sem débitos'}${c.lateCount ? ` · ${c.lateCount} atraso(s) de mensalidade` : ''}</div>
  <div style="display:flex;gap:6px;margin:10px 0;flex-wrap:wrap"><button class="bt zap" data-act="waOpen" data-id="${id}">WhatsApp</button><button class="bt ouro" data-act="newFor" data-id="${id}">Marcar horário</button></div>
  <label class="campo"><span>Nome</span><input value="${esc(c.name)}" data-cl="name"></label>
  <label class="campo"><span>WhatsApp</span><input inputmode="tel" value="${esc(c.phone)}" data-cl="phone"></label>
  <div class="duas"><label class="campo"><span>Plano</span><select data-cl="planId"><option value="">Sem plano</option>${S().plans.map(p => `<option value="${p.id}" ${c.planId === p.id ? 'selected' : ''}>${esc(p.name)} · ${brl(p.price)}</option>`).join('')}</select></label>
    <label class="campo"><span>Dia de vencimento</span><input inputmode="numeric" value="${c.dueDay || ''}" data-cl="dueDay"></label></div>
  <label class="campo"><span>Aniversário</span><input type="date" value="${esc(/^\d{4}-\d{2}-\d{2}$/.test(c.birthday || '') ? c.birthday : '')}" data-cl="birthday"></label>
  <label class="campo"><span>Observações (corte preferido etc.)</span><textarea data-cl="notes">${esc(c.notes || '')}</textarea></label>
  <button class="bt ouro cheio" data-act="clSave" data-id="${id}">Salvar</button>
  <h2>Histórico</h2>${hist.length ? hist.map(a => `<div class="mini" style="display:flex;justify-content:space-between;padding:5px 0;border-bottom:1px solid var(--linha)"><span>${dataCurta(parseLocal(a.start))} ${hhmm(a.start)} · ${esc(service(a.serviceId).name)} · ${esc(firstName(pro(a.proId).name))}</span><span>${a.covered ? 'plano' : brl(a.price)} ${statusTag(a)}</span></div>`).join('') : '<div class="vazio">Sem atendimentos ainda.</div>'}
  <button class="bt mal cheio" style="margin-top:16px" data-act="clDel" data-id="${id}">Apagar cliente</button>`);
}

function apptSheet(id) {
  const a = byId(S().appointments, id); if (!a) return;
  sheet(`<h2>${esc(client(a.clientId).name)}</h2><div class="lista">${apptItem(a)}</div>
  ${['scheduled', 'confirmed'].includes(a.status) ? `<h2>Remarcar</h2><div class="duas"><input type="date" value="${a.start.slice(0, 10)}" id="rmD"><input type="time" value="${hhmm(a.start)}" step="${S().settings.slotMin * 60}" id="rmT"></div><button class="bt zap cheio" style="margin-top:8px" data-act="reschedule" data-id="${a.id}">Remarcar e avisar no WhatsApp</button>` : ''}
  <div style="display:flex;gap:6px;margin-top:12px"><button class="bt leve" data-act="client" data-id="${a.clientId}">Ver cliente</button><button class="bt mal" data-act="cancel" data-id="${a.id}">Cancelar horário</button></div>`);
}

function walkinSheet() {
  const w = ui.wk;
  const q = stripAccents(w.name).toLowerCase();
  const sugs = q.length >= 2 ? S().clients.filter(x => stripAccents(x.name).toLowerCase().includes(q)).slice(0, 4) : [];
  sheet(`<h2>Chegou alguém agora</h2>
  <div class="mini">Serviço</div><div class="svc-cards" style="margin-bottom:12px">${S().services.map(x => `<button class="svc-card ${w.sv === x.id ? 'on' : ''}" data-act="wkSvc" data-id="${x.id}"><b>${esc(x.name)}</b><div class="p num">${brl(x.price)}</div></button>`).join('')}</div>
  <div class="mini">Nome (opcional)</div><input data-wk="name" value="${esc(w.name)}" placeholder="Deixe em branco: entra como Avulso" autocomplete="off">
  <div id="wkSugs">${sugs.length ? `<div class="sugs">${sugs.map(x => `<button data-act="wkPick" data-id="${x.id}">${esc(x.name)}</button>`).join('')}</div>` : ''}</div>
  ${w.clientId ? `<div class="mini" style="margin-top:6px">Cliente: <strong>${esc(client(w.clientId).name)}</strong>${coveredFor(client(w.clientId), w.sv, `${ymd(new Date())}T12:00`) ? ' · <span class="tag plano">coberto pelo plano</span>' : ''}</div>` : ''}
  <div class="mini" style="margin-top:12px">Pagou como</div><div class="chips">${[['pix', 'Pix'], ['dinheiro', 'Dinheiro'], ['cartao', 'Cartão'], ['depois', 'Paga depois']].map(([k, l]) => `<button class="chip ${w.pay === k ? 'on' : ''}" data-act="wkPay" data-id="${k}">${l}</button>`).join('')}</div>
  <button class="bt ouro cheio" style="margin-top:14px" data-act="wkSave">Registrar ${w.sv ? brl(service(w.sv).price) : ''}</button>`);
}

function blockSheet() {
  const b = ui.blk;
  sheet(`<h2>Bloquear ${esc(dataBR(parseLocal(ui.day + 'T00:00')))} às ${esc(b.time)}</h2>
  <div class="mini">Motivo</div><div class="chips" style="flex-wrap:wrap">${['Almoço', 'Folga', 'Compromisso', 'Médico', 'Outro'].map(r => `<button class="chip ${b.reason === r ? 'on' : ''}" data-act="blkWhy" data-id="${r}">${r}</button>`).join('')}</div>
  <div class="mini">Por quanto tempo</div><div class="chips" style="flex-wrap:wrap">${[[30, '30 min'], [60, '1 h'], [120, '2 h'], [240, '4 h'], [0, 'Resto do dia']].map(([v, l]) => `<button class="chip ${b.min === v ? 'on' : ''}" data-act="blkMin" data-id="${v}">${l}</button>`).join('')}</div>
  <p class="sub">Esse horário some da página do cliente.</p>
  <button class="bt ouro cheio" data-act="blkSave">Bloquear</button>`);
}
function productSheet() {
  const a = byId(S().appointments, ui.prodFor); if (!a) return;
  const ps = S().products || [];
  sheet(`<h2>Vender produto · ${esc(firstName(client(a.clientId).name))}</h2>
  ${(a.extras || []).length ? `<div class="grupo" style="margin-bottom:10px">${a.extras.map(x => `<div class="linha"><div class="cresce">${esc(x.name)}</div><div class="valor num">${brl(x.price)}</div></div>`).join('')}</div>` : ''}
  ${ps.length ? `<div class="svc-cards">${ps.map(p => `<button class="svc-card" data-act="prodAdd" data-id="${p.id}"><b>${esc(p.name)}</b><small>lucro ${brl(p.price - (p.cost || 0))}</small><div class="p num">${brl(p.price)}</div></button>`).join('')}</div>` : '<div class="vazio">Cadastre produtos em Ajustes → Produtos.</div>'}
  <p class="sub">Cada toque registra uma venda paga (Pix) e entra no caixa.</p>
  <button class="bt leve cheio" data-act="close">Pronto</button>`);
}

function costsSheet() {
  const cs = costSummary(S().fixedCosts);
  const cats = [['contas', '🧾', 'Contas do mês', 'o que chega todo mês'], ['impostos', '🏛️', 'Impostos e taxas', 'MEI, contador, prefeitura'], ['voce', '🙋', 'Você', 'seu salário entra no custo para o preço ser justo'], ['equip', '✂️', 'Equipamentos', 'quanto pagou ÷ meses que dura'], ['outros', '🧽', 'Outros gastos', 'limpeza, café, divulgação'], ['extra', '➕', 'Que você adicionou', '']];
  const known = cats.map(c => c[0]);
  const row = f => f.cat === 'equip'
    ? `<div class="campo-linha" style="grid-template-columns:1fr 1fr"><div style="grid-column:1/-1"><b>${esc(f.name)}</b> <span class="mini">= ${brl(f.monthly)}/mês</span></div><label class="mini">Paguei R$<input inputmode="decimal" value="${f.price || ''}" placeholder="0" data-eq="${f.id}" data-k="price"></label><label class="mini">Dura (meses)<input inputmode="numeric" value="${f.months || ''}" placeholder="24" data-eq="${f.id}" data-k="months"></label></div>`
    : `<div class="campo-linha ${Number(f.monthly) > 0 ? 'cheio' : ''}"><div><b>${esc(f.name)}</b>${f.hint ? `<small>${esc(f.hint)}</small>` : ''}</div><input inputmode="decimal" value="${f.monthly || ''}" placeholder="R$ 0" data-fc="${f.id}" data-k="monthly" aria-label="${esc(f.name)}">${f.bill !== false ? `<div class="venc">Vence dia <input inputmode="numeric" value="${f.dueDay || ''}" data-fc="${f.id}" data-k="dueDay" aria-label="Dia que vence"></div>` : ''}</div>`;
  const grp = ([k, ico, t, d]) => { const items = S().fixedCosts.filter(f => (f.cat || 'extra') === k || (k === 'extra' && !known.includes(f.cat))); if (!items.length) return '';
    const tot = items.reduce((a, f) => a + (Number(f.monthly) || 0), 0), n = items.filter(f => Number(f.monthly) > 0).length;
    return `<details class="grp" data-g="${k}" ${ui.costOpen === k ? 'open' : ''} data-cgrp="${k}"><summary><span class="gico">${ico}</span><span><b>${t}</b><small>${d ? d + ' · ' : ''}${n} de ${items.length}</small></span><span class="gt">${brl(tot)}</span></summary><div class="gbody">${items.map(row).join('')}</div></details>`; };
  sheet(`<h2>Custos do salão</h2>
  <div class="total-folha"><span class="mini">${cs.filled} de ${cs.total} preenchidos</span><b class="num">${brl(cs.monthly)}/mês</b></div>
  <div class="barra"><i style="width:${Math.round(cs.filled / Math.max(1, cs.total) * 100)}%"></i></div>
  <p class="sub" style="margin-top:8px">Abra cada grupo e coloque o valor. O que você não tem, deixe em branco.</p>
  ${cats.map(grp).join('')}
  <details class="grp" data-g="taxa" ${ui.costOpen === 'cfg' ? 'open' : ''} data-cgrp="cfg"><summary><span class="gico">⏱️</span><span><b>Horas e cartão</b><small>para o custo por minuto</small></span><span class="gt">${S().settings.hoursPerMonth} h</span></summary><div class="gbody">
    <div class="campo-linha"><div><b>Horas trabalhadas por mês</b><small>Ex.: 11 h por dia × 22 dias = 242</small></div><input inputmode="numeric" value="${S().settings.hoursPerMonth}" data-set="hoursPerMonth"></div>
    <div class="campo-linha"><div><b>Taxa no cartão (%)</b><small>Pix sem taxa: deixe 0</small></div><input inputmode="decimal" value="${S().settings.paymentFeePct || ''}" placeholder="0" data-set="paymentFeePct"></div></div></details>
  <div class="tres" style="margin-top:14px"><input placeholder="Outro gasto" data-new="fcName"><input inputmode="decimal" placeholder="R$/mês" data-new="fcVal"><button class="bt leve" data-act="addFixed">Adicionar</button></div>
  <button class="bt ouro cheio" style="margin-top:14px" data-act="close">Pronto</button>`);
}

function settingsSheet() {
  const st = S().settings;
  const sec = {
    salao: () => `  <label class="campo"><span>Nome do salão</span><input value="${esc(st.shopName)}" data-set="shopName"></label>
  <label class="campo"><span>Endereço (aparece pro cliente)</span><input value="${esc(st.address || '')}" placeholder="Rua, número, bairro" data-set="address"></label>
  <div class="duas"><label class="campo"><span>Tipo de chave Pix</span><select data-set="pixKeyType">${[['phone', 'Celular'], ['cpf', 'CPF'], ['cnpj', 'CNPJ'], ['email', 'E-mail'], ['evp', 'Chave aleatória']].map(([v, l]) => `<option value="${v}" ${(st.pixKeyType || 'phone') === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label><label class="campo"><span>Chave Pix</span><input value="${esc(st.pixKey)}" data-set="pixKey"></label></div>
  <div class="mini">Vai no Pix como: <strong>${esc(normPixKey(st.pixKey, st.pixKeyType || 'phone'))}</strong></div>
  <label class="campo"><span>Nome no Pix (como aparece no banco)</span><input value="${esc(st.pixName)}" data-set="pixName"></label>
  <div class="duas"><label class="campo"><span>Cidade</span><input value="${esc(st.pixCity)}" data-set="pixCity"></label><label class="campo"><span>Sumido após (dias)</span><input inputmode="numeric" value="${st.missingDays}" data-set="missingDays"></label></div>
  <div class="mini" style="margin-top:10px">Dias de atendimento</div><div class="chips">${['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'].map((l, i) => `<button class="chip ${(st.workDays || [0, 1, 2, 3, 4, 5, 6]).includes(i) ? 'on' : ''}" data-act="wday" data-id="${i}">${l}</button>`).join('')}</div>
  <div class="duas"><label class="campo"><span>Pausa todo dia (ex.: almoço)</span><input type="time" value="${esc(st.breakStart || '')}" data-set="breakStart"></label><label class="campo"><span>Duração (min)</span><input inputmode="numeric" value="${st.breakMin || ''}" placeholder="0 = sem pausa" data-set="breakMin"></label></div>
  <div class="tres"><label class="campo"><span>Abre</span><input inputmode="numeric" value="${st.openHour}" data-set="openHour"></label><label class="campo"><span>Fecha</span><input inputmode="numeric" value="${st.closeHour}" data-set="closeHour"></label><label class="campo"><span>Intervalo (min)</span><input inputmode="numeric" value="${st.slotMin}" data-set="slotMin"></label></div>
<h2>Barbeiros</h2>  ${S().pros.map(p => `<div class="cartao" style="background:var(--couro)"><div class="duas"><input value="${esc(p.name)}" data-pr="${p.id}" data-k="name"><input inputmode="tel" value="${esc(p.phone || '')}" placeholder="WhatsApp" data-pr="${p.id}" data-k="phone"></div>${p.owner ? '<div class="mini" style="margin-top:6px">Dono do salão</div>' : `<div style="text-align:right"><button class="icone" data-act="del" data-kind="pro" data-id="${p.id}" aria-label="Apagar">✕</button></div><div class="tres" style="margin-top:6px"><select data-pr="${p.id}" data-k="shareType"><option value="percent" ${p.shareType === 'percent' ? 'selected' : ''}>% do faturamento</option><option value="fixed" ${p.shareType === 'fixed' ? 'selected' : ''}>Valor fixo/mês</option></select><input inputmode="decimal" value="${p.shareValue}" data-pr="${p.id}" data-k="shareValue"><input inputmode="numeric" value="${p.dueDay || 5}" data-pr="${p.id}" data-k="dueDay" aria-label="Dia do repasse"></div><div class="mini">Tipo · valor · dia do repasse</div>`}</div>`).join('')}<button class="bt leve" data-act="addPro">Adicionar barbeiro</button>
`,
    servicos: () => `<p class="sub">Preço, duração e o material que cada serviço gasta.</p>  ${S().services.map(s => `<div class="cartao" style="background:var(--couro)"><div style="display:flex;gap:6px"><input value="${esc(s.name)}" data-sv="${s.id}" data-k="name"><button class="icone" data-act="del" data-kind="svc" data-id="${s.id}" aria-label="Apagar">✕</button></div><div class="tres" style="margin-top:6px"><input inputmode="decimal" value="${s.price}" data-sv="${s.id}" data-k="price"><input inputmode="numeric" value="${s.durationMin}" data-sv="${s.id}" data-k="durationMin"><input inputmode="decimal" value="${s.materialCost}" data-sv="${s.id}" data-k="materialCost"></div><div class="mini">Preço · minutos · custo extra fixo</div><label class="mini" style="display:flex;align-items:center;gap:8px;margin-top:6px">Cliente volta em <input style="width:70px" inputmode="numeric" value="${s.returnDays || ''}" placeholder="—" data-sv="${s.id}" data-k="returnDays"> dias</label>${mats().length ? `<div class="mini" style="margin-top:8px">Material usado por atendimento (quantidade):</div>${mats().map(m => { const u = (s.materials || []).find(x => x.id === m.id); return `<div style="display:flex;gap:8px;align-items:center;margin-top:4px"><span class="mini" style="flex:1">${esc(m.name)}</span><input style="width:80px" inputmode="decimal" value="${u ? u.qty : 0}" data-svm="${s.id}" data-m="${m.id}"></div>`; }).join('')}<div class="mini" style="margin-top:4px">Material por atendimento: <strong>${brl(materialCostOf(s, mats()))}</strong></div>` : ''}</div>`).join('')}<button class="bt leve" data-act="addSvc">Adicionar serviço</button>
`,
    pagina: () => `<p class="sub">Tudo o que o cliente vê na página de agendamento.</p>
  <div class="duas"><button class="bt ouro" data-act="bookPreview">Ver como o cliente vê</button><button class="bt leve" data-act="bookLink">Copiar link</button></div>
  <h2>Avisos no topo</h2>${(st.notices || []).map((n, i) => `<div class="cartao" style="background:var(--couro)"><div style="display:flex;gap:6px"><input value="${esc(n.text)}" placeholder="Ex.: Fechado dia 15 (feriado)" data-nt="${i}" data-k="text"><button class="icone" data-act="delNotice" data-id="${i}" aria-label="Apagar aviso">✕</button></div><div class="duas" style="margin-top:6px;align-items:center"><label class="mini">Sai do ar em<input type="date" value="${esc(n.until || '')}" data-nt="${i}" data-k="until"></label><button class="chip ${n.on !== false ? 'on' : ''}" data-act="togNotice" data-id="${i}">${n.on !== false ? 'Aparecendo' : 'Escondido'}</button></div></div>`).join('') || '<div class="vazio">Nenhum aviso.</div>'}
  <button class="bt leve" style="margin-top:8px" data-act="addNotice">Adicionar aviso</button>
  <h2>Serviços na página</h2><div class="grupo">${S().services.map(x => `<div class="linha"><div class="cresce"><strong>${esc(x.name)}</strong><div class="meta">${brl(x.price)} · ${x.durationMin} min</div></div><button class="chip ${x.hideOnline ? '' : 'on'}" data-act="togSvcOnline" data-id="${x.id}">${x.hideOnline ? 'Escondido' : 'Aparece'}</button></div>`).join('')}</div>
  <h2>Regras</h2>
  <label class="campo"><span>Marcar com pelo menos (horas de antecedência)</span><input inputmode="numeric" value="${st.minAdvanceH || ''}" placeholder="0 = pode marcar em cima da hora" data-set="minAdvanceH"></label>
  <label class="campo"><span>Regras para o cliente (atraso, cancelamento)</span><textarea data-set="policy" placeholder="Ex.: Tolerância de 10 min. Para desmarcar, avise com 2 h de antecedência.">${esc(st.policy || '')}</textarea></label>
  <h2>Contato</h2>
  <label class="campo"><span>Endereço</span><input value="${esc(st.address || '')}" placeholder="Rua, número, bairro" data-set="address"></label>
  <label class="campo"><span>Instagram (sem @)</span><input value="${esc(st.instagram || '')}" placeholder="glstyle" data-set="instagram"></label>
  <p class="sub">Horário de atendimento, dias e pausa ficam na aba Salão. Preços e tempos, na aba Serviços.</p>`,
    produtos: () => `<p class="sub">O que você vende no balcão. Preço de venda e quanto pagou.</p>${(S().products || []).map(p => `<div class="cartao" style="background:var(--couro)"><div style="display:flex;gap:6px"><input value="${esc(p.name)}" data-pd="${p.id}" data-k="name"><button class="icone" data-act="del" data-kind="prod" data-id="${p.id}" aria-label="Apagar">✕</button></div><div class="duas" style="margin-top:6px"><label class="mini">Vende por R$<input inputmode="decimal" value="${p.price}" data-pd="${p.id}" data-k="price"></label><label class="mini">Pagou R$<input inputmode="decimal" value="${p.cost || 0}" data-pd="${p.id}" data-k="cost"></label></div><div class="mini" style="margin-top:4px">Lucro por unidade: <strong>${brl(p.price - (p.cost || 0))}</strong></div></div>`).join('')}<button class="bt leve" data-act="addProd">Adicionar produto</button>`,
    pacotes: () => `<p class="sub">Preço do plano, se é ilimitado ou por número de visitas, e quais serviços entram.</p>  ${S().plans.map(p => `<div class="cartao" style="background:var(--couro)"><div style="display:flex;gap:6px"><input value="${esc(p.name)}" data-pl="${p.id}" data-k="name"><button class="icone" data-act="del" data-kind="plan" data-id="${p.id}" aria-label="Apagar">✕</button></div><div class="tres" style="margin-top:6px"><input inputmode="decimal" value="${p.price}" data-pl="${p.id}" data-k="price"><select data-pl="${p.id}" data-k="type"><option value="unlimited" ${p.type === 'unlimited' ? 'selected' : ''}>Ilimitado</option><option value="fixed" ${p.type === 'fixed' ? 'selected' : ''}>Nº de visitas</option></select><input inputmode="numeric" value="${p.visitsPerCycle}" data-pl="${p.id}" data-k="visitsPerCycle"></div><div class="mini">Preço · tipo · visitas no mês</div><div class="chips" style="margin-top:6px">${S().services.map(s => `<button class="chip ${p.serviceIds.includes(s.id) ? 'on' : ''}" data-act="plSvc" data-id="${p.id}" data-s="${s.id}">${esc(s.name)}</button>`).join('')}</div></div>`).join('')}<button class="bt leve" data-act="addPlan">Adicionar pacote</button>
`,
    mensagens: () => `<p class="sub">Textos que vão prontos no WhatsApp. Escreva do seu jeito.</p>  ${Object.entries(st.templates).map(([k, v]) => `<label class="campo"><span>${{ accept: 'Pedido aceito', refuse: 'Pedido recusado', confirm: 'Confirmação de horário (véspera)', renew: 'Renovação do plano (fim do ciclo)', reschedule: 'Horário remarcado', remindLeve: 'Mensalidade (tom leve)', remindFirme: 'Mensalidade atrasada (tom firme)', charge: 'Cobrança de avulso', thanks: 'Agradecimento de pagamento', comeback: 'Cliente sumido', proShare: 'Repasse do associado' }[k] || k}</span><textarea data-tpl="${k}">${esc(v)}</textarea></label>`).join('')}<div class="mini">Variáveis: {link} {nome} {data} {hora} {servico} {valor} {plano} {inicio} {fim} {chave} {pix} {dias} {mes} {salao}</div>
`,
    backup: () => `  <div class="mini">${store.persistent ? 'Os dados ficam guardados neste aparelho. Exporte um backup de vez em quando.' : 'Este navegador não está guardando os dados. Exporte antes de fechar.'}</div>
  <div class="duas" style="margin-top:8px"><button class="bt leve" data-act="export">Baixar backup</button><button class="bt leve" data-act="exportCopy">Copiar backup</button><label class="bt leve" style="text-align:center">Importar<input type="file" accept="application/json" data-act-file="import" hidden></label></div>
  <button class="bt mal cheio" style="margin-top:12px" data-act="reset">Recomeçar com dados de exemplo</button>`,
  };
  sheet(`<h2>Ajustes</h2><div class="seg">${[['salao', 'Salão'], ['pagina', 'Página do cliente'], ['servicos', 'Serviços'], ['produtos', 'Produtos'], ['pacotes', 'Pacotes'], ['mensagens', 'Mensagens'], ['backup', 'Backup']].map(([k, l]) => `<button class="${ui.aj === k ? 'on' : ''}" data-act="aj" data-id="${k}">${l}</button>`).join('')}</div>${sec[ui.aj]()}`);
}

// ---------- render
const TABS = [['hoje', 'Hoje'], ['agenda', 'Agenda'], ['clientes', 'Clientes'], ['cobrancas', 'Cobranças'], ['caixa', 'Caixa']];
function render() {
  const view = { hoje: viewHoje, agenda: viewAgenda, clientes: viewClientes, cobrancas: viewCobrancas, caixa: viewCaixa }[ui.tab];
  const focus = document.activeElement?.dataset?.input; const pos = document.activeElement?.selectionStart;
  $('main').innerHTML = view();
  const late = openCharges().filter(c => c.late > 0).length;
  $('nav.abas .in').innerHTML = TABS.map(([k, l]) => `<button class="${ui.tab === k ? 'on' : ''}" data-act="tab" data-id="${k}" aria-label="${l}">${I[k]}${l}${k === 'cobrancas' && late ? `<span class="badge">${late}</span>` : ''}</button>`).join('');
  $('.fab').style.display = ui.tab === 'hoje' || ui.tab === 'agenda' ? '' : 'none';
  { const nm = S().settings.shopName || 'GL Style', ini = (nm.match(/\b\w/g) || ['G']).slice(0, 2).join('').toUpperCase(); $('.marca').innerHTML = `<span class="mono">${esc(nm.split(' ')[0].slice(0, 2).toUpperCase() === 'GL' ? 'GL' : ini)}</span><span>${esc(nm)}</span>`; }
  if (focus) { const el = document.querySelector(`[data-input="${focus}"]`); if (el) { el.focus(); try { el.setSelectionRange(pos, pos); } catch {} } }
}

// ---------- ações
const findCharge = id => openCharges().find(c => c.id === id);
const A = {
  cx: el => { ui.cx = el.dataset.id; render(); },
  aj: el => { ui.aj = el.dataset.id; settingsSheet(); },
  tab: el => { ui.tab = el.dataset.id; window.scrollTo(0, 0); render(); },
  pro: el => { ui.pro = el.dataset.id; render(); },
  day: el => { ui.day = el.dataset.id; render(); },
  month: el => { const [y, m] = ui.month.split('-').map(Number); ui.month = monthKey(new Date(y, m - 1 + Number(el.dataset.id), 1)); render(); },
  confirm: el => { const a = byId(S().appointments, el.dataset.id), c = client(a.clientId); openWA(c.phone, fill(S().settings.templates.confirm, vars({ nome: firstName(c.name), data: dataBR(parseLocal(a.start)), hora: hhmm(a.start), servico: service(a.serviceId).name }))); a.remindedAt = new Date().toISOString(); if (a.status === 'scheduled') a.status = 'confirmed'; save(); },
  done: el => { const a = byId(S().appointments, el.dataset.id); a.status = 'done'; if (a.covered) a.paid = true; save(); toast(a.covered ? 'Atendido (plano)' : `Atendido · falta receber ${brl(a.price)}`); },
  noshow: el => { byId(S().appointments, el.dataset.id).status = 'noshow'; save(); },
  undo: el => { const a = byId(S().appointments, el.dataset.id); a.status = 'confirmed'; if (!a.covered && a.paid) { a.paid = false; S().payments = S().payments.filter(p => p.ref !== a.id); } save(); },
  paid: el => { const ch = findCharge('appt:' + el.dataset.id); if (ch) { receive(ch); save(); toast('Pagamento registrado'); } },
  chargeAppt: el => { const ch = findCharge('appt:' + el.dataset.id); ch && openWA(ch.client.phone, chargeText(ch)); },
  cancel: el => { byId(S().appointments, el.dataset.id).status = 'canceled'; closeSheet(); save(); toast('Horário cancelado'); },
  client: el => clientSheet(el.dataset.id),
  appt: el => apptSheet(el.dataset.id),
  comeback: el => { const c = client(el.dataset.id), v = visitsOf(c.id); const d = v.length ? daysBetween(v.reduce((a, b) => (a > b ? a : b)), today()) : ''; openWA(c.phone, fill(S().settings.templates.comeback, vars({ nome: firstName(c.name), dias: d }))); },
  waOpen: el => openWA(client(el.dataset.id).phone, ''),
  newFor: el => { closeSheet(); newApptSheet({ clientId: el.dataset.id }); },
  new: el => newApptSheet({ time: el.dataset.time }),
  newClient: () => { const id = store.uid(); S().clients.push({ id, name: 'Novo cliente', phone: '', planId: null, dueDay: new Date().getDate(), notes: '', createdAt: ymd(new Date()), lateCount: 0 }); save(); clientSheet(id); },
  clSave: el => {
    const c = byId(S().clients, el.dataset.id), g = k => document.querySelector(`[data-cl="${k}"]`).value;
    const name = g('name').trim(); if (!name) return toast('Preencha o nome');
    Object.assign(c, { name, phone: g('phone').trim(), planId: g('planId') || null, dueDay: Math.min(31, Math.max(1, parseInt(g('dueDay')) || 1)), notes: g('notes'), birthday: g('birthday') });
    closeSheet(); save(); toast('Cliente salvo');
  },
  clDel: el => { if (!el.dataset.ok) return ask('Apagar este cliente e todo o histórico dele?', 'Apagar', 'clDel', el.dataset.id); const id = el.dataset.id; S().clients = S().clients.filter(c => c.id !== id); S().appointments = S().appointments.filter(a => a.clientId !== id); closeSheet(); save(); },
  charge: el => { const ch = findCharge(el.dataset.id); ch && openWA(ch.client.phone, chargeText(ch)); },
  copyPix: el => { const ch = findCharge(el.dataset.id); ch && copy(pixFor(ch.amount, 'GL' + ch.client.id.slice(0, 6)), 'Pix copia e cola copiado'); },
  receive: el => { const ch = findCharge(el.dataset.id); if (!ch) return; receive(ch); save(); thanksPrompt(ch); },
  parseNotif: () => {
    const p = parseBankNotification(ui.notif || '');
    if (p.amount == null) return toast('Não achei um valor (R$) no texto');
    const id = matchPayment(p, openCharges());
    if (id) { const ch = findCharge(id); receive(ch); ui.notif = ''; save(); thanksPrompt(ch); }
    else { ui.pending = [...(ui.pending || []), p]; ui.notif = ''; render(); toast('Não achei sozinho: escolha em "Pix a conferir"'); }
  },
  naClear: () => { ui.na.clientId = ''; drawNA(); },
  naPick: el => { ui.na.clientId = el.dataset.id; drawNA(); },
  naSvc: el => { ui.na.serviceId = el.dataset.id; ui.na.force = false; drawNA(); },
  naPro: el => { ui.na.proId = el.dataset.id; ui.na.force = false; drawNA(); },
  naSave: () => {
    const n = ui.na, err = m => { document.getElementById('naErr').textContent = m; };
    if (!n.time) return err('Escolha a hora.');
    let c = n.clientId && byId(S().clients, n.clientId);
    if (!c) {
      const name = n.q.trim(); if (name.length < 2) return err('Digite o nome do cliente.');
      if (normPhone(n.newPhone).length < 12) return err('Informe o WhatsApp do cliente novo (com DDD).');
      c = { id: store.uid(), name, phone: n.newPhone, planId: null, dueDay: new Date().getDate(), notes: '', createdAt: ymd(new Date()), lateCount: 0 }; S().clients.push(c);
    }
    const start = `${n.date}T${n.time}`, s = service(n.serviceId), st0 = parseLocal(start);
    if (!isOpenDay(S().settings, n.date) && !n.forceDay) { n.forceDay = true; return err('Esse dia o salão está fechado. Toque de novo para marcar mesmo assim.'); }
    const clash = findClash(S(), n.proId, start, s.durationMin);
    if (clash && !n.force) { n.force = true; return err(`${firstName(pro(n.proId).name)} já tem ${client(clash.clientId).name} às ${hhmm(clash.start)}. Toque de novo para marcar assim mesmo.`); }
    const covered = coveredFor(c, n.serviceId, start);
    S().appointments.push({ id: store.uid(), clientId: c.id, serviceId: n.serviceId, proId: n.proId, start, status: 'scheduled', covered, price: covered ? 0 : s.price, paid: covered });
    closeSheet(); ui.day = n.date; save(); toast(`Marcado: ${firstName(c.name)} ${dataCurta(st0)} ${n.time}`);
  },
  reschedule: el => {
    const a = byId(S().appointments, el.dataset.id), d = document.getElementById('rmD').value, t = document.getElementById('rmT').value;
    if (!d || !t) return toast('Escolha dia e hora');
    const clash = findClash(S(), a.proId, `${d}T${t}`, service(a.serviceId).durationMin, a.id);
    if (clash) return toast(`Ocupado: ${client(clash.clientId).name} às ${hhmm(clash.start)}`);
    a.start = `${d}T${t}`; a.status = 'scheduled'; const c = client(a.clientId);
    if (!a.paid || a.covered) { a.covered = coveredFor(c, a.serviceId, a.start); a.price = a.covered ? 0 : service(a.serviceId).price; a.paid = a.covered; }
    openWA(c.phone, fill(S().settings.templates.reschedule || '{nome}, seu horário mudou para {data} às {hora}.', vars({ nome: firstName(c.name), data: dataBR(parseLocal(a.start)), hora: t })));
    closeSheet(); ui.day = d; save(); toast('Remarcado');
  },
  accept: el => { const a = byId(S().appointments, el.dataset.id), c = client(a.clientId);
    const clash = findClash(S(), a.proId, a.start, service(a.serviceId).durationMin, a.id);
    if (clash) return toast(`Conflito com ${client(clash.clientId).name} às ${hhmm(clash.start)}. Remarque ou recuse.`);
    a.status = 'confirmed'; openWA(c.phone, fill(S().settings.templates.accept, vars({ nome: firstName(c.name), data: dataBR(parseLocal(a.start)), hora: hhmm(a.start), servico: service(a.serviceId).name }))); save(); toast('Pedido aceito'); },
  refuse: el => { const a = byId(S().appointments, el.dataset.id), c = client(a.clientId); a.status = 'canceled'; openWA(c.phone, fill(S().settings.templates.refuse, vars({ nome: firstName(c.name), data: dataBR(parseLocal(a.start)), hora: hhmm(a.start), link: bookingURL() }))); save(); },
  shareFree: () => {
    const now = new Date(), day = ymd(now), dur = Math.min(...S().services.map(x => x.durationMin));
    const lines = S().pros.map(p => { const f = freeSlots(S(), day, p.id, dur, now); return f.length ? (S().pros.length > 1 ? `${firstName(p.name.replace(/\s*\(.*\)/, ''))}: ` : '') + f.join(' · ') : null; }).filter(Boolean);
    if (!lines.length) return toast('Hoje não sobrou horário livre');
    const msg = `✂️ ${S().settings.shopName} — horários livres hoje:\n${lines.join('\n')}\n\nPede o seu por aqui: ${bookingURL()}`;
    const a = document.createElement('a'); a.href = 'https://wa.me/?text=' + encodeURIComponent(msg); a.target = '_blank'; a.rel = 'noopener'; document.body.appendChild(a); a.click(); a.remove();
  },
  bookLink: () => copy(bookingURL(), 'Link de agendamento copiado'),
  bookPreview: () => { closeSheet(); ui.preview = true; document.body.classList.add('cliente'); bookingPage(bookingURL().split('#agendar=')[1]); $('main').insertAdjacentHTML('beforebegin', '<div id="prevBar" class="faixa-demo" style="max-width:620px;margin:10px auto 0;display:flex;justify-content:space-between;align-items:center">Prévia: é isso que o cliente vê <button class="bt ouro" data-act="endPreview">Voltar ao painel</button></div>'); window.scrollTo(0, 0); },
  endPreview: () => { $('#prevBar')?.remove(); ui.preview = false; document.body.classList.remove('cliente'); $('main').onclick = null; $('main').oninput = null; render(); },
  pasteReq: () => {
    const r = parseBookingRequest(ui.req || ''); if (!r) return toast('Não achei o código do pedido (#GL[…]) na mensagem');
    if (!byId(S().services, r.serviceId) || !byId(S().pros, r.proId)) return toast('Pedido com serviço ou profissional que não existe mais');
    const phone = (String(ui.req).match(/tel(?:efone)?:?\s*(\+?[\d()\s.-]{10,})/i) || [])[1] || '';
    let c = findClientForRequest(S().clients, r.name, phone);
    if (!c) { c = { id: store.uid(), name: r.name, phone, planId: null, dueDay: new Date().getDate(), notes: '', createdAt: ymd(new Date()), lateCount: 0 }; S().clients.push(c); }
    if (S().appointments.some(a => a.clientId === c.id && a.start === r.start && a.status !== 'canceled')) return toast('Esse pedido já está na agenda');
    const covered = coveredFor(c, r.serviceId, r.start);
    S().appointments.push({ id: store.uid(), clientId: c.id, serviceId: r.serviceId, proId: r.proId, start: r.start, status: 'requested', covered, price: covered ? 0 : service(r.serviceId).price, paid: covered });
    ui.req = ''; ui.tab = 'hoje'; save();
    if (normPhone(c.phone).length < 12) { clientSheet(c.id); toast('Cliente novo: coloque o WhatsApp dele e salve'); } else toast('Pedido adicionado: aceite ou recuse');
  },
  del: el => {
    const k = el.dataset.kind, id = el.dataset.id, st = S();
    const lists = { svc: 'services', plan: 'plans', pro: 'pros', mat: 'materials', fixed: 'fixedCosts', prod: 'products' };
    const item = st[lists[k]].find(x => x.id === id); if (!item) return;
    if (k === 'svc' && st.services.length < 2) return toast('Precisa ter pelo menos um serviço');
    if (!el.dataset.ok) { const prev = ui.sheet; ask(`Apagar “${item.name}”?`, 'Apagar', 'del', id); document.querySelector('[data-ok="1"]').dataset.kind = k; return; }
    st[lists[k]] = st[lists[k]].filter(x => x.id !== id);
    if (k === 'plan') st.clients.forEach(c => { if (c.planId === id) c.planId = null; });
    if (k === 'mat') st.services.forEach(sv => { sv.materials = (sv.materials || []).filter(u => u.id !== id); });
    if (k === 'svc') st.plans.forEach(pl => { pl.serviceIds = pl.serviceIds.filter(x => x !== id); });
    if (k === 'pro') st.appointments.forEach(a => { if (a.proId === id && ['scheduled', 'confirmed', 'requested'].includes(a.status)) a.proId = owner().id; });
    store.save(); toast('Apagado'); if (['svc', 'plan', 'pro', 'prod'].includes(k)) settingsSheet(); else { closeSheet(); render(); }
  },
  block: el => { ui.blk = { time: el.dataset.time, min: 60, reason: 'Almoço' }; blockSheet(); },
  blkMin: el => { ui.blk.min = Number(el.dataset.id); blockSheet(); },
  blkWhy: el => { ui.blk.reason = el.dataset.id; blockSheet(); },
  blkSave: () => {
    const b = ui.blk, st = S().settings, proId = ui.pro !== 'todos' ? ui.pro : owner().id;
    const dur = b.min === 0 ? Math.max(30, st.closeHour * 60 - (Number(b.time.slice(0, 2)) * 60 + Number(b.time.slice(3)))) : b.min;
    (S().blocks = S().blocks || []).push({ id: store.uid(), proId, start: `${ui.day}T${b.time}`, durationMin: dur, reason: b.reason });
    closeSheet(); save(); toast(`Bloqueado: ${b.reason}`);
  },
  unblock: el => { S().blocks = (S().blocks || []).filter(b => b.id !== el.dataset.id); save(); },
  prod: el => { ui.prodFor = el.dataset.id; productSheet(); },
  prodAdd: el => {
    const a = byId(S().appointments, ui.prodFor), pr = byId(S().products || [], el.dataset.id); if (!a || !pr) return;
    const now = new Date(), iso = `${ymd(now)}T${pad2(now.getHours())}:${pad2(now.getMinutes())}`;
    (a.extras = a.extras || []).push({ productId: pr.id, name: pr.name, price: pr.price });
    S().payments.push({ id: store.uid(), clientId: a.clientId, amount: pr.price, cost: pr.cost || 0, date: iso, kind: 'product', ref: a.id, method: 'pix', proId: a.proId });
    save(); productSheet(); toast(`${pr.name} vendido · ${brl(pr.price)}`);
  },
  bday: el => { const c = client(el.dataset.id); openWA(c.phone, fill(S().settings.templates.birthday || 'Feliz aniversário, {nome}! 🎉', vars({ nome: firstName(c.name) }))); },
  addProd: () => { (S().products = S().products || []).push({ id: store.uid(), name: 'Novo produto', price: 30, cost: 15 }); store.save(); settingsSheet(); },
  addNotice: () => { (S().settings.notices = S().settings.notices || []).push({ text: '', until: '', on: true }); store.save(); settingsSheet(); },
  delNotice: el => { S().settings.notices.splice(Number(el.dataset.id), 1); store.save(); settingsSheet(); },
  togNotice: el => { const n = S().settings.notices[Number(el.dataset.id)]; n.on = n.on === false; store.save(); settingsSheet(); },
  togSvcOnline: el => { const x = service(el.dataset.id); x.hideOnline = !x.hideOnline; store.save(); settingsSheet(); },
  walkin: () => { ui.wk = { sv: S().services[0].id, name: '', clientId: '', pay: 'pix' }; walkinSheet(); },
  wkSvc: el => { ui.wk.sv = el.dataset.id; walkinSheet(); },
  wkPay: el => { ui.wk.pay = el.dataset.id; walkinSheet(); },
  wkPick: el => { ui.wk.clientId = el.dataset.id; ui.wk.name = client(el.dataset.id).name; walkinSheet(); },
  wkSave: () => {
    const w = ui.wk, sv = service(w.sv), now = new Date();
    const start = `${ymd(now)}T${pad2(now.getHours())}:${pad2(Math.floor(now.getMinutes() / 5) * 5)}`;
    let c = w.clientId && byId(S().clients, w.clientId);
    if (!c && w.name.trim().length > 1) { c = { id: store.uid(), name: w.name.trim(), phone: '', planId: null, dueDay: now.getDate(), notes: '', createdAt: ymd(now), lateCount: 0 }; S().clients.push(c); }
    if (!c) { c = byId(S().clients, 'c_avulso'); if (!c) { c = { id: 'c_avulso', name: 'Avulso', phone: '', planId: null, dueDay: 1, notes: 'Clientes sem nome registrados na hora', createdAt: ymd(now), lateCount: 0 }; S().clients.push(c); } }
    const covered = coveredFor(c, sv.id, start), paid = covered || w.pay !== 'depois';
    const a = { id: store.uid(), clientId: c.id, serviceId: sv.id, proId: ui.pro !== 'todos' ? ui.pro : owner().id, start, status: 'done', covered, price: covered ? 0 : sv.price, paid, walkin: true };
    S().appointments.push(a);
    if (!covered && paid) S().payments.push({ id: store.uid(), clientId: c.id, amount: sv.price, date: start, kind: 'single', ref: a.id, method: w.pay, proId: a.proId });
    closeSheet(); save(); toast(covered ? `${firstName(c.name)}: coberto pelo plano` : paid ? `Registrado: ${sv.name} · ${brl(sv.price)}` : `Registrado: ${brl(sv.price)} a receber`);
  },
  rDay: el => { const d = parseLocal((ui.rDay || ymd(new Date())) + 'T12:00'); ui.rDay = ymd(addDays(d, Number(el.dataset.id))); render(); },
  ecoPick: el => { ui.ecoCost = el.dataset.id; render(); },
  ecoPct: el => { ui.ecoPct = Number(el.dataset.id); render(); },
  sendDay: () => { const r = dayReport(S(), ui.rDay || ymd(new Date())), d = parseLocal((ui.rDay || ymd(new Date())) + 'T12:00');
    const txt = `📊 ${S().settings.shopName} · ${d.toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit' })}\nEntrou: ${brl(r.received)}\n${Object.entries(r.byMethod).map(([k, v]) => `• ${k}: ${brl(v)}`).join('\n')}\nAtendidos: ${r.done} (faltas: ${r.noshow})\nProdutos: ${brl(r.products)}\nA receber: ${brl(r.toReceive)}\nAgenda ocupada: ${Math.round(r.occupancy * 100)}%`;
    openWA(owner().phone, txt); },
  wday: el => { const st = S().settings, i = Number(el.dataset.id); const w = new Set(st.workDays || [0, 1, 2, 3, 4, 5, 6]); w.has(i) ? w.delete(i) : w.add(i); st.workDays = [...w].sort(); store.save(); settingsSheet(); render(); },
  addMat: () => { (S().materials = S().materials || []).push({ id: store.uid(), name: 'Novo material', price: 0, yield: 1 }); save(); },
  billPaid: el => { const f = byId(S().fixedCosts, el.dataset.id); S().billPayments.push({ id: store.uid(), costId: f.id, month: ui.month, amount: f.monthly, date: ymd(new Date()) }); save(); toast(`${f.name} paga`); },
  addExpense: () => { const n = document.querySelector('[data-new="expName"]').value.trim(), v = parseMoney(document.querySelector('[data-new="expVal"]').value); if (!n || !(v > 0)) return toast('Preencha o gasto e o valor'); const d = ui.month === monthKey(new Date()) ? ymd(new Date()) : ui.month + '-01'; S().expenses.push({ id: store.uid(), date: d, name: n, amount: v }); save(); toast('Despesa lançada'); },
  delExpense: el => { S().expenses = S().expenses.filter(e => e.id !== el.dataset.id); save(); },
  proCharge: el => { const p = pro(el.dataset.id), v = Number(el.dataset.v); openWA(p.phone, fill(S().settings.templates.proShare, vars({ nome: firstName(p.name), mes: mesNome(ui.month), valor: brl(v), pix: pixFor(v, 'REP' + p.id.slice(-4)) }))); },
  proPaid: el => { S().proPayments.push({ id: store.uid(), proId: el.dataset.id, month: ui.month, amount: Number(el.dataset.v), date: ymd(new Date()) }); save(); toast('Repasse recebido'); },
  addFixed: () => { const n = document.querySelector('[data-new="fcName"]')?.value.trim(); const v = parseMoney(document.querySelector('[data-new="fcVal"]')?.value); if (!n) return toast('Digite o nome do gasto'); S().fixedCosts.push({ id: store.uid(), cat: 'extra', name: n, monthly: Number.isFinite(v) ? v : 0, dueDay: 10, hint: '' }); store.save(); costsSheet(); render(); },
  costs: () => costsSheet(),
  conta: el => contaSheet(el.dataset.id),
  calcSvc: el => { ui.calcSvc = el.dataset.id; render(); },
  settingsSvc: () => { ui.aj = 'servicos'; settingsSheet(); },
  settings: () => settingsSheet(),
  addPro: () => { S().pros.push({ id: store.uid(), name: 'Novo barbeiro', phone: '', color: ['#e88cc2', '#f0d264', '#9b8cf0', '#64d2f0'][S().pros.length % 4], owner: false, shareType: 'percent', shareValue: 30, dueDay: 5 }); store.save(); settingsSheet(); },
  addSvc: () => { S().services.push({ id: store.uid(), name: 'Novo serviço', durationMin: 30, price: 30, materialCost: 2 }); store.save(); settingsSheet(); },
  addPlan: () => { S().plans.push({ id: store.uid(), name: 'Novo pacote', type: 'fixed', visitsPerCycle: 2, price: 60, serviceIds: [S().services[0].id] }); store.save(); settingsSheet(); },
  plSvc: el => { const p = plan(el.dataset.id), s = el.dataset.s; p.serviceIds = p.serviceIds.includes(s) ? p.serviceIds.filter(x => x !== s) : [...p.serviceIds, s]; store.save(); settingsSheet(); },
  exportCopy: () => copy(store.exportJSON(), 'Backup copiado: cole numa conversa sua no WhatsApp para guardar'),
  export: () => { const blob = new Blob([store.exportJSON()], { type: 'application/json' }); const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `glstyle-backup-${ymd(new Date())}.json`; a.click(); toast('Backup baixado'); },
  reset: el => { if (!el.dataset.ok) return ask('Apagar tudo e voltar aos dados de exemplo?', 'Apagar tudo', 'reset'); store.reset(); closeSheet(); render(); },
  thanks: el => { const c = client(el.dataset.id); openWA(c.phone, fill(S().settings.templates.thanks, vars({ nome: firstName(c.name), valor: brl(Number(el.dataset.v)) }))); closeSheet(); },
  close: () => closeSheet(),
};
function thanksPrompt(ch) {
  sheet(`<h2>Pago ✓</h2><p>${esc(ch.client.name)} · <strong>${brl(ch.amount)}</strong> registrado.</p>
  <button class="bt zap cheio" data-act="thanks" data-id="${ch.client.id}" data-v="${ch.amount}">Mandar “recebi, valeu” no WhatsApp</button>
  <button class="bt leve cheio" style="margin-top:8px" data-act="close">Agora não</button>`);
}

document.addEventListener('click', e => {
  const el = e.target.closest('[data-act]'); if (!el) return;
  const fn = A[el.dataset.act]; if (fn) { e.preventDefault(); fn(el); }
});
document.addEventListener('input', e => {
  const t = e.target, d = t.dataset;
  if (d.input === 'q') { ui.q = t.value; const tmp = document.createElement('div'); tmp.innerHTML = viewClientes(); const fresh = tmp.querySelector('#cliRes'), cur = document.getElementById('cliRes'); if (fresh && cur) cur.replaceWith(fresh); else render(); }
  else if (d.input === 'notif') ui.notif = t.value;
  else if (d.input === 'req') ui.req = t.value;
  else if (d.wk) { ui.wk[d.wk] = t.value; ui.wk.clientId = ''; const q = stripAccents(t.value).toLowerCase(); const box = document.getElementById('wkSugs'); if (box) { const sg = q.length >= 2 ? S().clients.filter(x => x.id !== 'c_avulso' && stripAccents(x.name).toLowerCase().includes(q)).slice(0, 4) : []; box.innerHTML = sg.length ? `<div class="sugs">${sg.map(x => `<button data-act="wkPick" data-id="${x.id}">${esc(x.name)}</button>`).join('')}</div>` : ''; } }
  else if (d.na) { ui.na[d.na] = t.value; ui.na.force = false; if (d.na === 'q') { const box = document.getElementById('naSugs'); if (box) box.innerHTML = naSugs(); } }
});
const numOr = (v, f) => { const n = parseMoney(v); return Number.isFinite(n) ? n : f; };
document.addEventListener('change', e => {
  const t = e.target, d = t.dataset;
  if (d.set) { const st = S().settings; st[d.set] = typeof st[d.set] === 'number' || ['paymentFeePct', 'breakMin', 'minAdvanceH'].includes(d.set) ? numOr(t.value || '0', st[d.set] || 0) : t.value; save(); }
  else if (d.tpl) { S().settings.templates[d.tpl] = t.value; store.save(); }
  else if (d.fc) { const f = byId(S().fixedCosts, d.fc); f[d.k] = d.k === 'name' ? t.value : (t.value.trim() === '' ? 0 : numOr(t.value, f[d.k])); store.save(); render(); if (document.querySelector('.folha h2')?.textContent === 'Custos do salão') { const y = $('.folha').scrollTop; costsSheet(); $('.folha').scrollTop = y; } }
  else if (d.eq) { const f = byId(S().fixedCosts, d.eq); f[d.k] = t.value.trim() === '' ? 0 : numOr(t.value, f[d.k]); f.monthly = equipMonthly(f.price, f.months); store.save(); render(); const y = $('.folha').scrollTop; costsSheet(); $('.folha').scrollTop = y; }
  else if (d.pr) { const p = pro(d.pr); p[d.k] = ['name', 'phone', 'shareType'].includes(d.k) ? t.value : numOr(t.value, p[d.k]); store.save(); render(); }
  else if (d.sv) { const s = service(d.sv); s[d.k] = d.k === 'name' ? t.value : numOr(t.value, s[d.k]); store.save(); render(); }
  else if (d.pl) { const p = plan(d.pl); p[d.k] = ['name', 'type'].includes(d.k) ? t.value : numOr(t.value, p[d.k]); store.save(); render(); }
  else if (d.pd) { const pr = byId(S().products, d.pd); pr[d.k] = d.k === 'name' ? t.value : numOr(t.value, pr[d.k]); store.save(); settingsSheet(); render(); }
  else if (d.nt !== undefined) { const n = S().settings.notices[Number(d.nt)]; n[d.k] = t.value; store.save(); }
  else if (d.mt) { const m = byId(mats(), d.mt); m[d.k] = d.k === 'name' ? t.value : numOr(t.value, m[d.k]); save(); }
  else if (d.svm) { const sv = service(d.svm), q = numOr(t.value, 0); sv.materials = (sv.materials || []).filter(x => x.id !== d.m); if (q > 0) sv.materials.push({ id: d.m, qty: q }); store.save(); settingsSheet(); }
  else if (d.pend !== undefined && t.value) { const ch = findCharge(t.value); if (!ch) { toast('Essa cobrança já foi paga'); render(); return; } ui.pending.splice(Number(d.pend), 1); receive(ch); save(); thanksPrompt(ch); }
  else if (d.actFile === 'import' && t.files[0]) { t.files[0].text().then(s => { try { store.importJSON(s); closeSheet(); render(); toast('Backup importado'); } catch (err) { toast(err.message); } }); }
});
document.addEventListener('toggle', e => { const d = e.target; if (d.matches && d.matches('details.grp[data-cgrp]')) { if (d.open) { ui.costOpen = d.dataset.cgrp; document.querySelectorAll('details.grp[data-cgrp][open]').forEach(o => { if (o !== d) o.open = false; }); } else if (ui.costOpen === d.dataset.cgrp) ui.costOpen = null; } if (d.matches && d.matches('details.grp[data-grp]')) { if (d.open) { ui.calcOpen = d.dataset.grp; document.querySelectorAll('details.grp[data-grp][open]').forEach(o => { if (o !== d) o.open = false; }); } else if (ui.calcOpen === d.dataset.grp) ui.calcOpen = null; } }, true);
document.addEventListener('keydown', e => { if (e.key === 'Escape' && ui.sheet) closeSheet(); });
render();
