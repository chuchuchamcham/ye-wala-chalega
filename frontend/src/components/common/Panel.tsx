import type { ReactNode } from "react";

export function Panel({
  title,
  meta,
  actions,
  children,
  tight,
  className = "",
}: {
  title?: string;
  meta?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  tight?: boolean;
  className?: string;
}) {
  return (
    <div className={`surface rounded-xl border border-border-1 ${className}`}>
      {title && (
        <div className="flex items-center justify-between border-b border-border-1/80 px-5 py-3.5">
          <h2 className="flex items-center gap-2 text-[13px] font-semibold text-text-primary"><span className="h-3 w-[3px] rounded-full bg-accent-blue/80" />{title}</h2>
          <div className="flex items-center gap-2">
            {meta && <span className="text-[11px] text-text-tertiary">{meta}</span>}
            {actions}
          </div>
        </div>
      )}
      <div className={tight ? "p-3" : "p-5"}>{children}</div>
    </div>
  );
}

export function SectionTitle({ children }: { children: ReactNode }) {
  return <div className="mb-3 text-[12.5px] font-bold uppercase tracking-wide text-text-secondary">{children}</div>;
}

export function KeyValueRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-center justify-between border-b border-border-1 py-2 text-[12.5px] last:border-0">
      <span className="text-text-tertiary">{label}</span>
      <span className="font-mono font-semibold text-text-primary">{value}</span>
    </div>
  );
}
