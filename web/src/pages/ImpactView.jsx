import { useGlobalState } from '../context/GlobalStateContext';

// metrics.md §2: EPA factors, all labelled estimate on screen
const KG_PER_KM = 0.25;
const KG_PER_TREE_10Y = 60;
const KG_PER_LITRE = 2.31;

const Card = ({ label, value, saved, note }) => (
  <div className="border border-border p-4 md:p-5 bg-surface flex flex-col justify-between">
    <span className="text-[10px] uppercase tracking-wider text-ink-muted mb-1 block">{label}</span>
    <span className={`mono text-2xl md:text-3xl font-medium ${saved ? 'text-saved' : 'text-ink'}`}>{value}</span>
    {note && <span className="text-[10px] text-ink-muted mt-1">{note}</span>}
  </div>
);

// MOER buckets (g/kWh): 0 = renewable at the margin, < 200 = mostly clean, >= 200 = gas
const bucket = (g) => (g === 0 ? 'clean' : g < 200 ? 'mixed' : 'dirty');
const BUCKET_STYLE = { clean: 'bg-saved', mixed: 'bg-solar/60', dirty: 'bg-danger/25' };

export default function ImpactView() {
  const { data } = useGlobalState();
  const { impact, id: siteId, meter_ticks } = data.siteDetail;
  const { status, signal } = data;
  const perSession = impact.sessions ? impact.saved_kgco2 / impact.sessions : 0;
  const kwhMax = Math.max(1, ...meter_ticks.map((t) => t.kwh));
  const hours = meter_ticks.map((t) => ({ ...t, g: signal[t.time]?.gco2_per_kwh ?? null }));
  const fee = impact.saved_usd * status.beta;

  return (
    <div className="p-4 md:p-8 max-w-5xl mx-auto w-full">
      <header className="mb-6 md:mb-8 flex flex-wrap justify-between items-end gap-2 border-b border-border pb-4">
        <div>
          <h1 className="text-2xl font-semibold text-ink">Energy & Impact</h1>
          <p className="text-sm text-ink-muted mt-1">Today at {siteId} vs charge-immediately · {status.signalKind ?? '—'} signal{status.signalSource ? ` (${status.signalSource})` : ''}</p>
        </div>
        <a href={data.ledgerUrl} download className="text-xs uppercase tracking-wider px-3 py-1.5 border border-border hover:bg-bg transition-colors">
          Export ledger (CSV)
        </a>
      </header>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-6 mb-8 md:mb-12">
        <Card label="Energy delivered" value={`${(impact.kwh / 1000).toFixed(2)} MWh`} note={`${impact.sessions} sessions`} />
        <Card label="CO₂ avoided (est.)" value={`${impact.saved_kgco2.toFixed(1)} kg`} saved note={`${perSession.toFixed(2)} kg per session`} />
        <Card label="Renewable-hour share" value={`${Math.round(impact.renewable_share * 100)}%`} saved note="kWh charged while the marginal source was renewable" />
        <Card label="Cost saved (est.)" value={`$${impact.saved_usd.toFixed(2)}`} note={impact.health_usd != null ? `+ $${impact.health_usd.toFixed(2)} health damage avoided` : `Noonshift fee ${Math.round(status.beta * 100)} % = $${fee.toFixed(2)}`} />
      </div>

      <section className="mb-8 md:mb-12">
        <h2 className="text-lg font-medium text-ink mb-1">Charging by hour, coloured by how clean the grid was</h2>
        <p className="text-xs text-ink-muted mb-4">Bars: kWh delivered per hour (meter). Colour: hourly mean of the marginal signal from <span className="mono">/grid/signal</span>.</p>
        <div className="border border-border bg-surface p-4 md:p-6 overflow-x-auto">
          <div className="min-w-[560px]">
            <div className="flex items-end gap-1 h-40">
              {hours.map((h) => (
                <div key={h.time} className="flex-1 flex flex-col items-center justify-end h-full" title={`${String(h.time).padStart(2, '0')}:00 · ${h.kwh.toFixed(1)} kWh · ${h.g ?? '?'} g/kWh`}>
                  <div className={`w-full ${h.g == null ? 'bg-border' : BUCKET_STYLE[bucket(h.g)]}`} style={{ height: `${(h.kwh / kwhMax) * 100}%`, minHeight: h.kwh > 0 ? 2 : 0 }}></div>
                </div>
              ))}
            </div>
            <div className="flex gap-1 mt-1">
              {hours.map((h) => (
                <div key={h.time} className="flex-1 text-center text-[9px] mono text-ink-muted">{h.time % 3 === 0 ? String(h.time).padStart(2, '0') : ''}</div>
              ))}
            </div>
            <div className="flex flex-wrap gap-4 text-[10px] uppercase tracking-wider text-ink-muted mt-4">
              <span className="flex items-center gap-2"><span className="w-3 h-3 bg-saved"></span> 0 g/kWh — renewable at the margin</span>
              <span className="flex items-center gap-2"><span className="w-3 h-3 bg-solar/60"></span> under 200 g/kWh</span>
              <span className="flex items-center gap-2"><span className="w-3 h-3 bg-danger/25"></span> 200 g/kWh and above</span>
            </div>
          </div>
        </div>
      </section>

      <section className="mb-8 md:mb-12">
        <h2 className="text-lg font-medium text-ink mb-1">What {impact.saved_kgco2.toFixed(1)} kg CO₂ means</h2>
        <p className="text-xs text-ink-muted mb-4">Estimates from EPA equivalence factors (metrics.md §2), computed from today's avoided CO₂.</p>
        <div className="grid grid-cols-3 gap-4 md:gap-6">
          <Card label="Km not driven (petrol car)" value={`${Math.round(impact.saved_kgco2 / KG_PER_KM)} km`} />
          <Card label="Petrol not burned" value={`${(impact.saved_kgco2 / KG_PER_LITRE).toFixed(1)} L`} />
          <Card label="Tree-years of growth" value={`${(impact.saved_kgco2 / KG_PER_TREE_10Y * 10).toFixed(1)}`} note="a seedling absorbs ~60 kg over 10 years" />
        </div>
      </section>

      <section>
        <h2 className="text-lg font-medium text-ink mb-4">Against charge-immediately</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-8">
          <div className="border border-border bg-surface p-6 flex flex-col gap-4">
            <h3 className="font-semibold text-ink-muted uppercase tracking-wider text-xs text-center pb-4 border-b border-border">Baseline (charge immediately)</h3>
            <p className="text-sm text-ink-muted">Every car draws full power from the moment it plugs in, under the same feed. Same {impact.kwh.toFixed(1)} kWh delivered. Peak {impact.baseline_peak_kw} kW (est.).</p>
          </div>
          <div className="border-2 border-grid-blue bg-surface p-6 flex flex-col gap-4 relative">
            <h3 className="font-semibold text-grid-blue uppercase tracking-wider text-xs text-center pb-4 border-b border-border">Noonshift</h3>
            <div className="flex justify-between items-end"><span className="text-sm text-ink-muted">CO₂</span><span className="mono text-xl text-saved font-medium">−{impact.saved_kgco2.toFixed(1)} kg</span></div>
            <div className="flex justify-between items-end"><span className="text-sm text-ink-muted">Bill</span><span className="mono text-xl text-saved font-medium">−${impact.saved_usd.toFixed(2)}</span></div>
            <div className="flex justify-between items-end"><span className="text-sm text-ink-muted">Peak</span><span className="mono text-xl text-ink font-medium">{impact.peak_kw} kW</span></div>
          </div>
        </div>
      </section>
    </div>
  );
}
