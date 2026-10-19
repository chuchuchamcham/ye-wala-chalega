import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Bot, Check, ChevronDown, ChevronRight, Cloud, CloudOff, FileText, Loader2, Repeat, Send, Sparkles, X } from "lucide-react";
import { Panel } from "../components/common/Panel";
import { EmptyState } from "../components/common/States";
import { agentApi, type AgentStatus, type Brief, type CopilotReply, type ModelKind, type Pattern, type Proposal } from "../api/agent";
import type { SessionUser } from "../api/auth";
import { ApiError } from "../api/client";
import { eventMeta } from "../lib/eventMeta";

const REFRESH_MS = 5000;

// Plain wording for what an agent may ask for. Nothing here runs by itself:
// an operator approves or rejects each one.
const ACTION_LABELS: Record<string, string> = {
  enable_person_id: "Turn on Person ID",
  enable_anpr: "Turn on plate reading",
  review_footage: "Review footage",
  dispatch_patrol: "Send a patrol",
  raise_alert_level: "Raise the alert level",
};

function clock(seconds: number) {
  return new Date(seconds * 1000).toLocaleTimeString([], { hour12: false });
}

function errorText(err: unknown, fallback: string) {
  return err instanceof ApiError || err instanceof Error ? err.message : fallback;
}

const KIND_STYLE: Record<ModelKind, { label: (model: string) => string; className: string; icon: typeof Sparkles }> = {
  claude: { label: () => "Claude", className: "bg-accent-blue/15 text-accent-blue", icon: Sparkles },
  cloud: { label: (m) => `Cloud · ${m.split(":")[0]}`, className: "bg-accent-cyan/15 text-accent-cyan", icon: Cloud },
  local: { label: () => "Local model", className: "bg-accent-amber/15 text-accent-amber", icon: CloudOff },
  template: { label: () => "Rules, no AI", className: "bg-bg-4 text-text-secondary", icon: FileText },
};

/** Which model wrote something: Claude, a hosted cloud model, the local one
 * that keeps working offline, or the rules-based fallback. Shown on every
 * answer so operators know what they are reading. */
function ModelBadge({ model, kind }: { model: string; kind: ModelKind }) {
  const style = KIND_STYLE[kind] ?? KIND_STYLE.cloud;
  const Icon = style.icon;
  return (
    <span className={`inline-flex items-center gap-1 rounded px-1.5 py-[1px] text-[10px] font-semibold ${style.className}`} title={model}>
      <Icon size={10} />
      {style.label(model)}
    </span>
  );
}

/** "Situation:", "Evidence:", "Links:", "Next step:" lines get their label in bold. */
function BriefText({ text }: { text: string }) {
  return (
    <div className="flex flex-col gap-1.5 text-[13px] leading-relaxed text-text-primary">
      {text.split("\n").filter((line) => line.trim()).map((line, i) => {
        const match = line.match(/^(Situation|Evidence|Other cameras|History|Next step):\s*(.*)$/i);
        return match ? (
          <p key={i}>
            <span className="font-semibold text-text-secondary">{match[1]}: </span>
            {match[2]}
          </p>
        ) : (
          <p key={i}>{line}</p>
        );
      })}
    </div>
  );
}

function ProposalRow({
  proposal, canDecide, busy, onDecide,
}: {
  proposal: Proposal;
  canDecide: boolean;
  busy: boolean;
  onDecide: (id: string, approve: boolean) => void;
}) {
  const pending = proposal.status === "pending";
  return (
    <div className="flex items-start justify-between gap-3 rounded border border-border-1 bg-bg-1 px-3 py-2.5">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2 text-[12.5px] font-semibold text-text-primary">
          {ACTION_LABELS[proposal.action] ?? proposal.action}
          {proposal.camera_id && <span className="font-mono text-[11px] text-text-tertiary">{proposal.camera_id}</span>}
          {!pending && (
            <span
              className={`rounded px-1.5 text-[10px] font-bold uppercase ${
                proposal.status === "approved" ? "bg-accent-green/15 text-accent-green" : "bg-bg-4 text-text-tertiary"
              }`}
            >
              {proposal.status}
              {proposal.decided_by ? ` by ${proposal.decided_by}` : ""}
            </span>
          )}
        </div>
        <div className="mt-0.5 text-[12px] text-text-secondary">{proposal.reason}</div>
      </div>
      {pending && canDecide && (
        <div className="flex shrink-0 gap-1.5">
          <button
            onClick={() => onDecide(proposal.proposal_id, true)}
            disabled={busy}
            className="inline-flex items-center gap-1 rounded bg-accent-green/90 px-2.5 py-1.5 text-[11.5px] font-bold text-[#04140a] hover:bg-accent-green disabled:opacity-40"
          >
            <Check size={13} /> Approve
          </button>
          <button
            onClick={() => onDecide(proposal.proposal_id, false)}
            disabled={busy}
            className="inline-flex items-center gap-1 rounded border border-border-2 px-2.5 py-1.5 text-[11.5px] font-semibold text-text-secondary hover:bg-bg-3 hover:text-text-primary disabled:opacity-40"
          >
            <X size={13} /> Reject
          </button>
        </div>
      )}
      {pending && !canDecide && <span className="shrink-0 text-[11px] text-text-tertiary">Awaiting an operator</span>}
    </div>
  );
}

function BriefCard({
  brief, proposals, canDecide, busyId, onDecide,
}: {
  brief: Brief;
  proposals: Proposal[];
  canDecide: boolean;
  busyId: string | null;
  onDecide: (id: string, approve: boolean) => void;
}) {
  const [showEvents, setShowEvents] = useState(false);
  const events = brief.incident.events ?? [];
  const critical = brief.incident.highest_severity === "CRITICAL";
  return (
    <div className={`rounded-[10px] border bg-bg-2 ${critical ? "border-accent-red/40" : "border-border-1"}`}>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border-1 px-4 py-3">
        <div className="flex items-center gap-2">
          <span className={`h-2 w-2 rounded-full ${critical ? "bg-accent-red" : "bg-accent-amber"}`} />
          <span className="text-[13px] font-semibold text-text-primary">{brief.camera_name}</span>
          <span className="font-mono text-[11px] text-text-tertiary">from {brief.incident.started ?? "—"}</span>
        </div>
        <div className="flex items-center gap-2">
          <ModelBadge model={brief.model} kind={brief.model_kind} />
          <span className="font-mono text-[11px] text-text-tertiary">{clock(brief.created_at)}</span>
        </div>
      </div>
      <div className="flex flex-col gap-3 px-4 py-3">
        <BriefText text={brief.text} />
        {brief.status === "template" && brief.note ? (
          <div className="text-[11px] text-text-tertiary">Written from rules. {brief.note}.</div>
        ) : (
          <div className="text-[11px] text-text-tertiary">Situation, Evidence and Other cameras come straight from the event log; the AI decides the Next step.</div>
        )}
        {proposals.length > 0 && (
          <div className="flex flex-col gap-2">
            {proposals.map((p) => (
              <ProposalRow key={p.proposal_id} proposal={p} canDecide={canDecide} busy={busyId === p.proposal_id} onDecide={onDecide} />
            ))}
          </div>
        )}
        <button
          onClick={() => setShowEvents((v) => !v)}
          className="flex items-center gap-1 self-start text-[11.5px] text-text-tertiary hover:text-text-secondary"
        >
          {showEvents ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
          {events.length} event{events.length === 1 ? "" : "s"} in this incident
        </button>
        {showEvents && (
          <ul className="flex flex-col gap-1 border-l border-border-2 pl-3">
            {events.map((e, i) => (
              <li key={i} className="text-[12px] text-text-secondary">
                <span className="font-mono text-text-tertiary">{e.time}</span>{" "}
                <span className="font-semibold text-text-primary">{eventMeta(e.type ?? "").label}</span>
                {e.reason ? ` · ${e.reason}` : ""}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

interface Exchange {
  question: string;
  reply?: CopilotReply;
  error?: string;
}

function Copilot({
  enabled, canAsk, canDecide, busyId, latest, onDecide, onProposals,
}: {
  enabled: boolean;
  canAsk: boolean;
  canDecide: boolean;
  busyId: string | null;
  latest: (p: Proposal) => Proposal;
  onDecide: (id: string, approve: boolean) => void;
  onProposals: () => void;
}) {
  const [question, setQuestion] = useState("");
  const [asking, setAsking] = useState(false);
  const [history, setHistory] = useState<Exchange[]>([]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const q = question.trim();
    if (!q || asking) return;
    setAsking(true);
    setQuestion("");
    setHistory((h) => [...h, { question: q }]);
    try {
      const reply = await agentApi.ask(q);
      setHistory((h) => h.map((x, i) => (i === h.length - 1 ? { ...x, reply } : x)));
      if (reply.proposals.length) onProposals();
    } catch (err) {
      setHistory((h) => h.map((x, i) => (i === h.length - 1 ? { ...x, error: errorText(err, "The Copilot could not answer.") } : x)));
    } finally {
      setAsking(false);
    }
  }

  return (
    <Panel title="Ask the Copilot" meta="Answers from your cameras' events">
      <div className="flex flex-col gap-3">
        {history.length === 0 && (
          <div className="text-[12.5px] text-text-tertiary">
            For example: "Did plate TEST123 appear today?" or "What happened on CAMERA 01 in the last hour?"
          </div>
        )}
        <div className="flex max-h-[45vh] flex-col gap-3 overflow-y-auto">
          {history.map((x, i) => (
            <div key={i} className="flex flex-col gap-1.5">
              <div className="self-end rounded bg-accent-blue/15 px-3 py-2 text-[12.5px] text-text-primary">{x.question}</div>
              {x.reply && (
                <div className="flex flex-col gap-2 rounded border border-border-1 bg-bg-1 px-3 py-2">
                  <div className="whitespace-pre-wrap text-[12.5px] leading-relaxed text-text-primary">{x.reply.answer}</div>
                  <ModelBadge model={x.reply.model} kind={x.reply.model_kind} />
                  {x.reply.proposals.map((p) => (
                    <ProposalRow key={p.proposal_id} proposal={latest(p)} canDecide={canDecide} busy={busyId === p.proposal_id} onDecide={onDecide} />
                  ))}
                </div>
              )}
              {x.error && <div className="text-[12px] text-accent-red">{x.error}</div>}
              {!x.reply && !x.error && (
                <div className="flex items-center gap-2 text-[12px] text-text-tertiary">
                  <Loader2 size={13} className="animate-spin" /> Checking events…
                </div>
              )}
            </div>
          ))}
        </div>
        <form onSubmit={(e) => void submit(e)} className="flex gap-2">
          <input
            id="copilot-question"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            disabled={!enabled || !canAsk || asking}
            maxLength={1000}
            placeholder={!enabled ? "The AI analyst is off" : canAsk ? "Ask about cameras and events…" : "Only operators can ask"}
            className="min-w-0 flex-1 rounded border border-border-2 bg-bg-3 px-3 py-2 text-[13px] text-text-primary placeholder:text-text-disabled focus:border-accent-blue focus:outline-none disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={!enabled || !canAsk || asking || !question.trim()}
            className="inline-flex items-center gap-1.5 rounded bg-accent-blue px-4 py-2 text-[12.5px] font-bold text-[#051020] hover:bg-[#59aeff] disabled:opacity-40"
          >
            {asking ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />} Ask
          </button>
        </form>
      </div>
    </Panel>
  );
}

export function Analyst({ user }: { user?: SessionUser | null }) {
  const [status, setStatus] = useState<AgentStatus | null>(null);
  const [briefs, setBriefs] = useState<Brief[]>([]);
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [patterns, setPatterns] = useState<Pattern[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  // Matches the API: auditors read the record, operators and admins act.
  const canAct = user?.role === "ADMIN" || user?.role === "OPERATOR";

  const load = useCallback(async () => {
    try {
      const [s, b, p, pat] = await Promise.all([agentApi.status(), agentApi.briefs(), agentApi.proposals(), agentApi.patterns()]);
      setStatus(s);
      setBriefs(b);
      setProposals(p);
      setPatterns(pat);
      setError(null);
    } catch (err) {
      setError(errorText(err, "Could not load the AI analyst."));
    }
  }, []);

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(), REFRESH_MS);
    return () => window.clearInterval(timer);
  }, [load]);

  async function decide(id: string, approve: boolean) {
    setBusyId(id);
    try {
      const updated = approve ? await agentApi.approve(id) : await agentApi.reject(id);
      setProposals((list) => list.map((p) => (p.proposal_id === id ? updated : p)));
    } catch (err) {
      setError(errorText(err, "Could not record the decision."));
      void load();
    } finally {
      setBusyId(null);
    }
  }

  const byId = new Map(proposals.map((p) => [p.proposal_id, p]));
  const pending = proposals.filter((p) => p.status === "pending");
  const enabled = status?.enabled ?? false;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-text-primary">AI Analyst</h1>
          <p className="mt-1 max-w-[680px] text-[12.5px] text-text-tertiary">
            Turns alarms into short incident briefs and answers questions about your cameras. It never
            controls the siren or cameras: anything it suggests waits for an operator's approval, and
            every step it takes is kept in the Audit Log.
          </p>
        </div>
        {status && (
          <div className="flex items-center gap-2 rounded border border-border-1 bg-bg-2 px-3 py-2 text-[11.5px]">
            <span className={`h-[7px] w-[7px] rounded-full ${enabled ? "bg-accent-green" : "bg-text-disabled"}`} />
            {enabled ? (
              <span className="text-text-secondary" title="Briefs try each model in turn, then fall back to rules">
                On · {status.models.map((m) => <span key={m.name} className="font-mono">{m.name} → </span>)}
                <span className="font-mono">rules</span>
              </span>
            ) : (
              <span className="text-text-secondary">Off</span>
            )}
          </div>
        )}
      </div>

      {error && (
        <div className="rounded border border-accent-red/35 bg-accent-red/10 px-4 py-3 text-[12.5px] text-accent-red">{error}</div>
      )}
      {status && !enabled && (
        <div className="rounded border border-border-2 bg-bg-2 px-4 py-3 text-[12.5px] text-text-secondary">{status.message}</div>
      )}

      <div className="grid grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] gap-4 max-[1100px]:grid-cols-1">
        <Panel title="Incident briefs" meta={briefs.length ? `${briefs.length}` : undefined} tight>
          {briefs.length === 0 ? (
            <EmptyState
              icon={Bot}
              title="No incidents yet"
              description="When an alarm fires, a brief appears here within seconds: what happened, the evidence, and a suggested next step."
            />
          ) : (
            <div className="flex flex-col gap-3">
              {briefs.map((b) => (
                <BriefCard
                  key={b.brief_id}
                  brief={b}
                  proposals={b.proposal_ids.map((id) => byId.get(id)).filter((p): p is Proposal => Boolean(p))}
                  canDecide={canAct}
                  busyId={busyId}
                  onDecide={(id, ok) => void decide(id, ok)}
                />
              ))}
            </div>
          )}
        </Panel>

        <div className="flex flex-col gap-4">
          <Panel title="Patterns" meta="last 7 days">
            {patterns.length === 0 ? (
              <div className="text-[12.5px] text-text-tertiary">
                No repeats yet. A plate read on several days, or alarms on one camera at the same hour on several
                days, shows up here.
              </div>
            ) : (
              <ul className="flex flex-col gap-2">
                {patterns.map((p) => (
                  <li key={`${p.kind}-${p.key}`} className="flex items-start gap-2 text-[12px] text-text-secondary">
                    <Repeat size={13} className="mt-[2px] shrink-0 text-accent-amber" />
                    <span>{p.summary}</span>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
          <Panel title="Waiting for approval" meta={`${pending.length}`}>
            {pending.length === 0 ? (
              <div className="text-[12.5px] text-text-tertiary">Nothing to approve.</div>
            ) : (
              <div className="flex flex-col gap-2">
                {pending.map((p) => (
                  <ProposalRow key={p.proposal_id} proposal={p} canDecide={canAct} busy={busyId === p.proposal_id} onDecide={(id, ok) => void decide(id, ok)} />
                ))}
              </div>
            )}
          </Panel>
          <Copilot
            enabled={enabled}
            canAsk={canAct}
            canDecide={canAct}
            busyId={busyId}
            latest={(p) => byId.get(p.proposal_id) ?? p}
            onDecide={(id, ok) => void decide(id, ok)}
            onProposals={() => void load()}
          />
        </div>
      </div>
    </div>
  );
}
