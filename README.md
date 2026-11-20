# 💜 BeaconFinance

Gerenciador financeiro pessoal na nuvem: rendas, gastos fixos, cartões com faturas
parceladas (e importação da fatura do banco), caixinhas rendendo % do CDI, simulador de
compras com farol de saúde financeira e dashboards mensais / semestrais / anuais.
Cada pessoa tem a própria conta, com os dados separados.

Hospedado na **Vercel** (região São Paulo) com banco **Postgres no Supabase**.

---

## Stack

| Camada | Tecnologia |
|---|---|
| Runtime | Node.js 22.13+ (Vercel: Node 24) |
| App (front + back) | Next.js 16 (App Router, Server Actions) + TypeScript |
| UI | Tailwind CSS v4, componentes no padrão shadcn/ui, Lucide Icons, Recharts |
| Banco | Postgres (Supabase) + Drizzle ORM, migrações SQL versionadas, RLS ligado |
| Auth | bcrypt + 2FA por e-mail (Nodemailer) + sessão JWT em cookie HttpOnly |
| Hospedagem | Vercel (Hobby) + Vercel Cron |
| Testes | Vitest com Postgres em memória (PGlite) |

---

## Ambientes

| Branch | Ambiente | Banco |
|---|---|---|
| `main` | **Produção**: `https://beaconfinance.vercel.app` | Supabase `beaconfinance-prod` |
| `homologacao` | **Homologação** (link de preview fixo da branch) | Supabase `beaconfinance-homolog` |
| `feature/*` | sem deploy (só a verificação automática do PR) | — |

O build da Vercel (`npm run vercel-build`) aplica as migrações pendentes no banco do
ambiente e depois gera o app.

---

## Desenvolvimento no seu PC (opcional)

```bash
git clone https://github.com/igor-vasconcellos/local_finance.git
cd local_finance
npm install
npm run setup        # cria o .env com SESSION_SECRET aleatório
# no .env: DATABASE_URL e DIRECT_URL do projeto de HOMOLOGAÇÃO (Supabase → Connect)
npm run db:migrate
npm run dev          # http://localhost:3000
```

Sem SMTP no `.env`, o código de verificação aparece no terminal.

### Contas, cadastro e login (Etapa 8)

1. Abra http://localhost:3000 → **Criar conta**: nome, e-mail e senha forte.
   - **Senha forte:** 10+ caracteres, maiúscula, minúscula, número e símbolo; não pode
     conter seu nome/e-mail nem ser uma senha comum (a tela mostra cada critério).
   - **E-mail real:** e-mails temporários são recusados, o domínio precisa receber
     e-mails (registro MX) e a conta só é ativada com o **código enviado ao e-mail**.
2. Cada conta vê **apenas os próprios dados**; contas novas já vêm com as categorias
   padrão, a taxa CDI e o farol.
3. Todo login tem **duas etapas**: e-mail + senha → código de 6 dígitos
   (válido por 5 minutos, uso único, até 5 tentativas; reenvio a cada 30s).
4. Após 5 senhas erradas seguidas, o login fica bloqueado por 15 minutos.

### E-mail para o código 2FA

Sem SMTP configurado, o código de 6 dígitos aparece **no terminal** onde o `npm run dev`
está rodando (ótimo para começar). Para receber por e-mail, preencha as variáveis
`SMTP_*` no `.env` — o `.env.example` traz um exemplo com Gmail (senha de app) — e
reinicie o servidor. Se o SMTP falhar, o código é impresso no terminal como fallback
(a tela de verificação avisa).

### Cadastros (Etapa 3)

- **Rendas** — salário, pró-labore e extras; mensais (com início e término opcional) ou únicas.
- **Gastos fixos** — aluguel, contas, assinaturas; com categoria e dia de vencimento.
- **Cartões** — limite, dia de fechamento e de vencimento. Cada compra (à vista ou em até
  48x) gera as parcelas automaticamente nas faturas certas:
  - compra **antes** do dia de fechamento → fatura que fecha naquele mês;
  - compra **no dia** do fechamento ou depois → fatura seguinte;
  - a fatura é identificada pelo **mês do vencimento** (quando o dinheiro sai da conta);
  - centavos que sobram na divisão vão para as primeiras parcelas (a soma bate sempre).
- **Limite comprometido** = tudo o que ainda não foi pago, incluindo parcelas futuras.
  Marcar uma fatura como paga libera o limite correspondente.

### Visão geral, relatórios e configurações

- **Visão geral** — resumo do mês (navegue com ← →): total recebido, despesas pagas,
  a receber, a pagar, reserva (caixinhas), patrimônio líquido e a **previsão do mês**
  (realizado + a receber − a pagar − metas), com o farol de saúde. Lista os próximos
  vencimentos, as entradas e as faturas do mês.
- **Recebido / pago é confirmado por você**: clique em “Recebi” ou “Pagar” em cada item
  (e “Desfazer” se precisar). O valor confirmado fica guardado mesmo se a renda/gasto
  mudar depois. Faturas de cartão usam o mesmo botão.
- **Patrimônio líquido** = saldo em conta (informado em Configurações) + caixinhas −
  tudo o que falta pagar nos cartões.
- **Relatórios** — gastos do mês por categoria (fixos + parcelas de cartão + avulsos),
  com detalhamento de cada item.
- **Configurações** — nome, saldo em conta, taxa CDI (informe **por mês** como no app do
  banco ou por ano; o app mostra a equivalência e guarda o histórico) e limites do farol.
- **Valores em dinheiro**: digite só os números — `123456` vira `1.234,56`.

### Caixinhas (Etapa 4)

- Cada caixinha tem banco, **% do CDI** (ex.: 115) e meta opcional (valor + data).
- Aportes e resgates com data; resgates nunca deixam o saldo negativo.
- **Rendimento**: capitalização diária em dias úteis (seg–sex, base 252), usando o
  histórico de CDI das Configurações — mudar a taxa não altera o passado. Valores
  brutos (sem IR/IOF); pode diferir alguns centavos do banco por causa de feriados.
- **Metas com data**: o app calcula quanto guardar por mês (já considerando o
  rendimento) e mostra a projeção de 12 meses no gráfico.
- No painel, **Reserva** = total das caixinhas com rendimento, e **Metas** na previsão
  do mês = o que você guardou no mês + o que ainda falta guardar para seguir as metas.

### Simulador (Etapa 5)

- Simule uma compra no **crédito** (parcelada, nas faturas certas do cartão) ou no
  **débito/Pix** (valor inteiro no mês) e veja na hora o impacto nos próximos 12 meses:
  saldo livre antes × depois, gráfico e o **farol** de cada mês (com aviso quando piora
  ou fica negativo, e quando passa do limite disponível do cartão).
- Saldo livre = rendas previstas − (gastos fixos + faturas que vencem no mês + gastos
  avulsos + metas das caixinhas + simulações salvas consideradas).
- **Simulações salvas** podem entrar ou sair do cenário (👁) para comparar opções.
- **Efetivar** transforma a simulação em lançamento real: no crédito vira compra no
  cartão; no débito vira um gasto avulso (listado em Gastos fixos → Gastos avulsos).

### Dashboards (Etapa 6)

- **Visão geral** com três abas:
  - **Mensal** — resumo do mês, vencimentos, entradas, faturas e categorias;
  - **Semestral** (6 meses) e **Anual** (12 meses) — fluxo de caixa previsto com gráfico
    (entradas × saídas e linha do saldo livre) e tabela lado a lado, totais do período e
    farol de cada mês. Clique num mês da tabela para abrir a visão mensal dele.
- **Mostrar simulações** — interruptor que inclui as simulações marcadas no Simulador
  em todas as visões, para comparar o cenário real × simulado (linha tracejada no
  gráfico, coluna “Simulações” na tabela e parcelas “Simulado” nos vencimentos).
- A navegação ← → anda 1, 6 ou 12 meses conforme a aba; “Hoje” volta ao período atual.

### Importação de fatura (Etapa 7)

- **Cartões → (cartão) → Importar fatura** (ou o botão na página Cartões).
- Formatos: **Nubank (CSV)**, **PicPay (PDF)** e **Mercado Pago (PDF)**, com o banco detectado
  pelo conteúdo. O PDF é lido localmente com o `pdfjs-dist`, sem internet.
- **Prévia antes de gravar:** fatura de destino (vencimento/fechamento do arquivo), conferência
  da soma com o total informado pelo banco, cartão final (titular/adicional), parcela, categoria
  sugerida e selos (pagamento ignorado, crédito/estorno, já importada, possível duplicada).
- **Regras:** a fatura informada pelo banco manda; “Parcela k/n” cria a compra completa e marca
  as faturas anteriores como pagas; créditos e estornos abatem o total da fatura em todo o app
  (painel, previsão, limite e relatórios); categorias escolhidas viram regras aprendidas; aviso
  e opção de atualizar o cartão quando o fechamento do banco é diferente do cadastrado.
- **Histórico e Desfazer** na página do cartão.
- Faturas reais têm dados pessoais e **nunca** entram no repositório: os testes usam cópias do
  formato com dados fictícios.

### Saldo em conta (calculado)

- O card **Saldo em conta** (primeiro da Visão geral) é calculado sozinho — ninguém digita o valor: rendas marcadas como **Recebi** − gastos fixos marcados como **Pagar** − faturas pagas − gastos avulsos já ocorridos.
- A **sobra de um mês passa para o seguinte** (saldo acumulado até o mês escolhido). Caixinhas não mexem no saldo.
- **Recebi / Pagar** abre uma janela com o valor previsto para informar o valor real. **Desfazer** devolve.
- **Ver extrato** mostra a sobra anterior, o que entrou e saiu no mês e o saldo.
- "Hoje" é sempre calculado no fuso de Brasília.

### Painel admin e controle de acesso (Etapa 10)

- A conta definida em `ADMIN_EMAILS` (com e-mail confirmado) vê **Painel admin** no menu. Para qualquer outra conta, `/admin` responde "Página não encontrada".
- **Usuários:** bloquear (com motivo; a pessoa é desconectada), desbloquear, cortesia (permanente ou até uma data) e encerrar sessões. Contas de admin não podem ser alteradas pelo painel.
- **Conta bloqueada:** entra só para consulta. Um modal mostra o motivo, permite **Exportar meus dados** (.zip com CSVs) e reabre a cada tentativa de alteração; o servidor recusa toda escrita.
- **Funcionalidades:** travar Caixinhas, Simulador ou Importação de faturas para todos (o admin continua usando), com mensagem opcional.
- **Auditoria:** toda ação do painel fica registrada (quem, o quê, em quem, quando e IP). O painel nunca mostra dados financeiros dos usuários.
- **Upload de faturas:** o tipo é decidido pelo conteúdo do arquivo (não pelo nome), até 5 MB, 40 páginas, 15 s de leitura e 30 envios por hora; nada é salvo em disco.

### Interface

- **Datas** sempre em dd/mm/aaaa (independe do idioma do navegador): digite só os
  números ou use o calendário em português (clique no nome do mês para pular para
  outro mês/ano). Meses em mm/aaaa com seletor de meses.
- **Barra lateral recolhível** (botão ao lado do logo) — o app lembra sua escolha.
- **Cor do perfil**: escolha a cor do seu avatar em Configurações → Conta.
- **Guia de uso** completo em Configurações → Guia de uso.

### Atualizações

Depois de `git pull`, basta rodar `npm run dev`: o banco é atualizado sozinho ao
iniciar (migrações automáticas), sem perder dados.

### Esqueci minha senha

Na tela de login, **Esqueci minha senha** → informe o e-mail → digite o código recebido
e a nova senha (forte). A troca desbloqueia o login e encerra todas as sessões abertas.
Por segurança, a resposta é a mesma exista ou não uma conta com o e-mail informado.

Sem acesso ao e-mail, quem tem o terminal do servidor pode usar
`npm run user:reset-password` (pede o e-mail da conta e a nova senha).

---

## Fluxo de trabalho (branches e PRs)

```
feature/*  ──PR──▶  homologacao  ──PR──▶  main
(cada mudança)      (teste)              (produção)
```

- Cada mudança nasce numa branch `feature/...` e vira um **Pull Request para `homologacao`**.
  O PR descreve **o que foi pedido**, **o que foi feito**, **como testar** e traz uma
  **autorrevisão** em comentário. A verificação automática (lint, tipos, testes e build)
  roda em todo PR.
- Você revisa o PR no GitHub (aba *Files changed*) e faz o **merge** em `homologacao`.
- Validado em homologação, um PR de `homologacao` → `main` publica em produção.
- `main` e `homologacao` são protegidas: não aceitam push direto, só PR com a
  verificação automática passando.

## Comandos

| Comando | O que faz |
|---|---|
| `npm run dev` | Servidor de desenvolvimento em `localhost:3000` |
| `npm run setup` | Cria o `.env` com um `SESSION_SECRET` aleatório |
| `npm run db:migrate` | Aplica migrações pendentes (usa `DIRECT_URL`) |
| `npm run db:generate` | Gera nova migração após alterar `src/db/schema` |
| `npm run db:seed` | Garante as categorias padrão em todas as contas (idempotente) |
| `npm run db:copy-from-sqlite -- arquivo.db` | Copia, uma vez, os dados do antigo banco SQLite para o Postgres |
| `npm run db:studio` | Abre o Drizzle Studio para inspecionar o banco |
| `npm run user:reset-password` | Redefine a senha de uma conta pelo terminal |
| `npm test` | Testes automatizados |
| `npm run typecheck` / `npm run lint` | Verificações de tipo e estilo |

---

## Segurança

- Senhas com bcrypt; login em duas etapas; sessões revogáveis no banco.
- Limite de tentativas **por IP** (login, cadastro, códigos e "esqueci a senha"), além do
  bloqueio por conta após 5 senhas erradas.
- Em produção, o envio de códigos exige SMTP (`MAIL_MODE=smtp`): nada vai para os logs.
- **RLS ligado em todas as tabelas**: a API pública do Supabase não enxerga nenhum dado;
  só o servidor do app, com a senha do banco, acessa.
- Cabeçalhos de segurança (HSTS, X-Frame-Options, nosniff, Permissions-Policy).

## Backup

O plano gratuito do Supabase não faz backup. O workflow **Backup do banco (produção)**
(`.github/workflows/backup.yml`) gera toda segunda-feira uma cópia **criptografada**
(AES-256) e guarda por 90 dias nos *Artifacts* do GitHub Actions. Para ativar, cadastre os
segredos `BACKUP_DATABASE_URL` e `BACKUP_PASSPHRASE` no repositório. Restaurar:

```bash
gpg -d beaconfinance-AAAA-MM-DD.sql.gz.gpg | gunzip | psql "<url do banco>"
```

## Supabase gratuito: pausa por inatividade

Projetos gratuitos pausam após 7 dias sem uso. A tarefa diária da Vercel
(`/api/cron/keepalive`, protegida por `CRON_SECRET`) acessa o banco todo dia e ainda faz a
faxina de sessões vencidas e códigos antigos.

---

## Estrutura

```text
├── .github/workflows/    # CI dos PRs e backup semanal
├── drizzle/              # migrações SQL (Postgres) versionadas
├── scripts/              # setup do .env, migrate, seed, cópia do SQLite antigo
├── src/
│   ├── app/              # rotas (App Router) e /api/cron
│   ├── components/       # UI (layout, ui/, finance/, charts/)
│   ├── db/               # conexão Postgres + schema por módulo
│   ├── lib/              # utilitários (auth, mail, dinheiro, datas)
│   ├── server/           # regras de negócio e Server Actions
│   └── env.ts            # validação do .env
├── tests/                # Vitest (Postgres em memória via PGlite)
└── vercel.json           # build, região, tarefa diária e branches com deploy
```

### Convenções de dados

- **Dinheiro em centavos** (`INTEGER`) — nada de float.
- **Percentuais em basis points** — `11500` = 115% do CDI; `1365` = 13,65% a.a.
- **Datas** `YYYY-MM-DD`; **competência** `YYYY-MM` (faturas pelo mês do vencimento).
- Regras críticas também ficam no banco (CHECK, UNIQUE, FKs), não só no código.

---

## Roadmap

- [x] **Etapa 1** — Setup, estrutura, schema (SQLite na época), `.env`
- [x] **Etapa 2** — Cadastro do usuário master + login com 2FA (SMTP / console)
- [x] **Etapa 3** — Layout (sidebar, dark mode) + CRUD de rendas, gastos, cartões e parcelas
- [x] **Etapa 4** — Caixinhas com rendimento CDI e histórico de aportes
- [x] **Etapa 5** — Simulador (crédito e débito) + farol + efetivação
- [x] **Etapa 6** — Dashboards mensal / semestral / anual, real vs. simulado
- [x] **Etapa 7** — Importação de fatura (Nubank CSV, PicPay e Mercado Pago PDF)
- [x] **Etapa 8** — Várias contas com dados separados, cadastro com e-mail confirmado e senha forte, "Esqueci minha senha"
- [x] **Etapa 9** — Hospedagem na Vercel + Supabase (Postgres), limite por IP, backup e tarefa diária
- [x] **Etapa 10** — Painel admin: bloqueio, cortesia, travas de funções, auditoria, exportação de dados e upload endurecido
- [ ] **Etapa 11** — Pagamento (Mercado Pago): R$ 39/mês, 7 dias grátis
