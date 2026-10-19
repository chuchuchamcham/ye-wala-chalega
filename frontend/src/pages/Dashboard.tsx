import { Activity, Car, ChevronRight, Radar, Radio, ScanFace, ShieldCheck, Siren, Video } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { cancelJob } from "../api/jobs";
import { Globe, type GlobeMarker } from "../components/dashboard/Globe";
import { PageBody, PageHeader } from "../components/layout/AppLayout";
import { Panel } from "../components/common/Panel";
import { ErrorState } from "../components/common/States";
import { JobStatusBadge, StatusBadge } from "../components/common/StatusBadge";
import { ProgressPanel } from "../components/jobs/ProgressPanel";
import { useDashboardData } from "../hooks/useDashboardData";
import { hourlyBuckets, threatIndex, useOpsPicture } from "../hooks/useOpsPicture";
import { eventMeta } from "../lib/eventMeta";
import { SITE_LOCATION } from "../lib/site";

function useNow(intervalMs = 5000) {
  const [now, setNow] = useState(() => Date.now() / 1000);
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now() / 1000), intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs]);
  return now;
}

function ago(seconds: number): string {
  if (seconds < 60) return `${Math.max(0, Math.round(seconds))}s ago`;
  if (seconds < 3600) return `${Math.round(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.round(seconds / 3600)}h ago`;
  return `${Math.round(seconds / 86400)}d ago`;
}

const SEVERITY_TONE: Record<string, string> = {
  CRITICAL: "bg-accent-red",
  HIGH: "bg-accent-red/80",
  MEDIUM: "bg-accent-amber",
  LOW: "bg-accent-blue",
  INFO: "bg-text-tertiary",
};

export function Dashboard() {
  const { error, jobs, metrics, activeJob, refetch } = useDashboardData();
  const { cameras, events, connected } = useOpsPicture();
  const navigate = useNavigate();
  const [cancelling, setCancelling] = useState(false);
  const now = useNow();

  const online = cameras.filter((c) => c.state === "online").length;
  const day = useMemo(() => events.filter((e) => now - e.wall_time < 86400), [events, now]);
  const alarms24 = day.filter((e) => e.alarm).length;
  const buckets = useMemo(() => hourlyBuckets(events, now), [events, now]);
  const index = useMemo(() => threatIndex(events, now), [events, now]);
  const lastAlarm = events.find((e) => e.alarm);
  const hot = !!lastAlarm && now - lastAlarm.wall_time < 300;

  const breakdown = useMemo(() => {
    const counts = new Map<string, number>();
    for (const e of day) counts.set(e.type, (counts.get(e.type) ?? 0) + 1);
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
  }, [day]);

  const markers: GlobeMarker[] = useMemo(() => {
    const ring = cameras.map((_, i) => {
      const a = (i / Math.max(1, cameras.length)) * Math.PI * 2;
      return { location: [SITE_LOCATION[0] + Math.sin(a) * 1.2, SITE_LOCATION[1] + Math.cos(a) * 1.2] as [number, number], size: 0.03 };
    });
    return [{ location: SITE_LOCATION, size: hot ? 0.11 : 0.08 }, ...ring];
  }, [cameras, hot]);

  async function handleCancelActive() {
    if (!activeJob) return;
    setCancelling(true);
    try {
      await cancelJob(activeJob.job_id);
      refetch();
    } finally {
      setCancelling(false);
    }
  }

  const site = cameras.find((c) => c.location)?.location ?? "Primary site";

  return (
    <>
      <PageHeader
        title="Overview"
        subtitle="Command center for every camera, job and alert"
        actions={
          <>
            <StatusBadge label={connected ? "Feed live" : "Feed offline"} severity={connected ? "green" : "amber"} pulse={connected} />
            <button
              onClick={() => navigate("/analysis")}
              className="rounded-lg bg-accent-blue px-4 py-2 text-[12.5px] font-semibold text-on-accent shadow-[0_0_20px_-6px_var(--color-accent-blue)] hover:bg-accent-hover"
            >
              New analysis
            </button>
          </>
        }
      />
      <PageBody>
        {error && <ErrorState message={error} onRetry={refetch} />}

        <div className="grid grid-cols-[300px_minmax(0,1fr)_320px] gap-5 max-[1400px]:grid-cols-[minmax(0,1fr)_300px] max-[1000px]:grid-cols-1">
          {/* Centre: the globe hero */}
          <section className="surface relative col-start-2 row-start-1 overflow-hidden rounded-2xl border border-border-1 max-[1400px]:col-start-1 max-[1000px]:row-start-auto">
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_55%,rgba(45,212,191,0.14),transparent_55%)]" />
            <div className="relative flex items-start justify-between gap-4 p-6 pb-0">
              <div>
                <div className="text-[11px] font-medium uppercase tracking-[0.14em] text-accent-blue">Security operations center</div>
                <h2 className="mt-1 text-[22px] font-semibold tracking-tight text-text-primary">{site}</h2>
                <p className="mt-0.5 text-[12.5px] text-text-tertiary">
                  {cameras.length ? `${online} of ${cameras.length} cameras online` : "No cameras connected yet"}
                </p>
              </div>
              <button
                onClick={() => navigate("/live")}
                className="flex items-center gap-2 rounded-lg border border-border-2 bg-bg-2/70 px-3 py-1.5 text-[12px] text-text-secondary hover:text-text-primary"
              >
                <Radio size={14} /> Live monitor
              </button>
            </div>

            <div className="relative mx-auto -mt-2 w-full max-w-[560px] px-6">
              <Globe markers={markers} focus={SITE_LOCATION} alarm={hot} />

              <FloatTag className="left-2 top-[22%]" label="Last alarm" value={lastAlarm ? ago(now - lastAlarm.wall_time) : "None"} tone={hot ? "red" : "muted"} />
              <FloatTag className="bottom-[30%] right-2" label="Threat index" value={String(index)} tone={index >= 60 ? "red" : index >= 25 ? "amber" : "teal"} />
              <FloatTag className="bottom-[16%] left-6" label="Events in 24h" value={day.length.toLocaleString()} tone="teal" />
            </div>

            <div className="relative grid grid-cols-4 divide-x divide-border-1 border-t border-border-1 bg-bg-1/40 max-[700px]:grid-cols-2">
              <HeroStat label="Cameras online" value={`${online}/${cameras.length}`} />
              <HeroStat label="Alarms, 24h" value={alarms24} tone={alarms24 ? "text-accent-red" : undefined} />
              <HeroStat label="Videos analysed" value={metrics.videosAnalyzed} />
              <HeroStat label="Plates read" value={metrics.platesRead} />
            </div>
          </section>

          {/* Left column */}
          <div className="col-start-1 row-start-1 flex flex-col gap-5 max-[1400px]:row-start-2 max-[1000px]:row-start-auto">
            <Panel title="Threat activity" meta="Last 24 hours">
              <ActivityChart buckets={buckets} />
              <div className="mt-3 flex items-center gap-4 text-[11px] text-text-tertiary">
                <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-sm bg-accent-blue/70" />Events</span>
                <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-sm bg-accent-red" />Alarms</span>
              </div>
            </Panel>
            <div className="grid grid-cols-2 gap-3">
              <MiniStat icon={ScanFace} label="Targets" value={metrics.targetsIdentified} tone={metrics.targetsIdentified ? "text-accent-red" : undefined} />
              <MiniStat icon={Car} label="Vehicles" value={metrics.vehiclesDetected} />
              <MiniStat icon={Radar} label="Plates" value={metrics.platesRead} />
              <MiniStat icon={Activity} label="Forensic events" value={metrics.securityEvents} tone={metrics.securityEvents ? "text-accent-amber" : undefined} />
            </div>
          </div>

          {/* Right column */}
          <div className="col-start-3 row-start-1 flex flex-col gap-5 max-[1400px]:col-start-2 max-[1400px]:row-span-2 max-[1000px]:col-start-1 max-[1000px]:row-span-1 max-[1000px]:row-start-auto">
            <Panel title="Threat index" meta="Last hour">
              <Gauge value={index} />
              {breakdown.length > 0 && (
                <div className="mt-4 flex flex-col gap-2.5 border-t border-border-1 pt-4">
                  {breakdown.map(([type, n]) => (
                    <div key={type}>
                      <div className="mb-1 flex justify-between text-[11.5px]">
                        <span className="truncate text-text-secondary">{eventMeta(type).label}</span>
                        <span className="tabular-nums text-text-primary">{n}</span>
                      </div>
                      <div className="h-1 overflow-hidden rounded-full bg-bg-4">
                        <div className="h-full rounded-full bg-accent-blue" style={{ width: `${(n / breakdown[0][1]) * 100}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Panel>

            <Panel title="Live alerts" meta={day.length ? `${day.length} today` : undefined} tight>
              {events.length === 0 ? (
                <div className="flex flex-col items-center gap-2 py-8 text-center text-[12.5px] text-text-tertiary">
                  <ShieldCheck size={20} className="text-accent-green" /> All quiet. No live events yet.
                </div>
              ) : (
                <div className="flex max-h-[420px] flex-col overflow-y-auto">
                  {events.slice(0, 12).map((e, i) => {
                    const meta = eventMeta(e.type);
                    const Icon = e.alarm ? Siren : meta.icon;
                    return (
                      <button
                        key={e.event_id ?? i}
                        onClick={() => navigate("/live")}
                        className="group flex items-center gap-3 rounded-lg px-2 py-2 text-left hover:bg-bg-3/70"
                      >
                        <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-md ${e.alarm ? "bg-accent-red/15 text-accent-red" : "bg-bg-4 text-text-secondary"}`}>
                          <Icon size={14} />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[12.5px] text-text-primary">{meta.label}</span>
                          <span className="block truncate text-[11px] text-text-tertiary">{e.camera_name} · {ago(now - e.wall_time)}</span>
                        </span>
                        <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${SEVERITY_TONE[e.severity] ?? "bg-text-tertiary"}`} />
                      </button>
                    );
                  })}
                </div>
              )}
            </Panel>
          </div>
        </div>

        {/* Forensic work below the live picture */}
        <div className="mt-5 grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-5 max-[1000px]:grid-cols-1">
          <Panel title={activeJob ? "Active analysis" : "Forensic analysis"} meta={activeJob ? undefined : "Nothing processing"}>
            {activeJob ? (
              <ProgressPanel job={activeJob} onCancel={handleCancelActive} cancelling={cancelling} onView={() => navigate(`/results/${activeJob.job_id}`)} />
            ) : (
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 text-[12.5px] text-text-tertiary">
                  <Video size={18} className="text-accent-blue" />
                  Upload recorded footage to search it for targets, plates and intrusions.
                </div>
                <button onClick={() => navigate("/analysis")} className="shrink-0 rounded-lg border border-border-2 px-3 py-1.5 text-[12px] text-text-secondary hover:bg-bg-3 hover:text-text-primary">
                  Upload footage
                </button>
              </div>
            )}
          </Panel>

          <Panel title="Recent analyses" meta={jobs.length ? `${jobs.length} total` : undefined} tight>
            {jobs.length === 0 ? (
              <div className="py-6 text-center text-[12.5px] text-text-tertiary">No analyses yet</div>
            ) : (
              <div className="flex flex-col">
                {jobs.slice(0, 5).map((job) => (
                  <button
                    key={job.job_id}
                    onClick={() => navigate(job.status === "done" ? `/results/${job.job_id}` : `/processing/${job.job_id}`)}
                    className="flex items-center justify-between gap-3 rounded-lg px-2 py-2 text-left hover:bg-bg-3/70"
                  >
                    <div className="min-w-0">
                      <div className="font-mono text-[12px] text-text-primary">Job {job.job_id.slice(0, 8)}</div>
                      <div className="truncate text-[11px] text-text-tertiary">{job.summary?.modules_run?.join(" · ") || job.kind}</div>
                    </div>
                    <div className="flex items-center gap-2">
                      <JobStatusBadge status={job.status} />
                      <ChevronRight size={14} className="text-text-tertiary" />
                    </div>
                  </button>
                ))}
              </div>
            )}
          </Panel>
        </div>
      </PageBody>
    </>
  );
}

function FloatTag({ className, label, value, tone }: { className: string; label: string; value: string; tone: "red" | "amber" | "teal" | "muted" }) {
  const color = { red: "text-accent-red", amber: "text-accent-amber", teal: "text-accent-blue", muted: "text-text-secondary" }[tone];
  return (
    <div className={`absolute rounded-lg border border-border-2 bg-bg-1/75 px-3 py-2 backdrop-blur-md ${className}`}>
      <div className="text-[10.5px] uppercase tracking-[0.1em] text-text-tertiary">{label}</div>
      <div className={`mt-0.5 font-mono text-[15px] font-medium ${color}`}>{value}</div>
    </div>
  );
}

function HeroStat({ label, value, tone }: { label: string; value: string | number; tone?: string }) {
  return (
    <div className="px-5 py-4">
      <div className="text-[11px] text-text-tertiary">{label}</div>
      <div className={`mt-1 tabular-nums text-[22px] font-semibold tracking-tight ${tone ?? "text-text-primary"}`}>
        {typeof value === "number" ? value.toLocaleString() : value}
      </div>
    </div>
  );
}

function MiniStat({ icon: Icon, label, value, tone }: { icon: typeof Video; label: string; value: number; tone?: string }) {
  return (
    <div className="surface rounded-xl border border-border-1 px-4 py-3">
      <div className="flex items-center gap-1.5 text-[11px] text-text-tertiary">
        <Icon size={12} className="text-accent-blue/80" /> {label}
      </div>
      <div className={`mt-1.5 tabular-nums text-[22px] font-semibold tracking-tight ${tone ?? "text-text-primary"}`}>{value.toLocaleString()}</div>
    </div>
  );
}

function ActivityChart({ buckets }: { buckets: { total: number; alarms: number }[] }) {
  const max = Math.max(1, ...buckets.map((b) => b.total));
  const total = buckets.reduce((a, b) => a + b.total, 0);
  return (
    <div>
      <div className="mb-3 flex items-baseline gap-2">
        <span className="tabular-nums text-[26px] font-semibold tracking-tight text-text-primary">{total.toLocaleString()}</span>
        <span className="text-[11.5px] text-text-tertiary">live events</span>
      </div>
      <div className="flex h-[96px] items-end gap-[3px]">
        {buckets.map((b, i) => (
          <div key={i} className="relative flex h-full flex-1 flex-col justify-end" title={`${b.total} events, ${b.alarms} alarms`}>
            <div className="w-full rounded-t-[2px] bg-accent-blue/60" style={{ height: `${(b.total / max) * 100}%`, minHeight: b.total ? 2 : 1, opacity: b.total ? 1 : 0.25 }} />
            {b.alarms > 0 && <div className="absolute bottom-0 w-full rounded-t-[2px] bg-accent-red" style={{ height: `${(b.alarms / max) * 100}%`, minHeight: 2 }} />}
          </div>
        ))}
      </div>
      <div className="mt-1.5 flex justify-between font-mono text-[10px] text-text-disabled">
        <span>-24h</span><span>-12h</span><span>now</span>
      </div>
    </div>
  );
}

function Gauge({ value }: { value: number }) {
  const r = 70;
  const c = Math.PI * r;
  const tone = value >= 60 ? "var(--color-accent-red)" : value >= 25 ? "var(--color-accent-amber)" : "var(--color-accent-blue)";
  const label = value >= 60 ? "High" : value >= 25 ? "Elevated" : "Low";
  return (
    <div className="relative mx-auto w-[200px]">
      <svg viewBox="0 0 180 100" className="w-full">
        <path d="M 20 90 A 70 70 0 0 1 160 90" fill="none" stroke="var(--color-bg-4)" strokeWidth="10" strokeLinecap="round" />
        <path
          d="M 20 90 A 70 70 0 0 1 160 90"
          fill="none"
          stroke={tone}
          strokeWidth="10"
          strokeLinecap="round"
          strokeDasharray={`${(value / 100) * c} ${c}`}
          style={{ filter: `drop-shadow(0 0 6px ${tone})`, transition: "stroke-dasharray 600ms ease" }}
        />
      </svg>
      <div className="absolute inset-x-0 bottom-0 text-center">
        <div className="tabular-nums text-[30px] font-semibold leading-none tracking-tight text-text-primary">{value}</div>
        <div className="mt-1 text-[11.5px]" style={{ color: tone }}>{label}</div>
      </div>
    </div>
  );
}
