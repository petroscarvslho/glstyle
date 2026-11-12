import test from 'node:test';
import assert from 'node:assert/strict';
import * as C from '../src/core.js';

const near = (a, b, e = 0.01) => assert.ok(Math.abs(a - b) <= e, `${a} ≉ ${b}`);
const ymd = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

// ---------- Task 1: finanças
test('costPerMinute', () => near(C.costPerMinute([{ monthly: 1200 }, { monthly: 300 }], 150), 1500 / 9000, 1e-6));
test('apptCost', () => near(C.apptCost({ durationMin: 40, materialCost: 3 }, 0.1667, 35, 0), 9.668));
test('apptCost com taxa', () => near(C.apptCost({ durationMin: 0, materialCost: 0 }, 0, 100, 2), 2));
test('cycleRange dueDay 31 em fevereiro', () => {
  const r = C.cycleRange(31, new Date(2026, 1, 15));
  assert.equal(ymd(r.start), '2026-01-31');
  assert.equal(ymd(r.end), '2026-02-27');
});
test('cycleRange normal', () => {
  const r = C.cycleRange(10, new Date(2026, 10, 12));
  assert.equal(ymd(r.start), '2026-11-10');
  assert.equal(ymd(r.end), '2026-12-09');
});
test('cycleRange antes do vencimento do mês', () => {
  const r = C.cycleRange(20, new Date(2026, 10, 12));
  assert.equal(ymd(r.start), '2026-10-20');
  assert.equal(ymd(r.end), '2026-11-19');
});
test('breakEven', () => assert.equal(C.breakEven(100, 9.67), 10));
test('breakEven custo zero', () => assert.equal(C.breakEven(100, 0), Infinity));
test('brl', () => assert.equal(C.brl(1234.5).replace(/\s/g, ' '), 'R$ 1.234,50'));
test('subscriberStats conta só done+covered no ciclo', () => {
  const client = { id: 'c1', planId: 'p1', dueDay: 10 };
  const plan = { id: 'p1', price: 100 };
  const services = [{ id: 's1', durationMin: 30, materialCost: 2 }];
  const mk = (d, st = 'done', cov = true) => ({ clientId: 'c1', serviceId: 's1', start: d, status: st, covered: cov, price: 35 });
  const appts = [mk('2026-11-10T09:00'), mk('2026-11-11T09:00'), mk('2026-11-12T09:00'), mk('2026-11-05T09:00'), mk('2026-11-12T10:00', 'noshow')];
  const s = C.subscriberStats(client, plan, appts, services, 0.1, 0, new Date(2026, 10, 12));
  assert.equal(s.visits, 3);
  near(s.cost, 3 * (30 * 0.1 + 2));
  near(s.profit, 100 - 15);
});
test('proShare percent e fixo', () => {
  const appts = [
    { proId: 'a', start: '2026-11-02T09:00', status: 'done', price: 35 },
    { proId: 'a', start: '2026-11-03T09:00', status: 'done', price: 35 },
    { proId: 'a', start: '2026-11-04T09:00', status: 'noshow', price: 35 },
    { proId: 'a', start: '2026-10-30T09:00', status: 'done', price: 35 },
  ];
  assert.deepEqual(C.proShare({ id: 'a', shareType: 'percent', shareValue: 30 }, appts, '2026-11'), { gross: 70, share: 21 });
  assert.deepEqual(C.proShare({ id: 'a', shareType: 'fixed', shareValue: 400 }, appts, '2026-11'), { gross: 70, share: 400 });
});

// ---------- Task 2: pix / whatsapp / notificação
test('crc16 vetor conhecido', () => assert.equal(C.crc16('123456789'), '29B1'));
test('pixCode', () => {
  const code = C.pixCode({ key: 'petros@email.com', name: 'João Ângelo da Conceição Filho', city: 'Seabra', amount: 80 });
  assert.ok(code.startsWith('000201'));
  assert.ok(code.includes('0014br.gov.bcb.pix0116petros@email.com'));
  assert.ok(code.includes('5303986'));
  assert.ok(code.includes('540580.00'));
  assert.ok(code.includes('5802BR'));
  assert.ok(code.includes('5925JOAO ANGELO DA CONCEICA'));
  assert.ok(code.includes('6006SEABRA'));
  const body = code.slice(0, -4);
  assert.ok(body.endsWith('6304'));
  assert.equal(code.slice(-4), C.crc16(body));
});
test('pixCode sem valor omite campo 54', () => {
  const code = C.pixCode({ key: 'x@y.com', name: 'A', city: 'B' });
  assert.ok(!/530398654/.test(code));
});
test('normPhone formatos', () => {
  assert.equal(C.normPhone('(75) 9 9999-0000'), '5575999990000');
  assert.equal(C.normPhone('5575999990000'), '5575999990000');
  assert.equal(C.normPhone('75 3641-0000'), '557536410000');
});
test('waLink', () => assert.equal(C.waLink('75999990000', 'Oi João'), 'https://wa.me/5575999990000?text=Oi%20Jo%C3%A3o'));
test('fill', () => assert.equal(C.fill('Oi {nome}, {x}', { nome: 'Lu' }), 'Oi Lu, {x}'));
test('parseBankNotification 1', () => assert.deepEqual(C.parseBankNotification('Você recebeu um Pix de JOAO SILVA no valor de R$ 1.050,00'), { amount: 1050, name: 'JOAO SILVA' }));
test('parseBankNotification 2', () => assert.deepEqual(C.parseBankNotification('Pix recebido: R$50 de Maria'), { amount: 50, name: 'Maria' }));
test('parseBankNotification 3', () => assert.deepEqual(C.parseBankNotification('Transferência recebida! R$ 90,00 de Carlos Souza.'), { amount: 90, name: 'Carlos Souza' }));
test('matchPayment', () => {
  const open = [{ id: 'x', clientName: 'Maria Lima', amount: 80 }, { id: 'y', clientName: 'João Pedro', amount: 80 }];
  assert.equal(C.matchPayment({ amount: 80, name: 'JOAO SILVA' }, open), 'y');
  assert.equal(C.matchPayment({ amount: 81, name: 'JOAO' }, open), null);
  assert.equal(C.matchPayment({ amount: 80, name: null }, [open[0]]), 'x');
  assert.equal(C.matchPayment({ amount: 80, name: null }, open), null);
});

// ---------- Task 2b: caixa avançado
test('rhythm e isMissing', () => {
  const t = new Date(2026, 10, 12);
  const days = n => new Date(2026, 10, 12 - n);
  assert.equal(C.rhythm([days(60), days(45), days(30)]), 15);
  assert.equal(C.rhythm([days(5)]), null);
  assert.equal(C.isMissing([days(60), days(45), days(30)], t, 25), true);
  assert.equal(C.isMissing([days(50), days(35), days(20)], t, 25), false);
  assert.equal(C.isMissing([], t, 25), false);
});
test('toneFor', () => { assert.equal(C.toneFor(0), 'leve'); assert.equal(C.toneFor(2), 'firme'); });
test('billsStatus e forecast30', () => {
  const today = new Date(2026, 10, 12);
  const state = {
    fixedCosts: [{ id: 'luz', name: 'Energia', monthly: 200, dueDay: 22 }, { id: 'alug', name: 'Aluguel', monthly: 800, dueDay: 5 }],
    billPayments: [],
    plans: [{ id: 'p1', price: 100 }],
    clients: [{ id: 'c1', name: 'Ana', planId: 'p1', dueDay: 17 }],
    pros: [{ id: 'a', owner: false, shareType: 'fixed', shareValue: 400, dueDay: 20 }],
    appointments: [], payments: [],
  };
  const b = C.billsStatus(state, '2026-11', today);
  assert.equal(b.find(x => x.cost.id === 'alug').overdue, true);
  assert.equal(b.find(x => x.cost.id === 'luz').overdue, false);
  const f = C.forecast30(state, today);
  assert.ok(f.items.some(i => i.label.includes('Ana') && i.amount === 100));
  assert.ok(f.items.some(i => i.label.includes('Energia') && i.amount === -200));
  assert.ok(f.items.some(i => i.label.includes('Aluguel') && i.amount === -800)); // vencida entra como pendente
  near(f.net, f.inflow - f.outflow);
});

test('monthSummary: avulso de associado não entra como receita do salão', () => {
  const state = {
    pros: [{ id: 'o', owner: true }, { id: 'a', owner: false }],
    payments: [
      { kind: 'single', amount: 35, date: '2026-11-02T09:00', proId: 'o' },
      { kind: 'single', amount: 35, date: '2026-11-02T10:00', proId: 'a' },
      { kind: 'plan', amount: 100, date: '2026-11-05T10:00' },
    ],
    proPayments: [{ month: '2026-11', amount: 21 }],
    billPayments: [{ month: '2026-11', amount: 900 }], expenses: [{ date: '2026-11-03', amount: 60 }],
  };
  const s = C.monthSummary(state, '2026-11');
  assert.deepEqual(s.income, { own: 35, plans: 100, shares: 21 });
  assert.equal(s.profit, 35 + 100 + 21 - 960);
});

test('materialCostOf: preço ÷ rendimento × quantidade', () => {
  const materials = [{ id: 'lam', price: 30, yield: 100 }, { id: 'pom', price: 40, yield: 40 }, { id: 'zero', price: 10, yield: 0 }];
  const svc = { materials: [{ id: 'lam', qty: 1 }, { id: 'pom', qty: 0.5 }, { id: 'zero', qty: 1 }, { id: 'sumiu', qty: 2 }] };
  near(C.materialCostOf(svc, materials), 0.3 + 0.5, 1e-9);
  assert.equal(C.materialCostOf({}, materials), 0);
});
test('apptCost usa materiais quando existem', () => {
  const materials = [{ id: 'lam', price: 30, yield: 100 }];
  near(C.apptCost({ durationMin: 10, materialCost: 99, materials: [{ id: 'lam', qty: 2 }] }, 0.1, 0, 0, materials), 1 + 0.6);
});

test('freeSlots respeita duração e ocupação', () => {
  const state = { settings: { openHour: 9, closeHour: 12, slotMin: 30 }, services: [{ id: 's', durationMin: 40 }],
    appointments: [{ proId: 'p', serviceId: 's', start: '2026-11-13T10:00', status: 'scheduled' }, { proId: 'p', serviceId: 's', start: '2026-11-13T11:30', status: 'canceled' }] };
  // 09:00 ok (termina 9:40) · 09:30 colide com 10:00 · 10:00/10:30 ocupado · 11:00 ok (termina 11:40) · 11:30 passa do fechamento
  assert.deepEqual(C.freeSlots(state, '2026-11-13', 'p', 40), ['09:00', '11:00']);
});
test('freeSlots ignora horários que já passaram hoje', () => {
  const state = { settings: { openHour: 9, closeHour: 11, slotMin: 30 }, services: [], appointments: [] };
  assert.deepEqual(C.freeSlots(state, '2026-11-13', 'p', 30, new Date(2026, 10, 13, 9, 45)), ['10:00', '10:30']);
});
test('encode/decode disponibilidade', () => {
  const data = { s: 'GL Style', w: '5575999331990', sv: [['s', 'Corte', 35, 40]], pr: [['p', 'Guilherme']], d: { '2026-11-13': { p: ['09:00', '11:00'] } } };
  assert.deepEqual(C.decodeAvailability(C.encodeAvailability(data)), data);
  assert.equal(C.decodeAvailability('lixo%%'), null);
});
test('parseBookingRequest', () => {
  const msg = 'Olá! Quero marcar Corte com Guilherme sex 13/11 às 15:00.\n#GL[2026-11-13T15:00|s_corte|p_gl|Zé da Silva]';
  assert.deepEqual(C.parseBookingRequest(msg), { start: '2026-11-13T15:00', serviceId: 's_corte', proId: 'p_gl', name: 'Zé da Silva' });
  assert.equal(C.parseBookingRequest('oi tudo bem'), null);
});
