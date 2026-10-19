import {
  Activity, Bot, Car, ChevronsLeft, ChevronsRight, Eye, LayoutDashboard, ListChecks, Map as MapIcon, Moon, Radio, RadioTower, Scan, ScanSearch, ScrollText,
  Search, Server, Settings, ShieldAlert, Siren, Smartphone, Users,
} from "lucide-react";
import { useState, type MouseEvent } from "react";
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

function NavItem({ to, label, icon: Icon, end, expanded }: (typeof primaryLinks)[number] & { expanded: boolean }) {
  return (
    <NavLink
      to={to}
      end={end}
      data-tip={label}
      className={({ isActive }) =>
        `relative flex h-10 shrink-0 items-center gap-3 rounded-lg text-[13px] transition-colors ${expanded ? "px-3" : "w-10 justify-center"} ${
          isActive ? "bg-bg-3 text-text-primary" : "text-text-tertiary hover:bg-bg-3/60 hover:text-text-primary"
        }`
      }
    >
      <Icon size={18} strokeWidth={1.75} className="shrink-0" />
      {expanded && <span className="truncate">{label}</span>}
    </NavLink>
  );
}

const EXPANDED_KEY = "drishti.nav.expanded";

function readExpanded(): boolean {
  try {
    return localStorage.getItem(EXPANDED_KEY) === "1";
  } catch {
    return false;
  }
}

/** Icon rail by default, so the map and cameras get the width. Expanding it
 * shows labels and the per-module shortcuts into Forensic Analysis. */
export function Sidebar({ user, onSignedOut }: { user?: SessionUser | null; onSignedOut?: () => void }) {
  const [expanded, setExpanded] = useState(readExpanded);

  function toggle() {
    setExpanded((v) => {
      try {
        localStorage.setItem(EXPANDED_KEY, v ? "0" : "1");
      } catch {
        /* preference only */
      }
      return !v;
    });
  }

  const Toggle = expanded ? ChevronsLeft : ChevronsRight;

  // One fixed-position label for the collapsed rail: the rail scrolls on
  // short screens, which would clip a label positioned inside it.
  const [tip, setTip] = useState<{ text: string; top: number } | null>(null);
  function hover(e: MouseEvent<HTMLElement>) {
    if (expanded) return;
    const el = (e.target as HTMLElement).closest<HTMLElement>("[data-tip]");
    if (!el) return setTip(null);
    const box = el.getBoundingClientRect();
    setTip({ text: el.dataset.tip ?? "", top: box.top + box.height / 2 });
  }

  return (
    <aside
      onMouseOver={hover}
      onMouseLeave={() => setTip(null)}
      onScroll={() => setTip(null)}
      className={`sticky top-0 flex h-screen shrink-0 flex-col overflow-y-auto border-r border-border-1 bg-bg-0 py-4 [scrollbar-width:none] ${
        expanded ? "w-[232px] px-3" : "w-16 items-center"
      }`}
    >
      {tip && !expanded && (
        <span
          className="pointer-events-none fixed left-[68px] z-50 -translate-y-1/2 whitespace-nowrap rounded-md border border-border-2 bg-bg-3 px-2 py-1 text-[12px] text-text-primary shadow-lg"
          style={{ top: tip.top }}
        >
          {tip.text}
        </span>
      )}
      <div className={`mb-5 flex items-center gap-3 ${expanded ? "px-1" : ""}`}>
        <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-text-primary text-[15px] font-bold text-bg-0">D</div>
        {expanded && (
          <div className="min-w-0">
            <div className="text-[14px] font-semibold text-text-primary">Drishti</div>
            <div className="truncate text-[11px] text-text-tertiary">Video intelligence</div>
          </div>
        )}
      </div>

      <nav className="flex flex-col gap-1">
        {primaryLinks.map((l) => <NavItem key={l.to} {...l} expanded={expanded} />)}
      </nav>

      {expanded && (
        <>
          <div className="px-3 pb-1.5 pt-5 text-[11px] text-text-tertiary">Analysis modules</div>
          <nav className="flex flex-col gap-1">
            {moduleLinks.map((l) => <NavItem key={l.to} {...l} expanded />)}
          </nav>
        </>
      )}

      <div className={`my-3 h-px bg-border-1 ${expanded ? "" : "w-8"}`} />
      <nav className="flex flex-col gap-1">
        {systemLinks.map((l) => <NavItem key={l.to} {...l} expanded={expanded} />)}
        <a
          href={SIREN_URL}
          data-tip="Siren Panel"
          target="_blank"
          rel="noreferrer"
          className={`relative flex h-10 shrink-0 items-center gap-3 rounded-lg text-[13px] text-text-tertiary hover:bg-bg-3/60 hover:text-text-primary ${expanded ? "px-3" : "w-10 justify-center"}`}
        >
          <Siren size={18} strokeWidth={1.75} className="shrink-0" />
          {expanded && <span className="truncate">Siren Panel</span>}
        </a>
      </nav>

      <div className="mt-auto flex flex-col gap-2 pt-4">
        {expanded && <SessionFooter user={user} onSignedOut={onSignedOut} />}
        <button
          onClick={toggle}
          aria-label={expanded ? "Collapse navigation" : "Expand navigation"}
          className={`flex h-9 items-center gap-2 rounded-lg text-[12px] text-text-tertiary hover:bg-bg-3/60 hover:text-text-primary ${expanded ? "px-3" : "w-10 justify-center"}`}
        >
          <Toggle size={16} />
          {expanded && "Collapse"}
        </button>
      </div>
    </aside>
  );
}
