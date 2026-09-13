import { useGlobalState } from '../context/GlobalStateContext';

// Planned site kW per hour from the current plan frame (site_kw per 5-min slot from horizon_start)
const plannedByHour = (horizonStart, siteKw) => {
  const out = Array(24).fill(null);
  if (!horizonStart || !siteKw.length) return out;
  const sums = Array(24).fill(0);
  const counts = Array(24).fill(0);
  const t0 = new Date(horizonStart).getTime();
  siteKw.forEach((kw, k) => {
    const h = new Date(t0 + k * 300000).getHours();
    if (t0 + k * 300000 - t0 < 24 * 3600000) {
      sums[h] += kw;
      counts[h] += 1;
    }
  });
  return sums.map((s, h) => (counts[h] ? s / counts[h] : null));
};

const bucket = (g) => (g == null ? '' : g === 0 ? 'bg-saved/15' : g < 200 ? 'bg-solar/10' : 'bg-danger/5');

export default function SchedulesView() {
  const { data } = useGlobalState();
  const { siteDetail, status, signal } = data;
  // solved_at is sim time, so measure against the sim clock, not Date.now()
  const ago = siteDetail.solved_at && data.simTime ? `${Math.max(0, Math.round((new Date(data.simTime) - siteDetail.solved_at) / 60000))} sim-min ago` : '—';

  const planned = plannedByHour(siteDetail.horizon_start, siteDetail.site_kw);
  const metered = siteDetail.meter_ticks.map((t) => t.ev);
  const yMax = Math.max(status.feedKw, 1);
  const nowHour = data.simTime ? new Date(data.simTime).getHours() : null;

  return (
    <div className="p-4 md:p-8 max-w-5xl mx-auto w-full">
      <header className="mb-6 md:mb-8 flex flex-wrap justify-between items-end gap-2 border-b border-border pb-4">
        <div>
          <h1 className="text-2xl font-semibold text-ink">Plan</h1>
          <p className="text-sm text-ink-muted mt-1">Re-solved every 5 sim-minutes and on every event · reason: <span className="mono">{siteDetail.reason ?? '—'}</span></p>
        </div>
      </header>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-6 mb-8">
        <div className="border border-border p-4 bg-surface flex flex-col justify-between">
          <span className="text-[10px] uppercase tracking-wider text-ink-muted mb-1 block">Last solved</span>
          <span className="mono text-xl font-medium">{ago}</span>
        </div>
        <div className="border border-border p-4 bg-surface flex flex-col justify-between">
          <span className="text-[10px] uppercase tracking-wider text-ink-muted mb-1 block">Mode</span>
          <span className={`mono text-xl font-medium ${status.mode === 'live' ? 'text-saved' : 'text-solar'}`}>{status.mode}</span>
        </div>
        <div className="border border-border p-4 bg-surface flex flex-col justify-between">
          <span className="text-[10px] uppercase tracking-wider text-ink-muted mb-1 block">Carbon signal</span>
          <span className="mono text-xl font-medium">{status.signalKind ?? '—'}</span>
          <span className="text-[10px] text-ink-muted">{status.signalSource ?? ''}</span>
        </div>
        <div className="border border-border p-4 bg-surface flex flex-col justify-between">
          <span className="text-[10px] uppercase tracking-wider text-ink-muted mb-1 block">Tariff</span>
          <span className="mono text-sm font-medium">{status.tariffName ?? '—'}</span>
          <span className="text-[10px] text-ink-muted">block {status.blockKw} kW</span>
        </div>
      </div>

      <section>
        <h2 className="text-lg font-medium text-ink mb-1">Today, hour by hour</h2>
        <p className="text-xs text-ink-muted mb-4">Bars: planned EV kW (this plan) and metered EV kW (hours already run). Shading: the marginal signal from <span className="mono">/grid/signal</span>.</p>
        <div className="border border-border bg-surface p-4 md:p-6 overflow-x-auto">
          <div className="min-w-[640px]">
            <div className="flex h-56 border-b border-border">
              {Array.from({ length: 24 }, (_, h) => (
                <div key={h} className={`flex-1 relative border-r border-border/30 ${bucket(signal[h]?.gco2_per_kwh)}`} title={`${String(h).padStart(2, '0')}:00 · planned ${planned[h]?.toFixed(1) ?? '—'} kW · metered ${metered[h].toFixed(1)} kW · ${signal[h]?.gco2_per_kwh ?? '?'} g/kWh`}>
                  {nowHour === h && <div className="absolute inset-y-0 left-0 w-px bg-ink"></div>}
                  <div className="absolute bottom-0 left-1 right-1 flex items-end gap-px h-full">
                    <div className="flex-1 bg-grid-blue/40" style={{ height: `${Math.min(100, ((planned[h] ?? 0) / yMax) * 100)}%` }}></div>
                    <div className="flex-1 bg-grid-blue" style={{ height: `${Math.min(100, (metered[h] / yMax) * 100)}%` }}></div>
                  </div>
                </div>
              ))}
            </div>
            <div className="flex">
              {Array.from({ length: 24 }, (_, h) => (
                <div key={h} className="flex-1 text-[9px] mono text-ink-muted text-center pt-1">{h % 3 === 0 ? String(h).padStart(2, '0') : ''}</div>
              ))}
            </div>
            <div className="flex flex-wrap gap-4 text-[10px] uppercase tracking-wider text-ink-muted mt-4">
              <span className="flex items-center gap-2"><span className="w-3 h-3 bg-grid-blue/40"></span> planned EV kW</span>
              <span className="flex items-center gap-2"><span className="w-3 h-3 bg-grid-blue"></span> metered EV kW</span>
              <span className="flex items-center gap-2"><span className="w-3 h-3 bg-saved/15 border border-border"></span> 0 g/kWh</span>
              <span className="flex items-center gap-2"><span className="w-3 h-3 bg-solar/10 border border-border"></span> under 200 g/kWh</span>
              <span className="flex items-center gap-2"><span className="w-3 h-3 bg-danger/5 border border-border"></span> 200 g/kWh and above</span>
              <span className="flex items-center gap-2"><span className="w-px h-3 bg-ink"></span> now</span>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
