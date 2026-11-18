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

### Esqueci minha senha

Como o app é local, a recuperação é feita pelo terminal do próprio computador:

```bash
npm run user:reset-password
```

Define uma nova senha, desbloqueia o login e encerra todas as sessões abertas.

---

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
- [ ] **Etapa 3** — Layout (sidebar, dark mode) + CRUD de rendas, gastos, cartões e parcelas
- [ ] **Etapa 4** — Caixinhas com rendimento CDI e histórico de aportes
- [ ] **Etapa 5** — Simulador (crédito e débito) + farol + efetivação
- [ ] **Etapa 6** — Dashboards mensal / semestral / anual, real vs. simulado
