# Project Brief — Telegram Master Bot

> **Identidade:** Grok Bot (@AndrePinheirobot) — Assistente Pessoal & Familiar Cloud-Native  
> **Repositório:** `telegram-master-bot`  
> **Versão:** 2.0.0  
> **Ambiente Operacional:** 100% Cloud-Native (Render + GitHub Actions + Vercel — Zero Dependência de PC Local)  
> **Fuso Horário & Jurisdição:** `Europe/Lisbon` | Amarante, Distrito do Porto, Portugal, União Europeia  
> **Parâmetro de Inferência Obrigatório:** `temperature: 0.0` (Determinismo Estrito & Zero Alucinações)

---

## 1. Missão

Assistência executiva familiar e pessoal para utilizadores estritamente autorizados (André Pinheiro, Esposa e `CHAT_ID_AUTORIZADO` `950415577`), com persistência exclusiva em SQLite Local WAL (`./data/pessoal_master.db`) sincronizado com Google Drive privado (a cada 15 minutos e write-through debounced de 5 segundos). **É estritamente proibido utilizar Supabase neste serviço.**

### Funcionalidades Principais

- **Assistência Familiar:** gestão partilhada (compras, tarefas, registos da filha Carolina, notas e lembretes).
- **Notícias Certificadas:** apenas domínios oficiais do Estado e órgãos registados na ERC.
- **Nutrição & Receitas:** `/receita_mcc`, `/receita_airfryer` com macronutrientes fundamentados (EFSA/ISSN).
- **DevOps Cloud:** integração com GitHub Actions, Vercel e Render.
- **Radar Proativo 5 Frentes:** Casas (CMVM Amarante), Carros (EV/PHEV), Tecnologia (GPUs/mini PCs), Amazon.es (Novo vs. Warehouse) e Apple (Novo Selado vs. Recondicionado Grau A).

---

## 2. Stack Tecnológica

| Camada | Tecnologia | Versão Mínima |
|--------|------------|---------------|
| Runtime | Node.js | >= 20.0.0 |
| Framework | Express | ^4.21.2 |
| Bot Framework | Telegraf | ^4.16.3 |
| Base de Dados | better-sqlite3 (WAL) | ^13.0.3 |
| Agendamento | node-cron | ^4.6.0 |
| Email | imapflow + mailparser | ^2.11.0 / ^3.14.3 |
| HTTP Client | axios | ^1.21.0 |
| GitHub API | @octokit/rest | ^22.0.1 |
| Process Manager | PM2 | ecosystem.config.cjs |

---

## 3. Estrutura de Pastas

```
telegram-master-bot/
├── index.js                 # Entry point principal
├── ecosystem.config.cjs     # Configuração PM2
├── render.yaml              # Configuração Render
├── Dockerfile               # Containerização
├── package.json             # Dependências e scripts
├── data/                    # SQLite WAL + ficheiros persistidos
│   └── pessoal_master.db
├── public/                  # Recursos estáticos (HTML, M3U)
├── scripts/                 # Scripts auxiliares (testes, geração)
├── src/
│   ├── bot/                 # Lógica do bot e bridges legacy
│   ├── router/              # Master router e roteamento
│   ├── services/            # Serviços de negócio (radar, email, mapas, etc.)
│   ├── shared/              # Módulos partilhados (auth, DB, segurança, web search)
│   ├── utils/               # Utilitários (logger, sanitizer, resilience)
│   └── workers/             # Workers assíncronos (dev, geral, immo, nutrição)
└── tests/                   # Testes e baterias de validação
```

---

## 4. Dependências Externas & Integrações

- **Telegram Bot API** (via Telegraf)
- **Google Drive API** (sincronização de persistência)
- **Supabase** (apenas no `zeropaper-frota-bot` — **proibido neste repositório**)
- **OpenRouteService** (cálculos rodoviários pesados — partilhado com frota)
- **DGEG, IPMA, PRC** (dados governamentais e meteorológicos)
- **APIs de Radar:** Idealista, Standvirtual, Amazon.es, Apple, GitHub

---

## 5. Conformidade Normativa Obrigatória

- **EU AI Act (UE 2024/1689):** transparência, rastreabilidade, determinismo.
- **RGPD (UE 2016/679):** mascaramento de dados pessoais, isolamento de armazenamento.
- **Diretiva Omnibus (UE 2019/2161):** validação de preços mínimos 30/90 dias.
- **DL 84/2021:** garantias legais (3 anos novos selados, Grau A recondicionados).
- **CMVM 2/2015 + RGEU + DL 10/2024:** avaliação imobiliária Amarante (1.350 / 1.180 / 1.120 €/m²).
- **ERC + portais oficiais:** apenas fontes certificadas para notícias.

---

## 6. Regras de Execução Críticas

- **Janela de silêncio noturno:** 22:30–07:30 (`Europe/Lisbon`), exceto emergências.
- **Radares 4h:** não enviar "nada encontrado"; notificar apenas novidades ou baixas reais.
- **Receitas:** respeitar ingredientes pedidos, incluir tempo, gramas/ml, passos e macros (% da meta 160g proteína).
- **Idioma:** Português Europeu (PT-PT) claro, técnico e conciso.
- **Segurança:** nunca expor tokens, `.env`, `service-account.json` ou dados pessoais completos.

---

## 7. Scripts Disponíveis

| Script | Comando | Descrição |
|--------|---------|-----------|
| Start | `npm start` | Inicia o bot em produção |
| Dev | `npm run dev` | Modo watch com auto-reload |
| Test | `npm test` | Bateria de testes master |
| Test Live | `npm run test:live` | Testes de resposta máxima |
| PM2 Start | `npm run pm2:start` | Inicia via PM2 |
| PM2 Stop | `npm run pm2:stop` | Para instância PM2 |
| PM2 Restart | `npm run pm2:restart` | Reinicia instância PM2 |
| PM2 Logs | `npm run pm2:logs` | Logs em tempo real |

---

## 8. Plano Mestre de Auditoria

Este repositório está sujeito ao **Plano Mestre de Auditoria, Resolução de Dependências e Estabilização** (v1.0, 11/11/2026), executado sequencialmente pela ORDEM-MÃE:

- **Fase 0:** Receção, preservação e preparação (cópia isolada, hashes SHA-256, ausência de segredos).
- **Fase 1:** Inventário real (ficheiros, módulos, endpoints, workflows, dependências).
- **Fase 2:** Grafo de dependências (diretas, transitivas, ciclos, pontos únicos de falha).
- **Fase 3:** Baseline (build, testes, lint, typecheck — estado inicial documentado).
- **Fase 4+:** Auditoria e correção (menor alteração possível, testes de regressão).

**Regra inegociável:** não fazer commit, merge, sync ou deploy sem autorização expressa do responsável.

---

*Última atualização: 2026-11-12*