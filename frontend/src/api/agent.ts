import { api } from "./client";

export type ModelKind = "claude" | "cloud" | "local" | "template";

export interface AgentStatus {
  enabled: boolean;
  /** In the order briefs try them; a rules-based brief follows if all fail. */
  models: { name: string; kind: ModelKind }[];
  message: string | null;
}

export interface IncidentEvent {
  time?: string;
  camera?: string;
  type?: string;
  severity?: string;
  reason?: string;
  track_id?: number;
  zone?: string;
  has_evidence?: boolean;
}

export interface Brief {
  brief_id: string;
  incident_id: string;
  camera_id: string;
  camera_name: string;
  /** "template": no AI model answered, so it was written from rules; `note` says why. */
  status: "ready" | "template";
  text: string;
  model: string;
  model_kind: ModelKind;
  note: string | null;
  created_at: number;
  incident: {
    started?: string;
    highest_severity?: string;
    events?: IncidentEvent[];
  };
  proposal_ids: string[];
}

export type ProposalStatus = "pending" | "approved" | "rejected";

export interface Proposal {
  proposal_id: string;
  action: string;
  camera_id: string | null;
  reason: string;
  model: string;
  source: "incident" | "copilot";
  incident_id: string | null;
  status: ProposalStatus;
  created_at: number;
  decided_by: string | null;
  decided_at: number | null;
}

export interface CopilotReply {
  answer: string;
  model: string;
  model_kind: ModelKind;
  proposals: Proposal[];
}

export interface Pattern {
  kind: "plate" | "hour";
  key: string;
  summary: string;
  sightings: number;
  days: number;
  cameras: string[];
  first_seen: number;
  last_seen: number;
}

export const agentApi = {
  patterns: () => api.get<Pattern[]>("/api/agent/patterns"),
  status: () => api.get<AgentStatus>("/api/agent/status"),
  briefs: () => api.get<Brief[]>("/api/agent/briefs"),
  proposals: () => api.get<Proposal[]>("/api/agent/proposals"),
  ask: (question: string) => api.post<CopilotReply>("/api/agent/ask", { question }),
  approve: (id: string) => api.post<Proposal>(`/api/agent/proposals/${encodeURIComponent(id)}/approve`),
  reject: (id: string) => api.post<Proposal>(`/api/agent/proposals/${encodeURIComponent(id)}/reject`),
};
