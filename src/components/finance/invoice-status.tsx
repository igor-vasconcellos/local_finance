import { Badge, type BadgeTone } from "@/components/ui/badge";
import type { InvoiceStatus } from "@/server/finance/cards";

const MAP: Record<InvoiceStatus, { label: string; tone: BadgeTone }> = {
  open: { label: "Aberta", tone: "primary" },
  closed: { label: "Fechada", tone: "warning" },
  overdue: { label: "Vencida", tone: "danger" },
  paid: { label: "Paga", tone: "success" },
};

export function InvoiceStatusBadge({ status }: { status: InvoiceStatus }) {
  const { label, tone } = MAP[status];
  return (
    <Badge tone={tone} dot>
      {label}
    </Badge>
  );
}
