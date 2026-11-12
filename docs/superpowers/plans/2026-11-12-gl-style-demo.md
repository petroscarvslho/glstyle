# GL Style Demo (Fase 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** App web de gestão do GL Style (Fase 1/demo) num único HTML, com dados de exemplo, pronto para mostrar ao barbeiro.

**Architecture:** Lógica pura em `src/core.js` (testada em Node), persistência isolada em `src/store.js` (localStorage, trocável por Supabase na Fase 2), UI em `src/app.js` + `src/style.css`. `build.mjs` junta tudo em `dist/index.html` autocontido.

**Tech Stack:** HTML/CSS/JS puro (ES2020, sem framework), Node 18+ `node:test`, Playwright para screenshots.

**Spec:** `docs/superpowers/specs/2026-11-12-gl-style-design.md`

## Global Constraints
- Custo zero; nenhum serviço pago.
- Ações do dia a dia em ≤ 2 toques; barra inferior: Hoje · Agenda · Clientes · Cobranças · Caixa; Ajustes no topo; FAB "+".
- Idioma pt-BR, moeda BRL (`R$ 1.234,56`), fuso local do aparelho.
- WhatsApp só por `https://wa.me/55<DDD><NUM>?text=`.
- Pix BR Code estático EMV com CRC16-CCITT-FALSE (poly 0x1021, init 0xFFFF).
- `dist/index.html` único, sem requisições externas obrigatórias.
- Visual escuro, destaque dourado, marca "GL Style".

## Review Focus
1. Telefone digitado em formatos variados ("(75) 9 9999-0000", "5575999990000", "75999990000") → `waLink` gera sempre `55` + 10/11 dígitos.
2. Nome/cidade com acento ou longos no Pix ("João Ângelo da Conceição Filho", "Seabra") → BR Code remove acentos, maiúsculas, nome ≤ 25, cidade ≤ 15, CRC válido.
3. dueDay 31 em mês curto (fev) → ciclo termina no último dia do mês; sem datas inválidas.
4. localStorage indisponível (aba privada/iframe) → app abre com dados em memória e avisa, sem quebrar.
5. Notificação de banco com valor "R$ 1.050,00" ou "R$50" e nome em caixa diferente → `parseBankNotification` extrai valor e nome; `matchPayment` casa sem diferenciar maiúsculas/acentos.

---

### Task 1: Finanças (core)

**Files:** Create `src/core.js`, `tests/core.test.mjs`, `package.json` (`"type":"module"`, script `test: node --test tests/`)

**Interfaces — Produces (named exports de `src/core.js`):**
- `brl(n:number):string`
- `costPerMinute(fixedCosts:{monthly:number}[], hoursPerMonth:number):number`
- `apptCost(service:{durationMin,materialCost}, cpm:number, price:number, feePct:number):number`
- `cycleRange(dueDay:number, refDate:Date):{start:Date,end:Date}` — start = último vencimento ≤ refDate; end = véspera do próximo; dia clampado ao fim do mês.
- `subscriberStats(client, plan, appts, services, cpm, feePct, refDate):{visits:number,cost:number,profit:number}` — conta appts `done` e `covered` no ciclo.
- `breakEven(planPrice:number, avgVisitCost:number):number` → `Math.floor(price/avg)`
- `proShare(pro, appts, month:'AAAA-MM'):{gross:number,share:number}` — gross = Σ price de appts done do pro no mês; share = percent? gross×v/100 : v
- `monthSummary(state, month):{income:{own,plans,shares},out:{fixed,expenses},profit}`

- [ ] Step 1: testes: `costPerMinute([{monthly:1200},{monthly:300}],150)` = `1500/9000` (≈0.1667); `apptCost({durationMin:40,materialCost:3},0.1667,35,0)` ≈ 9.67; `cycleRange(31,new Date(2026,1,15))` → start 2026-01-31, end 2026-02-27; `cycleRange(10,new Date(2026,10,12))` → start 2026-11-10, end 2026-12-09; `breakEven(100,9.67)`=10; `proShare({shareType:'percent',shareValue:30},[2 done de R$35 no mês,1 noshow],'2026-11')` → {gross:70,share:21}; fixed 400 → share 400; `brl(1234.5)`="R$ 1.234,50" (normalize NBSP); subscriberStats com 3 visitas done no ciclo e 1 fora → visits 3.
- [ ] Step 2: `npm test` → FAIL.
- [ ] Step 3: implementar.
- [ ] Step 4: `npm test` → PASS. Commit `feat: core finanças`.

### Task 2: Pix, WhatsApp e notificação (core)

**Files:** Modify `src/core.js`, `tests/core.test.mjs`

**Interfaces — Produces:**
- `crc16(str):string` (4 hex maiúsculos)
- `pixCode({key,name,city,amount,txid='***'}):string`
- `normPhone(raw):string` → "55"+dígitos (adiciona 55 se 10/11 dígitos)
- `waLink(phone,text):string`
- `fill(tpl, vars):string` — substitui `{chave}`
- `parseBankNotification(text):{amount:number|null,name:string|null}` — padrões "Pix de NOME" / "recebeu ... de NOME", valor "R$ 1.050,00"/"R$50"
- `matchPayment(parsed, openCharges:{clientName,amount,id}[]):string|null` — id se valor igual (±0.01) e primeiro nome bate (sem acento/caixa); senão null.

- [ ] Step 1: testes: `crc16('123456789')`="29B1"; `pixCode` com key "petros@email.com", name "João Ângelo da Conceição Filho", city "Seabra", amount 80 → começa com "000201", contém "5303986", "540580.00", "5802BR", "5925JOAO ANGELO DA CONCEICA", termina com crc16 do resto; `normPhone('(75) 9 9999-0000')`="5575999990000"; `normPhone('5575999990000')` igual; `fill('Oi {nome}',{nome:'Lu'})`="Oi Lu"; `parseBankNotification('Você recebeu um Pix de JOAO SILVA no valor de R$ 1.050,00')` → {amount:1050,name:'JOAO SILVA'}; `parseBankNotification('Pix recebido: R$50 de Maria')` amount 50 name 'Maria'; matchPayment casa "joão" com "JOAO SILVA" valor 80.
- [ ] Step 2–4: fail → implementar → pass. Commit `feat: pix, whatsapp, notificação`.

### Task 2b: Caixa avançado (core)
**Interfaces — Produces:** `rhythm(dates:Date[]):number|null`; `isMissing(dates, today, missingDays):boolean`; `toneFor(latePayments:number):'leve'|'firme'`; `forecast30(state, today):{inflow,outflow,net,items:[{date,label,amount}]}`; `billsStatus(state, month, today):[{cost,paid,overdue}]`.
- [ ] Testes: rhythm de visitas a cada 15 dias = 15; isMissing com ritmo 15 e 30 dias sem vir = true, 20 dias = false (missingDays 25 → limite 25); toneFor(0)='leve', toneFor(2)='firme'; forecast30 inclui mensalidade que vence em 5 dias e conta de luz com dueDay em 10 dias; billsStatus marca vencida não paga.
- [ ] fail → implementar → pass. Commit `feat: caixa avançado`.

### Task 3: Store e dados de exemplo

**Files:** Create `src/store.js`, `tests/store.test.mjs`

**Interfaces — Produces:** `createStore(storage|null)` → `{state, save(), reset(), exportJSON():string, importJSON(s), uid(), persistent:boolean}`; `seed(today:Date)` → estado com settings (GL Style, cidade Seabra), 4 serviços, 3 planos (Ilimitado R$ 100, 4 cortes R$ 90, Corte+Barba 4x R$ 150), 12 clientes, 3 profissionais (dono + 2 associados: 30% e R$ 400 fixo), 3 despesas, atendimentos da semana atual e passada, pagamentos, 6 custos fixos, hoursPerMonth 176, paymentFeePct 0.
- [ ] Step 1: testes: `createStore(null).persistent===false` e tem seed; storage fake que lança no setItem → não quebra; export→import preserva clientes.
- [ ] Step 2–4. Commit `feat: store`.

### Task 4: UI + build

**Files:** Create `src/app.js`, `src/style.css`, `src/index.html` (template com `/*CORE*/ /*STORE*/ /*APP*/ /*CSS*/`), `build.mjs` (remove `export` e concatena em `dist/index.html`)

**Interfaces — Consumes:** Tasks 1–3.
Telas conforme spec §4: Hoje (resumo, lista com botões confirmar/atendido/faltou/pago, card lembretes de amanhã), Agenda (faixa 7 dias, grade de slots, toque livre → novo), Clientes (busca, sumidos, ficha em folha inferior), Cobranças (vencendo/vencidas/avulsos; botão WhatsApp+Pix; "Recebi"; caixa "colar notificação do banco"), Caixa (entradas/saídas/lucro do mês, repasses por associado com cobrar/recebi, despesas lançáveis; custo/min, por serviço, por plano com equilíbrio, assinantes no prejuízo; custos editáveis), Ajustes (dados, chave Pix, templates, backup, reset demo). Modal novo agendamento com autocomplete.
- [ ] Step 1: `node build.mjs` gera `dist/index.html`.
- [ ] Step 2: Playwright 390×844: abrir, sem erros no console, clicar cada aba e screenshot; criar agendamento; marcar pago; colar notificação → item pago.
- [ ] Step 3: Commit `feat: UI demo`.

### Task 5: Verificação e entrega
- [ ] `npm test` PASS; revisar screenshots; publicar `dist/index.html` como artifact; enviar link.
