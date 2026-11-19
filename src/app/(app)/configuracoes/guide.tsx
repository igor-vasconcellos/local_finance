import {
  ArrowRight,
  Calculator,
  ChevronDown,
  CreditCard,
  FileBarChart,
  Keyboard,
  LayoutDashboard,
  PiggyBank,
  Receipt,
  Settings,
  ShieldCheck,
  TrendingUp,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

type Topic = {
  icon: LucideIcon;
  title: string;
  summary: string;
  href?: string;
  linkLabel?: string;
  body: ReactNode;
};

const TOPICS: Topic[] = [
  {
    icon: LayoutDashboard,
    title: "Visão geral",
    summary: "O painel do seu dinheiro: mês a mês, semestre ou ano.",
    href: "/dashboard",
    linkLabel: "Abrir Visão geral",
    body: (
      <>
        <p>Mostra quanto entra, quanto sai e quanto sobra. Tem três abas:</p>
        <ul>
          <li>
            <strong>Mensal</strong> — total recebido, despesas pagas, a receber, a pagar, reserva, patrimônio e a{" "}
            <strong>previsão do mês</strong> (realizado + a receber − a pagar − metas).
          </li>
          <li>
            <strong>Semestral</strong> e <strong>Anual</strong> — gráfico e tabela do fluxo de caixa previsto, com o farol de cada mês.
          </li>
        </ul>
        <p className="font-medium text-foreground">Como usar</p>
        <ol>
          <li>Use as setas ← → para trocar de período e “Hoje” para voltar.</li>
          <li>
            Quando o dinheiro entrar ou sair de verdade, clique em <strong>Recebi</strong> ou <strong>Pagar</strong>. Errou? Use{" "}
            <strong>Desfazer</strong>.
          </li>
          <li>
            Ligue <strong>Mostrar simulações</strong> para ver como ficaria o orçamento com as compras que você está pensando em fazer.
          </li>
          <li>Na tabela semestral/anual, clique no mês para abrir os detalhes dele.</li>
        </ol>
        <p>
          O <strong>farol</strong> classifica o mês pelo quanto da renda sobra livre: 🟢 saudável, 🟡 atenção, 🔴 crítico (limites ajustáveis
          abaixo, em “Farol de saúde”).
        </p>
      </>
    ),
  },
  {
    icon: FileBarChart,
    title: "Relatórios",
    summary: "Para onde foi o dinheiro, por categoria.",
    href: "/relatorios",
    linkLabel: "Abrir Relatórios",
    body: (
      <>
        <p>Junta todas as saídas do mês — gastos fixos, parcelas de cartão que vencem no mês e gastos avulsos — e agrupa por categoria.</p>
        <ol>
          <li>Escolha o mês com as setas.</li>
          <li>Clique numa categoria para ver cada item, de onde veio (fixo, cartão ou avulso) e o valor.</li>
        </ol>
      </>
    ),
  },
  {
    icon: TrendingUp,
    title: "Rendas",
    summary: "Salário, pró-labore e rendas extras.",
    href: "/rendas",
    linkLabel: "Abrir Rendas",
    body: (
      <ol>
        <li>
          Clique em <strong>Nova renda</strong> e escolha <strong>Todo mês</strong> (com dia de recebimento e, se quiser, um mês de término) ou{" "}
          <strong>Uma vez</strong> (com a data).
        </li>
        <li>
          Use <strong>Pausar</strong> para deixar de contar uma renda sem apagá-la. Excluir remove de todos os meses.
        </li>
        <li>Todo mês, confirme o recebimento na Visão geral com “Recebi”.</li>
      </ol>
    ),
  },
  {
    icon: Receipt,
    title: "Gastos fixos e avulsos",
    summary: "Contas que se repetem todo mês e compras no débito/Pix.",
    href: "/gastos",
    linkLabel: "Abrir Gastos fixos",
    body: (
      <>
        <ol>
          <li>
            Em <strong>Novo gasto</strong>, informe descrição, categoria, valor e dia de vencimento. Se o gasto vai acabar (ex.: um curso), defina o
            mês de término.
          </li>
          <li>A lateral mostra quanto cada categoria pesa no seu mês.</li>
          <li>Todo mês, marque como pago na Visão geral com “Pagar”.</li>
        </ol>
        <p>
          <strong>Gastos avulsos</strong> (débito/Pix) aparecem no fim da página — hoje eles são criados ao efetivar uma simulação de débito no
          Simulador.
        </p>
      </>
    ),
  },
  {
    icon: CreditCard,
    title: "Cartões e faturas",
    summary: "Compras à vista ou parceladas, distribuídas nas faturas certas.",
    href: "/cartoes",
    linkLabel: "Abrir Cartões",
    body: (
      <>
        <ol>
          <li>Cadastre o cartão com limite, dia de fechamento e dia de vencimento (como aparecem no app do banco).</li>
          <li>
            Abra o cartão e use <strong>Lançar compra</strong>. Escolha as parcelas — o formulário mostra em quais faturas elas vão cair.
          </li>
          <li>Navegue pelas faturas na faixa de meses e use “Marcar como paga” quando quitar (isso libera o limite).</li>
        </ol>
        <p>
          Regras: compra <strong>antes</strong> do fechamento entra na fatura do mês; <strong>no dia</strong> do fechamento ou depois, na
          seguinte. A fatura é identificada pelo mês do vencimento. Limite comprometido inclui parcelas futuras.
        </p>
      </>
    ),
  },
  {
    icon: PiggyBank,
    title: "Caixinhas",
    summary: "Reserva e objetivos rendendo pelo % do CDI.",
    href: "/caixinhas",
    linkLabel: "Abrir Caixinhas",
    body: (
      <>
        <ol>
          <li>
            Crie a caixinha com o banco e o <strong>% do CDI</strong> (ex.: 115). Se tiver um objetivo, informe o valor e a data da meta.
          </li>
          <li>
            Registre o dinheiro que já está lá como primeiro <strong>aporte</strong>, com a data em que ele entrou — assim o rendimento fica certo.
          </li>
          <li>Use Aportar/Resgatar a cada movimentação. Com meta, o app sugere quanto guardar por mês.</li>
        </ol>
        <p>
          O rendimento é calculado em dias úteis com a taxa CDI das Configurações (valor bruto, sem IR). Pode diferir alguns centavos do banco.
        </p>
      </>
    ),
  },
  {
    icon: Calculator,
    title: "Simulador",
    summary: "Teste uma compra antes de fazer.",
    href: "/simulador",
    linkLabel: "Abrir Simulador",
    body: (
      <ol>
        <li>Preencha o que quer comprar, o valor e a forma de pagamento (crédito parcelado ou débito/Pix).</li>
        <li>Veja na hora o impacto nos próximos 12 meses: saldo livre antes × depois e se o farol muda de cor.</li>
        <li>
          <strong>Salvar simulação</strong> guarda para comparar (o 👁 coloca ou tira do cenário). Nada muda nos seus dados reais.
        </li>
        <li>
          Decidiu comprar? <strong>Efetivar</strong> lança a compra no cartão (crédito) ou como gasto avulso (débito).
        </li>
      </ol>
    ),
  },
  {
    icon: Settings,
    title: "Configurações",
    summary: "Seu perfil e os parâmetros do app.",
    body: (
      <ul>
        <li>
          <strong>Conta</strong>: nome e cor do seu avatar.
        </li>
        <li>
          <strong>Saldo em conta</strong>: entra no patrimônio líquido. Atualize quando quiser que o patrimônio reflita o banco.
        </li>
        <li>
          <strong>CDI</strong>: informe por mês (como no app do banco) ou por ano; o app converte e guarda o histórico.
        </li>
        <li>
          <strong>Farol</strong>: defina a partir de quanto % de sobra o mês é verde ou amarelo.
        </li>
      </ul>
    ),
  },
  {
    icon: ShieldCheck,
    title: "Segurança e seus dados",
    summary: "Login em duas etapas, backup e recuperação.",
    body: (
      <ul>
        <li>Todo login pede e-mail, senha e um código de 6 dígitos enviado por e-mail (ou exibido no terminal, se o SMTP não estiver configurado).</li>
        <li>
          Seus dados ficam só neste computador. Para fazer uma cópia de segurança, rode <code>npm run db:backup</code> no terminal.
        </li>
        <li>
          Esqueceu a senha? Rode <code>npm run user:reset-password</code> no terminal.
        </li>
      </ul>
    ),
  },
  {
    icon: Keyboard,
    title: "Dicas rápidas",
    summary: "Atalhos para preencher mais rápido.",
    body: (
      <ul>
        <li>
          <strong>Valores</strong>: digite só os números — <code>123456</code> vira <code>1.234,56</code>.
        </li>
        <li>
          <strong>Datas</strong>: digite <code>20122026</code> (vira 20/12/2026) ou clique no ícone de calendário. No calendário, clique no nome do
          mês para pular para outro mês/ano.
        </li>
        <li>
          <strong>Barra lateral</strong>: use o botão ao lado do logo para recolher e ganhar espaço.
        </li>
        <li>
          <strong>Tema</strong>: claro, escuro ou automático pelo seletor no rodapé da barra lateral.
        </li>
      </ul>
    ),
  },
];

/** Guia de uso: um item expansível por função do sistema. */
export function Guide() {
  return (
    <ul className="divide-y rounded-xl border">
      {TOPICS.map(({ icon: Icon, title, summary, href, linkLabel, body }) => (
        <li key={title}>
          <details className="group">
            <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-3.5 hover:bg-muted/40">
              <span className="inline-flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground group-open:bg-accent group-open:text-accent-foreground">
                <Icon className="size-4" aria-hidden />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium">{title}</span>
                <span className="block text-xs text-muted-foreground">{summary}</span>
              </span>
              <ChevronDown className="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" aria-hidden />
            </summary>
            <div className="guide-body grid gap-3 px-4 pt-1 pb-4 pl-15 text-sm text-muted-foreground [&_code]:rounded [&_code]:bg-muted [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-xs [&_code]:text-foreground [&_li]:pl-1 [&_ol]:grid [&_ol]:list-decimal [&_ol]:gap-1.5 [&_ol]:pl-5 [&_strong]:text-foreground [&_ul]:grid [&_ul]:list-disc [&_ul]:gap-1.5 [&_ul]:pl-5">
              {body}
              {href && (
                <Link href={href} className="inline-flex w-fit items-center gap-1 font-medium text-primary hover:underline">
                  {linkLabel} <ArrowRight className="size-3.5" aria-hidden />
                </Link>
              )}
            </div>
          </details>
        </li>
      ))}
    </ul>
  );
}
