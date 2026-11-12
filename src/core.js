// GL Style — lógica pura (sem DOM). Testada em tests/core.test.mjs.

// ---------- utilidades de data/dinheiro
export const pad2 = n => String(n).padStart(2, '0');
export const ymd = d => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
export const monthKey = d => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;
export const parseLocal = s => {
  const [date, time = '00:00'] = String(s).split('T');
  const [y, m, d] = date.split('-').map(Number);
  const [hh, mm] = time.split(':').map(Number);
  return new Date(y, m - 1, d, hh || 0, mm || 0);
};
export const startOfDay = d => new Date(d.getFullYear(), d.getMonth(), d.getDate());
export const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n, d.getHours(), d.getMinutes());
export const daysBetween = (a, b) => Math.round((startOfDay(b) - startOfDay(a)) / 86400000);
const lastDay = (y, m) => new Date(y, m + 1, 0).getDate();
const dayIn = (y, m, day) => new Date(y, m, Math.min(day, lastDay(y, m)));

export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const dataBR = d => d.toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit' });
export const brl = n => (Number(n) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
export const round2 = n => Math.round((Number(n) || 0) * 100) / 100;
export const stripAccents = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '');
const norm = s => stripAccents(s).toLowerCase().trim();

// ---------- custos
export function costPerMinute(fixedCosts, hoursPerMonth) {
  const total = (fixedCosts || []).reduce((a, c) => a + (Number(c.monthly) || 0), 0);
  const min = (Number(hoursPerMonth) || 0) * 60;
  return min > 0 ? total / min : 0;
}
// custo de material por atendimento: Σ qty × (preço pago ÷ quantos usos rende)
export function materialCostOf(service, materials) {
  return (service?.materials || []).reduce((t, u) => {
    const m = (materials || []).find(x => x.id === u.id);
    return m && Number(m.yield) > 0 ? t + (Number(u.qty) || 0) * Number(m.price) / Number(m.yield) : t;
  }, 0);
}
export function apptCost(service, cpm, price, feePct, materials) {
  const mat = materials && service?.materials?.length ? materialCostOf(service, materials) : (Number(service?.materialCost) || 0);
  return (Number(service?.durationMin) || 0) * cpm + mat + (Number(price) || 0) * (Number(feePct) || 0) / 100;
}

// Ciclo da assinatura: do último vencimento <= ref até a véspera do próximo.
export function cycleRange(dueDay, refDate) {
  const r = startOfDay(refDate);
  let y = r.getFullYear(), m = r.getMonth();
  let start = dayIn(y, m, dueDay);
  if (start > r) { m -= 1; if (m < 0) { m = 11; y -= 1; } start = dayIn(y, m, dueDay); }
  let ny = start.getFullYear(), nm = start.getMonth() + 1;
  if (nm > 11) { nm = 0; ny += 1; }
  const next = dayIn(ny, nm, dueDay);
  return { start, end: addDays(next, -1) };
}
const inRange = (iso, { start, end }) => { const d = startOfDay(parseLocal(iso)); return d >= start && d <= end; };

export function subscriberStats(client, plan, appts, services, cpm, feePct, refDate, materials) {
  const cyc = cycleRange(client.dueDay || 1, refDate);
  const svc = id => services.find(s => s.id === id);
  const mine = appts.filter(a => a.clientId === client.id && a.status === 'done' && a.covered && inRange(a.start, cyc));
  const cost = mine.reduce((t, a) => t + apptCost(svc(a.serviceId), cpm, 0, 0, materials), 0) + (plan?.price || 0) * (feePct || 0) / 100;
  return { visits: mine.length, cost, profit: (plan?.price || 0) - cost, cycle: cyc };
}
export const breakEven = (price, avg) => (avg > 0 ? Math.floor(price / avg) : Infinity);

export function proShare(pro, appts, month) {
  const gross = appts.filter(a => a.proId === pro.id && a.status === 'done' && String(a.start).slice(0, 7) === month)
    .reduce((t, a) => t + (Number(a.price) || 0), 0);
  const share = pro.shareType === 'percent' ? round2(gross * (Number(pro.shareValue) || 0) / 100) : (Number(pro.shareValue) || 0);
  return { gross: round2(gross), share };
}

// ---------- Pix BR Code (EMV)
export function crc16(str) {
  let crc = 0xffff;
  for (const ch of new TextEncoder().encode(str)) {
    crc ^= ch << 8;
    for (let i = 0; i < 8; i++) crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}
const tlv = (id, v) => id + pad2(v.length) + v;
const pixText = (s, max) => stripAccents(s).toUpperCase().replace(/[^A-Z0-9 .\-@]/g, '').trim().slice(0, max);
export function pixCode({ key, name, city, amount, txid = '***' }) {
  const mai = tlv('00', 'br.gov.bcb.pix') + tlv('01', String(key).trim());
  let p = tlv('00', '01') + tlv('26', mai) + tlv('52', '0000') + tlv('53', '986');
  if (amount && Number(amount) > 0) p += tlv('54', Number(amount).toFixed(2));
  p += tlv('58', 'BR') + tlv('59', pixText(name, 25) || 'RECEBEDOR') + tlv('60', pixText(city, 15) || 'BRASIL');
  p += tlv('62', tlv('05', String(txid).replace(/[^A-Za-z0-9*]/g, '').slice(0, 25) || '***'));
  p += '6304';
  return p + crc16(p);
}

// ---------- WhatsApp
export function normPhone(raw) {
  let d = String(raw || '').replace(/\D/g, '');
  if (d.startsWith('55') && (d.length === 12 || d.length === 13)) return d;
  d = d.replace(/^0+/, '');
  if (d.length === 10 || d.length === 11) return '55' + d;
  return d;
}
// chave Pix no formato que os bancos aceitam
export function normPixKey(key, type) {
  const k = String(key || '').trim();
  if (type === 'phone') { const d = normPhone(k); return d ? '+' + d : ''; }
  if (type === 'cpf' || type === 'cnpj') return k.replace(/\D/g, '');
  if (type === 'email') return k.toLowerCase();
  return k.toLowerCase();
}
export const waLink = (phone, text) => `https://wa.me/${normPhone(phone)}?text=${encodeURIComponent(text)}`;
export const fill = (tpl, vars) => String(tpl).replace(/\{(\w+)\}/g, (m, k) => (vars[k] !== undefined ? vars[k] : m));

// dinheiro digitado: "12.50", "12,50", "1.234,56", "1,234.56", "1.050", "R$100.00"
export function parseMoney(v) {
  let t = String(v ?? '').replace(/[^\d.,-]/g, '');
  if (!/\d/.test(t)) return NaN;
  const lc = t.lastIndexOf(','), ld = t.lastIndexOf('.');
  if (lc >= 0 && ld >= 0) { const dec = lc > ld ? ',' : '.'; t = t.split(dec === ',' ? '.' : ',').join('').replace(dec, '.'); }
  else if (lc >= 0) t = t.split(',').length > 2 ? t.replace(/,/g, '') : t.replace(',', '.');
  else if (ld >= 0 && (t.split('.').length > 2 || /^\d{1,3}\.\d{3}$/.test(t))) t = t.replace(/\./g, '');
  const n = Number(t);
  return Number.isFinite(n) ? n : NaN;
}

// ---------- notificação do banco
export function parseBankNotification(text) {
  const t = String(text || '');
  const mv = t.match(/R\$\s*([\d.,]*\d)/i);
  const amount = mv ? parseMoney(mv[1]) : null;
  const mn = t.match(/\bde\s+([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ'\s]*?)(?=\s+(?:no valor|valor|R\$)|[.,!;:\n]|$)/);
  let name = mn ? mn[1].trim() : null;
  if (name && /^(r\$|valor)/i.test(name)) name = null;
  return { amount, name };
}
export function matchPayment(parsed, open) {
  if (!parsed || parsed.amount == null) return null;
  const sameVal = open.filter(o => Math.abs(Number(o.amount) - parsed.amount) <= 0.01);
  if (!parsed.name) return null; // sem nome: vai para "Pix a conferir"
  const words = s => norm(s).split(/\s+/).filter(w => w.length > 2 && !['das', 'dos', 'de', 'da', 'do', 'e'].includes(w));
  const payer = new Set(words(parsed.name));
  const hit = sameVal.filter(o => { const w = words(o.clientName); return w.length > 0 && w.every(x => payer.has(x)); });
  return hit.length === 1 ? hit[0].id : null;
}

// ---------- caixa avançado
export function rhythm(dates) {
  const ds = [...dates].map(d => startOfDay(d)).sort((a, b) => a - b);
  if (ds.length < 2) return null;
  let s = 0; for (let i = 1; i < ds.length; i++) s += daysBetween(ds[i - 1], ds[i]);
  return Math.round(s / (ds.length - 1));
}
export function isMissing(dates, today, missingDays) {
  if (!dates.length) return false;
  const last = dates.reduce((a, b) => (a > b ? a : b));
  const r = rhythm(dates);
  const limit = Math.max(r ? r * 1.5 : 0, missingDays);
  return daysBetween(last, today) > limit;
}
export const toneFor = late => (late >= 2 ? 'firme' : 'leve');

export function billsStatus(state, month, today) {
  const [y, m] = month.split('-').map(Number);
  return (state.fixedCosts || []).filter(c => c.bill !== false && Number(c.monthly) > 0).map(cost => {
    const due = dayIn(y, m - 1, cost.dueDay || 1);
    const paid = (state.billPayments || []).some(p => p.costId === cost.id && p.month === month);
    return { cost, due, paid, overdue: !paid && startOfDay(today) > due };
  });
}

export function forecast30(state, today) {
  const t0 = startOfDay(today), t30 = addDays(t0, 30);
  const items = [];
  const within = d => d >= t0 && d <= t30;
  const nextDue = day => { const c = cycleRange(day, t0); const n = addDays(c.end, 1); return c.start.getTime() === t0.getTime() ? t0 : n; };
  for (const c of state.clients || []) {
    if (!c.planId) continue;
    const plan = (state.plans || []).find(p => p.id === c.planId); if (!plan) continue;
    const d = nextDue(c.dueDay || 1);
    if (within(d)) items.push({ date: d, label: `Mensalidade ${c.name}`, amount: plan.price });
  }
  for (const p of state.pros || []) {
    if (p.owner || p.shareType !== 'fixed') continue;
    const d = nextDue(p.dueDay || 5);
    if (within(d)) items.push({ date: d, label: `Repasse ${p.name || ''}`.trim(), amount: Number(p.shareValue) || 0 });
  }
  // avulsos: média diária dos últimos 30 dias de pagamentos 'single'
  const from = addDays(t0, -30);
  const owners = new Set((state.pros || []).filter(p => p.owner).map(p => p.id));
  const singles = (state.payments || []).filter(p => p.kind === 'single' && (!p.proId || owners.has(p.proId)) && parseLocal(p.date) >= from && parseLocal(p.date) < t0)
    .reduce((s, p) => s + (Number(p.amount) || 0), 0);
  if (singles > 0) items.push({ date: t30, label: 'Avulsos (média 30 dias)', amount: round2(singles) });
  // contas: vencidas não pagas deste mês entram hoje; próximas dentro de 30 dias
  for (const b of billsStatus(state, monthKey(t0), t0)) {
    if (b.paid) continue;
    items.push({ date: b.overdue ? t0 : b.due, label: `${b.cost.name}${b.overdue ? ' (vencida)' : ''}`, amount: -(Number(b.cost.monthly) || 0) });
  }
  const nm = new Date(t0.getFullYear(), t0.getMonth() + 1, 1);
  for (const b of billsStatus(state, monthKey(nm), t0)) {
    if (!b.paid && within(b.due)) items.push({ date: b.due, label: b.cost.name, amount: -(Number(b.cost.monthly) || 0) });
  }
  items.sort((a, b) => a.date - b.date);
  const inflow = round2(items.filter(i => i.amount > 0).reduce((s, i) => s + i.amount, 0));
  const outflow = round2(-items.filter(i => i.amount < 0).reduce((s, i) => s + i.amount, 0));
  return { inflow, outflow, net: round2(inflow - outflow), items };
}

// resumo do mês (fechamento)
export function monthSummary(state, month) {
  const pays = (state.payments || []).filter(p => String(p.date).slice(0, 7) === month);
  const ownerIds = new Set((state.pros || []).filter(p => p.owner).map(p => p.id));
  const isSalon = p => !p.proId || ownerIds.has(p.proId);
  const own = pays.filter(p => p.kind === 'single' && isSalon(p)).reduce((s, p) => s + p.amount, 0);
  const prodPays = pays.filter(p => p.kind === 'product' && isSalon(p));
  const products = prodPays.reduce((s, p) => s + p.amount, 0), productCost = prodPays.reduce((s, p) => s + (Number(p.cost) || 0), 0);
  const plans = pays.filter(p => p.kind === 'plan').reduce((s, p) => s + p.amount, 0);
  const shares = (state.proPayments || []).filter(p => p.month === month).reduce((s, p) => s + p.amount, 0);
  const fixed = (state.billPayments || []).filter(p => p.month === month).reduce((s, p) => s + p.amount, 0);
  const expenses = (state.expenses || []).filter(e => String(e.date).slice(0, 7) === month).reduce((s, e) => s + e.amount, 0);
  const income = { own: round2(own), plans: round2(plans), shares: round2(shares), products: round2(products) };
  const out = { fixed: round2(fixed), expenses: round2(expenses), productCost: round2(productCost) };
  const tin = own + plans + shares + products, tout = fixed + expenses + productCost;
  return { income, out, totalIn: round2(tin), totalOut: round2(tout), profit: round2(tin - tout) };
}

// ---------- agendamento pelo cliente
export function isOpenDay(settings, dateStr) {
  const wd = settings && settings.workDays;
  if (!Array.isArray(wd)) return true;
  return wd.includes(parseLocal(dateStr + 'T12:00').getDay());
}
export function freeSlots(state, dateStr, proId, durationMin, now = null) {
  const st = state.settings, out = [];
  if (!isOpenDay(st, dateStr)) return out;
  const busy = (state.appointments || []).filter(a => a.proId === proId && a.start.startsWith(dateStr) && !['canceled', 'noshow'].includes(a.status))
    .map(a => { const s = parseLocal(a.start); const m = s.getHours() * 60 + s.getMinutes(); const sv = (state.services || []).find(x => x.id === a.serviceId); return [m, m + (sv ? sv.durationMin : st.slotMin)]; })
    .concat(st.breakStart && Number(st.breakMin) > 0 ? [(() => { const [h, m] = st.breakStart.split(':').map(Number); return [h * 60 + m, h * 60 + m + Number(st.breakMin)]; })()] : [])
    .concat((state.blocks || []).filter(b => b.proId === proId && b.start.startsWith(dateStr)).map(b => { const s = parseLocal(b.start); const m = s.getHours() * 60 + s.getMinutes(); return [m, m + (Number(b.durationMin) || st.slotMin)]; }));
  const adv = (Number(st.minAdvanceH) || 0) * 60;
  const isToday = now && ymd(now) === dateStr, nowM = now ? now.getHours() * 60 + now.getMinutes() + adv : -1;
  const limitDay = now && adv ? ymd(new Date(now.getTime() + adv * 60000)) : null;
  if (limitDay && dateStr < limitDay) return out;
  for (let m = st.openHour * 60; m + durationMin <= st.closeHour * 60; m += st.slotMin) {
    if (isToday && m <= nowM) continue;
    if (busy.some(([a, b]) => m < b && a < m + durationMin)) continue;
    out.push(`${pad2(Math.floor(m / 60))}:${pad2(m % 60)}`);
  }
  return out;
}
const b64e = s => (typeof btoa === 'function' ? btoa(unescape(encodeURIComponent(s))) : Buffer.from(s, 'utf8').toString('base64'));
const b64d = s => (typeof atob === 'function' ? decodeURIComponent(escape(atob(s))) : Buffer.from(s, 'base64').toString('utf8'));
export const encodeAvailability = data => b64e(JSON.stringify(data)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
export function decodeAvailability(str) {
  let o; try { o = JSON.parse(b64d(String(str).replace(/-/g, '+').replace(/_/g, '/'))); } catch { return null; }
  const pos = v => typeof v === 'number' && Number.isFinite(v) && v > 0;
  const hr = v => typeof v === 'number' && v >= 0 && v <= 24;
  if (!o || typeof o !== 'object' || !o.d || typeof o.d !== 'object' || !Array.isArray(o.sv) || !Array.isArray(o.pr)) return null;
  if (!hr(o.o) || !hr(o.c) || o.c <= o.o || !pos(o.sl) || o.sl < 5) return null;
  if (!o.sv.length || !o.sv.every(x => Array.isArray(x) && typeof x[0] === 'string' && typeof x[1] === 'string' && typeof x[2] === 'number' && pos(x[3]))) return null;
  if (!o.pr.length || !o.pr.every(x => Array.isArray(x) && typeof x[0] === 'string' && typeof x[1] === 'string')) return null;
  if (!Object.keys(o.d).every(k => /^\d{4}-\d{2}-\d{2}$/.test(k))) return null;
  if (o.wd !== undefined && !(Array.isArray(o.wd) && o.wd.every(x => Number.isInteger(x) && x >= 0 && x <= 6))) return null;
  if (o.a !== undefined && typeof o.a !== 'string') return null;
  if (o.n !== undefined && !(Array.isArray(o.n) && o.n.every(x => typeof x === 'string' && x.length <= 300))) return null;
  for (const k of ['ig', 'pol']) if (o[k] !== undefined && typeof o[k] !== 'string') return null;
  if (o.ma !== undefined && !(typeof o.ma === 'number' && o.ma >= 0 && o.ma <= 72)) return null;
  if (typeof o.w !== 'string' || !/^\d{10,13}$/.test(o.w) || typeof o.s !== 'string') return null;
  return o;
}
export function parseBookingRequest(text) {
  const m = String(text || '').match(/#GL\[(\d{4}-\d{2}-\d{2}T\d{2}:\d{2})\|([^|\]]+)\|([^|\]]+)\|([^\]]+)\]/);
  return m ? { start: m[1], serviceId: m[2], proId: m[3], name: m[4].trim() } : null;
}

export function findClash(state, proId, startIso, durationMin, ignoreId = null) {
  const s0 = parseLocal(startIso), e0 = new Date(s0.getTime() + durationMin * 60000);
  return (state.appointments || []).find(a => a.id !== ignoreId && a.proId === proId && !['canceled', 'noshow'].includes(a.status) && (() => {
    const a0 = parseLocal(a.start), sv = (state.services || []).find(x => x.id === a.serviceId);
    const a1 = new Date(a0.getTime() + (sv ? sv.durationMin : 30) * 60000);
    return a0 < e0 && s0 < a1;
  })()) || (state.blocks || []).find(b => b.proId === proId && (() => {
    const b0 = parseLocal(b.start), b1 = new Date(b0.getTime() + (Number(b.durationMin) || 30) * 60000);
    return b0 < e0 && s0 < b1;
  })()) || null;
}
export function findClientForRequest(clients, name, phone) {
  const p = normPhone(phone);
  if (p.length >= 12) { const byPhone = clients.find(c => normPhone(c.phone) === p); if (byPhone) return byPhone; }
  const n = norm(name);
  const same = clients.filter(c => norm(c.name) === n);
  if (p.length >= 12) return same.find(c => normPhone(c.phone) === p) || null; // telefone diferente = outra pessoa
  return same.length === 1 ? same[0] : null; // sem telefone: só se o nome for único
}

export const equipMonthly = (price, months) => (Number(months) > 0 ? round2(Number(price) / Number(months)) : 0);
export function costSummary(costs) {
  const list = costs || [];
  return { filled: list.filter(c => Number(c.monthly) > 0).length, total: list.length, monthly: round2(list.reduce((t, c) => t + (Number(c.monthly) || 0), 0)) };
}

// dias de atraso para o cliente voltar (negativo = ainda não chegou a hora); null se o serviço não tem retorno
export function returnDue(lastDate, returnDays, today) {
  if (!(Number(returnDays) > 0) || !lastDate) return null;
  return daysBetween(addDays(startOfDay(lastDate), Number(returnDays)), today);
}
// aniversários nos próximos 7 dias (aceita 'AAAA-MM-DD' ou 'MM-DD')
export function birthdaysSoon(clients, today, days = 7) {
  const t = startOfDay(today), out = [];
  for (const c of clients || []) {
    const m = String(c.birthday || '').match(/(\d{2})-(\d{2})$/); if (!m) continue;
    let d = new Date(t.getFullYear(), Number(m[1]) - 1, Number(m[2]));
    if (d < t) d = new Date(t.getFullYear() + 1, Number(m[1]) - 1, Number(m[2]));
    const inDays = daysBetween(t, d);
    if (inDays <= days) out.push({ client: c, inDays, date: d });
  }
  return out.sort((a, b) => a.inDays - b.inDays);
}

export function activeNotices(notices, today) {
  const t = ymd(today);
  return (notices || []).filter(n => n && n.on !== false && String(n.text || '').trim() && (!n.until || n.until >= t)).map(n => String(n.text).trim());
}

// ---------- relatórios e economia
export function dayReport(state, dateStr) {
  const ap = (state.appointments || []).filter(a => String(a.start).startsWith(dateStr));
  const svc = id => (state.services || []).find(s => s.id === id);
  const done = ap.filter(a => a.status === 'done');
  const pays = (state.payments || []).filter(p => String(p.date).startsWith(dateStr));
  const byMethod = {};
  for (const p of pays) { const m = p.method || 'pix'; byMethod[m] = round2((byMethod[m] || 0) + p.amount); }
  const singles = pays.filter(p => p.kind === 'single');
  const st = state.settings || {};
  const brk = st.breakStart && Number(st.breakMin) > 0 ? Number(st.breakMin) : 0;
  const openMin = isOpenDay(st, dateStr) ? Math.max(0, ((st.closeHour || 0) - (st.openHour || 0)) * 60 - brk) * Math.max(1, (state.pros || []).length) : 0;
  const busyMin = done.reduce((t, a) => t + (svc(a.serviceId)?.durationMin || 30), 0);
  return {
    done: done.length, noshow: ap.filter(a => a.status === 'noshow').length, canceled: ap.filter(a => a.status === 'canceled').length,
    covered: done.filter(a => a.covered).length,
    received: round2(pays.reduce((t, p) => t + p.amount, 0)), byMethod,
    products: round2(pays.filter(p => p.kind === 'product').reduce((t, p) => t + p.amount, 0)),
    plans: round2(pays.filter(p => p.kind === 'plan').reduce((t, p) => t + p.amount, 0)),
    toReceive: round2(done.filter(a => !a.paid && !a.covered).reduce((t, a) => t + (Number(a.price) || 0), 0)),
    expenses: round2((state.expenses || []).filter(e => String(e.date).startsWith(dateStr)).reduce((t, e) => t + e.amount, 0)),
    busyMin, openMin, occupancy: openMin ? busyMin / openMin : 0,
    ticket: singles.length ? round2(singles.reduce((t, p) => t + p.amount, 0) / singles.length) : 0,
  };
}
export function costRanking(costs) {
  const list = (costs || []).filter(c => Number(c.monthly) > 0);
  const tot = list.reduce((t, c) => t + Number(c.monthly), 0) || 1;
  return list.map(c => ({ ...c, share: Number(c.monthly) / tot })).sort((a, b) => b.monthly - a.monthly);
}
export function billTrend(state, costId, month) {
  const [y, m] = month.split('-').map(Number), prev = monthKey(new Date(y, m - 2, 1));
  const sum = mk => round2((state.billPayments || []).filter(p => p.costId === costId && p.month === mk).reduce((t, p) => t + p.amount, 0));
  const now = sum(month), before = sum(prev);
  return { now, before, diff: round2(now - before), pct: before ? round2((now - before) / before) : null };
}
export function savingWhatIf(monthly, pct, minutesMonth, durationMin, profitPerCut) {
  const month = Number(monthly) * Number(pct) / 100;
  return { month, perService: minutesMonth ? month / minutesMonth * durationMin : 0, cutsEq: profitPerCut > 0 ? month / profitPerCut : null };
}
