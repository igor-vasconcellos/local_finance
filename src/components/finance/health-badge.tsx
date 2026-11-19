import { Badge } from "@/components/ui/badge";
import type { Health } from "@/server/finance/overview";

const MAP = {
  green: { label: "Saudável", tone: "success" },
  yellow: { label: "Atenção", tone: "warning" },
  red: { label: "Crítico", tone: "danger" },
} as const;

export function HealthBadge({ health }: { health: Health }) {
  return (
    <Badge tone={MAP[health].tone} dot>
      {MAP[health].label}
    </Badge>
  );
}
