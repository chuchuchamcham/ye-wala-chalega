import { Map as MapIcon } from "lucide-react";
import { Link } from "react-router-dom";
import type { LiveCamera, LiveEvent } from "../../api/live";
import { mapApi, type SiteMap } from "../../api/map";

// A camera glows red for this long after an alarm-level event (as on Site Map).
const ALARM_GLOW_SEC = 60;

type Tone = "alarm" | "warn" | "off" | "ok";

const TONE: Record<Tone, { dot: string; ring: string }> = {
  alarm: { dot: "bg-accent-red", ring: "border-accent-red/50" },
  warn: { dot: "bg-accent-amber", ring: "border-accent-amber/50" },
  off: { dot: "bg-text-disabled", ring: "border-text-disabled/50" },
  ok: { dot: "bg-accent-blue", ring: "border-accent-blue/50" },
};

function tone(camera: LiveCamera | undefined, alarm: boolean): Tone {
  if (alarm) return "alarm";
  if (!camera || camera.state === "offline" || camera.state === "stopped") return "off";
  if (camera.state !== "online" || camera.degraded) return "warn";
  return "ok";
}

/** Cameras not yet placed on the plan are spread on an ellipse so the map
 * is never empty; the panel says so rather than passing it off as a layout. */
function autoPosition(i: number, n: number): [number, number] {
  const a = (i / Math.max(1, n)) * Math.PI * 2 - Math.PI / 2;
  return [0.5 + Math.cos(a) * 0.32, 0.52 + Math.sin(a) * 0.3];
}

export function OpsMap({ map, cameras, events, now }: { map: SiteMap | null; cameras: LiveCamera[]; events: LiveEvent[]; now: number }) {
  const positions = map?.positions ?? {};
  const unplaced = cameras.filter((c) => !(c.name in positions));
  const alarmed = new Set(
    events.filter((e) => (e.alarm || e.severity === "CRITICAL") && now - e.wall_time <= ALARM_GLOW_SEC).map((e) => e.camera_name),
  );
  const byName = new Map(cameras.map((c) => [c.name, c]));
  const markers: { name: string; at: [number, number] }[] = [
    ...Object.entries(positions).map(([name, at]) => ({ name, at })),
    ...unplaced.map((c, i) => ({ name: c.name, at: autoPosition(i, unplaced.length) })),
  ];
  const reporting = cameras.filter((c) => c.state === "online").length;

  return (
    <div className="relative h-full min-h-[380px] overflow-hidden rounded-xl border border-border-1 bg-[#141a19]">
      {map?.has_image ? (
        <img
          src={mapApi.imageUrl(map.image_version)}
          alt="Site plan"
          className="absolute inset-0 h-full w-full object-cover opacity-55 saturate-[.6]"
          draggable={false}
        />
      ) : (
        <div
          className="absolute inset-0"
          style={{
            backgroundImage:
              "radial-gradient(ellipse at 55% 55%, rgba(91,156,248,0.06), transparent 60%), linear-gradient(#1c2423 1px, transparent 1px), linear-gradient(90deg, #1c2423 1px, transparent 1px)",
            backgroundSize: "100% 100%, 40px 40px, 40px 40px",
          }}
        />
      )}

      <div className="absolute left-4 top-4 z-10 flex items-center gap-3">
        <span className="text-[14px] font-semibold text-text-primary">Live site map</span>
        <span className="flex items-center gap-1.5 text-[11.5px] text-accent-green">
          <span className="h-1.5 w-1.5 rounded-full bg-accent-green" /> {reporting} {reporting === 1 ? "camera" : "cameras"} reporting
        </span>
      </div>

      <div className="absolute left-4 top-12 z-10 rounded-lg border border-border-2 bg-bg-1/85 px-3 py-2.5 text-[11.5px] leading-[1.9] text-text-secondary backdrop-blur">
        {(
          [
            ["bg-accent-blue", "Camera online"],
            ["bg-accent-amber", "Degraded"],
            ["bg-accent-red", "Alarm, last minute"],
            ["bg-text-disabled", "Offline"],
          ] as const
        ).map(([c, l]) => (
          <div key={l} className="flex items-center gap-2">
            <span className={`h-2.5 w-2.5 rounded-full ${c}`} /> {l}
          </div>
        ))}
      </div>

      <Link
        to="/map"
        className="absolute right-4 top-4 z-10 flex items-center gap-1.5 rounded-lg border border-border-2 bg-bg-1/85 px-2.5 py-1.5 text-[12px] text-text-secondary backdrop-blur hover:text-text-primary"
      >
        <MapIcon size={13} /> {map?.has_image ? "Edit map" : "Upload site plan"}
      </Link>

      {markers.map(({ name, at: [x, y] }) => {
        const camera = byName.get(name);
        const t = tone(camera, alarmed.has(name));
        return (
          <div
            key={name}
            className="absolute flex -translate-x-1/2 -translate-y-1/2 flex-col items-center"
            style={{ left: `${x * 100}%`, top: `${y * 100}%` }}
            title={`${name}${camera ? ` · ${camera.state}` : " · not connected"}${camera?.location ? ` · ${camera.location}` : ""}`}
          >
            {t === "alarm" && <span className="absolute top-[-34px] h-24 w-24 rounded-full bg-accent-red/25 blur-xl" />}
            <span className={`relative grid h-7 w-7 place-items-center rounded-full border ${TONE[t].ring}`}>
              <span className={`h-3.5 w-3.5 rounded-full ${TONE[t].dot} ${t === "alarm" ? "animate-pulse" : ""}`} />
            </span>
            <span className="mt-1 whitespace-nowrap text-[12px] font-medium text-text-primary [text-shadow:0_1px_3px_#000]">{name}</span>
          </div>
        );
      })}

      {markers.length === 0 && (
        <div className="absolute inset-0 grid place-items-center text-[12.5px] text-text-tertiary">
          No cameras connected yet. Add one from Live Monitor.
        </div>
      )}

      {unplaced.length > 0 && (
        <div className="absolute bottom-3 left-4 z-10 text-[11px] text-text-tertiary">
          {unplaced.length === cameras.length ? "Auto layout. " : `${unplaced.length} not placed yet, shown in an auto layout. `}
          <Link to="/map" className="text-text-secondary underline-offset-2 hover:underline">Place cameras on the Site Map</Link>
        </div>
      )}
    </div>
  );
}
