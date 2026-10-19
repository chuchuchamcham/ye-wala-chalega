import {
  Activity, Bot, Car, Eye, LayoutDashboard, ListChecks, Map as MapIcon, Moon, Radio, RadioTower, Scan, ScanSearch, ScrollText,
  Search, Server, Settings, ShieldAlert, Siren, Smartphone, Users,
} from "lucide-react";
import { NavLink } from "react-router-dom";
import type { SessionUser } from "../../api/auth";
import { SessionFooter } from "./AppLayout";

// Live Monitor leads: continuous camera monitoring is the primary workflow.
// The upload-and-wait flow is still fully supported, but it is a forensic
// tool for footage after the fact, and the naming now says so.
const primaryLinks = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard, end: true },
  { to: "/live", label: "Live Monitor", icon: Radio },
  { to: "/map", label: "Site Map", icon: MapIcon },
  { to: "/sensors", label: "Sensors", icon: RadioTower },
  { to: "/analyst", label: "AI Analyst", icon: Bot },
  { to: "/devices", label: "Connect Device", icon: Smartphone },
  { to: "/analysis", label: "Forensic Analysis", icon: Scan },
  { to: "/jobs", label: "Jobs", icon: ListChecks },
  { to: "/events", label: "Events", icon: Activity },
  { to: "/audit", label: "Audit Log", icon: ScrollText },
  { to: "/anpr-search", label: "ANPR Search", icon: Search },
  { to: "/appearance-search", label: "Appearance Search", icon: ScanSearch },
];

// These all deep-link into the Analysis page's module selection (via
// ?open=<key>) rather than separate pages - "Human Detection" and "Vehicle
// Detection" have no standalone backend endpoint of their own (person/vehicle
// detection is the shared tracker every module already uses under the
// hood), so routing them to a fake dedicated page would misrepresent what
// the backend actually offers. The Analysis page surfaces a note for those
// two explaining that instead of pretending they're independent modules.
const moduleLinks = [
  { to: "/analysis?open=person_id", label: "Target Person ID", icon: Eye },
  { to: "/analysis?open=human_detection", label: "Human Detection", icon: Users },
  { to: "/analysis?open=vehicle_detection", label: "Vehicle Detection", icon: Car },
  { to: "/analysis?open=anpr", label: "ANPR / Plate OCR", icon: Search },
  { to: "/analysis?open=zone", label: "Zone Intrusion", icon: ShieldAlert },
  { to: "/analysis?open=behavior", label: "Behavioral Analytics", icon: Activity },
  { to: "/analysis?open=lowlight", label: "Low-Light Enhancement", icon: Moon },
];

const systemLinks = [
  { to: "/system", label: "System Status", icon: Server },
  { to: "/settings", label: "Settings", icon: Settings },
];

// Served by the backend, not this app: the siren runs on a separate device at
// the post and must not depend on the dashboard being built or open.
const SIREN_URL = "/api/live/siren";

function NavGroup({ links }: { links: typeof primaryLinks }) {
  return (
    <nav className="flex flex-col gap-px px-3">
      {links.map(({ to, label, icon: Icon, end }) => (
        <NavLink
          key={to}
          to={to}
          end={end}
          className={({ isActive }) =>
            `group relative flex items-center gap-3 rounded-lg px-3 py-[8px] text-[13px] transition-colors ${
              isActive
                ? "bg-accent-blue/[0.09] text-text-primary shadow-[inset_0_0_0_1px_rgba(45,212,191,0.18)] before:absolute before:-left-3 before:top-1/2 before:h-5 before:w-[3px] before:-translate-y-1/2 before:rounded-r before:bg-accent-blue before:shadow-[0_0_10px_var(--color-accent-blue)] [&>svg]:text-accent-blue"
                : "text-text-secondary hover:bg-bg-3/70 hover:text-text-primary"
            }`
          }
        >
          <Icon size={16} strokeWidth={1.75} className="shrink-0" />
          <span className="truncate">{label}</span>
        </NavLink>
      ))}
    </nav>
  );
}

export function Sidebar({ user, onSignedOut }: { user?: SessionUser | null; onSignedOut?: () => void }) {
  return (
    <aside className="sticky top-0 h-screen w-[248px] shrink-0 overflow-y-auto border-r border-border-1 bg-bg-0/80 py-5 backdrop-blur max-[1366px]:w-[220px]">
      <div className="mb-5 flex items-center gap-3 px-5">
        <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-accent-blue/30 bg-accent-blue/10 shadow-[0_0_18px_-4px_var(--color-accent-blue)]">
          <Eye size={18} strokeWidth={1.75} className="text-accent-blue" />
        </div>
        <div className="min-w-0">
          <div className="text-[15px] font-semibold tracking-[0.08em] text-text-primary">DRISHTI</div>
          <div className="truncate text-[11px] text-text-tertiary">Video intelligence</div>
        </div>
      </div>

      <NavGroup links={primaryLinks} />

      <div className="px-6 pb-1.5 pt-5 text-[10.5px] font-medium uppercase tracking-[0.12em] text-text-tertiary">Analysis modules</div>
      <NavGroup links={moduleLinks} />

      <div className="px-6 pb-1.5 pt-5 text-[10.5px] font-medium uppercase tracking-[0.12em] text-text-tertiary">System</div>
      <NavGroup links={systemLinks} />

      <div className="px-3 pt-1">
        <a
          href={SIREN_URL}
          target="_blank"
          rel="noreferrer"
          className="flex items-center gap-3 rounded-lg px-3 py-[8px] text-[13px] text-text-secondary hover:bg-bg-3/70 hover:text-text-primary"
        >
          <Siren size={16} strokeWidth={1.75} className="shrink-0" />
          <span className="truncate">Siren Panel</span>
        </a>
      </div>

      <div className="mx-5 mt-5 flex items-center gap-2 rounded-lg border border-border-1 bg-bg-2/60 px-3 py-2 text-[11.5px] text-text-secondary">
        <span className="relative flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent-green opacity-50" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-accent-green" />
        </span>
        System online
      </div>

      <SessionFooter user={user} onSignedOut={onSignedOut} />
    </aside>
  );
}
