import type { ReactNode } from "react";
import { authApi, type SessionUser } from "../../api/auth";
import { Sidebar } from "./Sidebar";

export function AppLayout({
  children,
  user,
  onSignedOut,
}: {
  children: ReactNode;
  user?: SessionUser | null;
  onSignedOut?: () => void;
}) {
  return (
    <div className="flex min-h-screen">
      <Sidebar user={user} onSignedOut={onSignedOut} />
      <div className="flex min-w-0 flex-1 flex-col">{children}</div>
    </div>
  );
}

/** Who is signed in, and how to stop being signed in. */
export function SessionFooter({
  user,
  onSignedOut,
}: {
  user?: SessionUser | null;
  onSignedOut?: () => void;
}) {
  if (!user) return null;
  return (
    <div className="border-t border-border-1 px-1 pt-3">
      <div className="truncate text-[12px] font-semibold text-text-primary">{user.username}</div>
      <div className="mb-2 text-[11px] capitalize text-text-tertiary">{user.role}</div>
      <button
        onClick={() => {
          void authApi.logout().finally(() => onSignedOut?.());
        }}
        className="w-full rounded-lg border border-border-2 py-1.5 text-[12px] text-text-secondary hover:bg-bg-3 hover:text-text-primary"
      >
        Sign out
      </button>
    </div>
  );
}

export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}) {
  return (
    <header className="sticky top-0 z-10 flex h-[68px] shrink-0 items-center justify-between border-b border-border-1 bg-bg-1/90 px-6 backdrop-blur-md">
      <div className="flex flex-col gap-0.5">
        <h1 className="text-[18px] font-semibold tracking-tight text-text-primary">{title}</h1>
        {subtitle && <p className="text-[12px] text-text-tertiary">{subtitle}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </header>
  );
}

export function PageBody({ children, narrow }: { children: ReactNode; narrow?: boolean }) {
  return <div className={`flex-1 p-6 max-[1366px]:p-5 ${narrow ? "max-w-[1040px]" : ""}`}>{children}</div>;
}
