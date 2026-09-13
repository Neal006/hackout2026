import React, { createContext, useContext, useState, useEffect, useMemo, useRef } from 'react';
import { hhmm, MODE_COPY } from '../lib/ui';

/*
 * Live state for the ops dashboard, fed by the Noonshift backend:
 *   WS /ws                                   -> plan | meter | event frames (docs/ws-frames.json)
 *   GET /sites/{id}/impact, /sites/{id}/status -> polled every 5 s (docs/openapi.json)
 *   GET /grid/signal                          -> today's hourly MOER + tariff, once per sim day
 * Rule for every element on every page: it is fed by one of these or it does not exist.
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
const minutesBetween = (a, b) => Math.round((new Date(b) - new Date(a)) / 60000);
const emptyHours = () => Array.from({ length: 24 }, (_, i) => ({ time: i, ev: 0, building: 0, kwh: 0 }));


const GlobalStateContext = createContext();

export function GlobalStateProvider({ children }) {
  const [plan, setPlan] = useState(null);
  const [meter, setMeter] = useState(null);
  const [events, setEvents] = useState([]); // newest first, capped
  const [impact, setImpact] = useState(null);
  const [status, setStatus] = useState(null);
  const [signal, setSignal] = useState([]); // GET /grid/signal: 24 rows
  const [sessions, setSessions] = useState({}); // session_id -> row, built from meter frames
  const [ticks, setTicks] = useState(emptyHours); // per hour: latest kW and accumulated kWh (one meter frame = one sim-minute)
  const [resolved, setResolved] = useState(new Set());
  const [connected, setConnected] = useState(false);
  const [dayKey, setDayKey] = useState(0); // bumps on day_reset so the signal is refetched
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
        } else if (f.type === 'meter') {
          setMeter(f);
          const h = new Date(f.sim_time).getHours();
          setTicks((prev) => prev.map((t) => (t.time === h ? { time: h, ev: f.site_kw, building: f.building_load_kw, kwh: t.kwh + f.site_kw / 60 } : t)));
          setSessions((prev) => {
            const next = { ...prev };
            for (const c of f.connectors) {
              if (c.session_id == null) continue;
              const old = next[c.session_id];
              const mins = c.departure_at ? minutesBetween(f.sim_time, c.departure_at) : null;
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
                risk: mins != null && mins < 30 && c.kwh_delivered < 0.9 * c.kwh_needed && c.status !== 'done' ? 'High' : 'Low',
                boost: c.boost,
                urgency: c.urgency ?? null,
                idleMin: c.idle_min ?? 0,
                needConfidence: c.need_confidence ?? null,
                pMaxKw: c.p_max_kw ?? 0,
                capObserved: !!c.cap_observed,
                asap: !!c.asap,
                moveBy: !!c.move_by,
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
            setTicks(emptyHours());
            setDayKey((k) => k + 1);
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

  useEffect(() => {
    fetch(`${API}/grid/signal`)
      .then((r) => (r.ok ? r.json() : []))
      .then(setSignal)
      .catch(() => {});
  }, [dayKey, connected]);

  // ---- derive the shape the pages read ----
  const data = useMemo(() => {
    const simTime = meter?.sim_time;
    const feedKw = status?.feed_kw ?? meter?.feed_kw ?? 0;
    const evKw = meter?.site_kw ?? 0;
    const buildingKw = meter?.building_load_kw ?? 0;
    const mode = status?.mode ?? meter?.mode ?? plan?.mode ?? 'live';
    const planByConnector = Object.fromEntries((plan?.connectors ?? []).map((c) => [c.connector_id, c]));
    const slotMs = (plan?.slot_minutes ?? 5) * 60000;
    const asapBays = new Set(status?.connectors_asap ?? []);

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
          deadlineMins: Math.max(0, mins ?? 0),
          hasBoost: c.boost,
          urgency: c.urgency ?? null,
          asap: asapBays.has(c.connector_id),
          moveBy: !!c.move_by,
          idleMin: c.idle_min ?? 0,
          needConfidence: c.need_confidence ?? null,
          pMaxKw: c.p_max_kw ?? 0,
          capObserved: !!c.cap_observed,
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
    const waiting = meter?.waiting ?? status?.waiting ?? 0;

    const alerts = events
      .map((e) => {
        const time = hhmm(e.sim_time);
        const base = { id: e.id, site: SITE, time, status: resolved.has(e.id) ? 'Resolved' : 'Active' };
        const d = e.detail;
        switch (e.name) {
          case 'mode':
            return d.mode_after !== 'live'
              ? { ...base, severity: 'Warning', entity: 'Signal', desc: `Fail-safe: ${d.mode_before} → ${d.mode_after}. ${MODE_COPY[d.mode_after] ?? ''}` }
              : { ...base, severity: 'Info', entity: 'Signal', desc: 'Live signal restored' };
          case 'dr':
            return { ...base, severity: 'Critical', entity: 'Site Load', desc: `Demand response: reduce ${d.reduce_kw} kW ${hhmm(d.start)}–${hhmm(d.end)}` };
          case 'unplug':
            if (d.moved) return { ...base, severity: 'Info', entity: d.connector_id, desc: 'Full car moved off the bay for a waiting driver' };
            return d.shortfall_kwh > 0.5
              ? { ...base, severity: 'Warning', entity: d.connector_id, desc: `Left early, ${d.shortfall_kwh} kWh short of stated need` }
              : null;
          case 'boost':
            return { ...base, severity: 'Warning', entity: d.connector_id, desc: `Leaving now (session ${d.session_id}): full power, pays today's rate` };
          case 'urgency':
            return {
              ...base,
              severity: 'Warning',
              entity: d.connector_id,
              desc: d.level === 'soon' ? `Leaving at ${hhmm(d.leave_at)} (session ${d.session_id}): re-planned into the cleanest slots before then` : `Priority requested (session ${d.session_id}): 90 % floor, gives way last`,
            };
          case 'done':
            return { ...base, severity: 'Info', entity: d.connector_id, desc: `Full (session ${d.session_id}) — "done, please move" sent` };
          case 'cap_observed':
            return { ...base, severity: 'Info', entity: d.connector_id, desc: `Car draws ${d.metered_kw} kW at a ${d.limit_kw} kW limit; plan capped at ${d.max_kw} kW` };
          case 'move_by':
            return { ...base, severity: 'Info', entity: d.connector_id, desc: `${d.waiting} waiting: move-by ${hhmm(d.move_by)} (was ${hhmm(d.deadline_was)})` };
          case 'plug_in':
            return { ...base, severity: 'Info', entity: d.connector_id, desc: `Plugged in${d.waited_min ? ` after waiting ${d.waited_min} min` : ''}${d.departure_at ? `, ready by ${hhmm(d.departure_at)}` : ''}` };
          case 'demo':
            return { ...base, severity: 'Warning', entity: 'Site', desc: `Demo: ${d.what}${d.waiting ? ` (${d.waiting} waiting)` : ''}` };
          case 'day_reset':
            return { ...base, severity: 'Info', entity: 'System', desc: 'Sim day restarted' };
          default:
            return null;
        }
      })
      .filter(Boolean);
    if (waiting > 0) {
      alerts.unshift({ id: 'waiting', site: SITE, time: hhmm(simTime), status: resolved.has('waiting') ? 'Resolved' : 'Active', severity: 'Warning', entity: 'Bays', desc: `${waiting} car${waiting > 1 ? 's' : ''} waiting for a bay; slackest cars get move-by times` });
    }

    const loadKw = Math.round(evKw + buildingKw);
    const contractedPeakKw = status?.contracted_peak_kw ?? feedKw;
    const siteRow = {
      id: SITE,
      status: mode === 'live' ? 'Normal' : 'Attention',
      connectors: meter?.connectors.length ?? status?.n_connectors ?? 0,
      charging,
      loadKw,
      limitKw: feedKw,
      risk: atRisk,
      savings: Math.round(impact?.saved_usd ?? 0),
    };

    return {
      connected,
      simTime,
      systemStatus: !connected ? 'Offline' : mode === 'live' ? 'Optimal' : 'Degraded',
      status: {
        mode,
        modeCopy: MODE_COPY[mode],
        ladder: status?.ladder ?? {},
        safeShareKw: status?.safe_share_kw ?? 0,
        waiting,
        connectorsAsap: status?.connectors_asap ?? [],
        nConnectors: status?.n_connectors ?? siteRow.connectors,
        pMaxKw: status?.p_max_kw ?? 7,
        feedKw,
        blockKw: status?.block_kw ?? 0,
        contractedPeakKw,
        package: status?.package ?? 'pilot',
        rateR: status?.employee_rate_usd_per_kwh ?? 0,
        alpha: status?.driver_share ?? 0.5,
        beta: status?.noonshift_share ?? 0.2,
        signalKind: status?.signal_kind ?? null,
        signalSource: status?.signal_source ?? null,
        tariffName: status?.tariff_name ?? null,
        lastSolveAt: status?.last_solve_at ?? null,
      },
      portfolio: {
        connectors: siteRow.connectors,
        activeSessions: connectors.length,
        charging,
        atRisk,
        totalSavingsUsd: (impact?.saved_usd ?? 0).toFixed(2),
        totalSavingsKgCo2: (impact?.saved_kgco2 ?? 0).toFixed(1),
        currentDemandKw: loadKw,
        limitKw: feedKw,
        contractedPeakKw,
        peakAvoidedKw: Math.max(0, Math.round((impact?.baseline_peak_kw ?? 0) - (impact?.peak_kw ?? 0))),
        blockKw: status?.block_kw ?? 0,
        energyScheduledMwh: ((impact?.kwh ?? 0) / 1000).toFixed(2),
        chargedToday: impact?.sessions ?? 0,
        renewableShare: impact?.renewable_share ?? 0,
        healthUsd: impact?.health_usd ?? null,
      },
      siteDetail: {
        id: SITE,
        limitKw: feedKw,
        currentLoadKw: loadKw,
        evLoadKw: Math.round(evKw),
        buildingLoadKw: Math.round(buildingKw),
        mode,
        reason: plan?.reason,
        solved_at: plan ? new Date(plan.solved_at).getTime() : null,
        horizon_start: plan?.horizon_start ?? null,
        site_kw: plan?.site_kw ?? [],
        blockKw: status?.block_kw ?? 0,
        impact: {
          saved_usd: impact?.saved_usd ?? 0,
          saved_kgco2: impact?.saved_kgco2 ?? 0,
          kwh: impact?.kwh ?? 0,
          sessions: impact?.sessions ?? 0,
          peak_kw: impact?.peak_kw ?? 0,
          baseline_peak_kw: impact?.baseline_peak_kw ?? 0,
          renewable_share: impact?.renewable_share ?? 0,
          health_usd: impact?.health_usd ?? null,
        },
        meter_ticks: ticks,
        connectors,
      },
      signal,
      sites: [siteRow],
      alerts,
      sessions: Object.values(sessions).sort((a, b) => b.sid - a.sid),
      chargersList: (meter?.connectors ?? []).map((c) => ({
        id: c.connector_id,
        connector: c.connector_id,
        status: c.session_id == null ? 'Available' : c.kw > 0 ? 'Charging' : c.status === 'done' ? 'Done' : 'Waiting',
        power: c.kw,
        energyToday: c.kwh_delivered,
        pMaxKw: c.p_max_kw ?? status?.p_max_kw ?? 0,
        capObserved: !!c.cap_observed,
        asap: asapBays.has(c.connector_id),
        idleMin: c.idle_min ?? 0,
        sessionId: c.session_id,
        lastHeartbeat: hhmm(simTime),
      })),
      ledgerUrl: `${API}/sites/${SITE}/impact.csv`,
    };
  }, [plan, meter, events, impact, status, signal, sessions, ticks, resolved, connected]);

  // ---- actions: the demo buttons and per-session controls hit the real backend ----
  const post = async (path, body) => {
    const r = await fetch(`${API}${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
    if (!r.ok) console.warn(`POST ${path} -> ${r.status}`, await r.text());
    return r;
  };

  // business.md §4b: now | soon (leave_at) | priority. Explains and confirms in the UI; the backend re-solves.
  const setUrgency = (sessionId, level, leaveAt) => post(`/sessions/${sessionId}/urgency`, { level, leave_at: leaveAt ?? null });

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
      case 'resolve_alert':
        setResolved((prev) => new Set(prev).add(payload));
        return;
      default:
        console.warn('unknown triggerEvent', endpoint);
    }
  };

  return <GlobalStateContext.Provider value={{ data, triggerEvent, setUrgency }}>{children}</GlobalStateContext.Provider>;
}

export const useGlobalState = () => useContext(GlobalStateContext);
