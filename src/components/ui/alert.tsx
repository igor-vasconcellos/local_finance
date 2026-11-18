import { CircleAlert, CircleCheck, Info, TriangleAlert } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

const TONES = {
  info: { Icon: Info, cls: "border-primary/25 bg-accent text-accent-foreground" },
  success: { Icon: CircleCheck, cls: "border-success/30 bg-success-soft text-foreground [&>svg]:text-success" },
  warning: { Icon: TriangleAlert, cls: "border-warning/35 bg-warning-soft text-foreground [&>svg]:text-warning" },
  danger: { Icon: CircleAlert, cls: "border-danger/30 bg-danger-soft text-foreground [&>svg]:text-danger" },
} as const;

export function Alert({
  tone = "info",
  title,
  children,
  className,
}: {
  tone?: keyof typeof TONES;
  title?: ReactNode;
  children?: ReactNode;
  className?: string;
}) {
  const { Icon, cls } = TONES[tone];
  return (
    <div
      role={tone === "danger" ? "alert" : "status"}
      className={cn("flex items-start gap-3 rounded-lg border p-3 text-sm", cls, className)}
    >
      <Icon className="mt-0.5 size-4 shrink-0" aria-hidden />
      <div className="grid gap-0.5">
        {title && <p className="font-medium">{title}</p>}
        {children && <div className="text-muted-foreground">{children}</div>}
      </div>
    </div>
  );
}
