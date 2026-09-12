import React, { createContext, useContext, useState, useEffect, useMemo, useRef } from 'react';
import confetti from 'canvas-confetti';
import type { Vehicle, ChargingSchedule, NavTab, OptimizationStep, HourlyDataPoint, ChargingSession } from '../types/wattwise';
import { INITIAL_VEHICLE } from '../utils/mockData';
import { api, connectWs, onSimDay, toLocalIso } from '../api/noonshift';
import type { SessionOut, LiveOut, MeterMsg, PlanMsg, ConnectorMeter, SignalHour } from '../api/noonshift';

/*
 * Driver-side state, backed by the Noonshift backend:
 *   POST /sessions            when the driver answers "ready by when?"
 *   POST /sessions/{id}/boost when they flip to "charge now"
 *   GET  /sessions/{id}/live  polled for the receipt (saved $ / kg)
 *   WS   /ws                  meter + plan frames for live kW, delivered kWh, and the plan window
 * The screens keep reading the same `vehicle` / `schedule` shape the mock used.
 */

const START_SOC = INITIAL_VEHICLE.currentSoC; // SoC when the car arrives; the backend only knows kWh, not SoC

interface WattwiseContextType {
  vehicle: Vehicle;
  schedule: ChargingSchedule;
  hourly: HourlyDataPoint[];
  history: ChargingSession[];
  simTime: string | null;
  connected: boolean;
  sessionId: number | null;
  currentNav: NavTab;
  setCurrentNav: (tab: NavTab) => void;
  isConnectModalOpen: boolean;
  setIsConnectModalOpen: (open: boolean) => void;
  isOptimizing: boolean;
  optimizationSteps: OptimizationStep[];
  startOptimizationFlow: (connectDate: string, connectTime: string, departureDate: string, departureTime: string, targetSoC: number) => void;
  disconnectVehicle: () => void;
  openConnectModal: () => void;
  setChargeMode: (mode: 'smart' | 'immediate') => void;
  updateTargetSoC: (soc: number) => void;
  isSimulatingCharge: boolean;
  startSimulation: () => void;
  stopSimulation: () => void;
  resetDemo: () => void;
}

const WattwiseContext = createContext<WattwiseContextType | undefined>(undefined);

const DEFAULT_OPTIMIZATION_STEPS: OptimizationStep[] = [
  { id: 1, label: 'Electricity prices', sublabel: 'Reading today’s time-of-use tariff', completed: false, active: false },
  { id: 2, label: 'Grid carbon signal', sublabel: 'Marginal emissions per 5-min slot (WattTime)', completed: false, active: false },
  { id: 3, label: 'Site capacity', sublabel: 'Sharing the feed with every other car on site', completed: false, active: false },
  { id: 4, label: 'Your deadline', sublabel: 'Guaranteeing full by your ready-by time', completed: false, active: false },
];

const hhmm12 = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : '—';

export const WattwiseProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [currentNav, setCurrentNav] = useState<NavTab>('dashboard');
  const [isConnectModalOpen, setIsConnectModalOpen] = useState(false);
  const [isOptimizing, setIsOptimizing] = useState(false);
  const [optimizationSteps, setOptimizationSteps] = useState<OptimizationStep[]>(DEFAULT_OPTIMIZATION_STEPS);

  // backend-fed
  const [connected, setConnected] = useState(false);
  const [meter, setMeter] = useState<MeterMsg | null>(null);
  const [plan, setPlan] = useState<PlanMsg | null>(null);
  const [session, setSession] = useState<SessionOut | null>(null);
  const [live, setLive] = useState<LiveOut | null>(null);
  const [signal, setSignal] = useState<SignalHour[]>([]);
  const [history, setHistory] = useState<ChargingSession[]>([]);
  const [targetSoC, setTargetSoC] = useState(INITIAL_VEHICLE.targetSoC);
  const sessionRef = useRef<SessionOut | null>(null);
  sessionRef.current = session;
  const liveRef = useRef<LiveOut | null>(null);
  liveRef.current = live;

  // ---- WebSocket ----
  useEffect(() => {
    const close = connectWs((f) => {
      if (f.type === 'meter') setMeter(f);
      else if (f.type === 'plan') setPlan(f);
      else if (f.type === 'event') {
        const s = sessionRef.current;
        if (!s) return;
        if ((f.name === 'unplug' || f.name === 'day_reset') && (f.name === 'day_reset' || f.detail.session_id === s.session_id)) {
          // our session ended: move it into history and clear (no side effects inside updaters: StrictMode runs them twice)
          const l = liveRef.current;
          if (l) {
            const row: ChargingSession = {
              id: `S-${s.session_id}`,
              date: new Date(f.sim_time).toDateString(),
              timeRange: `${hhmm12(s.plan.start)} – ${hhmm12(f.sim_time)}`,
              energyKwh: l.kwh_delivered,
              cost: l.kwh_delivered * s.price.usd_per_kwh,
              normalCost: l.kwh_delivered * s.price.usd_per_kwh + l.saved_usd,
              savings: l.saved_usd,
              co2AvoidedKg: l.saved_kgco2,
              targetReached: l.kwh_needed ? Math.round((100 * l.kwh_delivered) / l.kwh_needed) : 0,
              isOptimal: !s.boost,
              charger: s.connector_id,
            };
            setHistory((h) => (h.some((x) => x.id === row.id) ? h : [row, ...h]));
          }
          setLive(null);
          setSession(null);
        }
      }
    }, setConnected);
    return close;
  }, []);

  // ---- grid signal for the "why this hour" graph (static for the day) ----
  useEffect(() => {
    api.signal().then(setSignal).catch(() => setSignal([]));
  }, []);

  // ---- receipt polling while we have a session ----
  useEffect(() => {
    if (!session) return;
    let stop = false;
    const poll = () => api.live(session.session_id).then((l) => !stop && setLive(l)).catch(() => {});
    poll();
    const t = setInterval(poll, 2000);
    return () => {
      stop = true;
      clearInterval(t);
    };
  }, [session]);

  // ---- derived ----
  const simTime = meter?.sim_time ?? null;
  const mine: ConnectorMeter | undefined = useMemo(
    () => (session ? meter?.connectors.find((c) => c.session_id === session.session_id) : undefined),
    [meter, session],
  );
  const kwhDelivered = mine?.kwh_delivered ?? live?.kwh_delivered ?? 0;
  const kwhNeeded = mine?.kwh_needed ?? live?.kwh_needed ?? 0;

  const vehicle: Vehicle = useMemo(
    () => ({
      ...INITIAL_VEHICLE,
      chargerName: session ? `Noonshift ${session.connector_id}` : INITIAL_VEHICLE.chargerName,
      currentSoC: Math.min(100, Math.round(START_SOC + (100 * kwhDelivered) / INITIAL_VEHICLE.batteryCapacityKwh)),
      targetSoC,
      maxChargeRateKw: 7, // site p_max_kw
      connected: !!session,
      status: !session ? 'idle' : mine?.status === 'done' || live?.status === 'done' ? 'complete' : (mine?.kw ?? 0) > 0 ? 'charging' : 'scheduled',
    }),
    [session, mine, live, kwhDelivered, targetSoC],
  );

  const schedule: ChargingSchedule = useMemo(() => {
    const start = session?.plan.start ?? null; // arrival isn't in the frames; plan start stands in for connect time
    const end = session?.plan.end ?? null;
    const readyBy = session?.plan.ready_by ?? null;
    const flexMin = start && readyBy ? Math.max(0, (new Date(readyBy).getTime() - new Date(start).getTime()) / 60000) : 0;
    const smartCost = kwhDelivered * (session?.price.usd_per_kwh ?? 0);
    return {
      connectTime: hhmm12(start),
      departureTime: hhmm12(readyBy),
      connectDateTime: start ? new Date(start) : new Date(),
      departureDateTime: readyBy ? new Date(readyBy) : new Date(),
      flexibilityHours: Math.floor(flexMin / 60),
      flexibilityMinutes: Math.round(flexMin % 60),
      optimalStart: hhmm12(start),
      optimalEnd: hhmm12(end),
      chargingDurationHours: Number((kwhNeeded / 7).toFixed(1)),
      energyNeededKwh: Number(kwhNeeded.toFixed(1)),
      smartCost,
      normalCost: smartCost + (live?.saved_usd ?? 0),
      savings: live?.saved_usd ?? 0,
      co2AvoidedKg: live?.saved_kgco2 ?? 0,
      normalCo2Kg: live?.saved_kgco2 ?? 0,
      smartCo2Kg: 0,
      isOptimizing,
      hasOptimized: !!session,
      chargeMode: session?.boost ? 'immediate' : 'smart',
    };
  }, [session, mine, live, kwhDelivered, kwhNeeded, isOptimizing]);

  // hourly graph: tariff + carbon from /grid/signal, site load from the plan, my slots marked optimal
  const hourly: HourlyDataPoint[] = useMemo(() => {
    if (!signal.length) return [];
    const maxG = Math.max(...signal.map((s) => s.gco2_per_kwh), 1);
    const slotMs = (plan?.slot_minutes ?? 5) * 60000;
    const h0 = plan ? new Date(plan.horizon_start).getTime() : 0;
    const myKw = plan?.connectors.find((c) => c.session_id === session?.session_id)?.kw ?? [];
    const hourOf = (i: number) => new Date(h0 + i * slotMs).getHours();
    const siteKwByHour: Record<number, number[]> = {};
    const mineByHour: Record<number, boolean> = {};
    (plan?.site_kw ?? []).forEach((kw, i) => ((siteKwByHour[hourOf(i)] ??= []).push(kw)));
    myKw.forEach((kw, i) => kw > 0 && (mineByHour[hourOf(i)] = true));
    const now = simTime ? new Date(simTime).getHours() : -1;
    const readyH = session ? new Date(session.plan.ready_by).getHours() : -1;
    return signal.map((s) => {
      const site = siteKwByHour[s.hour];
      return {
        hourLabel: new Date(2000, 0, 1, s.hour).toLocaleTimeString([], { hour: 'numeric' }),
        rawHour: s.hour,
        tariff: s.usd_per_kwh,
        gridDemandGw: site ? site.reduce((a, b) => a + b, 0) / site.length : 0, // site kW, not GW: the graph relabels it
        renewablePercent: Math.round(100 * (1 - s.gco2_per_kwh / maxG)), // "grid clean %": 100 = cleanest hour today
        isOptimal: !!mineByHour[s.hour],
        isPluggedIn: !!session && s.hour >= now && s.hour <= readyH,
      };
    });
  }, [signal, plan, session, simTime]);

  // ---- actions ----
  const runStepAnimation = () => {
    setOptimizationSteps(DEFAULT_OPTIMIZATION_STEPS.map((s) => ({ ...s, completed: false, active: false })));
    [200, 700, 1200, 1700].forEach((ms, i) =>
      setTimeout(() => setOptimizationSteps((prev) => prev.map((s, j) => (j < i ? { ...s, completed: true, active: false } : j === i ? { ...s, active: true } : s))), ms),
    );
  };

  const startOptimizationFlow = async (_connectDate: string, _connectTime: string, _departureDate: string, departureTime: string, soc: number) => {
    setIsConnectModalOpen(false);
    setIsOptimizing(true);
    runStepAnimation();
    setTargetSoC(soc);
    const now = meter?.sim_time ?? toLocalIso(new Date());
    // ready-by on the sim's day; if the driver picked a time already behind the (fast) sim clock, give them 4 h
    let departure = onSimDay(now, departureTime);
    if (new Date(departure).getTime() <= new Date(now).getTime() + 5 * 60000) {
      departure = toLocalIso(new Date(new Date(now).getTime() + 4 * 3600000));
    }
    const kwh = Math.max(1, ((soc - START_SOC) / 100) * INITIAL_VEHICLE.batteryCapacityKwh);
    // take the highest-numbered free connector: the replayed sessions occupy the low ones
    const free = [...(meter?.connectors ?? [])].reverse().find((c) => c.session_id == null)?.connector_id ?? 'c60';
    const t0 = Date.now();
    try {
      const s = await api.createSession(free, departure, Number(kwh.toFixed(1)));
      await new Promise((r) => setTimeout(r, Math.max(0, 2200 - (Date.now() - t0)))); // let the steps finish
      setOptimizationSteps((prev) => prev.map((x) => ({ ...x, completed: true, active: false })));
      setSession(s);
      try {
        confetti({ particleCount: 50, spread: 60, origin: { y: 0.6 }, colors: ['#D4F634', '#171717', '#10B981'] });
      } catch {
        /* no canvas */
      }
    } catch (e) {
      console.error('createSession failed', e);
      alert(`Could not plug in: ${(e as Error).message}`);
    } finally {
      setIsOptimizing(false);
    }
  };

  const setChargeMode = async (mode: 'smart' | 'immediate') => {
    if (!session) return;
    if (mode === 'immediate' && !session.boost) {
      try {
        setSession(await api.boost(session.session_id));
      } catch (e) {
        console.warn('boost failed', e);
      }
    }
    // back to 'smart' after a boost isn't a backend operation (boost is one-way for the session)
  };

  const updateTargetSoC = async (soc: number) => {
    setTargetSoC(soc);
    if (!session) return;
    const kwh = Math.max(1, ((soc - START_SOC) / 100) * INITIAL_VEHICLE.batteryCapacityKwh);
    try {
      setSession(await api.createSession(session.connector_id, session.plan.ready_by, Number(kwh.toFixed(1)))); // same connector = update
    } catch (e) {
      console.warn('update kwh failed', e);
    }
  };

  const disconnectVehicle = () => {
    // Unplugging is physical: the backend ends the session when the car leaves. Here we just stop following it.
    setSession(null);
    setLive(null);
  };

  const resetDemo = () => {
    disconnectVehicle();
    setOptimizationSteps(DEFAULT_OPTIMIZATION_STEPS);
    setCurrentNav('dashboard');
  };

  return (
    <WattwiseContext.Provider
      value={{
        vehicle,
        schedule,
        hourly,
        history,
        simTime,
        connected,
        sessionId: session?.session_id ?? null,
        currentNav,
        setCurrentNav,
        isConnectModalOpen,
        setIsConnectModalOpen,
        isOptimizing,
        optimizationSteps,
        startOptimizationFlow,
        disconnectVehicle,
        openConnectModal: () => setIsConnectModalOpen(true),
        setChargeMode,
        updateTargetSoC,
        // the backend's sim clock drives charging; these stay for UI parity
        isSimulatingCharge: vehicle.status === 'charging',
        startSimulation: () => {},
        stopSimulation: () => {},
        resetDemo,
      }}
    >
      {children}
    </WattwiseContext.Provider>
  );
};

export const useWattwise = () => {
  const context = useContext(WattwiseContext);
  if (!context) {
    throw new Error('useWattwise must be used within a WattwiseProvider');
  }
  return context;
};
