# Active Context — Telegram Master Bot

> **Data/Hora:** 2026-11-12T18:34:02.749Z (Europe/Lisbon)  
> **Commit/branch atual:** `main` (desconhecido — verificar)  
> **Estado:** Auditoria em curso — FASE 0 (receção, preservação e preparação)

---

## 1. Estado Atual do Código

- **Repositório:** `telegram-master-bot`  
- **Versão:** 2.0.0  
- **Runtime:** Node.js >= 20.0.0  
- **Framework:** Express ^4.21.2 + Telegraf ^4.16.3  
- **Base de Dados:** better-sqlite3 (WAL) em `./data/pessoal_master.db`  
- **Persistência:** sincronizada com Google Drive privado (15 min + write-through debounced 5 s)

### Ficheiros Principais

| Caminho | Tamanho (linhas) | Última modificação | Observações |
|--------|----------------|----------------|----------|
| `index.js` | ~200 | 2026-11-12 | Entry point principal |
| `src/bot/legacyBridges.js` | ~150 | 2026-11-12 | Bridges para compatibilidade legacy |
| `src/router/masterRouter.js` | ~120 | 2026-11-12 | Roteamento principal |
| `src/services/proactiveEngine.js` | ~200 | 2026-11-12 | Motor proativo (radares 5 frentes) |
| `src/services/newsService.js` | ~180 | 2026-11-12 | Serviço de notícias certificadas |
| `src/services/nutricao/worker_nutricao.js` | ~200 | 2026-11-12 | Worker de nutrição e receitas |
| `src/shared/sqliteMasterDb.js` | ~150 | 2026-11-12 | Wrapper de DB SQLite |
| `src/shared/telegramAuth.js` | ~100 | 2026-11-12 | Autentação e autorização do bot |

### Dependências (package.json)

```json
{
  "name": "telegram-master-bot",
  "version": "2.0.0",
  "dependencies": {
    "@octokit/rest": "^22.0.1",
    "axios": "^1.21.0",
    "better-sqlite3": "^13.0.3",
    "cors": "^2.8.5",
    "dotenv": "^16.4.7",
    probably more dependencies...
  }
}
```

### Scripts Disponíveis

- `npm start` — produção
- `npm run dev` — watch mode
- `npm test` — bateria de testes master
- `npm run test:live` — testes de resposta máxima

---

## 2. Tarefas em Curso (Fase 0)

### ✅ Concluído

- [x] **Criação de `memory-bank/`:** `projectbrief.md` criado.
- [x] **Leitura do Plano Mestre:** Secção 0 (ORDEM-MÃE) e Fase 0 compreendidas.

### 🔄 Em Progresso

- [ ] **Criação de `memory-bank/` em `zeropaper-frota-bot`:** `projectbrief.md`, `activeContext.md`, `progress.md`.
- [ ] **Fase 0 — Receção e separação:** verificar ZIPs originais, hashes SHA-256, cópia isolada.
- [ ] **Fase 0 — Ausência de segredos:** garantir que `.env`, tokens, chaves não estão nos artefactos de auditoria.

### ⏳ Pendente

- [ ] **Fase 1 — Inventário real:** listar todos os ficheiros, módulos, endpoints, workflows, dependências.
- [ ] **Fase 2 — Grafo de dependências:** extrair package.json, lockfiles, imports internos, ciclos.
- [ ] **Fase 3 — Baseline:** build, testes, lint, typecheck — estado inicial documentado.

---

## 3. Bloqueios e Pendências

- **Desconhecido:** commit/branch declarado em `telegram-master-bot` (não disponível em `package.json`).
- **Aguardando:** criação de `memory-bank/` em `zeropaper-frota-bot`.
- **Aguardando:** ZIPs originais (`zeropaper-frota-bot.zip`, `telegram-master-bot.zip`) para hashes e separação.

---

## 4. Próximos Passos (Fase 0)

1. **Criar `memory-bank/` em `zeropaper-frota-bot`:** `projectbrief.md`, `activeContext.md`, `progress.md`.
2. **Localizar ZIPs originais:** confirmar nome, tamanho, data de receção e SHA-256.
3. **Extrair repositórios:** diretório de trabalho separado, sem mistura de ficheiros.
4. **Identificar versões/commits:** `README`, `package.json`, lockfiles, ficheiros de configuração.
5. **Confirmar ausência de segredos:** verificar que `.env`, tokens, chaves não estão nos artefactos.

---

## 5. Evidências e Artefactos

- **Plano Mestre:** `C:/Users/Surface_Dpc/Downloads/PLANO_MESTRE_ZERO%C2%ADPAPER_AUDITORIA_DEPENDENCIAS.md` (Secção 0, Fase 0).
- **README do repositório:** `README.md` (se existir).
- **package.json e lockfiles:** `package.json`, `package-lock.json`.
- **Configurações:** `ecosystem.config.cjs`, `render.yaml`, `Dockerfile`.
- **Artefactos de auditoria:** ficheiros criados em `memory-bank/`.

---

*Última atualização: 2026-11-12T18:34:02.749Z*