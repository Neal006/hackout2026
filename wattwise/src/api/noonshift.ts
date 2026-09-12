// Client for the Noonshift backend. Types mirror noonshift/models.py (the frozen contract); keep them in sync by hand.

export const API = import.meta.env.VITE_API_URL ?? (import.meta.env.DEV ? '/api' : 'http://localhost:8000');
export const WS_URL = import.meta.env.VITE_WS_URL ?? (import.meta.env.DEV ? `ws://${location.host}/ws` : 'ws://localhost:8000/ws');
export const SITE = 'site-1';

export type Mode = 'live' | 'cached' | 'tariff' | 'deadline' | 'full';
export type SessionStatus = 'pending' | 'charging' | 'done' | 'ended';

export interface SessionOut {
  session_id: number;
  connector_id: string;
  status: SessionStatus;
  plan: { start: string | null; end: string | null; ready_by: string };
  eta: string | null;
  price: { tier: 'green' | 'standard' | 'boost'; usd_per_kwh: number };
  boost: boolean;
}

export interface LiveOut {
  session_id: number;
  status: SessionStatus;
  kw_now: number;
  grid_percentile: number;
  kwh_delivered: number;
  kwh_needed: number;
  saved_usd: number;
  saved_kgco2: number;
}

export interface SignalHour {
  hour: number;
  gco2_per_kwh: number;
  usd_per_kwh: number;
  kind: 'marginal' | 'average';
}

export interface ConnectorMeter {
  connector_id: string;
  session_id: number | null;
  status: 'idle' | 'charging' | 'done';
  kw: number;
  kwh_delivered: number;
  kwh_needed: number;
  departure_at: string | null;
  boost: boolean;
}

export interface MeterMsg {
  type: 'meter';
  sim_time: string;
  mode: Mode;
  site_kw: number;
  building_load_kw: number;
  feed_kw: number;
  connectors: ConnectorMeter[];
}

export interface PlanMsg {
  type: 'plan';
  site_id: string;
  solved_at: string;
  mode: Mode;
  reason: string;
  horizon_start: string;
  slot_minutes: number;
  connectors: { connector_id: string; session_id: number; kw: number[] }[];
  site_kw: number[];
}

export interface EventMsg {
  type: 'event';
  sim_time: string;
  name: 'plug_in' | 'unplug' | 'deadline' | 'boost' | 'dr' | 'demo' | 'mode' | 'day_reset';
  detail: Record<string, unknown>;
}

export type Frame = PlanMsg | MeterMsg | EventMsg;

async function json<T>(r: Response): Promise<T> {
  if (!r.ok) throw new Error(`${r.status} ${await r.text()}`);
  return r.json() as Promise<T>;
}

export const api = {
  createSession: (connector_id: string, departure_at: string, kwh_needed?: number) =>
    fetch(`${API}/sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ connector_id, departure_at, kwh_needed }),
    }).then(json<SessionOut>),
  boost: (sid: number) => fetch(`${API}/sessions/${sid}/boost`, { method: 'POST' }).then(json<SessionOut>),
  live: (sid: number) => fetch(`${API}/sessions/${sid}/live`).then(json<LiveOut>),
  signal: () => fetch(`${API}/grid/signal`).then(json<SignalHour[]>),
};

/** Open /ws and hand every frame to `onFrame`; reconnects until `close()` is called. */
export function connectWs(onFrame: (f: Frame) => void, onOpen?: (open: boolean) => void) {
  let ws: WebSocket | null = null;
  let closed = false;
  let retry: ReturnType<typeof setTimeout> | undefined;
  const open = () => {
    ws = new WebSocket(WS_URL);
    ws.onopen = () => onOpen?.(true);
    ws.onmessage = (m) => onFrame(JSON.parse(m.data) as Frame);
    ws.onclose = () => {
      onOpen?.(false);
      if (!closed) retry = setTimeout(open, 2000);
    };
  };
  open();
  return () => {
    closed = true;
    clearTimeout(retry);
    ws?.close();
  };
}

/** Build an ISO datetime on the sim's current day from an "HH:MM" string. */
export function onSimDay(simTime: string, hhmm: string): string {
  const [h, m] = hhmm.split(':').map(Number);
  const d = new Date(simTime);
  d.setHours(h, m, 0, 0);
  return toLocalIso(d);
}

/** Naive local ISO (no Z): the backend's sim clock is naive local time too. */
export function toLocalIso(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}:00`;
}
