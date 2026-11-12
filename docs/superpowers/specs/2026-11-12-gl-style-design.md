# GL Style — Sistema de gestão da barbearia (spec)

Data: 2026-11-12 · Autor: Petros + Claude

## 1. Objetivo
App web de uso exclusivo do dono do GL Style (barbeiro autônomo) para:
gerenciar agenda e clientes, controlar pacotes/assinaturas e pagamentos (Pix),
confirmar e cobrar pelo WhatsApp sem perder tempo, e saber o **custo real e o lucro de cada pacote**.

Clientes NÃO usam o app; só recebem mensagens no WhatsApp. Só o dono acessa (associados não veem nada).

O salão tem **profissionais associados** (modelo salão-parceiro): atendem na agenda do salão e repassam ao dono um valor fixo por mês ou uma % do que faturam — configurável por associado.

## 2. Restrições
- Custo zero (hospedagem e banco gratuitos).
- Muito rápido, interativo e fácil: ações do dia a dia em ≤ 2 toques.
- Celular primeiro (instalável na tela inicial, PWA); funciona também no computador.
- Sem automação não oficial do WhatsApp (risco de banimento).

## 3. Fases
- **Fase 1 — Demo para mostrar ao barbeiro (esta entrega):** app completo rodando com dados guardados no próprio navegador e dados de exemplo pré-carregados. Botão "Exportar/Importar backup". Publicado como página com link.
- **Fase 2 — Produção:** mesma interface, com sincronização no Supabase (plano grátis, login por e-mail/senha, RLS só para o dono) e hospedagem no GitHub Pages/Cloudflare Pages. Fora do escopo desta entrega; a camada de dados da Fase 1 fica isolada num módulo `store` para trocar sem mexer nas telas.

## 4. Telas (barra inferior: Hoje · Agenda · Clientes · Cobranças · Caixa; Ajustes no topo)
1. **Hoje** — lista do dia por horário. Cada item: cliente, serviço, status (marcado / confirmado / atendido / faltou), pago ou não. Botões: 📲 Confirmar (WhatsApp), ✓ Atendido, ✗ Faltou, 💰 Pago. Topo: recebido hoje, a receber, atendimentos. Card "Lembretes de amanhã" com envio um a um.
2. **Agenda** — dias da semana em faixa horizontal; grade de horários livres/ocupados do dia escolhido. Toque em horário livre = novo agendamento. Aviso de conflito.
3. **Clientes** — busca instantânea; ficha com WhatsApp, pacote ativo, vencimento, uso no ciclo, histórico, saldo devedor. Seção "Sumidos" (sem vir há ≥ N dias, padrão 25) com botão de mensagem de retorno.
4. **Cobranças** — assinaturas vencendo (≤ 3 dias), vencidas e avulsos não pagos. Botão abre WhatsApp com mensagem + Pix copia-e-cola com valor. Botão "Recebi" registra pagamento e renova o ciclo.
5. **Caixa** (financeiro do salão) — mês selecionável: entradas (cortes do dono, pacotes, repasses de associados), saídas (custos fixos + despesas lançadas), lucro do mês; repasse devido por associado (faturamento dele × % ou fixo), pago/pendente, botão cobrar no WhatsApp. Abaixo, **Lucro por pacote** — custos fixos mensais (lista editável) + horas trabalhadas/mês → **custo por minuto**. Serviços com duração, preço avulso e custo de material. Por pacote: receita, custo real pelo uso de cada assinante, lucro, e "ponto de equilíbrio" (nº de visitas a partir do qual o assinante dá prejuízo). Lista de assinantes que dão prejuízo.
6. **Ajustes** — nome do salão, chave Pix, cidade, nome do recebedor, textos das mensagens (com variáveis {nome} {data} {hora} {valor} {servico} {pix}), horário de funcionamento, dias para "sumido", backup.

Botão flutuante "+" (novo agendamento) em Hoje e Agenda. Cliente por autocomplete (2 letras); criar cliente novo no mesmo fluxo.

## 5. Modelo de dados
- `settings` {shopName, pixKey, pixName, pixCity, openHour, closeHour, slotMin, missingDays, templates{}}
- `services` {id, name, durationMin, price, materialCost}
- `plans` {id, name, type: 'unlimited'|'fixed', visitsPerCycle (fixed), price, serviceIds[]}
- `clients` {id, name, phone, notes, planId|null, planStart, dueDay, createdAt}
- `appointments` {id, clientId, serviceId, start (ISO), status: scheduled|confirmed|done|noshow|canceled, covered (bool, coberto por pacote), price, paid (bool)}
- `payments` {id, clientId, amount, date, kind: 'plan'|'single', ref (appointmentId|cycle), method: 'pix'|'dinheiro'|'cartao'}
- `fixedCosts` {id, name, monthly}
- `pros` {id, name, phone, color, owner (bool), shareType: 'percent'|'fixed', shareValue}
- `expenses` {id, date, name, amount}
- `proPayments` {id, proId, month 'AAAA-MM', amount, date}
- appointments ganham `proId`
- `hoursPerMonth`, `paymentFeePct`

## 6. Regras de negócio
- **Ciclo de assinatura:** do dia de vencimento até o dia anterior ao próximo vencimento. Pago no ciclo → atendimentos do ciclo cobertos (fixed: até visitsPerCycle; excedente vira avulso). Vencido e não pago → aparece em Cobranças.
- **Custo de um atendimento** = durationMin × custoMinuto + materialCost + preço×taxa%.
- **custoMinuto** = Σ custos fixos mensais ÷ (horasMês × 60).
- **Lucro do assinante no ciclo** = preço do plano − Σ custo dos atendimentos cobertos.
- **Ponto de equilíbrio** = floor(preço ÷ custo médio por visita).
- Atendido avulso sem pagamento = saldo devedor do cliente.
- **Repasse do associado no mês** = percent: Σ preço dos atendimentos `done` dele × shareValue%; fixed: shareValue. Custo por minuto usa as horas de todas as cadeiras (horasMês × nº profissionais) para mostrar quanto cada cadeira custa vs quanto o associado repassa.

## 7. WhatsApp e Pix
- WhatsApp: link `https://wa.me/55DDDNUMERO?text=...` (abre conversa com texto pronto; dono toca em enviar). Gratuito, oficial.
- Pix: BR Code estático EMV (campos 00, 26 [GUI br.gov.bcb.pix + chave], 52=0000, 53=986, 54 valor, 58=BR, 59 nome, 60 cidade, 62 txid, 63 CRC16-CCITT-FALSE). Botão "copiar código". Confirmação de recebimento é manual (1 toque).

### 7.1 Regra: custo zero
Nada pago (descartados Asaas/gateways e API paga do WhatsApp).

### 7.2 Módulo opcional grátis (Fase 2): Pix confirmado sozinho pela notificação do banco
- Se o celular dele for Android: app gratuito MacroDroid lê a notificação do banco ("Você recebeu um Pix de NOME, R$ X") e envia para o app (Supabase, grátis). O app casa nome/valor com a cobrança aberta e marca "pago"; se não casar, cai numa lista "Pix a conferir".
- Alternativa: se o banco manda e-mail de Pix recebido, Google Apps Script (grátis) lê o e-mail e faz o mesmo.
- Após marcar pago, o app deixa pronta a mensagem "pagamento recebido, obrigado" (1 toque para enviar).
- A demo (Fase 1) simula: campo "colar notificação do banco" → marca pago automaticamente.

## 8. Técnica
- Uma página HTML com JS puro (sem build), CSS próprio, ícones inline. Carrega instantâneo.
- Camada `store` (Fase 1: localStorage com try/catch e fallback em memória).
- Visual: escuro, tipografia forte, cor de destaque dourada; marca "GL Style".

## 9. Testes / verificação
- Funções puras (custo/minuto, lucro, equilíbrio, ciclo, BR Code + CRC) testadas em Node.
- BR Code validado contra exemplo conhecido de CRC.
- Fluxo navegado no navegador em largura de celular (screenshots).

## 10. Fora do escopo
Agendamento pelo cliente, robô de WhatsApp, login de associados, estoque, nota fiscal.
