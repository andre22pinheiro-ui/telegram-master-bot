# MEMORY.md — telegram-master-bot

## 1. Estado Técnico Real e Stack
- **Runtime:** Node.js `>=20.0.0` (ES Modules nativo).
- **Frameworks:** Telegraf (`^4.16.3`), Express (`^4.21.2`), CORS (`^2.8.5`).
- **Persistência Exclusiva:** SQLite em modo Write-Ahead Logging (`better-sqlite3`, WAL ativo, 16 tabelas oficiais legadas + 7 tabelas canónicas de Nutrição, Consumo e Compras).
- **Ativação de Integridade Relacional:** `PRAGMA foreign_keys = ON;` ativo na inicialização do driver SQLite.
- **Isolamento de Base de Dados:** Isolamento total e estrito face ao Supabase (o bot pessoal nunca importa, conecta nem referencia tabelas do Supabase).
- **Sincronização e Resiliência:** Ganchos assíncronos write-through debounced para Google Drive (`googleDriveService.js`), tolerante a ausência de chaves (`DISABLE_DRIVE_SYNC=true`).
- **Roteamento:** Despacho de mensagens por `masterRouter.js` para workers especializados (`worker_dev`, `worker_geral`, `worker_immo`, `worker_nutricao`).
- **Redirecionamento de Frota:** Qualquer comando ou pedido relativo a frotas, autocarros, tacógrafo ou quilometragem é imediatamente redirecionado para o `@zeropaperfrotaBot`.

## 2. Decisões de Arquitetura e Governação
- **Governação Determinística:** Inferência cognitiva parametrizada com `temperature: 0.0` nos serviços de raciocínio.
- **Validações Determinísticas:** Regras de negócio, autorizações e limites de conformidade operam no código JavaScript, sem delegação a alucinações de modelos de linguagem.
- **Segurança e Whitelist:** Autenticação baseada exclusivamente em variáveis de ambiente:
  - `AUTHORIZED_PHONE_NUMBERS`
  - `AUTHORIZED_TELEGRAM_USER_IDS`
  - `AUTHORIZED_CHAT_IDS` / `CHAT_ID_AUTORIZADO` / `CHAT_ID_ESPOSA`
- **Avaliação Imobiliária:** Critérios periciais e ajustamentos documentais tratados como informativos preliminares, sem substituição de avaliações periciais oficiais nem regras cegas arbitrárias.

## 3. Registo de Correções Realizadas
- **Remoção de PII e Dados Pessoais:** Substituição de números de telefone hardcoded (+351...) e do nome próprio de menores por referências neutras e seguras.
- **Eliminação de Fallbacks Hardcoded:** Removidos fallbacks codificados de Chat ID (`950415577`) em 17 ficheiros (incluindo `index.js`, `security.js`, `masterRouter.js`, `emailService.js`, `proactiveEngine.js`, `radarCommon.js`, `reasoningService.js`, `sqliteMasterDb.js`, workers e documentação técnica).
- **Higienização de Configuração:** `.env.example` atualizado com placeholders neutros. Remoção de ficheiros `.env` reais rastreados.
- **Atualização do `.gitignore`:** Bloqueio explícito de ficheiros de ambiente, bases de dados (`*.db`, `*.db-wal`, `*.db-shm`), credenciais Google e dumps locais.
- **Suíte de Testes:** 100% aprovada (34/34 testes na bateria de testes `tests/run_master_battery.mjs`).
- **Migração do Esquema de Nutrição & Compras:** Criadas 7 tabelas canónicas (`products`, `nutrition_facts`, `food_entries`, `shopping_items`, `purchase_entries`, `product_history`, `nutrition_goals`) com índices em `barcode`, `user_id`, `consumed_at` e `status`, preservando 100% dos dados legados e compatibilidade total.
- **Serviços de Nutrição, Memória de Produtos e Compras (TAREFA 5):**
  - Implementado o serviço modular `nutritionCatalogService.js` com cálculo de Atwater determinístico (Proteína: 4 kcal/g, Hidratos: 4 kcal/g, Gordura: 9 kcal/g, Fibra: 2 kcal/g).
  - Isolamento comprovado por asserção factual: cadastrar rótulo oficial (`products` + `nutrition_facts`) ou registar compras (`purchase_entries` / `shopping_items`) mantém o consumo calórico diário a rigorosamente zero até haver registo explícito de ingestão (`food_entries`).
  - Ligação no router e bot de todos os comandos de Alimentação (`/comer`, `/foto_refeicao`, `/foto_rotulo`, `/diario_alimentar`, `/resumo_nutricional`, `/consumo_agua`, `/metas_nutricionais`), Compras (`/adicionar_compra`, `/foto_compra`, `/comprado`, `/historico_compras`) e Memória de Produtos (`/produtos_frequentes`, `/mais_consumidos`, `/mais_comprados`, `/corrigir_produto`, `/eliminar_produto`).
  - Motor de receitas adaptado a confeção saudável sem refogados pesados (Airfryer e Monsieur Cuisine Connect) com discriminação dos 4 blocos obrigatórios e percentagem face à meta de 160g de proteína.
  - Teste `NUT-03` adicionado à bateria mestre comprovando a separação produto vs compra vs consumo.
- **Expurgo Git, Resolução de Dependências e Padrões Mercury (TAREFA 6):**
  - *Expurgo Git:* Verificação com `git status` e `git ls-files` confirmando que `.env`, `*.db`, `service-account.json`, `data_pessoal.json` e `data_central.json` estão 100% excluídos do índice Git via `.gitignore`.
  - *Resolução de Dependências:* Removidas as dependências mortas `express` e `cors` do `package.json` do Master Bot (o bot utiliza nativamente `http.createServer`). `npm audit` com 0 vulnerabilidades em ambos os bots.
  - *Padrões Mercury (Second Brain FTS5 + Token Budget ADR-044):* Criadas as tabelas `memory_facts` com índice virtual `memory_facts_fts` (FTS5 com sincronização por triggers) e `token_budget` (limiar de 100 000 tokens/dia e estimativa em EUR).
  - *Comandos Expostos:* Ativados `/memoria` (pesquisa FTS5 e inserção de factos) e `/budget` (monitorização de quotas e custos).
  - *Validação:* Teste `DEV-02` adicionado à bateria mestre.
- **Motor Cloud-Native de Absorção e Adaptação de Ideias Open-Source (TAREFA 7):**
  - *Tabela SQLite `idea_radar`:* Criada para registo de `source_url`, `repo_name`, `target_project`, `user_notes`, `extracted_summary`, `cloud_adaptation_plan`, `ide_prompt` e `status`.
  - *Serviço `src/services/ideaHarvesterService.js`:* Extração segura via Octokit/Axios, sanitização rigorosa de `<untrusted_data>` (ADR-044), rejeição automática de dependências locais (TUI Ink -> Telegraf/Markup; Daemons de SO -> node-cron/Render Workers; GUI Desktop -> Webhooks Telegram/Cloudinary; Filesystem local -> SQLite WAL/Drive) e geração do bloco `ide_prompt` estruturado para o Antigravity IDE.
  - *Comandos Telegram:* Integrados `/absorver_ideia`, `/radar_ideias` e `/gerar_prompt_ideia`.
  - *Validação:* Teste `DEV-03` adicionado à bateria mestre. Resultado final: 34 PASS | 0 FAIL.

