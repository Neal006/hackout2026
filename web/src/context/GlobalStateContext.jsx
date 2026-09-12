import React, { createContext, useContext, useState, useEffect, useMemo, useRef } from 'react';

/*
 * Live state for the ops dashboard, fed by the Noonshift backend:
 *   WS /ws          -> plan | meter | event frames (see noonshift/models.py)
 *   GET /sites/{id}/impact, /sites/{id}/status  -> polled every 5 s
 * The pages keep reading the same `data` shape the mock used; this file derives it from the frames.
 */

const SITE = 'site-1';
const API = import.meta.env.VITE_API_URL ?? (import.meta.env.DEV ? '/api' : 'http://localhost:8000');
const WS_URL = import.meta.env.VITE_WS_URL ?? (import.meta.env.DEV ? `ws://${location.host}/ws` : 'ws://localhost:8000/ws');

// Gantt axis in OpsDashboard runs 06:00 -> 22:00
const AXIS_START_MIN = 6 * 60;
const AXIS_SPAN_MIN = 16 * 60;
const pct = (iso) => {
  if (!iso) return 0;
  const d = new Date(iso);
  return Math.max(0, Math.min(100, ((d.getHours() * 60 + d.getMinutes() - AXIS_START_MIN) / AXIS_SPAN_MIN) * 100));
};
const hhmm = (iso) => (iso ? new Date(iso).toTimeString().slice(0, 5) : '—');
const minutesBetween = (a, b) => Math.round((new Date(b) - new Date(a)) / 60000);

const GlobalStateContext = createContext();

export function GlobalStateProvider({ children }) {
  const [plan, setPlan] = useState(null);
  const [meter, setMeter] = useState(null);
  const [events, setEvents] = useState([]); // newest first, capped
  const [impact, setImpact] = useState(null);
  const [status, setStatus] = useState(null);
  const [sessions, setSessions] = useState({}); // session_id -> row, built from meter frames
  const [ticks, setTicks] = useState(() => Array.from({ length: 24 }, (_, i) => ({ time: i, ev: 0, building: 0 })));
  const [resolved, setResolved] = useState(new Set());
  const [isOptimizing, setIsOptimizing] = useState(false);
  const [connected, setConnected] = useState(false);
  const socketRef = useRef(null);
  const arrivalsRef = useRef({}); // session_id -> HH:MM from its plug_in event; sessions that predate this page show "—"

  // ---- WebSocket: reconnects on close ----
  useEffect(() => {
    let closed = false;
    let retry;
    const open = () => {
      const ws = new WebSocket(WS_URL);
      socketRef.current = ws;
      ws.onopen = () => setConnected(true);
      ws.onclose = () => {
        setConnected(false);
        if (!closed) retry = setTimeout(open, 2000);
      };
      ws.onmessage = (m) => {
        const f = JSON.parse(m.data);
        if (f.type === 'plan') {
          setPlan(f);
          setIsOptimizing(false);
        } else if (f.type === 'meter') {
          setMeter(f);
          const h = new Date(f.sim_time).getHours();
          setTicks((prev) => prev.map((t) => (t.time === h ? { time: h, ev: f.site_kw, building: f.building_load_kw } : t)));
          setSessions((prev) => {
            const next = { ...prev };
            for (const c of f.connectors) {
              if (c.session_id == null) continue;
              const old = next[c.session_id];
              next[c.session_id] = {
                id: `SESS-${c.session_id}`,
                sid: c.session_id,
                site: SITE,
                connector: c.connector_id,
                arrival: old?.arrival ?? arrivalsRef.current[c.session_id] ?? '—',
                departure: hhmm(c.departure_at),
                departure_at: c.departure_at,
                kwh_delivered: c.kwh_delivered,
                kwh_needed: c.kwh_needed,
                energy: `${c.kwh_delivered.toFixed(1)} / ${c.kwh_needed.toFixed(1)} kWh`,
                status: c.status === 'done' ? 'Completed' : c.kw > 0 ? 'Charging' : 'Waiting',
                risk: c.departure_at && minutesBetween(f.sim_time, c.departure_at) < 30 && c.kwh_delivered < 0.9 * c.kwh_needed ? 'High' : 'Low',
                boost: c.boost,
              };
            }
            return next;
          });
        } else if (f.type === 'event') {
          setEvents((prev) => [{ ...f, id: `${f.sim_time}-${f.name}-${prev.length}` }, ...prev].slice(0, 200));
          if (f.name === 'plug_in') {
            arrivalsRef.current[f.detail.session_id] = hhmm(f.sim_time);
          } else if (f.name === 'unplug') {
            setSessions((prev) => (prev[f.detail.session_id] ? { ...prev, [f.detail.session_id]: { ...prev[f.detail.session_id], status: 'Completed', risk: 'Low' } } : prev));
          } else if (f.name === 'day_reset') {
            setSessions({});
            setPlan(null);
            setTicks(Array.from({ length: 24 }, (_, i) => ({ time: i, ev: 0, building: 0 })));
          }
        }
      };
    };
    open();
    return () => {
      closed = true;
      clearTimeout(retry);
      socketRef.current?.close();
    };
  }, []);

  // ---- REST polling ----
  useEffect(() => {
    const poll = async () => {
      try {
        const [i, s] = await Promise.all([fetch(`${API}/sites/${SITE}/impact`), fetch(`${API}/sites/${SITE}/status`)]);
        if (i.ok) setImpact(await i.json());
        if (s.ok) setStatus(await s.json());
      } catch {
        /* backend down: keep last values */
      }
    };
    poll();
    const t = setInterval(poll, 5000);
    return () => clearInterval(t);
  }, []);

  // ---- derive the shape the pages read ----
  const data = useMemo(() => {
    const simTime = meter?.sim_time;
    const feedKw = meter?.feed_kw ?? 150;
    const evKw = meter?.site_kw ?? 0;
    const buildingKw = meter?.building_load_kw ?? 0;
    const mode = status?.mode ?? meter?.mode ?? plan?.mode ?? 'live';
    const planByConnector = Object.fromEntries((plan?.connectors ?? []).map((c) => [c.connector_id, c]));
    const slotMs = (plan?.slot_minutes ?? 5) * 60000;

    const connectors = (meter?.connectors ?? [])
      .filter((c) => c.session_id != null)
      .map((c) => {
        const p = planByConnector[c.connector_id];
        const on = p ? p.kw.map((v, i) => (v > 0 ? i : -1)).filter((i) => i >= 0) : [];
        const h0 = plan ? new Date(plan.horizon_start).getTime() : 0;
        const planStart = on.length && plan ? new Date(h0 + on[0] * slotMs).toISOString() : simTime;
        const planEnd = on.length && plan ? new Date(h0 + (on[on.length - 1] + 1) * slotMs).toISOString() : null;
        const startPct = pct(planStart);
        const endPct = pct(c.departure_at);
        const planWidth = Math.max(1, endPct - startPct);
        const frac = c.kwh_needed > 0 ? Math.min(1, c.kwh_delivered / c.kwh_needed) : 0;
        const mins = c.departure_at && simTime ? minutesBetween(simTime, c.departure_at) : null;
        return {
          scheduled: c.status === 'done' ? 'done' : on.length ? `${hhmm(planStart)}–${hhmm(planEnd)}` : 'waiting for plan',
          readyBy: hhmm(c.departure_at),
          risk: mins != null && mins < 30 && frac < 0.9 && c.status !== 'done' ? 'High' : 'Low',
          id: c.connector_id,
          sessionId: c.session_id,
          driver: `Driver #${c.session_id}`,
          carModel: 'EV (7 kW AC)',
          licensePlate: '—',
          deadlineMins: Math.max(0, mins ?? 0),
          hasBoost: c.boost,
          startPct,
          planWidth,
          actualWidth: planWidth * frac,
          status: c.status === 'done' ? 'Done' : c.kw > 0 ? 'Charging' : 'Waiting',
          energyReq: c.kwh_needed,
          delivered: c.kwh_delivered,
          power: c.kw,
        };
      });

    const charging = connectors.filter((c) => c.status === 'Charging').length;
    const atRisk = Object.values(sessions).filter((s) => s.risk === 'High' && s.status !== 'Completed').length;

    const alerts = events
      .map((e) => {
        const time = hhmm(e.sim_time);
        const base = { id: e.id, site: SITE, time, status: resolved.has(e.id) ? 'Resolved' : 'Active' };
        switch (e.name) {
          case 'mode':
            return e.detail.mode_after !== 'live'
              ? { ...base, severity: 'Warning', entity: 'Signal', desc: `Fail-safe: ${e.detail.mode_before} → ${e.detail.mode_after}` }
              : { ...base, severity: 'Info', entity: 'Signal', desc: 'Live signal restored' };
          case 'dr':
            return { ...base, severity: 'Critical', entity: 'Site Load', desc: `Demand response: reduce ${e.detail.reduce_kw} kW ${hhmm(e.detail.start)}–${hhmm(e.detail.end)}` };
          case 'unplug':
            return e.detail.shortfall_kwh > 0.5
              ? { ...base, severity: 'Warning', entity: e.detail.connector_id, desc: `Left early, ${e.detail.shortfall_kwh} kWh short of stated need` }
              : null;
          case 'boost':
            return { ...base, severity: 'Info', entity: e.detail.connector_id, desc: `Boost requested (session ${e.detail.session_id})` };
          case 'plug_in':
            return { ...base, severity: 'Info', entity: e.detail.connector_id, desc: `Plugged in${e.detail.departure_at ? `, ready by ${hhmm(e.detail.departure_at)}` : ''}` };
          case 'demo':
            return { ...base, severity: 'Warning', entity: 'Site', desc: `Demo: ${e.detail.what}` };
          case 'day_reset':
            return { ...base, severity: 'Info', entity: 'System', desc: 'Sim day restarted' };
          default:
            return null;
        }
      })
      .filter(Boolean);

    const siteRow = {
      id: SITE,
      status: mode === 'live' ? 'Normal' : 'Attention',
      connectors: meter?.connectors.length ?? 0,
      charging,
      loadKw: Math.round(evKw + buildingKw),
      limitKw: feedKw,
      risk: atRisk,
      savings: Math.round(impact?.saved_usd ?? 0),
    };

    return {
      connected,
      simTime,
      systemStatus: !connected ? 'Offline' : mode === 'live' ? 'Optimal' : 'Degraded',
      portfolio: {
        totalSites: 1,
        connectors: siteRow.connectors,
        activeSessions: connectors.length,
        totalSavingsUsd: (impact?.saved_usd ?? 0).toFixed(2),
        totalSavingsKgCo2: (impact?.saved_kgco2 ?? 0).toFixed(1),
        currentDemandKw: siteRow.loadKw,
        limitKw: feedKw,
        peakAvoidedKw: Math.max(0, Math.round((impact?.baseline_peak_kw ?? 0) - (impact?.peak_kw ?? 0))),
        blockKw: status?.block_kw ?? 0,
        energyScheduledMwh: ((impact?.kwh ?? 0) / 1000).toFixed(2),
      },
      siteDetail: {
        id: SITE,
        limitKw: feedKw,
        currentLoadKw: siteRow.loadKw,
        evLoadKw: Math.round(evKw),
        buildingLoadKw: Math.round(buildingKw),
        mode,
        reason: plan?.reason,
        solved_at: plan ? new Date(plan.solved_at).getTime() : null,
        isOptimizing,
        blockKw: status?.block_kw ?? 0,
        impact: { saved_usd: impact?.saved_usd ?? 0, saved_kgco2: impact?.saved_kgco2 ?? 0, kwh: impact?.kwh ?? 0, sessions: impact?.sessions ?? 0, peak_kw: impact?.peak_kw ?? 0, baseline_peak_kw: impact?.baseline_peak_kw ?? 0 },
        meter_ticks: ticks,
        connectors,
      },
      sites: [siteRow],
      alerts,
      sessions: Object.values(sessions).sort((a, b) => b.sid - a.sid),
      chargersList: (meter?.connectors ?? []).map((c) => ({
        id: c.connector_id,
        site: SITE,
        connector: c.connector_id,
        status: c.session_id == null ? 'Available' : c.kw > 0 ? 'Charging' : c.status === 'done' ? 'Done' : 'Waiting',
        power: c.kw,
        energyToday: c.kwh_delivered,
        lastHeartbeat: hhmm(simTime),
      })),
    };
  }, [plan, meter, events, impact, status, sessions, ticks, resolved, isOptimizing, connected]);

  // ---- actions: the demo buttons and per-connector controls hit the real backend ----
  const post = async (path, body) => {
    const r = await fetch(`${API}${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
    if (!r.ok) console.warn(`POST ${path} -> ${r.status}`, await r.text());
    return r;
  };

  const triggerEvent = (endpoint, payload) => {
    switch (endpoint) {
      case 'demo_driver_early':
        return post('/demo/early_unplug');
      case 'demo_driver_boost':
      case 'boost':
        return post('/demo/boost');
      case 'demo_late_surge':
        return post('/demo/oversubscribe');
      case 'demo_grid_fail':
        return post('/demo/signal_outage', { rungs: ['live'] });
      case 'demo_grid_restore':
        return post('/demo/signal_outage', { rungs: ['live'], restore: true });
      case 'prioritize_connector': {
        const c = data.siteDetail.connectors.find((x) => x.id === payload);
        return c ? post(`/sessions/${c.sessionId}/boost`) : undefined;
      }
      case 'pause_connector':
        // ponytail: Noonshift never pauses a car by design (IEC 61851 min 6 A); no backend call. Kept for UI parity.
        console.warn('pause_connector is not supported by the scheduler (never-pause guarantee)');
        return;
      case 'resolve_alert':
        setResolved((prev) => new Set(prev).add(payload));
        return;
      case 'reoptimize_start':
        setIsOptimizing(true); // backend re-solves on the next 5-min boundary or event; the next plan frame clears this
        return;
      case 'reoptimize_end':
        setIsOptimizing(false);
        return;
      default:
        console.warn('unknown triggerEvent', endpoint);
    }
  };

  return <GlobalStateContext.Provider value={{ data, triggerEvent }}>{children}</GlobalStateContext.Provider>;
}

export const useGlobalState = () => useContext(GlobalStateContext);
