// GL Style — persistência (Fase 1: localStorage). Trocar por Supabase na Fase 2 mantendo a interface.
import { ymd, pad2, addDays, startOfDay, monthKey, cycleRange } from './core.js';

const KEY = 'glstyle.v1';
const REQUIRED = ['settings', 'services', 'plans', 'clients', 'appointments', 'payments', 'pros', 'fixedCosts'];
export const uid = () => Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-3);

export function seed(today = new Date()) {
  const t = startOfDay(today);
  const at = (d, h, m = 0) => `${ymd(d)}T${pad2(h)}:${pad2(m)}`;
  const settings = {
    shopName: 'GL Style', pixKey: 'glstyle@email.com', pixName: 'GL Style', pixCity: 'Seabra',
    openHour: 8, closeHour: 19, slotMin: 30, missingDays: 25, hoursPerMonth: 176, paymentFeePct: 0,
    templates: {
      confirm: 'Fala, {nome}! Passando pra confirmar seu horário no {salao}: {data} às {hora} ({servico}). Posso confirmar? ✂️',
      remindLeve: 'Oi, {nome}! Sua mensalidade do {salao} ({plano}) de {valor} vence {data}. Segue o Pix copia e cola:\n{pix}',
      remindFirme: '{nome}, sua mensalidade do {salao} ({plano}) de {valor} está em aberto desde {data}. Pra continuar usando o plano, faz o Pix por aqui:\n{pix}',
      charge: 'Oi, {nome}! Ficou {valor} do atendimento no {salao}. Pix copia e cola:\n{pix}',
      thanks: 'Recebi seu pagamento de {valor}, {nome}. Valeu! 🙌 — {salao}',
      comeback: 'E aí, {nome}! Faz {dias} dias que você não aparece no {salao}. Bora dar aquele trato? Me fala o melhor dia que eu reservo.',
      proShare: 'Fala, {nome}! Fechamento de {mes}: seu repasse pro {salao} ficou em {valor}. Pix:\n{pix}',
    },
  };
  const pros = [
    { id: 'p_gl', name: 'GL (dono)', phone: '75999990001', color: '#d4a64a', owner: true, shareType: 'percent', shareValue: 0 },
    { id: 'p_ra', name: 'Rafa', phone: '75999990002', color: '#5aa9e6', owner: false, shareType: 'percent', shareValue: 30, dueDay: 5 },
    { id: 'p_th', name: 'Thiago', phone: '75999990003', color: '#7bd389', owner: false, shareType: 'fixed', shareValue: 400, dueDay: 5 },
  ];
  const services = [
    { id: 's_corte', name: 'Corte', durationMin: 40, price: 35, materialCost: 2.5 },
    { id: 's_barba', name: 'Barba', durationMin: 30, price: 25, materialCost: 3 },
    { id: 's_cb', name: 'Corte + Barba', durationMin: 60, price: 55, materialCost: 5 },
    { id: 's_pez', name: 'Pezinho', durationMin: 15, price: 15, materialCost: 1 },
  ];
  const plans = [
    { id: 'pl_ilim', name: 'Corte Ilimitado', type: 'unlimited', visitsPerCycle: 0, price: 100, serviceIds: ['s_corte', 's_pez'] },
    { id: 'pl_4', name: '4 Cortes/mês', type: 'fixed', visitsPerCycle: 4, price: 110, serviceIds: ['s_corte'] },
    { id: 'pl_cb', name: 'Corte + Barba 4x', type: 'fixed', visitsPerCycle: 4, price: 180, serviceIds: ['s_cb', 's_corte', 's_barba'] },
  ];
  const names = ['João Pedro', 'Maria Lima', 'Carlos Souza', 'Lucas Andrade', 'Rafael Santos', 'Bruno Costa', 'Diego Alves', 'Felipe Rocha', 'Gustavo Melo', 'Henrique Dias', 'Igor Matos', 'Vinícius Reis'];
  const planOf = ['pl_ilim', null, 'pl_4', 'pl_ilim', 'pl_cb', null, 'pl_4', null, 'pl_ilim', null, null, 'pl_cb'];
  const dueOf = [5, 1, 10, 15, 20, 1, 12, 1, 25, 1, 1, 8];
  const clients = names.map((n, i) => ({
    id: 'c' + i, name: n, phone: `7598888${pad2(i)}${pad2(i)}`, notes: i === 3 ? 'Degradê navalhado, nº 1 nas laterais' : '',
    planId: planOf[i], dueDay: dueOf[i], createdAt: ymd(addDays(t, -120)), lateCount: i === 6 ? 2 : 0,
  }));
  const appointments = [], payments = [];
  const svcOf = id => services.find(s => s.id === id);
  const add = (ci, si, d, h, m, status, proId = 'p_gl') => {
    const c = clients[ci];
    const covered = !!c.planId && plans.find(p => p.id === c.planId).serviceIds.includes(si);
    const a = { id: uid(), clientId: c.id, serviceId: si, proId, start: at(d, h, m), status, covered, price: covered ? 0 : svcOf(si).price, paid: covered || status === 'done' };
    appointments.push(a);
    if (!covered && status === 'done') payments.push({ id: uid(), clientId: c.id, amount: a.price, date: a.start, kind: 'single', ref: a.id, method: 'pix', proId });
    return a;
  };
  // histórico (últimos 60 dias) para ritmo, lucro e sumidos
  const hist = [[0, 's_corte', [-56, -42, -28, -14]], [1, 's_corte', [-60, -30]], [2, 's_corte', [-21, -12, -4]], [3, 's_corte', [-27, -20, -13, -9, -6, -3, -1]],
    [4, 's_cb', [-25, -18, -11, -4]], [5, 's_barba', [-58, -44]], [6, 's_corte', [-30, -16]], [7, 's_cb', [-9]], [8, 's_corte', [-15, -8, -2]], [9, 's_corte', [-70, -55, -40]], [10, 's_pez', [-3]], [11, 's_cb', [-12, -5]]];
  hist.forEach(([ci, si, ds], k) => ds.forEach((dd, j) => add(ci, si, addDays(t, dd), 9 + ((k + j) % 9), j % 2 ? 30 : 0, 'done', ['p_gl', 'p_ra', 'p_th'][(k + j) % 3])));
  // hoje
  add(0, 's_corte', t, 9, 0, 'done'); add(10, 's_corte', t, 10, 0, 'confirmed'); add(2, 's_corte', t, 11, 0, 'scheduled');
  add(7, 's_cb', t, 14, 0, 'scheduled'); add(4, 's_cb', t, 15, 30, 'scheduled', 'p_ra'); add(5, 's_barba', t, 16, 0, 'scheduled', 'p_th');
  // amanhã e semana
  add(3, 's_corte', addDays(t, 1), 9, 0, 'scheduled'); add(8, 's_corte', addDays(t, 1), 10, 30, 'scheduled'); add(11, 's_cb', addDays(t, 1), 17, 0, 'scheduled', 'p_ra');
  add(1, 's_corte', addDays(t, 2), 11, 0, 'scheduled', 'p_th'); add(6, 's_corte', addDays(t, 3), 15, 0, 'scheduled');
  // um avulso atendido e não pago (saldo devedor)
  const fiado = add(7, 's_barba', addDays(t, -2), 18, 0, 'done'); fiado.paid = false;
  payments.splice(payments.findIndex(p => p.ref === fiado.id), 1);
  // mensalidades pagas no ciclo atual (exceto 2 em aberto para a demo)
  clients.forEach((c, i) => {
    if (!c.planId || i === 6 || i === 8) return;
    const cyc = cycleRange(c.dueDay, t);
    payments.push({ id: uid(), clientId: c.id, amount: plans.find(p => p.id === c.planId).price, date: at(cyc.start, 10), kind: 'plan', ref: ymd(cyc.start), method: 'pix' });
  });
  const fixedCosts = [
    { id: 'f_alug', name: 'Aluguel', monthly: 900, dueDay: 5 }, { id: 'f_luz', name: 'Energia', monthly: 280, dueDay: 18 },
    { id: 'f_agua', name: 'Água', monthly: 70, dueDay: 20 }, { id: 'f_net', name: 'Internet', monthly: 100, dueDay: 10 },
    { id: 'f_mei', name: 'MEI (DAS)', monthly: 80, dueDay: 20 }, { id: 'f_prod', name: 'Produtos/lâminas', monthly: 150, dueDay: 25 },
  ];
  const m = monthKey(t);
  const billPayments = [{ id: uid(), costId: 'f_alug', month: m, amount: 900, date: `${m}-05` }, { id: uid(), costId: 'f_net', month: m, amount: 100, date: `${m}-10` }];
  const expenses = [{ id: uid(), date: `${m}-03`, name: 'Toalhas novas', amount: 60 }, { id: uid(), date: `${m}-08`, name: 'Pomada (estoque)', amount: 85 }];
  const proPayments = [{ id: uid(), proId: 'p_th', month: monthKey(new Date(t.getFullYear(), t.getMonth() - 1, 1)), amount: 400, date: `${m}-05` }];
  return { version: 1, settings, pros, services, plans, clients, appointments, payments, fixedCosts, billPayments, expenses, proPayments };
}

export function createStore(storage, today = new Date()) {
  let persistent = false, state = null;
  try {
    if (storage) {
      const raw = storage.getItem(KEY);
      if (raw) state = JSON.parse(raw);
      storage.setItem(KEY + '.probe', '1'); storage.removeItem(KEY + '.probe');
      persistent = true;
    }
  } catch { persistent = false; }
  if (!state || !REQUIRED.every(k => k in state)) state = seed(today);
  const api = {
    get state() { return state; }, set state(v) { state = v; },
    persistent, uid,
    save() { if (!persistent) return false; try { storage.setItem(KEY, JSON.stringify(state)); return true; } catch { return false; } },
    reset() { state = seed(new Date()); api.save(); },
    exportJSON() { return JSON.stringify(state, null, 1); },
    importJSON(s) {
      const obj = JSON.parse(s);
      if (!obj || !REQUIRED.every(k => k in obj)) throw new Error('Arquivo de backup inválido');
      for (const k of ['billPayments', 'expenses', 'proPayments']) obj[k] = obj[k] || [];
      state = obj; api.save();
    },
  };
  return api;
}
