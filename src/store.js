// GL Style — persistência (Fase 1: localStorage). Trocar por Supabase na Fase 2 mantendo a interface.
import { ymd, pad2, addDays, startOfDay, monthKey, cycleRange } from './core.js';

const KEY = 'glstyle.v1';
export const SEED_VERSION = 3;
const REQUIRED = ['settings', 'services', 'plans', 'clients', 'appointments', 'payments', 'pros', 'fixedCosts'];
export const uid = () => Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-3);

export function seed(today = new Date()) {
  const t = startOfDay(today);
  const WD = [2, 3, 4, 5, 6];
  const openFrom = (d, dir) => { let x = d; for (let i = 0; i < 7 && !WD.includes(x.getDay()); i++) x = addDays(x, dir); return x; };
  const at = (d, h, m = 0) => `${ymd(d)}T${pad2(h)}:${pad2(m)}`;
  const settings = {
    shopName: 'GL Style', pixKey: '+5575999331990', pixName: 'Guilherme Mendes', pixCity: 'Seabra',
    openHour: 8, closeHour: 21, slotMin: 30, workDays: [2, 3, 4, 5, 6], breakStart: '12:00', breakMin: 60, minAdvanceH: 1, instagram: '', policy: 'Tolerância de 10 minutos de atraso. Para desmarcar, avise com pelo menos 2 horas de antecedência.', notices: [{ text: 'Agora dá pra marcar seu horário por aqui! ✂️', until: '', on: true }], missingDays: 25, hoursPerMonth: 242, paymentFeePct: 0,
    templates: {
      confirm: '{nome}, boa noite! Tudo certo para amanhã às {hora}?',
      renew: 'Bom dia, {nome}! Tudo bem?\n\nPassando para te avisar que seu plano chegou ao fim do ciclo. Ele teve início em {inicio} e encerra {fim}.\n\nAgradeço pela confiança e por continuar contando com o nosso trabalho! 🤝\nJá estamos iniciando um novo ciclo e gostaria de saber se podemos confirmar a renovação do seu plano ({plano} — {valor}) para que você continue aproveitando todos os benefícios.\nPosso deixar sua renovação confirmada?\n\nPix: {chave}\n\nUm abraço!',
      accept: '{nome}, confirmado! {data} às {hora} ({servico}) no {salao}. Te espero ✂️',
      refuse: '{nome}, esse horário ({data} às {hora}) não vai dar. Olha os outros livres aqui e me pede de novo: {link}',
      birthday: 'Fala, {nome}! Feliz aniversário! 🎉 Seu presente tá aqui: corte com 20% de desconto essa semana no {salao}. Bora?',
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
    { id: 'm_selag', name: 'Produto de selagem (frasco)', price: 180, yield: 10 },
    { id: 'm_sham', name: 'Shampoo', price: 35, yield: 60 },
    { id: 'm_cond', name: 'Condicionador / máscara', price: 35, yield: 60 },
    { id: 'm_cera', name: 'Cera / pó modelador', price: 40, yield: 40 },
    { id: 'm_ton', name: 'Tônico / loção pós-corte', price: 30, yield: 80 },
    { id: 'm_alc', name: 'Álcool / desinfetante de lâmina', price: 20, yield: 150 },
    { id: 'm_luva', name: 'Luvas (caixa)', price: 30, yield: 50 },
    { id: 'm_pig', name: 'Pigmentação / tinta', price: 40, yield: 15 },
  ];
  const RET = { s_corte: 15, s_barba: 10, s_cb: 15, s_sel: 30, s_pez: 10 };
  const svc = (id, name, durationMin, price, mats) => ({ id, name, durationMin, price, materialCost: 0, returnDays: RET[id] || 0, materials: mats.map(([m, qty]) => ({ id: m, qty })) });
  const services = [
    svc('s_corte', 'Corte', 30, 50, [['m_lam', 1], ['m_pom', 1], ['m_toalha', 1], ['m_talco', 1], ['m_desc', 1], ['m_maq', 1]]),
    svc('s_barba', 'Barba', 30, 40, [['m_lam', 1], ['m_gel', 1], ['m_oleo', 1], ['m_toalha', 1], ['m_desc', 1]]),
    svc('s_cb', 'Corte + Barba', 60, 90, [['m_lam', 2], ['m_pom', 1], ['m_gel', 1], ['m_oleo', 1], ['m_toalha', 1], ['m_talco', 1], ['m_desc', 1], ['m_maq', 1]]),
    svc('s_sel', 'Selagem', 90, 120, [['m_selag', 1], ['m_sham', 1], ['m_cond', 1], ['m_luva', 1], ['m_toalha', 2], ['m_desc', 1]]),
    svc('s_pez', 'Pezinho', 15, 15, [['m_lam', 1], ['m_desc', 1], ['m_maq', 1]]),
  ];
  const products = [
    { id: 'pr_pom', name: 'Pomada modeladora', price: 45, cost: 22 },
    { id: 'pr_oleo', name: 'Óleo de barba', price: 40, cost: 18 },
    { id: 'pr_sham', name: 'Shampoo', price: 35, cost: 15 },
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
    birthday: i === 3 ? `1995-${ymd(addDays(t, 2)).slice(5)}` : i === 8 ? `1990-${ymd(addDays(t, 5)).slice(5)}` : '',
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
  hist.forEach(([ci, si, ds], k) => ds.forEach((dd, j) => add(ci, si, openFrom(addDays(t, dd), -1), 9 + ((k + j) % 9), j % 2 ? 30 : 0, 'done')));
  // movimento avulso dos últimos 35 dias (seg–sáb), determinístico
  const extra = ['André Luiz', 'Paulo Henrique', 'Mateus Brito', 'Caio Nunes', 'Renan Oliveira', 'Samuel Pires', 'Otávio Lopes', 'Wesley Prado', 'Davi Moura', 'Leandro Sá'];
  extra.forEach((n, i) => clients.push({ id: 'cx' + i, name: n, phone: `7597777${pad2(i)}${pad2(i)}`, notes: '', planId: null, dueDay: 1, createdAt: ymd(addDays(t, -90)), lateCount: 0 }));
  let rnd = 7; const next = () => (rnd = (rnd * 9301 + 49297) % 233280) / 233280;
  for (let dd = -35; dd <= -1; dd++) {
    const d = addDays(t, dd); if (!WD.includes(d.getDay())) continue;
    const n = 4 + Math.floor(next() * 4);
    for (let k = 0; k < n; k++) {
      const ci = clients.length - extra.length + Math.floor(next() * extra.length);
      const si = ['s_corte', 's_corte', 's_cb', 's_barba', 's_pez'][Math.floor(next() * 5)];
      add(ci, si, d, 8 + k + (k > 3 ? 1 : 0), next() > 0.5 ? 30 : 0, 'done');
    }
  }
  // hoje (ou o próximo dia aberto) e próximos dias abertos
  const d0 = openFrom(t, 1), d1 = openFrom(addDays(d0, 1), 1), d2 = openFrom(addDays(d1, 1), 1), d3 = openFrom(addDays(d2, 1), 1);
  add(0, 's_corte', d0, 9, 0, ymd(d0) === ymd(t) ? 'done' : 'scheduled'); add(10, 's_corte', d0, 10, 0, 'confirmed'); add(2, 's_corte', d0, 11, 0, 'scheduled');
  add(7, 's_cb', d0, 14, 0, 'scheduled'); add(4, 's_cb', d0, 15, 30, 'scheduled'); add(5, 's_sel', d0, 17, 0, 'scheduled');
  add(3, 's_corte', d1, 9, 0, 'scheduled'); add(8, 's_corte', d1, 10, 30, 'scheduled'); add(11, 's_cb', d1, 19, 0, 'scheduled');
  add(1, 's_corte', d2, 11, 0, 'scheduled'); add(6, 's_corte', d3, 15, 0, 'scheduled');
  // um avulso atendido e não pago (saldo devedor)
  const fiado = add(7, 's_barba', openFrom(addDays(t, -2), -1), 18, 0, 'done'); fiado.paid = false;
  payments.splice(payments.findIndex(p => p.ref === fiado.id), 1);
  // mensalidades pagas no ciclo atual (exceto 2 em aberto para a demo)
  clients.forEach((c, i) => {
    if (!c.planId || i === 6 || i === 8) return;
    const cyc = cycleRange(c.dueDay, t);
    payments.push({ id: uid(), clientId: c.id, amount: plans.find(p => p.id === c.planId).price, date: at(cyc.start, 10), kind: 'plan', ref: ymd(cyc.start), method: 'pix' });
  });
  const fc = (id, cat, name, monthly, dueDay, hint, extra = {}) => ({ id, cat, name, monthly, dueDay, hint, ...extra });
  const fixedCosts = [
    fc('f_alug', 'contas', 'Aluguel', 900, 5, 'Do ponto do salão'),
    fc('f_cond', 'contas', 'Condomínio / IPTU (por mês)', 0, 10, 'Se pagar, divida o IPTU do ano por 12'),
    fc('f_luz', 'contas', 'Energia', 280, 18, 'Conta da Coelba'),
    fc('f_agua', 'contas', 'Água', 70, 20, 'Conta da Embasa'),
    fc('f_net', 'contas', 'Internet', 100, 10, ''),
    fc('f_cel', 'contas', 'Celular / plano', 0, 15, 'Se o número é usado no salão'),
    fc('f_sis', 'contas', 'Apps e sistemas', 0, 10, 'Música, Canva, etc.'),
    fc('f_mei', 'impostos', 'MEI (DAS)', 80, 20, 'Guia mensal do MEI'),
    fc('f_cont', 'impostos', 'Contador', 0, 10, ''),
    fc('f_alv', 'impostos', 'Alvará / taxas da prefeitura (por mês)', 0, 30, 'Valor do ano ÷ 12'),
    fc('f_maqm', 'impostos', 'Mensalidade da maquininha', 0, 10, 'Se a maquininha cobra aluguel'),
    fc('f_inss', 'impostos', 'INSS / previdência própria', 0, 15, 'Se paga além do DAS'),
    fc('f_pro', 'voce', 'Seu salário (pró-labore)', 0, 30, 'Quanto você quer tirar por mês pra viver. Entra no custo para o preço ser justo.', { bill: false }),
    fc('f_eq_maq', 'equip', 'Máquinas de corte', 0, 0, '', { bill: false, price: 1200, months: 24 }),
    fc('f_eq_cad', 'equip', 'Cadeira de barbeiro', 0, 0, '', { bill: false, price: 2500, months: 60 }),
    fc('f_eq_sec', 'equip', 'Secador / outros aparelhos', 0, 0, '', { bill: false, price: 400, months: 24 }),
    fc('f_eq_mov', 'equip', 'Móveis, espelho, reforma', 0, 0, '', { bill: false, price: 0, months: 60 }),
    fc('f_limp', 'outros', 'Produtos de limpeza', 40, 25, ''),
    fc('f_lav', 'outros', 'Lavanderia de toalhas', 0, 25, 'Se não conta como material'),
    fc('f_cafe', 'outros', 'Café, água e mimos pro cliente', 30, 25, ''),
    fc('f_mkt', 'outros', 'Divulgação (Instagram, panfleto)', 0, 25, ''),
    fc('f_res', 'outros', 'Reserva para manutenção', 50, 25, 'Guardar todo mês para consertos', { bill: false }),
  ];
  fixedCosts.forEach(f => { if (f.cat === 'equip') f.monthly = f.months > 0 ? Math.round(f.price / f.months * 100) / 100 : 0; });
  const m = monthKey(t);
  const billPayments = [{ id: uid(), costId: 'f_alug', month: m, amount: 900, date: `${m}-05` }, { id: uid(), costId: 'f_net', month: m, amount: 100, date: `${m}-10` }];
  const expenses = [{ id: uid(), date: `${m}-03`, name: 'Toalhas novas', amount: 60 }, { id: uid(), date: `${m}-08`, name: 'Pomada (estoque)', amount: 85 }];
  const proPayments = [];
  return { version: SEED_VERSION, settings, pros, materials, products, blocks: [], services, plans, clients, appointments, payments, fixedCosts, billPayments, expenses, proPayments };
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
  if (!state || !REQUIRED.every(k => k in state) || (state.version || 1) < SEED_VERSION) state = seed(today);
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
      for (const k of ['billPayments', 'expenses', 'proPayments', 'materials', 'products', 'blocks']) obj[k] = obj[k] || [];
      state = obj; api.save();
    },
  };
  return api;
}
