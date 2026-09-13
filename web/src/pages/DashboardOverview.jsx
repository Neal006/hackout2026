import { useGlobalState } from '../context/GlobalStateContext';
import { useNavigate } from 'react-router-dom';

// 06:00-22:00 on x (0-1000); the top line sits at y=20 (= the y-axis max), zero load at y=180. Hours not yet reached stay at 0.
const linePoints = (ticks, pick, maxKw) =>
  ticks
    .filter((t) => t.time >= 6 && t.time <= 22)
    .map((t) => `${((t.time - 6) / 16) * 1000},${180 - Math.min(1, pick(t) / (maxKw || 1)) * 160}`)
    .join(' ');
const yOf = (kw, maxKw) => 180 - Math.min(1, kw / (maxKw || 1)) * 160;

function Ring({ value }) {
  const r = 26;
  const c = 2 * Math.PI * r;
  return (
    <svg viewBox="0 0 64 64" className="w-16 h-16 shrink-0" role="img" aria-label={`renewable-hour share ${Math.round(value * 100)} percent`}>
      <circle cx="32" cy="32" r={r} fill="none" stroke="var(--color-border)" strokeWidth="6" />
      <circle cx="32" cy="32" r={r} fill="none" stroke="var(--color-saved)" strokeWidth="6" strokeDasharray={`${c * value} ${c}`} transform="rotate(-90 32 32)" />
      <text x="32" y="36" textAnchor="middle" className="mono text-[12px] fill-ink">{Math.round(value * 100)}%</text>
    </svg>
  );
}

export default function DashboardOverview() {
  const { data } = useGlobalState();
  const { portfolio, sites, status, siteDetail } = data;
  const navigate = useNavigate();
  const yMax = Math.max(status.contractedPeakKw, status.feedKw, 1);
  const portsAtFullPower = status.pMaxKw ? Math.floor(status.feedKw / status.pMaxKw) : 0;

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto w-full">
      <header className="mb-6 md:mb-8 flex flex-wrap justify-between items-end gap-2 border-b border-border pb-4">
        <div>
          <h1 className="text-2xl font-semibold text-ink">{siteDetail.id}</h1>
          <p className="text-sm text-ink-muted mt-1">Replay day {data.simTime ? new Date(data.simTime).toDateString() : '—'} · live from Noonshift</p>
        </div>
        <div className={`inline-flex items-center gap-2 px-2 py-1 text-xs border ${status.mode === 'live' ? 'bg-saved/10 text-saved border-saved/20' : 'bg-solar/10 text-solar border-solar/20'}`} title={status.modeCopy}>
          <span className="w-2 h-2 rounded-full bg-current"></span>
          mode {status.mode}
        </div>
      </header>

      {/* What the facilities manager is paid to watch, in that order */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-x-6 gap-y-6 mb-8 border-b border-border pb-8">
        <div className="flex flex-col lg:border-r border-border lg:pr-6">
          <span className="text-xs text-ink-muted mb-1">Building + EV load vs contracted peak</span>
          <span className={`mono text-2xl font-medium ${portfolio.currentDemandKw > status.contractedPeakKw ? 'text-danger' : 'text-ink'}`}>
            {portfolio.currentDemandKw} <span className="text-base text-ink-muted">/ {status.contractedPeakKw} kW</span>
          </span>
        </div>
        <div className="flex flex-col lg:border-r border-border lg:pr-6">
          <span className="text-xs text-ink-muted mb-1">Ports on this feed</span>
          <span className="mono text-2xl font-medium text-ink">
            {status.nConnectors} <span className="text-base text-ink-muted">· {portsAtFullPower} fit at full power</span>
          </span>
        </div>
        <div className="flex flex-col lg:border-r border-border lg:pr-6">
          <span className="text-xs text-ink-muted mb-1">Employees charged today / at risk</span>
          <span className="mono text-2xl font-medium text-ink">
            {portfolio.chargedToday} <span className="text-base text-ink-muted">/</span> <span className={portfolio.atRisk > 0 ? 'text-danger' : 'text-ink-muted'}>{portfolio.atRisk}</span>
          </span>
        </div>
        <div className="flex flex-col lg:border-r border-border lg:pr-6">
          <span className="text-xs text-ink-muted mb-1">CO₂ avoided today (est.)</span>
          <span className="mono text-2xl font-medium text-saved">{portfolio.totalSavingsKgCo2} kg</span>
          <span className="mono text-xs text-ink-muted mt-1">${portfolio.totalSavingsUsd} saved · {portfolio.peakAvoidedKw} kW peak avoided</span>
        </div>
        <div className="flex items-center gap-3">
          <Ring value={portfolio.renewableShare} />
          <div className="flex flex-col">
            <span className="text-xs text-ink-muted">Renewable-hour share</span>
            <span className="text-[11px] text-ink-muted">of charged kWh in hours where the next kWh was renewable</span>
          </div>
        </div>
      </div>

      {/* Live site power */}
      <section className="mb-8 md:mb-12">
        <h2 className="text-lg font-medium text-ink mb-4">Site power today</h2>
        <div className="border border-border bg-surface p-4 md:p-6 flex flex-col gap-6">
          <div className="flex flex-wrap gap-6 md:gap-12 border-b border-border pb-4">
            <div className="flex flex-col">
              <span className="text-xs text-ink-muted uppercase tracking-wider mb-1">EV load</span>
              <span className="mono text-xl text-solar font-medium">{siteDetail.evLoadKw} kW</span>
            </div>
            <div className="flex flex-col">
              <span className="text-xs text-ink-muted uppercase tracking-wider mb-1">Building load</span>
              <span className="mono text-xl text-ink font-medium">{siteDetail.buildingLoadKw} kW</span>
            </div>
            <div className="flex flex-col">
              <span className="text-xs text-ink-muted uppercase tracking-wider mb-1">Headroom to feed</span>
              <span className="mono text-xl text-ink font-medium">{Math.max(0, status.feedKw - portfolio.currentDemandKw)} kW</span>
            </div>
            <div className="flex flex-col">
              <span className="text-xs text-ink-muted uppercase tracking-wider mb-1">Static share if we vanish</span>
              <span className="mono text-xl text-ink font-medium">{status.nConnectors} × {status.safeShareKw} kW</span>
            </div>
          </div>

          <div className="w-full overflow-x-auto">
            <div className="relative h-48 min-w-[640px]">
              <svg viewBox="0 0 1000 200" preserveAspectRatio="none" className="w-full h-full overflow-visible">
                <line x1="0" y1={yOf(status.feedKw, yMax)} x2="1000" y2={yOf(status.feedKw, yMax)} stroke="var(--color-danger)" strokeDasharray="4 4" />
                <text x="900" y={yOf(status.feedKw, yMax) - 5} className="text-xs fill-danger">Feed {status.feedKw} kW</text>
                {status.contractedPeakKw !== status.feedKw && (
                  <>
                    <line x1="0" y1={yOf(status.contractedPeakKw, yMax)} x2="1000" y2={yOf(status.contractedPeakKw, yMax)} stroke="var(--color-ink)" strokeDasharray="6 3" />
                    <text x="760" y={yOf(status.contractedPeakKw, yMax) - 5} className="text-xs fill-ink">Contracted peak {status.contractedPeakKw} kW</text>
                  </>
                )}
                {portfolio.blockKw > 0 && (
                  <>
                    <line x1="0" y1={yOf(portfolio.blockKw, yMax)} x2="1000" y2={yOf(portfolio.blockKw, yMax)} stroke="var(--color-solar)" strokeDasharray="2 4" />
                    <text x="900" y={yOf(portfolio.blockKw, yMax) - 5} className="text-xs fill-solar">Tariff block {portfolio.blockKw} kW</text>
                  </>
                )}
                {[6, 10, 14, 18, 22].map((h) => (
                  <text key={h} x={((h - 6) / 16) * 1000} y="195" className="text-[10px] fill-ink-muted">{String(h).padStart(2, '0')}:00</text>
                ))}
                <polyline fill="none" stroke="var(--color-ink-muted)" strokeWidth="1" points={linePoints(siteDetail.meter_ticks, (t) => t.building, yMax)} />
                <polyline fill="none" stroke="var(--color-solar)" strokeWidth="2" points={linePoints(siteDetail.meter_ticks, (t) => t.ev + t.building, yMax)} />
              </svg>
            </div>
          </div>
          <div className="flex flex-wrap gap-4 text-xs text-ink-muted mt-2 justify-center">
            <div className="flex items-center gap-1"><div className="w-3 h-0.5 bg-solar"></div> Building + EV</div>
            <div className="flex items-center gap-1"><div className="w-3 h-0.5 bg-ink-muted"></div> Building</div>
            <div className="flex items-center gap-1"><div className="w-3 h-0.5 border-t border-dashed border-danger"></div> Feed</div>
            <div className="flex items-center gap-1"><div className="w-3 h-0.5 border-t border-dashed border-solar"></div> Tariff block</div>
          </div>
        </div>
      </section>

      {/* Site row */}
      <section>
        <h2 className="text-lg font-medium text-ink mb-4">Site</h2>
        <div className="border border-border bg-surface w-full text-sm overflow-x-auto">
          <div className="min-w-[640px]">
            <div className="grid grid-cols-8 border-b border-border bg-bg text-ink-muted text-xs uppercase tracking-wider p-4">
              <div className="col-span-2">Site</div>
              <div className="col-span-1">Status</div>
              <div className="col-span-1 text-right">Ports</div>
              <div className="col-span-1 text-right">Charging</div>
              <div className="col-span-1 text-right">Load / feed</div>
              <div className="col-span-1 text-right">At risk</div>
              <div className="col-span-1 text-right">Waiting</div>
            </div>
            {sites.map((site) => (
              <div key={site.id} onClick={() => navigate('/ops/sites')} className="grid grid-cols-8 items-center p-4 border-b border-border hover:bg-bg cursor-pointer transition-colors">
                <div className="col-span-2 font-medium">{site.id}</div>
                <div className="col-span-1">
                  <span className={`inline-flex items-center px-1.5 py-0.5 text-[10px] uppercase tracking-wide border ${site.status === 'Normal' ? 'bg-saved/10 text-saved border-saved/20' : 'bg-solar/10 text-solar border-solar/20'}`}>{site.status}</span>
                </div>
                <div className="col-span-1 mono text-right">{site.connectors}</div>
                <div className="col-span-1 mono text-right">{site.charging}</div>
                <div className="col-span-1 mono text-right">{site.loadKw} / {site.limitKw}</div>
                <div className="col-span-1 mono text-right text-danger">{site.risk > 0 ? site.risk : '-'}</div>
                <div className="col-span-1 mono text-right">{status.waiting > 0 ? status.waiting : '-'}</div>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
