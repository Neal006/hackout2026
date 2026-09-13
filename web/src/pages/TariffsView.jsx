import { useGlobalState } from '../context/GlobalStateContext';

// business.md §9b
const PACKAGE_COPY = {
  capacity: 'Capacity (the EMS): EV cap under the contracted peak, static share on every charger, NEC 625.42 documentation, move-by and done notifications.',
  'clean-hours': 'Clean hours (the scheduler): marginal-carbon scheduling, receipts, hourly Scope 2 / Scope 3 ledger. No fixed fee; a share of measured savings.',
  pilot: 'Pilot: both packages, one site, 90 days, free. The building\'s own bill before and after is the report.',
};

// Group consecutive hours with the same tariff price into periods (from GET /grid/signal)
const periods = (signal) => {
  const out = [];
  for (const h of signal) {
    const last = out[out.length - 1];
    if (last && last.usd === h.usd_per_kwh) {
      last.end = h.hour + 1;
      last.g.push(h.gco2_per_kwh);
    } else {
      out.push({ start: h.hour, end: h.hour + 1, usd: h.usd_per_kwh, g: [h.gco2_per_kwh] });
    }
  }
  return out;
};

const Row = ({ label, value, mono = true }) => (
  <div className="flex justify-between gap-4 border-b border-border pb-3">
    <span className="text-sm text-ink-muted">{label}</span>
    <span className={`font-medium text-ink text-right ${mono ? 'mono' : ''}`}>{value}</span>
  </div>
);

export default function TariffsView() {
  const { data } = useGlobalState();
  const { status, signal, siteDetail } = data;
  const saved = siteDetail.impact.saved_usd;
  const prices = signal.map((h) => h.usd_per_kwh);
  const pmax = prices.length ? Math.max(...prices) : 0;

  return (
    <div className="p-4 md:p-8 max-w-4xl mx-auto w-full">
      <header className="mb-6 md:mb-8 border-b border-border pb-4">
        <h1 className="text-2xl font-semibold text-ink">Tariffs & package</h1>
        <p className="text-sm text-ink-muted mt-1">What the scheduler prices against, what the employee pays, and how today's saving is split</p>
      </header>

      <section className="mb-8">
        <h2 className="text-lg font-medium text-ink mb-4">Site tariff</h2>
        <div className="border border-border bg-surface p-4 md:p-6 flex flex-col gap-3">
          <Row label="Rate schedule" value={status.tariffName ?? '—'} mono={false} />
          <Row label="Tariff block" value={`${status.blockKw} kW`} />
          <Row label="Feed" value={`${status.feedKw} kW`} />
          <Row label="Contracted building peak" value={`${status.contractedPeakKw} kW`} />
          <Row label="Grid signal" value={status.signalKind ? `${status.signalKind}${status.signalSource ? ` · ${status.signalSource}` : ''}` : '—'} mono={false} />
        </div>
      </section>

      <section className="mb-8">
        <h2 className="text-lg font-medium text-ink mb-4">Employee price and today's split (business.md §7b)</h2>
        <div className="border border-border bg-surface p-4 md:p-6 flex flex-col gap-3">
          <Row label="Employee rate R" value={status.rateR > 0 ? `$${status.rateR.toFixed(2)} / kWh` : 'free'} />
          <Row label="Driver share α" value={`${Math.round(status.alpha * 100)} % of measured saving, as a discount below R`} mono={false} />
          <Row label="Noonshift share β" value={`${Math.round(status.beta * 100)} % of measured saving`} mono={false} />
          <Row label="Measured saving today" value={`$${saved.toFixed(2)}`} />
          <Row label="→ driver pool" value={`$${(saved * status.alpha).toFixed(2)}`} />
          <Row label="→ Noonshift fee" value={`$${(saved * status.beta).toFixed(2)}`} />
          <Row label="→ site keeps" value={`$${(saved * (1 - status.alpha - status.beta)).toFixed(2)}`} />
          <p className="text-xs text-ink-muted pt-1">Emergency bands pay exactly R. Nothing is ever billed above R. On a day that saves nothing, the fee is nothing.</p>
        </div>
      </section>

      <section className="mb-8">
        <h2 className="text-lg font-medium text-ink mb-4">Package: {status.package}</h2>
        <div className="border border-border bg-surface p-4 md:p-6 text-sm text-ink">{PACKAGE_COPY[status.package] ?? status.package}</div>
      </section>

      <section>
        <h2 className="text-lg font-medium text-ink mb-4">Time-of-use periods today</h2>
        <div className="border border-border bg-surface w-full text-sm overflow-x-auto">
          <div className="min-w-[480px]">
            <div className="grid grid-cols-4 border-b border-border bg-bg text-ink-muted text-xs uppercase tracking-wider p-4">
              <div>Hours</div>
              <div className="text-right">Energy $/kWh</div>
              <div className="text-right">Mean gCO₂/kWh</div>
              <div className="text-right">Rank</div>
            </div>
            {periods(signal).map((p) => (
              <div key={p.start} className="grid grid-cols-4 items-center p-4 border-b border-border">
                <div className="mono text-ink-muted">{String(p.start).padStart(2, '0')}:00 – {String(p.end).padStart(2, '0')}:00</div>
                <div className={`text-right mono ${p.usd === pmax ? 'text-danger' : ''}`}>${p.usd.toFixed(2)}</div>
                <div className="text-right mono">{Math.round(p.g.reduce((a, b) => a + b, 0) / p.g.length)}</div>
                <div className="text-right text-xs text-ink-muted">{p.usd === Math.min(...prices) ? 'cheapest' : p.usd === pmax ? 'peak' : 'mid'}</div>
              </div>
            ))}
            {signal.length === 0 && <div className="p-8 text-center text-sm text-ink-muted">No tariff loaded — backend offline.</div>}
          </div>
        </div>
      </section>
    </div>
  );
}
