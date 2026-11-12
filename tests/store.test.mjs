import test from 'node:test';
import assert from 'node:assert/strict';
import { createStore, seed } from '../src/store.js';

const memStorage = () => { const m = new Map(); return { getItem: k => m.get(k) ?? null, setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k) }; };

test('sem storage: não persistente, com seed', () => {
  const s = createStore(null);
  assert.equal(s.persistent, false);
  assert.ok(s.state.clients.length >= 10);
});
test('storage que lança não quebra', () => {
  const bad = { getItem() { throw new Error('x'); }, setItem() { throw new Error('quota'); }, removeItem() {} };
  const s = createStore(bad);
  assert.equal(s.persistent, false);
  assert.doesNotThrow(() => s.save());
});
test('persiste e recarrega', () => {
  const st = memStorage();
  const a = createStore(st);
  assert.equal(a.persistent, true);
  a.state.clients.push({ id: 'zz', name: 'Teste' });
  a.save();
  const b = createStore(st);
  assert.ok(b.state.clients.some(c => c.id === 'zz'));
});
test('export/import preserva clientes', () => {
  const a = createStore(null);
  const json = a.exportJSON();
  const b = createStore(null);
  b.state.clients = [];
  b.importJSON(json);
  assert.equal(b.state.clients.length, a.state.clients.length);
});
test('import inválido lança e não altera', () => {
  const a = createStore(null);
  const n = a.state.clients.length;
  assert.throws(() => a.importJSON('{"x":1}'));
  assert.equal(a.state.clients.length, n);
});
test('seed começa só com o dono e dados coerentes', () => {
  const s = seed(new Date(2026, 10, 12));
  assert.equal(s.pros.length, 1);
  assert.equal(s.pros[0].owner, true);
  for (const a of s.appointments) {
    assert.ok(s.clients.some(c => c.id === a.clientId));
    assert.ok(s.services.some(x => x.id === a.serviceId));
    assert.ok(s.pros.some(p => p.id === a.proId));
  }
  assert.ok(s.appointments.some(a => a.start.startsWith('2026-11-12')));
  assert.ok(s.fixedCosts.every(c => c.dueDay >= 1));
  for (const sv of s.services) for (const m of sv.materials) assert.ok(s.materials.some(x => x.id === m.id), m.id);
  assert.ok(s.settings.templates.renew.includes('{inicio}'));
});
