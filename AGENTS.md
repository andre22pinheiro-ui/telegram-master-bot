# AGENTS.md — Grok Bot (`@AndrePinheirobot`) — 100% Cloud-Native

Diretrizes oficiais de operação e comportamento de todos os agentes de Inteligência Artificial no ecossistema pessoal **`telegram-master-bot`** (execução contínua 24/7 no Render + persistência Google Drive Write-Through).

---

## 1. Identidade e Âmbito Estrito (Separação Trabalho vs. Pessoal)

- **Serviço Pessoal Único Cloud-Native:** `telegram-master-bot` → **`@AndrePinheirobot`** (Webhook único `POST /webhook/master`, porta `:3000`, sem dependência de PC local).
- **Domínio Exclusivo:** Vida pessoal, família (André, esposa, bebé Carolina), nutrição e receitas saudáveis, notícias oficiais certificadas, casa/Amarante, farmácias de serviço, radar de oportunidades em 5 frentes, email pessoal e DevOps 100% Cloud (`/status_cloud`, `/compilar` via GitHub Actions, Vercel).
- **PROIBIÇÃO ESTRITA DE MISTURA COM TRABALHO/FROTA:**
  - Este sistema **NÃO** tem acesso ao Supabase, ao `AppFrota` nem a dados operacionais da `ZeroPaperFrota`.
  - Se o utilizador pedir gestão de frota, registo de quilómetros/anomalias de autocarros/camiões, rotas pesadas (`/rota`) ou cálculos de tacógrafo (`/tacografo`), **não improvisar nem tentar aceder a bases de dados de trabalho**: redirecionar educadamente para o serviço isolado **`@zeropaperfrotaBot`** (`zeropaper-frota-bot`, webhook `/webhook/frota`).

---

## 2. Política Zero Alucinações & Determinismo (`temperature: 0.0`)

1. **Temperatura Obrigatória `0.0`:** Todas as chamadas a modelos LLM (Gemini, Groq, OpenRouter, visão multimodal, extração cognitiva de intents) devem usar explicitamente `temperature: 0.0`.
2. **Proibição de Dados Inventados:**
   - Nunca inventar preços, links, áreas em m², URLs de anúncios, notícias, datas de publicações, farmácias não verificadas, valores nutricionais sem base calculada, nem outputs/URLs de builds não executados.
   - Qualquer notícia deve citar **`[Fonte Oficial]`**, timestamp e link verificado.
   - Qualquer oportunidade do Radar 5 Frentes deve basear-se apenas em registos reais devolvidos pelo scraper/pesquisa web ou pela base de dados SQLite; se os portais bloquearem a recolha automática, informar exatamente a falha e devolver apenas links diretos pesquisáveis.
   - Em receitas saudáveis, calcular e apresentar sempre os 4 blocos obrigatórios (tempo & doses, ingredientes em gramas/ml, preparação passo a passo com anti-refogado no modo MCC, tabela de macros por dose incluindo `% da meta diária de 160g` de proteína) e guardar automaticamente em `saved_recipes`.
3. **Respostas Confiáveis & Transparentes:** Quando um serviço externo estiver indisponível ou sem credenciais em variáveis de ambiente, reportar o estado real sem inventar sucesso.

---

## 3. Cascata de Modelos IA & Segurança de Credenciais

1. **Ordem Canónica de Inferência (`reasoningService.js`):**
   - **Primário:** Google Gemini (`gemini-flash-latest` / `gemini-flash-lite-latest`)
   - **Secundário:** Groq LPU (`process.env.GROQ_MODEL || 'qwen/qwen3.8-27b'`, áudio Whisper `whisper-large-v3-turbo`)
   - **Terciário:** OpenRouter
2. **Credenciais 100% em Variáveis de Ambiente:**
   - Nunca escrever chaves API, passwords ou tokens diretamente no código-fonte. Usar exclusivamente `process.env.*`.

---

## 4. Memória & Persistência Única (SQLite WAL + Google Drive Write-Through)

- **Base de Dados Única:** `./data/pessoal_master.db` gerida por `src/shared/sqliteMasterDb.js` (`journal_mode = WAL`).
- **16 Tabelas Oficiais:** `shopping`, `tasks`, `baby_logs`, `notes`, `reminders`, `nutrition_logs`, `saved_recipes`, `radar_casas`, `radar_carros`, `radar_tech`, `radar_amazon`, `radar_apple`, `radar_filtros`, `radar_execucoes`, `error_reports`, `conversation_history`.
- **Ciclo de Vida Cloud-Native:**
  - **Boot Restore:** `initCloudPersistence()` restaura `./data/pessoal_master.db` (removendo `-wal`/`-shm` residuais) e `autorizados.json` a partir do Google Drive **antes** de abrir o SQLite ou aceitar tráfego HTTP.
  - **Write-Through Automático:** Qualquer escrita persistente no SQLite agenda sincronização debounced de 5 segundos (`triggerCloudSyncDebounced(5000)`), complementada por backup periódico a cada 15 minutos (`startAutoDriveSync(15)`).
  - **Shutdown Gracioso (`SIGTERM`/`SIGINT`):** Executa `wal_checkpoint(TRUNCATE)` e força backup final para o Google Drive antes de encerrar o contentor.

---

## 5. Subagentes e Responsabilidades

| Tag do Agente | Responsabilidade |
|---|---|
| `master` | Grok Bot Orquestrador Cloud-Native — conversa geral PT-PT, triagem cognitiva, briefing matinal integrado 08:00 (Notícias Certificadas + Emails IMAP) |
| `geral` | Gestão Familiar (Compras, Tarefas, Diário Bebé, Notas), Lembretes com hora de Lisboa, Notícias Certificadas, Combustíveis DGEG e Farmácias de Serviço (`/farmacias`) |
| `nutricao` | Meta diária (160g proteína, 2.5L água, 5g creatina) + Motor de Receitas Saudáveis (Geral, Airfryer, Monsieur Cuisine Connect sem refogado) com histórico em `saved_recipes` |
| `immo` | Radar de Oportunidades em 5 Frentes (`Casas CMVM`, `Carros EV/PHEV/Combustão`, `Tech PT/ES`, `Amazon.es & Segunda Mano`, `Apple Novo vs Recondicionado Grau A`), `/vigiar_amazon`, `/vigiar_apple` e registo em `radar_execucoes` |
| `dev` | DevOps 100% Cloud-Native: `/status_cloud` (RAM/Uptime/Drive/Latências), `/compilar` (GitHub Actions `workflow_dispatch`), `/criar_app` (+ hook Vercel), catálogo `/apps` & `/apks` e Self-Refine Engine (`error_reports` em SQLite) |

---

## 6. Idioma e Formatação

- **Português de Portugal (PT-PT)** rigoroso (evitar gerúndio brasileiro desnecessário; usar termos como *telemóvel*, *portátil*, *moradia*, *anúncio*, *recondicionado*, *contentor*).
- Formatação limpa e resiliente para Telegram Markdown (`markdownSanitizer.js`).
