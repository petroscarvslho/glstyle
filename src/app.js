// GL Style — interface. Usa as funções de core.js e store.js (juntadas no build).
let store; try { store = createStore(window.localStorage); } catch { store = createStore(null); }
const S = () => store.state;
const ui = { tab: 'hoje', pro: 'todos', day: ymd(new Date()), month: monthKey(new Date()), q: '', sheet: null, open: {} };
const $ = sel => document.querySelector(sel);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const today = () => startOfDay(new Date());
const byId = (arr, id) => arr.find(x => x.id === id);
const client = id => byId(S().clients, id) || { name: '(cliente removido)', phone: '' };
const service = id => byId(S().services, id) || { name: '?', durationMin: 30, price: 0, materialCost: 0 };
const pro = id => byId(S().pros, id) || S().pros[0];
const plan = id => byId(S().plans, id);
const owner = () => S().pros.find(p => p.owner) || S().pros[0];
const hhmm = iso => iso.slice(11, 16);
const dataBR = d => d.toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit' });
const dataCurta = d => d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
const mesNome = mk => { const [y, m] = mk.split('-').map(Number); return new Date(y, m - 1, 1).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }); };
const firstName = n => String(n).split(' ')[0];

function save() { store.save(); render(); }
function toast(msg) { const t = document.createElement('div'); t.className = 'aviso'; t.textContent = msg; document.body.appendChild(t); setTimeout(() => t.remove(), 2200); }
async function copy(text, msg = 'Copiado') { try { await navigator.clipboard.writeText(text); } catch { const ta = document.createElement('textarea'); ta.value = text; document.body.appendChild(ta); ta.select(); try { document.execCommand('copy'); } catch {} ta.remove(); } toast(msg); }
function openWA(phone, text) { window.open(waLink(phone, text), '_blank', 'noopener'); }

// ---------- regras de negócio da interface
const mats = () => S().materials || [];
const cpm = () => costPerMinute(S().fixedCosts, (S().settings.hoursPerMonth || 176) * Math.max(1, S().pros.length));
const pixFor = (amount, txid) => pixCode({ key: S().settings.pixKey, name: S().settings.pixName, city: S().settings.pixCity, amount, txid });
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
  const fimDate = ch.due, inicio = (() => { const d = new Date(fimDate); d.setMonth(d.getMonth() - 1); return d; })();
  return fill(tpl, vars({ nome: firstName(ch.client.name), plano: ch.label, valor: brl(ch.amount), data: ch.late > 0 ? dataCurta(ch.due) : (ch.late === 0 ? 'hoje' : dataCurta(ch.due)), inicio: dataCurta(inicio), fim: ch.late === 0 ? `hoje, ${dataCurta(fimDate)}` : `em ${dataCurta(fimDate)}`, chave: S().settings.pixKey, pix }));
}
function visitsOf(cid) { return S().appointments.filter(a => a.clientId === cid && a.status === 'done').map(a => parseLocal(a.start)); }

// ---------- link de agendamento
function bookingURL() {
  const st = S().settings, t = today(), d = {};
  for (let i = 0; i < 7; i++) {
    const day = ymd(addDays(t, i)); d[day] = {};
    for (const p of S().pros) d[day][p.id] = S().appointments.filter(a => a.proId === p.id && a.start.startsWith(day) && !['canceled', 'noshow'].includes(a.status))
      .map(a => { const s0 = parseLocal(a.start), m = s0.getHours() * 60 + s0.getMinutes(); return [m, m + service(a.serviceId).durationMin]; });
  }
  const data = { s: st.shopName, w: normPhone(owner().phone), o: st.openHour, c: st.closeHour, sl: st.slotMin, sv: S().services.map(x => [x.id, x.name, x.price, x.durationMin]), pr: S().pros.map(p => [p.id, firstName(p.name.replace(/\s*\(.*\)/, ''))]), d, g: Date.now() };
  return location.href.split('#')[0] + '#agendar=' + encodeAvailability(data);
}

// ---------- ícones
const I = {
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

function apptItem(a, actions = true) {
  const c = client(a.clientId), s = service(a.serviceId), p = pro(a.proId);
  const pago = a.covered ? '<span class="tag plano">plano</span>' : (a.paid ? '<span class="tag ok">pago</span>' : (a.status === 'done' ? '<span class="tag av">a receber</span>' : ''));
  let bts = '';
  if (actions) {
    if (a.status === 'requested') bts += `<button class="bt ok" data-act="accept" data-id="${a.id}">Aceitar</button><button class="bt mal" data-act="refuse" data-id="${a.id}">Recusar</button>`;
    if (a.status === 'scheduled' || a.status === 'confirmed') {
      bts += `<button class="bt zap" data-act="confirm" data-id="${a.id}">Confirmar</button>`;
      bts += `<button class="bt ok" data-act="done" data-id="${a.id}">Atendido</button>`;
      bts += `<button class="bt mal" data-act="noshow" data-id="${a.id}">Faltou</button>`;
    }
    if (a.status === 'done' && !a.paid && !a.covered) bts += `<button class="bt ouro" data-act="paid" data-id="${a.id}">Recebi ${brl(a.price)}</button><button class="bt leve" data-act="chargeAppt" data-id="${a.id}">Cobrar</button>`;
    if (a.status === 'done' || a.status === 'noshow') bts += `<button class="bt leve" data-act="undo" data-id="${a.id}">Desfazer</button>`;
  }
  return `<div class="item ${a.status === 'done' || a.status === 'noshow' ? 'feito' : ''}">
    <div class="hora num">${hhmm(a.start)}</div>
    <div><div class="nome" data-act="client" data-id="${c.id}">${esc(c.name)}${pago}</div>
      <div class="meta">${S().pros.length > 1 ? `<span class="dot" style="background:${p.color}"></span>${esc(firstName(p.name))} · ` : ''}${esc(s.name)} ${statusTag(a)}</div></div>
    ${bts ? `<div class="acoes">${bts}</div>` : ''}</div>`;
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
  return `<h1>${esc(new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' }))}</h1>
  ${store.persistent ? '' : '<div class="faixa-demo">Os dados ficam só nesta aba: o navegador não deixa guardar. Use Ajustes → Exportar backup antes de fechar.</div>'}
  <div class="resumo"><div class="kpi dest"><span>Recebido hoje</span><strong class="num">${brl(recebido)}</strong></div>
    <div class="kpi"><span>A receber</span><strong class="num">${brl(aReceber)}</strong></div>
    <div class="kpi"><span>Atendidos</span><strong class="num">${feitos}/${list.length}</strong></div></div>
  ${charges ? `<div class="cartao alerta" data-act="tab" data-id="cobrancas" style="cursor:pointer"><strong>${charges} cobrança${charges > 1 ? 's' : ''} em atraso</strong><div class="mini">Toque para cobrar pelo WhatsApp</div></div>` : ''}
  ${(() => { const req = S().appointments.filter(a => a.status === 'requested').sort((a, b) => a.start.localeCompare(b.start)); return req.length ? `<h2>Pedidos para confirmar</h2><div class="lista">${req.map(a => `<div class="mini">${esc(dataBR(parseLocal(a.start)))}</div>${apptItem(a)}`).join('')}</div><h2>Agenda de hoje</h2>` : ''; })()}
  ${proChips()}
  <div class="lista">${list.filter(a => a.status !== 'requested').length ? list.filter(a => a.status !== 'requested').map(a => apptItem(a)).join('') : '<div class="vazio">Nenhum horário hoje. Toque em + para marcar.</div>'}</div>
  <h2>Confirmar os de amanhã</h2>
  ${amanha.length ? `<div class="lista">${amanha.map(a => `<div class="linha"><div class="cresce"><strong>${hhmm(a.start)}</strong> ${esc(client(a.clientId).name)}<div class="meta">${esc(service(a.serviceId).name)}${S().pros.length > 1 ? ' · ' + esc(firstName(pro(a.proId).name)) : ''}${a.remindedAt ? ' · mensagem enviada' : ''}</div></div><button class="bt ${a.remindedAt ? 'leve' : 'zap'}" data-act="confirm" data-id="${a.id}">${a.remindedAt ? 'Reenviar' : 'Enviar'}</button></div>`).join('')}</div>` : '<div class="vazio">Nada pendente para amanhã.</div>'}`;
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
    return `<div class="slot"><div class="h num">${hh}</div><div class="c">${here.map(a => `<div class="ocup" style="border-left-color:${pro(a.proId).color}" data-act="appt" data-id="${a.id}"><strong>${hhmm(a.start)} ${esc(client(a.clientId).name)}</strong> ${statusTag(a)}<div class="mini">${esc(service(a.serviceId).name)} · ${esc(firstName(pro(a.proId).name))}</div></div>`).join('')}${free && !here.length ? `<button class="livre" data-act="new" data-time="${hh}">Livre · marcar</button>` : ''}</div></div>`;
  }).join('');
  return `<h1>Agenda</h1><p class="sub">${esc(dataBR(base))}</p>
  <div class="dias">${days.map(d => `<button class="dia ${ymd(d) === ui.day ? 'on' : ''}" data-act="day" data-id="${ymd(d)}">${d.toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', '')}<b>${d.getDate()}</b></button>`).join('')}</div>
  ${proChips()}${rows}
  <h2>Agendamento pelo cliente</h2>
  <div class="cartao"><div class="mini">Mande o link no WhatsApp, status ou Instagram. O cliente vê os horários livres dos próximos 7 dias e pede pelo WhatsApp. Gere de novo quando a agenda mudar.</div>
    <div class="duas" style="margin-top:8px"><button class="bt ouro" data-act="bookLink">Copiar link</button><button class="bt leve" data-act="bookPreview">Ver como cliente</button></div>
    <label class="campo"><span>Chegou um pedido? Cole a mensagem aqui</span><textarea data-input="req" placeholder="Olá! Quero marcar… #GL[…]">${esc(ui.req || '')}</textarea></label>
    <button class="bt ok cheio" data-act="pasteReq">Adicionar pedido</button></div>`;
}

function viewClientes() {
  const t = today(), q = stripAccents(ui.q).toLowerCase();
  const all = [...S().clients].sort((a, b) => a.name.localeCompare(b.name));
  const sumidos = all.filter(c => isMissing(visitsOf(c.id), t, S().settings.missingDays));
  const list = all.filter(c => !q || stripAccents(c.name).toLowerCase().includes(q) || c.phone.includes(q));
  const last = c => { const v = visitsOf(c.id); return v.length ? daysBetween(v.reduce((a, b) => (a > b ? a : b)), t) : null; };
  const debt = c => S().appointments.filter(a => a.clientId === c.id && a.status === 'done' && !a.paid && !a.covered).reduce((s, a) => s + a.price, 0);
  return `<h1>Clientes</h1><p class="sub">${all.length} cadastrados · ${all.filter(c => c.planId).length} com plano</p>
  <input type="search" placeholder="Buscar por nome ou telefone" value="${esc(ui.q)}" data-input="q" autocomplete="off">
  ${!q && sumidos.length ? `<h2>Sumidos</h2><p class="sub">Passaram do ritmo normal de visitas.</p><div class="lista">${sumidos.map(c => `<div class="linha"><div class="cresce"><strong data-act="client" data-id="${c.id}">${esc(c.name)}</strong><div class="meta">Última visita há ${last(c)} dias · costuma vir a cada ${rhythm(visitsOf(c.id)) ?? '?'} dias</div></div><button class="bt zap" data-act="comeback" data-id="${c.id}">Chamar</button></div>`).join('')}</div><h2>Todos</h2>` : ''}
  <div class="lista" style="margin-top:10px">${list.map(c => { const d = debt(c), l = last(c); return `<div class="linha" data-act="client" data-id="${c.id}" style="cursor:pointer"><div class="cresce"><strong>${esc(c.name)}</strong>${c.planId ? `<span class="tag plano">${esc(plan(c.planId)?.name || '')}</span>` : ''}${d ? `<span class="tag av">deve ${brl(d)}</span>` : ''}<div class="meta">${l === null ? 'Sem visitas' : l === 0 ? 'Veio hoje' : `Última visita há ${l} dias`}</div></div></div>`; }).join('') || '<div class="vazio">Ninguém com esse nome. Toque em + para cadastrar no agendamento.</div>'}</div>
  <button class="bt cheio leve" style="margin-top:12px" data-act="newClient">Cadastrar cliente</button>`;
}

function viewCobrancas() {
  const ch = openCharges();
  const late = ch.filter(c => c.late > 0), soon = ch.filter(c => c.late <= 0);
  const row = c => `<div class="cartao"><div style="display:flex;justify-content:space-between;gap:8px"><div><strong data-act="client" data-id="${c.client.id}">${esc(c.client.name)}</strong><div class="mini">${esc(c.label)} · ${c.kind === 'single' ? (c.late > 0 ? `<span class="neg">atendido há ${c.late} dia${c.late > 1 ? 's' : ''}</span>` : 'atendido hoje') : c.late > 0 ? `<span class="neg">atrasada há ${c.late} dia${c.late > 1 ? 's' : ''}</span>` : c.late === 0 ? 'vence hoje' : `vence em ${-c.late} dia${c.late < -1 ? 's' : ''}`}${c.kind === 'plan' && c.late > 0 ? ` · tom ${toneFor(c.client.lateCount || 0)}` : ''}</div></div><div class="valor num">${brl(c.amount)}</div></div>
    <div class="acoes" style="display:flex;gap:6px;flex-wrap:wrap;margin-top:10px"><button class="bt zap" data-act="charge" data-id="${c.id}">Cobrar no WhatsApp</button><button class="bt leve" data-act="copyPix" data-id="${c.id}">Copiar Pix</button><button class="bt ok" data-act="receive" data-id="${c.id}">Recebi</button></div></div>`;
  const pend = ui.pending || [];
  return `<h1>Cobranças</h1><p class="sub">${late.length} em atraso · ${soon.length} vencendo em até 3 dias</p>
  <div class="cartao"><strong>Chegou um Pix?</strong><div class="mini">Cole aqui a notificação ou o comprovante do banco. O app acha a cobrança e marca como paga.</div>
    <textarea data-input="notif" placeholder="Ex.: Você recebeu um Pix de JOAO PEDRO no valor de R$ 100,00">${esc(ui.notif || '')}</textarea>
    <button class="bt ouro cheio" style="margin-top:8px" data-act="parseNotif">Conferir Pix</button>
    ${pend.length ? `<h2>Pix a conferir</h2>${pend.map((p, i) => `<div class="linha" style="background:var(--couro);margin-top:6px"><div class="cresce">${esc(p.name || 'Sem nome')} · <strong>${p.amount != null ? brl(p.amount) : 'valor não lido'}</strong><div class="meta">Não achei uma cobrança só com esses dados. Escolha:</div><select data-pend="${i}"><option value="">Escolher cobrança…</option>${ch.map(c => `<option value="${c.id}">${esc(c.client.name)} — ${brl(c.amount)}</option>`).join('')}</select></div></div>`).join('')}` : ''}</div>
  <h2>Em atraso</h2>${late.length ? late.map(row).join('') : '<div class="vazio">Ninguém em atraso.</div>'}
  <h2>Vencendo</h2>${soon.length ? soon.map(row).join('') : '<div class="vazio">Nada vencendo nos próximos 3 dias.</div>'}`;
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
  return `<h1>Caixa</h1>
  <div class="chips"><button class="chip" data-act="month" data-id="-1">‹ Anterior</button><button class="chip on">${esc(mesNome(mk))}</button><button class="chip" data-act="month" data-id="1">Próximo ›</button></div>
  <div class="cartao"><div class="mini">Lucro do mês</div><div class="grande num ${sum.profit >= 0 ? 'pos' : 'neg'}">${brl(sum.profit)}</div>
    <div class="duas" style="margin-top:10px"><div><div class="mini">Entradas</div><strong class="num">${brl(sum.totalIn)}</strong><div class="mini">Avulsos ${brl(sum.income.own)}<br>Mensalidades ${brl(sum.income.plans)}<br>Repasses ${brl(sum.income.shares)}</div></div>
    <div><div class="mini">Saídas</div><strong class="num">${brl(sum.totalOut)}</strong><div class="mini">Contas ${brl(sum.out.fixed)}<br>Despesas ${brl(sum.out.expenses)}</div></div></div></div>
  ${isCur ? `<h2>Próximos 30 dias</h2><div class="cartao ${fc.net < 0 ? 'alerta' : ''}"><div style="display:flex;justify-content:space-between;align-items:end"><div><div class="mini">Previsão de saldo</div><div class="valor num ${fc.net >= 0 ? 'pos' : 'neg'}" style="font-size:26px">${brl(fc.net)}</div></div><div class="mini" style="text-align:right">Entra ${brl(fc.inflow)}<br>Sai ${brl(fc.outflow)}</div></div>
    ${fc.net < 0 ? '<div class="mini neg" style="margin-top:6px">Vai faltar dinheiro: cobre os atrasados ou segure despesas.</div>' : ''}
    <details><summary>Ver lançamentos previstos</summary>${fc.items.map(i => `<div class="mini" style="display:flex;justify-content:space-between;margin:3px 0"><span>${dataCurta(i.date)} · ${esc(i.label)}</span><span class="num ${i.amount >= 0 ? 'pos' : 'neg'}">${brl(i.amount)}</span></div>`).join('')}</details></div>` : ''}
  <h2>Contas do mês</h2><div class="lista">${bills.map(b => `<div class="linha"><div class="cresce"><strong>${esc(b.cost.name)}</strong><div class="meta">vence ${dataCurta(b.due)} ${b.paid ? '<span class="tag ok">paga</span>' : b.overdue ? '<span class="tag mal">vencida</span>' : ''}</div></div><div class="valor num">${brl(b.cost.monthly)}</div>${b.paid ? '' : `<button class="bt ok" data-act="billPaid" data-id="${b.cost.id}">Paguei</button>`}</div>`).join('')}</div>
  <h2>Despesas avulsas</h2>
  <div class="lista">${S().expenses.filter(e => e.date.startsWith(mk)).map(e => `<div class="linha"><div class="cresce"><strong>${esc(e.name)}</strong><div class="meta">${dataCurta(parseLocal(e.date))}</div></div><div class="valor num neg">${brl(e.amount)}</div><button class="icone" data-act="delExpense" data-id="${e.id}" aria-label="Apagar despesa">✕</button></div>`).join('')}</div>
  <div class="tres" style="margin-top:8px"><input placeholder="Gasto (ex.: lâminas)" data-new="expName"><input inputmode="decimal" placeholder="R$" data-new="expVal"><button class="bt ouro" data-act="addExpense">Lançar</button></div>
  <h2>Barbeiros associados</h2>${assoc ? `<p class="sub">Repasse de ${esc(mesNome(mk))}</p><div class="lista">${assoc}</div>` : '<div class="vazio">Por enquanto só você. Quando entrar outro barbeiro, cadastre em Ajustes → Profissionais: ele ganha agenda própria e o app calcula o repasse dele.</div>'}
  <h2>Quanto custa cada minuto</h2>
  <div class="cartao"><div class="duas"><div><div class="mini">Gastos fixos/mês</div><strong class="num">${brl(totalFix)}</strong></div><div><div class="mini">Custo do minuto de cadeira</div><strong class="num">${brl(c)}</strong></div></div>
  <div class="mini" style="margin-top:6px">${S().pros.length} cadeira(s) × ${S().settings.hoursPerMonth} h/mês. Cada cadeira custa ${brl(totalFix / Math.max(1, S().pros.length))} por mês. Compare com o repasse de cada associado.</div>
  <details><summary>Editar gastos fixos</summary>${S().fixedCosts.map(f => `<div class="tres" style="margin:6px 0"><input value="${esc(f.name)}" data-fc="${f.id}" data-k="name"><input inputmode="decimal" value="${f.monthly}" data-fc="${f.id}" data-k="monthly"><input inputmode="numeric" value="${f.dueDay}" data-fc="${f.id}" data-k="dueDay" aria-label="Dia de vencimento"></div>`).join('')}<div class="mini">Nome · valor mensal · dia que vence</div><button class="bt leve" style="margin-top:6px" data-act="addFixed">Adicionar gasto fixo</button>
    <label class="campo"><span>Horas trabalhadas por mês (por cadeira)</span><input inputmode="numeric" value="${S().settings.hoursPerMonth}" data-set="hoursPerMonth"></label></details></div>
  <h2>Material</h2><p class="sub">Preço que paga · quantos atendimentos rende. O custo por uso entra sozinho em cada serviço.</p>
  <div class="lista">${mats().map(m => `<div class="cartao" style="margin:0"><input value="${esc(m.name)}" data-mt="${m.id}" data-k="name"><div class="tres" style="margin-top:6px"><input inputmode="decimal" value="${m.price}" data-mt="${m.id}" data-k="price" aria-label="Preço pago"><input inputmode="numeric" value="${m.yield}" data-mt="${m.id}" data-k="yield" aria-label="Rende quantos usos"><div class="mini" style="text-align:right">${brl(m.yield > 0 ? m.price / m.yield : 0)}/uso</div></div></div>`).join('')}</div>
  <div class="mini">Preço pago · rende quantos usos · custo por uso</div>
  <button class="bt leve" style="margin-top:6px" data-act="addMat">Adicionar material</button>
  <h2>Lucro por serviço avulso</h2><div class="lista">${svcRows}</div>
  <h2>Lucro por pacote (ciclo atual)</h2>${planRows}`;
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
function drawNA() {
  const n = ui.na, c = n.clientId && byId(S().clients, n.clientId);
  const q = stripAccents(n.q).toLowerCase();
  const sugs = q.length >= 2 ? S().clients.filter(x => stripAccents(x.name).toLowerCase().includes(q)).slice(0, 5) : [];
  const covered = c && coveredFor(c, n.serviceId, `${n.date}T${n.time || '09:00'}`);
  sheet(`<h2>Novo horário</h2>
  ${c ? `<div class="linha" style="background:var(--couro)"><div class="cresce"><strong>${esc(c.name)}</strong>${c.planId ? `<span class="tag plano">${esc(plan(c.planId).name)}</span>` : ''}</div><button class="bt leve" data-act="naClear">Trocar</button></div>`
      : `<div class="busca"><input placeholder="Nome do cliente (2 letras)" data-na="q" value="${esc(n.q)}" autofocus autocomplete="off">${sugs.length ? `<div class="sugs">${sugs.map(x => `<button data-act="naPick" data-id="${x.id}">${esc(x.name)}</button>`).join('')}</div>` : ''}</div>
         ${q.length >= 2 ? `<div class="duas" style="margin-top:8px"><input placeholder="Nome completo (novo)" data-na="newName" value="${esc(n.newName || n.q)}"><input placeholder="WhatsApp" inputmode="tel" data-na="newPhone" value="${esc(n.newPhone)}"></div><div class="mini">Se não estiver na lista, preencha o WhatsApp e ele é cadastrado ao salvar.</div>` : ''}`}
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

function settingsSheet() {
  const st = S().settings;
  sheet(`<h2>Ajustes</h2>
  <label class="campo"><span>Nome do salão</span><input value="${esc(st.shopName)}" data-set="shopName"></label>
  <div class="duas"><label class="campo"><span>Chave Pix</span><input value="${esc(st.pixKey)}" data-set="pixKey"></label><label class="campo"><span>Nome no Pix</span><input value="${esc(st.pixName)}" data-set="pixName"></label></div>
  <div class="duas"><label class="campo"><span>Cidade</span><input value="${esc(st.pixCity)}" data-set="pixCity"></label><label class="campo"><span>Sumido após (dias)</span><input inputmode="numeric" value="${st.missingDays}" data-set="missingDays"></label></div>
  <div class="tres"><label class="campo"><span>Abre</span><input inputmode="numeric" value="${st.openHour}" data-set="openHour"></label><label class="campo"><span>Fecha</span><input inputmode="numeric" value="${st.closeHour}" data-set="closeHour"></label><label class="campo"><span>Intervalo (min)</span><input inputmode="numeric" value="${st.slotMin}" data-set="slotMin"></label></div>
  <details><summary>Profissionais e repasse</summary>${S().pros.map(p => `<div class="cartao" style="background:var(--couro)"><div class="duas"><input value="${esc(p.name)}" data-pr="${p.id}" data-k="name"><input inputmode="tel" value="${esc(p.phone || '')}" placeholder="WhatsApp" data-pr="${p.id}" data-k="phone"></div>${p.owner ? '<div class="mini" style="margin-top:6px">Dono do salão</div>' : `<div class="tres" style="margin-top:6px"><select data-pr="${p.id}" data-k="shareType"><option value="percent" ${p.shareType === 'percent' ? 'selected' : ''}>% do faturamento</option><option value="fixed" ${p.shareType === 'fixed' ? 'selected' : ''}>Valor fixo/mês</option></select><input inputmode="decimal" value="${p.shareValue}" data-pr="${p.id}" data-k="shareValue"><input inputmode="numeric" value="${p.dueDay || 5}" data-pr="${p.id}" data-k="dueDay" aria-label="Dia do repasse"></div><div class="mini">Tipo · valor · dia do repasse</div>`}</div>`).join('')}<button class="bt leve" data-act="addPro">Adicionar barbeiro</button></details>
  <details><summary>Serviços</summary>${S().services.map(s => `<div class="cartao" style="background:var(--couro)"><input value="${esc(s.name)}" data-sv="${s.id}" data-k="name"><div class="tres" style="margin-top:6px"><input inputmode="decimal" value="${s.price}" data-sv="${s.id}" data-k="price"><input inputmode="numeric" value="${s.durationMin}" data-sv="${s.id}" data-k="durationMin"><input inputmode="decimal" value="${s.materialCost}" data-sv="${s.id}" data-k="materialCost"></div><div class="mini">Preço · minutos · custo extra fixo</div>${mats().length ? `<div class="mini" style="margin-top:8px">Material usado por atendimento (quantidade):</div>${mats().map(m => { const u = (s.materials || []).find(x => x.id === m.id); return `<div style="display:flex;gap:8px;align-items:center;margin-top:4px"><span class="mini" style="flex:1">${esc(m.name)}</span><input style="width:80px" inputmode="decimal" value="${u ? u.qty : 0}" data-svm="${s.id}" data-m="${m.id}"></div>`; }).join('')}<div class="mini" style="margin-top:4px">Material por atendimento: <strong>${brl(materialCostOf(s, mats()))}</strong></div>` : ''}</div>`).join('')}<button class="bt leve" data-act="addSvc">Adicionar serviço</button></details>
  <details><summary>Pacotes</summary>${S().plans.map(p => `<div class="cartao" style="background:var(--couro)"><input value="${esc(p.name)}" data-pl="${p.id}" data-k="name"><div class="tres" style="margin-top:6px"><input inputmode="decimal" value="${p.price}" data-pl="${p.id}" data-k="price"><select data-pl="${p.id}" data-k="type"><option value="unlimited" ${p.type === 'unlimited' ? 'selected' : ''}>Ilimitado</option><option value="fixed" ${p.type === 'fixed' ? 'selected' : ''}>Nº de visitas</option></select><input inputmode="numeric" value="${p.visitsPerCycle}" data-pl="${p.id}" data-k="visitsPerCycle"></div><div class="mini">Preço · tipo · visitas no mês</div><div class="chips" style="margin-top:6px">${S().services.map(s => `<button class="chip ${p.serviceIds.includes(s.id) ? 'on' : ''}" data-act="plSvc" data-id="${p.id}" data-s="${s.id}">${esc(s.name)}</button>`).join('')}</div></div>`).join('')}<button class="bt leve" data-act="addPlan">Adicionar pacote</button></details>
  <details><summary>Textos das mensagens</summary>${Object.entries(st.templates).map(([k, v]) => `<label class="campo"><span>${{ accept: 'Pedido aceito', refuse: 'Pedido recusado', confirm: 'Confirmação de horário (véspera)', renew: 'Renovação do plano (fim do ciclo)', reschedule: 'Horário remarcado', remindLeve: 'Mensalidade (tom leve)', remindFirme: 'Mensalidade atrasada (tom firme)', charge: 'Cobrança de avulso', thanks: 'Agradecimento de pagamento', comeback: 'Cliente sumido', proShare: 'Repasse do associado' }[k] || k}</span><textarea data-tpl="${k}">${esc(v)}</textarea></label>`).join('')}<div class="mini">Variáveis: {link} {nome} {data} {hora} {servico} {valor} {plano} {inicio} {fim} {chave} {pix} {dias} {mes} {salao}</div></details>
  <h2>Backup</h2><div class="mini">${store.persistent ? 'Os dados ficam guardados neste aparelho. Exporte um backup de vez em quando.' : 'Este navegador não está guardando os dados. Exporte antes de fechar.'}</div>
  <div class="duas" style="margin-top:8px"><button class="bt leve" data-act="export">Exportar backup</button><label class="bt leve" style="text-align:center">Importar<input type="file" accept="application/json" data-act-file="import" hidden></label></div>
  <button class="bt mal cheio" style="margin-top:12px" data-act="reset">Recomeçar com dados de exemplo</button>`);
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
  $('.marca').innerHTML = esc(S().settings.shopName).replace(/^(\S+)/, '<b>$1</b>');
  if (focus) { const el = document.querySelector(`[data-input="${focus}"]`); if (el) { el.focus(); try { el.setSelectionRange(pos, pos); } catch {} } }
}

// ---------- ações
const findCharge = id => openCharges().find(c => c.id === id);
const A = {
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
    Object.assign(c, { name, phone: g('phone').trim(), planId: g('planId') || null, dueDay: Math.min(31, Math.max(1, parseInt(g('dueDay')) || 1)), notes: g('notes') });
    closeSheet(); save(); toast('Cliente salvo');
  },
  clDel: el => { if (!confirm('Apagar este cliente e o histórico dele?')) return; const id = el.dataset.id; S().clients = S().clients.filter(c => c.id !== id); S().appointments = S().appointments.filter(a => a.clientId !== id); closeSheet(); save(); },
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
  naSvc: el => { ui.na.serviceId = el.dataset.id; drawNA(); },
  naPro: el => { ui.na.proId = el.dataset.id; drawNA(); },
  naSave: () => {
    const n = ui.na, err = m => { document.getElementById('naErr').textContent = m; };
    if (!n.time) return err('Escolha a hora.');
    let c = n.clientId && byId(S().clients, n.clientId);
    if (!c) {
      const name = (n.newName || n.q).trim(); if (name.length < 2) return err('Digite o nome do cliente.');
      if (normPhone(n.newPhone).length < 12) return err('Informe o WhatsApp do cliente novo (com DDD).');
      c = { id: store.uid(), name, phone: n.newPhone, planId: null, dueDay: new Date().getDate(), notes: '', createdAt: ymd(new Date()), lateCount: 0 }; S().clients.push(c);
    }
    const start = `${n.date}T${n.time}`, s = service(n.serviceId), st0 = parseLocal(start), en0 = new Date(st0.getTime() + s.durationMin * 60000);
    const clash = S().appointments.find(a => a.proId === n.proId && !['canceled', 'noshow'].includes(a.status) && (() => { const a0 = parseLocal(a.start), a1 = new Date(a0.getTime() + service(a.serviceId).durationMin * 60000); return a0 < en0 && st0 < a1; })());
    if (clash && !n.force) { n.force = true; return err(`${firstName(pro(n.proId).name)} já tem ${client(clash.clientId).name} às ${hhmm(clash.start)}. Toque de novo para marcar assim mesmo.`); }
    const covered = coveredFor(c, n.serviceId, start);
    S().appointments.push({ id: store.uid(), clientId: c.id, serviceId: n.serviceId, proId: n.proId, start, status: 'scheduled', covered, price: covered ? 0 : s.price, paid: covered });
    closeSheet(); ui.day = n.date; save(); toast(`Marcado: ${firstName(c.name)} ${dataCurta(st0)} ${n.time}`);
  },
  reschedule: el => {
    const a = byId(S().appointments, el.dataset.id), d = document.getElementById('rmD').value, t = document.getElementById('rmT').value;
    if (!d || !t) return toast('Escolha dia e hora');
    a.start = `${d}T${t}`; a.status = 'scheduled'; const c = client(a.clientId);
    openWA(c.phone, fill(S().settings.templates.reschedule || '{nome}, seu horário mudou para {data} às {hora}.', vars({ nome: firstName(c.name), data: dataBR(parseLocal(a.start)), hora: t })));
    closeSheet(); ui.day = d; save(); toast('Remarcado');
  },
  accept: el => { const a = byId(S().appointments, el.dataset.id), c = client(a.clientId); a.status = 'confirmed'; openWA(c.phone, fill(S().settings.templates.accept, vars({ nome: firstName(c.name), data: dataBR(parseLocal(a.start)), hora: hhmm(a.start), servico: service(a.serviceId).name }))); save(); toast('Pedido aceito'); },
  refuse: el => { const a = byId(S().appointments, el.dataset.id), c = client(a.clientId); a.status = 'canceled'; openWA(c.phone, fill(S().settings.templates.refuse, vars({ nome: firstName(c.name), data: dataBR(parseLocal(a.start)), hora: hhmm(a.start), link: bookingURL() }))); save(); },
  bookLink: () => copy(bookingURL(), 'Link de agendamento copiado'),
  bookPreview: () => { location.hash = bookingURL().split('#')[1]; },
  pasteReq: () => {
    const r = parseBookingRequest(ui.req || ''); if (!r) return toast('Não achei o código do pedido (#GL[…]) na mensagem');
    if (!byId(S().services, r.serviceId) || !byId(S().pros, r.proId)) return toast('Pedido com serviço ou profissional que não existe mais');
    let c = S().clients.find(x => stripAccents(x.name).toLowerCase() === stripAccents(r.name).toLowerCase());
    const phone = (String(ui.req).match(/tel(?:efone)?:?\s*([\d()\s-]{10,})/i) || [])[1] || '';
    if (!c) { c = { id: store.uid(), name: r.name, phone, planId: null, dueDay: new Date().getDate(), notes: '', createdAt: ymd(new Date()), lateCount: 0 }; S().clients.push(c); }
    else if (phone && !c.phone) c.phone = phone;
    if (S().appointments.some(a => a.clientId === c.id && a.start === r.start && a.status !== 'canceled')) return toast('Esse pedido já está na agenda');
    const covered = coveredFor(c, r.serviceId, r.start);
    S().appointments.push({ id: store.uid(), clientId: c.id, serviceId: r.serviceId, proId: r.proId, start: r.start, status: 'requested', covered, price: covered ? 0 : service(r.serviceId).price, paid: covered });
    ui.req = ''; ui.tab = 'hoje'; save(); toast('Pedido adicionado: aceite ou recuse');
  },
  addMat: () => { (S().materials = S().materials || []).push({ id: store.uid(), name: 'Novo material', price: 0, yield: 1 }); save(); },
  billPaid: el => { const f = byId(S().fixedCosts, el.dataset.id); S().billPayments.push({ id: store.uid(), costId: f.id, month: ui.month, amount: f.monthly, date: ymd(new Date()) }); save(); toast(`${f.name} paga`); },
  addExpense: () => { const n = document.querySelector('[data-new="expName"]').value.trim(), v = Number(String(document.querySelector('[data-new="expVal"]').value).replace(/\./g, '').replace(',', '.')); if (!n || !(v > 0)) return toast('Preencha o gasto e o valor'); const d = ui.month === monthKey(new Date()) ? ymd(new Date()) : ui.month + '-01'; S().expenses.push({ id: store.uid(), date: d, name: n, amount: v }); save(); toast('Despesa lançada'); },
  delExpense: el => { S().expenses = S().expenses.filter(e => e.id !== el.dataset.id); save(); },
  proCharge: el => { const p = pro(el.dataset.id), v = Number(el.dataset.v); openWA(p.phone, fill(S().settings.templates.proShare, vars({ nome: firstName(p.name), mes: mesNome(ui.month), valor: brl(v), pix: pixFor(v, 'REP' + p.id.slice(-4)) }))); },
  proPaid: el => { S().proPayments.push({ id: store.uid(), proId: el.dataset.id, month: ui.month, amount: Number(el.dataset.v), date: ymd(new Date()) }); save(); toast('Repasse recebido'); },
  addFixed: () => { S().fixedCosts.push({ id: store.uid(), name: 'Novo gasto', monthly: 0, dueDay: 10 }); save(); },
  settings: () => settingsSheet(),
  addPro: () => { S().pros.push({ id: store.uid(), name: 'Novo barbeiro', phone: '', color: ['#e88cc2', '#f0d264', '#9b8cf0', '#64d2f0'][S().pros.length % 4], owner: false, shareType: 'percent', shareValue: 30, dueDay: 5 }); store.save(); settingsSheet(); },
  addSvc: () => { S().services.push({ id: store.uid(), name: 'Novo serviço', durationMin: 30, price: 30, materialCost: 2 }); store.save(); settingsSheet(); },
  addPlan: () => { S().plans.push({ id: store.uid(), name: 'Novo pacote', type: 'fixed', visitsPerCycle: 2, price: 60, serviceIds: [S().services[0].id] }); store.save(); settingsSheet(); },
  plSvc: el => { const p = plan(el.dataset.id), s = el.dataset.s; p.serviceIds = p.serviceIds.includes(s) ? p.serviceIds.filter(x => x !== s) : [...p.serviceIds, s]; store.save(); settingsSheet(); },
  export: () => { const blob = new Blob([store.exportJSON()], { type: 'application/json' }); const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `glstyle-backup-${ymd(new Date())}.json`; a.click(); toast('Backup baixado'); },
  reset: () => { if (!confirm('Apagar tudo e voltar aos dados de exemplo?')) return; store.reset(); closeSheet(); render(); },
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
  if (d.input === 'q') { ui.q = t.value; render(); }
  else if (d.input === 'notif') ui.notif = t.value;
  else if (d.input === 'req') ui.req = t.value;
  else if (d.na) { ui.na[d.na] = t.value; ui.na.force = false; if (d.na === 'q') { drawNA(); const el = document.querySelector('[data-na="q"]'); el.focus(); el.setSelectionRange(el.value.length, el.value.length); } }
});
const numOr = (v, f) => { const n = Number(String(v).replace(',', '.')); return Number.isFinite(n) ? n : f; };
document.addEventListener('change', e => {
  const t = e.target, d = t.dataset;
  if (d.set) { const st = S().settings; st[d.set] = typeof st[d.set] === 'number' ? numOr(t.value, st[d.set]) : t.value; save(); }
  else if (d.tpl) { S().settings.templates[d.tpl] = t.value; store.save(); }
  else if (d.fc) { const f = byId(S().fixedCosts, d.fc); f[d.k] = d.k === 'name' ? t.value : numOr(t.value, f[d.k]); save(); }
  else if (d.pr) { const p = pro(d.pr); p[d.k] = ['name', 'phone', 'shareType'].includes(d.k) ? t.value : numOr(t.value, p[d.k]); store.save(); render(); }
  else if (d.sv) { const s = service(d.sv); s[d.k] = d.k === 'name' ? t.value : numOr(t.value, s[d.k]); store.save(); render(); }
  else if (d.pl) { const p = plan(d.pl); p[d.k] = ['name', 'type'].includes(d.k) ? t.value : numOr(t.value, p[d.k]); store.save(); render(); }
  else if (d.mt) { const m = byId(mats(), d.mt); m[d.k] = d.k === 'name' ? t.value : numOr(t.value, m[d.k]); save(); }
  else if (d.svm) { const sv = service(d.svm), q = numOr(t.value, 0); sv.materials = (sv.materials || []).filter(x => x.id !== d.m); if (q > 0) sv.materials.push({ id: d.m, qty: q }); store.save(); settingsSheet(); }
  else if (d.pend !== undefined && t.value) { const ch = findCharge(t.value); ui.pending.splice(Number(d.pend), 1); receive(ch); save(); thanksPrompt(ch); }
  else if (d.actFile === 'import' && t.files[0]) { t.files[0].text().then(s => { try { store.importJSON(s); closeSheet(); render(); toast('Backup importado'); } catch (err) { toast(err.message); } }); }
});
document.addEventListener('keydown', e => { if (e.key === 'Escape' && ui.sheet) closeSheet(); });
function boot() { if (location.hash.startsWith('#agendar=')) bookingPage(location.hash.slice(9)); else { document.body.classList.remove('cliente'); render(); } }
window.addEventListener('hashchange', boot);
boot();
