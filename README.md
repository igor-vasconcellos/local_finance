# 💜 Local Finance

Gerenciador financeiro pessoal que roda **100% no seu computador**: rendas, gastos
fixos, cartões com faturas parceladas, caixinhas rendendo % do CDI, simulador de
compras com farol de saúde financeira e dashboards mensais / semestrais / anuais.

Seus dados ficam em **um único arquivo SQLite** (`data/financeiro.db`), que nunca vai
para o Git.

---

## Stack

| Camada | Tecnologia |
|---|---|
| Runtime | Node.js 22.13+ (recomendado: 24 LTS) |
| App (front + back) | Next.js 16 (App Router, Server Actions) + TypeScript |
| UI | Tailwind CSS v4, componentes no padrão shadcn/ui, Lucide Icons, Recharts |
| Banco | SQLite via better-sqlite3 + Drizzle ORM (migrações SQL versionadas) |
| Auth | bcrypt + 2FA por e-mail (Nodemailer) + sessão JWT em cookie HttpOnly |
| Testes | Vitest |

---

## Instalação (primeira vez)

```bash
git clone https://github.com/igor-vasconcellos/local_finance.git
cd local_finance
npm install
npm run setup     # cria o .env (com SESSION_SECRET aleatório), o banco e os dados iniciais
npm run dev       # abre em http://localhost:3000
```

> **Windows:** se o `npm install` reclamar ao compilar o `better-sqlite3`, confira se
> está usando Node 22 ou 24 LTS (há binários prontos para essas versões).

### Primeiro acesso e login

1. Abra http://localhost:3000 — na primeira vez você cai em **Primeiro acesso** para
   criar o usuário master (nome, e-mail e senha com 10+ caracteres, letras e números).
2. Depois, todo login tem **duas etapas**: e-mail + senha → código de 6 dígitos
   (válido por 5 minutos, uso único, até 5 tentativas; reenvio a cada 30s).
3. Após 5 senhas erradas seguidas, o login fica bloqueado por 15 minutos.

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

Como o app é local, a recuperação é feita pelo terminal do próprio computador:

```bash
npm run user:reset-password
```

Define uma nova senha, desbloqueia o login e encerra todas as sessões abertas.

---

## Uso no Windows sem terminal

Na pasta do projeto há três atalhos (duplo clique, **sem** precisar de administrador):

| Arquivo | O que faz |
|---|---|
| `iniciar.bat` | Sobe o servidor (janela minimizada) e abre o app no navegador. Na primeira vez também instala e prepara tudo. Se já estiver aberto, só abre o navegador. |
| `parar.bat` | Desliga o servidor. |
| `atualizar.bat` | Baixa a versão nova do GitHub (`git pull`), instala e prepara. Seus dados e o `.env` não mudam. |

Dica: clique com o botão direito em `iniciar.bat` → **Enviar para → Área de trabalho (criar atalho)**.
Para abrir junto com o Windows, coloque um atalho em `shell:startup` (Win + R).

> Evite deixar o projeto dentro de **Documentos** ou do **OneDrive** (proteção de pastas e
> sincronização podem bloquear o Git ou corromper o banco). Prefira algo como `C:\Projetos`.

## Comandos

| Comando | O que faz |
|---|---|
| `npm run dev` | Servidor de desenvolvimento em `127.0.0.1:3000` |
| `npm run build && npm start` | Versão otimizada (mais rápida no uso diário) |
| `npm run setup` | Cria `.env` + aplica migrações + seed (seguro rodar de novo) |
| `npm run db:migrate` | Aplica migrações pendentes |
| `npm run db:seed` | Insere dados iniciais (idempotente) |
| `npm run db:backup` | Cópia consistente do banco em `data/backups/` |
| `npm run db:studio` | Abre o Drizzle Studio para inspecionar o banco |
| `npm run user:reset-password` | Redefine a senha do usuário master |
| `npm run db:generate` | Gera nova migração após alterar `src/db/schema` |
| `npm test` | Testes automatizados |
| `npm run typecheck` / `npm run lint` | Verificações de tipo e estilo |

---

## Backup

Todo o seu histórico está em `data/financeiro.db`. Para backup:

- `npm run db:backup` (seguro mesmo com o app aberto), ou
- copie a pasta `data/` com o app fechado.

---

## Acesso remoto seguro (opcional)

O servidor escuta **apenas em `127.0.0.1`** — ninguém na sua rede acessa diretamente.
Para usar de fora de casa, publique por um túnel privado com HTTPS:

- **Tailscale:** `tailscale serve --bg 3000` → acesse pelo endereço `https://<seu-pc>.<tailnet>.ts.net`
  de qualquer dispositivo logado na sua tailnet.
- **Cloudflare Tunnel:** `cloudflared tunnel --url http://localhost:3000` (idealmente com
  Cloudflare Access na frente).

Ao acessar por HTTPS, ajuste no `.env`: `APP_URL=<url https>` e `COOKIE_SECURE=true`.

---

## Estrutura

```text
├── data/                 # banco SQLite + backups (gitignored)
├── drizzle/              # migrações SQL geradas (versionadas)
├── scripts/              # setup do .env, migrate, seed, backup
├── src/
│   ├── app/              # rotas (App Router)
│   ├── components/       # UI (layout, ui/, finance/, charts/)
│   ├── db/               # conexão SQLite + schema por módulo
│   ├── lib/              # utilitários (auth, mail, dinheiro, datas)
│   ├── server/           # regras de negócio e Server Actions
│   └── env.ts            # validação do .env
└── tests/                # Vitest
```

### Convenções de dados

- **Dinheiro em centavos** (`INTEGER`) — nada de float.
- **Percentuais em basis points** — `11500` = 115% do CDI; `1365` = 13,65% a.a.
- **Datas** `YYYY-MM-DD`; **competência** `YYYY-MM` (faturas pelo mês do vencimento).
- Regras críticas também ficam no banco (CHECK, UNIQUE, FKs), não só no código.

---

## Roadmap

- [x] **Etapa 1** — Setup, estrutura, schema SQLite, `.env`
- [x] **Etapa 2** — Cadastro do usuário master + login com 2FA (SMTP / console)
- [x] **Etapa 3** — Layout (sidebar, dark mode) + CRUD de rendas, gastos, cartões e parcelas
- [x] **Etapa 4** — Caixinhas com rendimento CDI e histórico de aportes
- [x] **Etapa 5** — Simulador (crédito e débito) + farol + efetivação
- [x] **Etapa 6** — Dashboards mensal / semestral / anual, real vs. simulado
- [x] **Etapa 7** — Importação de fatura (Nubank CSV, PicPay e Mercado Pago PDF)
