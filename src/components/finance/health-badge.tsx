import { Badge } from "@/components/ui/badge";
import type { Health } from "@/lib/health";

const MAP = {
  green: { label: "Saudável", tone: "success" },
  yellow: { label: "Atenção", tone: "warning" },
  red: { label: "Crítico", tone: "danger" },
} as const;

/** `compactOnMobile`: em telas pequenas mostra só a bolinha (o texto continua para leitores de tela). */
export function HealthBadge({ health, compactOnMobile }: { health: Health; compactOnMobile?: boolean }) {
  return (
    <Badge tone={MAP[health].tone} dot>
      {compactOnMobile ? <span className="sr-only sm:not-sr-only">{MAP[health].label}</span> : MAP[health].label}
    </Badge>
  );
}
