// GL Style — persistência (Fase 1: localStorage). Trocar por Supabase na Fase 2 mantendo a interface.
import { ymd, pad2, addDays, startOfDay, monthKey, cycleRange } from './core.js';

const KEY = 'glstyle.v1';
const REQUIRED = ['settings', 'services', 'plans', 'clients', 'appointments', 'payments', 'pros', 'fixedCosts'];
export const uid = () => Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-3);

export function seed(today = new Date()) {
  const t = startOfDay(today);
  const at = (d, h, m = 0) => `${ymd(d)}T${pad2(h)}:${pad2(m)}`;
  const settings = {
    shopName: 'GL Style', pixKey: '+5575999331990', pixName: 'Guilherme Mendes', pixCity: 'Seabra',
    openHour: 8, closeHour: 19, slotMin: 30, missingDays: 25, hoursPerMonth: 176, paymentFeePct: 0,
    templates: {
      confirm: '{nome}, boa noite! Tudo certo para amanhã às {hora}?',
      renew: 'Bom dia, {nome}! Tudo bem?\n\nPassando para te avisar que seu plano chegou ao fim do ciclo. Ele teve início em {inicio} e encerra {fim}.\n\nAgradeço pela confiança e por continuar contando com o nosso trabalho! 🤝\nJá estamos iniciando um novo ciclo e gostaria de saber se podemos confirmar a renovação do seu plano ({plano} — {valor}) para que você continue aproveitando todos os benefícios.\nPosso deixar sua renovação confirmada?\n\nPix: {chave}\n\nUm abraço!',
      accept: '{nome}, confirmado! {data} às {hora} ({servico}) no {salao}. Te espero ✂️',
      refuse: '{nome}, esse horário ({data} às {hora}) não vai dar. Olha os outros livres aqui e me pede de novo: {link}',
      reschedule: '{nome}, seu horário mudou para {data} às {hora}. Tudo certo?',
      remindLeve: 'Oi, {nome}! Sua mensalidade do {salao} ({plano}) de {valor} vence {data}. Segue o Pix copia e cola:\n{pix}',
      remindFirme: '{nome}, sua mensalidade do {salao} ({plano}) de {valor} está em aberto desde {data}. Pra continuar usando o plano, faz o Pix por aqui:\n{pix}',
      charge: 'Oi, {nome}! Ficou {valor} do atendimento no {salao}. Pix copia e cola:\n{pix}',
      thanks: 'Recebi seu pagamento de {valor}, {nome}. Valeu! 🙌 — {salao}',
      comeback: 'E aí, {nome}! Faz {dias} dias que você não aparece no {salao}. Bora dar aquele trato? Me fala o melhor dia que eu reservo.',
      proShare: 'Fala, {nome}! Fechamento de {mes}: seu repasse pro {salao} ficou em {valor}. Pix:\n{pix}',
    },
  };
  const pros = [
    { id: 'p_gl', name: 'Guilherme (dono)', phone: '75999331990', color: '#d4a64a', owner: true, shareType: 'percent', shareValue: 0 },
  ];
  const materials = [
    { id: 'm_lam', name: 'Lâmina (caixa c/ 100)', price: 35, yield: 100 },
    { id: 'm_pom', name: 'Pomada modeladora', price: 45, yield: 40 },
    { id: 'm_gel', name: 'Gel de barbear', price: 30, yield: 50 },
    { id: 'm_oleo', name: 'Óleo/balm de barba', price: 40, yield: 60 },
    { id: 'm_toalha', name: 'Toalha (lavagem por uso)', price: 2, yield: 1 },
    { id: 'm_talco', name: 'Talco / pós-barba', price: 25, yield: 80 },
    { id: 'm_desc', name: 'Descartáveis (capa, gola, papel)', price: 30, yield: 100 },
    { id: 'm_maq', name: 'Manutenção de máquina (rateio)', price: 120, yield: 300 },
  ];
  const svc = (id, name, durationMin, price, mats) => ({ id, name, durationMin, price, materialCost: 0, materials: mats.map(([m, qty]) => ({ id: m, qty })) });
  const services = [
    svc('s_corte', 'Corte', 40, 35, [['m_lam', 1], ['m_pom', 1], ['m_toalha', 1], ['m_talco', 1], ['m_desc', 1], ['m_maq', 1]]),
    svc('s_barba', 'Barba', 30, 25, [['m_lam', 1], ['m_gel', 1], ['m_oleo', 1], ['m_toalha', 1], ['m_desc', 1]]),
    svc('s_cb', 'Corte + Barba', 60, 55, [['m_lam', 2], ['m_pom', 1], ['m_gel', 1], ['m_oleo', 1], ['m_toalha', 1], ['m_talco', 1], ['m_desc', 1], ['m_maq', 1]]),
    svc('s_pez', 'Pezinho', 15, 15, [['m_lam', 1], ['m_desc', 1], ['m_maq', 1]]),
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
  hist.forEach(([ci, si, ds], k) => ds.forEach((dd, j) => add(ci, si, addDays(t, dd), 9 + ((k + j) % 9), j % 2 ? 30 : 0, 'done')));
  // movimento avulso dos últimos 35 dias (seg–sáb), determinístico
  const extra = ['André Luiz', 'Paulo Henrique', 'Mateus Brito', 'Caio Nunes', 'Renan Oliveira', 'Samuel Pires', 'Otávio Lopes', 'Wesley Prado', 'Davi Moura', 'Leandro Sá'];
  extra.forEach((n, i) => clients.push({ id: 'cx' + i, name: n, phone: `7597777${pad2(i)}${pad2(i)}`, notes: '', planId: null, dueDay: 1, createdAt: ymd(addDays(t, -90)), lateCount: 0 }));
  let rnd = 7; const next = () => (rnd = (rnd * 9301 + 49297) % 233280) / 233280;
  for (let dd = -35; dd <= -1; dd++) {
    const d = addDays(t, dd); if (d.getDay() === 0) continue;
    const n = 4 + Math.floor(next() * 4);
    for (let k = 0; k < n; k++) {
      const ci = clients.length - extra.length + Math.floor(next() * extra.length);
      const si = ['s_corte', 's_corte', 's_cb', 's_barba', 's_pez'][Math.floor(next() * 5)];
      add(ci, si, d, 8 + k + (k > 3 ? 1 : 0), next() > 0.5 ? 30 : 0, 'done');
    }
  }
  // hoje
  add(0, 's_corte', t, 9, 0, 'done'); add(10, 's_corte', t, 10, 0, 'confirmed'); add(2, 's_corte', t, 11, 0, 'scheduled');
  add(7, 's_cb', t, 14, 0, 'scheduled'); add(4, 's_cb', t, 15, 30, 'scheduled'); add(5, 's_barba', t, 16, 30, 'scheduled');
  // amanhã e semana
  add(3, 's_corte', addDays(t, 1), 9, 0, 'scheduled'); add(8, 's_corte', addDays(t, 1), 10, 30, 'scheduled'); add(11, 's_cb', addDays(t, 1), 17, 0, 'scheduled');
  add(1, 's_corte', addDays(t, 2), 11, 0, 'scheduled'); add(6, 's_corte', addDays(t, 3), 15, 0, 'scheduled');
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
    { id: 'f_mei', name: 'MEI (DAS)', monthly: 80, dueDay: 20 }, 
  ];
  const m = monthKey(t);
  const billPayments = [{ id: uid(), costId: 'f_alug', month: m, amount: 900, date: `${m}-05` }, { id: uid(), costId: 'f_net', month: m, amount: 100, date: `${m}-10` }];
  const expenses = [{ id: uid(), date: `${m}-03`, name: 'Toalhas novas', amount: 60 }, { id: uid(), date: `${m}-08`, name: 'Pomada (estoque)', amount: 85 }];
  const proPayments = [];
  return { version: 1, settings, pros, materials, services, plans, clients, appointments, payments, fixedCosts, billPayments, expenses, proPayments };
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
  const fresh = seed(today).settings.templates;
  state.settings.templates = { ...fresh, ...state.settings.templates };
  const api = {
    get state() { return state; }, set state(v) { state = v; },
    persistent, uid,
    save() { if (!persistent) return false; try { storage.setItem(KEY, JSON.stringify(state)); return true; } catch { return false; } },
    reset() { state = seed(new Date()); api.save(); },
    exportJSON() { return JSON.stringify(state, null, 1); },
    importJSON(s) {
      const obj = JSON.parse(s);
      if (!obj || !REQUIRED.every(k => k in obj)) throw new Error('Arquivo de backup inválido');
      for (const k of ['billPayments', 'expenses', 'proPayments', 'materials']) obj[k] = obj[k] || [];
      state = obj; api.save();
    },
  };
  return api;
}
