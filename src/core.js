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
  if (d.length === 10 || d.length === 11) d = '55' + d;
  return d;
}
export const waLink = (phone, text) => `https://wa.me/${normPhone(phone)}?text=${encodeURIComponent(text)}`;
export const fill = (tpl, vars) => String(tpl).replace(/\{(\w+)\}/g, (m, k) => (vars[k] !== undefined ? vars[k] : m));

// ---------- notificação do banco
export function parseBankNotification(text) {
  const t = String(text || '');
  const mv = t.match(/R\$\s*([\d.]+(?:,\d{1,2})?)/i);
  const amount = mv ? Number(mv[1].replace(/\./g, '').replace(',', '.')) : null;
  const mn = t.match(/\bde\s+([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ'\s]*?)(?=\s+(?:no valor|valor|R\$)|[.,!;:\n]|$)/);
  let name = mn ? mn[1].trim() : null;
  if (name && /^(r\$|valor)/i.test(name)) name = null;
  return { amount, name };
}
export function matchPayment(parsed, open) {
  if (!parsed || parsed.amount == null) return null;
  const sameVal = open.filter(o => Math.abs(Number(o.amount) - parsed.amount) <= 0.01);
  if (parsed.name) {
    const first = norm(parsed.name).split(/\s+/)[0];
    const hit = sameVal.filter(o => norm(o.clientName).split(/\s+/)[0] === first);
    return hit.length === 1 ? hit[0].id : null;
  }
  return sameVal.length === 1 ? sameVal[0].id : null;
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
  return (state.fixedCosts || []).map(cost => {
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
  const plans = pays.filter(p => p.kind === 'plan').reduce((s, p) => s + p.amount, 0);
  const shares = (state.proPayments || []).filter(p => p.month === month).reduce((s, p) => s + p.amount, 0);
  const fixed = (state.billPayments || []).filter(p => p.month === month).reduce((s, p) => s + p.amount, 0);
  const expenses = (state.expenses || []).filter(e => String(e.date).slice(0, 7) === month).reduce((s, e) => s + e.amount, 0);
  const income = { own: round2(own), plans: round2(plans), shares: round2(shares) };
  const out = { fixed: round2(fixed), expenses: round2(expenses) };
  return { income, out, totalIn: round2(own + plans + shares), totalOut: round2(fixed + expenses), profit: round2(own + plans + shares - fixed - expenses) };
}

// ---------- agendamento pelo cliente
export function freeSlots(state, dateStr, proId, durationMin, now = null) {
  const st = state.settings, out = [];
  const busy = (state.appointments || []).filter(a => a.proId === proId && a.start.startsWith(dateStr) && !['canceled', 'noshow'].includes(a.status))
    .map(a => { const s = parseLocal(a.start); const m = s.getHours() * 60 + s.getMinutes(); const sv = (state.services || []).find(x => x.id === a.serviceId); return [m, m + (sv ? sv.durationMin : st.slotMin)]; });
  const isToday = now && ymd(now) === dateStr, nowM = now ? now.getHours() * 60 + now.getMinutes() : -1;
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
  try { const o = JSON.parse(b64d(String(str).replace(/-/g, '+').replace(/_/g, '/'))); return o && o.d && o.sv ? o : null; } catch { return null; }
}
export function parseBookingRequest(text) {
  const m = String(text || '').match(/#GL\[(\d{4}-\d{2}-\d{2}T\d{2}:\d{2})\|([^|\]]+)\|([^|\]]+)\|([^\]]+)\]/);
  return m ? { start: m[1], serviceId: m[2], proId: m[3], name: m[4].trim() } : null;
}
