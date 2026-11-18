import type { ReactNode } from "react";

export function AuthCard({
  title,
  description,
  icon,
  children,
  footer,
}: {
  title: string;
  description?: ReactNode;
  icon?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <div className="rounded-2xl border bg-card p-6 shadow-sm sm:p-8">
      <div className="mb-6 grid gap-1.5">
        {icon && (
          <span className="mb-2 inline-flex size-10 items-center justify-center rounded-xl bg-accent text-accent-foreground [&_svg]:size-5">
            {icon}
          </span>
        )}
        <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
        {description && <p className="text-sm text-muted-foreground">{description}</p>}
      </div>
      {children}
      {footer && <div className="mt-6 border-t pt-4 text-center text-sm text-muted-foreground">{footer}</div>}
    </div>
  );
}
