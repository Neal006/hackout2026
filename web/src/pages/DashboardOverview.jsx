import { useGlobalState } from '../context/GlobalStateContext';
import { useNavigate } from 'react-router-dom';

export default function DashboardOverview() {
  const { data } = useGlobalState();
  const { portfolio, sites } = data;
  const navigate = useNavigate();

  return (
    <div className="p-8 max-w-7xl mx-auto w-full">
      <header className="mb-8 flex justify-between items-end border-b border-border pb-4">
        <div>
          <h1 className="text-2xl font-semibold text-ink">Operations Overview</h1>
          <p className="text-sm text-ink-muted mt-1">Today — September 12, 2026</p>
        </div>
        <select className="border border-border bg-surface text-sm p-2 outline-none">
          <option>All sites</option>
          <option>Ahmedabad Office</option>
          <option>Campus North</option>
        </select>
      </header>

      {/* Restrained horizontal KPI row */}
      <div className="flex items-center gap-8 mb-12 border-b border-border pb-8">
        <div className="flex flex-col flex-1 border-r border-border pr-8">
          <span className="text-xs text-ink-muted mb-1">Active sites</span>
          <span className="mono text-2xl text-ink font-medium">{portfolio.totalSites} / 14</span>
        </div>
        <div className="flex flex-col flex-1 border-r border-border pr-8">
          <span className="text-xs text-ink-muted mb-1">Charging now</span>
          <span className="mono text-2xl text-ink font-medium">86 connectors</span>
        </div>
        <div className="flex flex-col flex-1 border-r border-border pr-8">
          <span className="text-xs text-ink-muted mb-1">Energy scheduled</span>
          <span className="mono text-2xl text-ink font-medium">{portfolio.energyScheduledMwh} MWh</span>
        </div>
        <div className="flex flex-col flex-1 border-r border-border pr-8">
          <span className="text-xs text-ink-muted mb-1">Estimated savings</span>
          <span className="mono text-2xl text-saved font-medium">${portfolio.totalSavingsUsd}</span>
        </div>
        <div className="flex flex-col flex-1 border-r border-border pr-8">
          <span className="text-xs text-ink-muted mb-1">Peak avoided</span>
          <span className="mono text-2xl text-ink font-medium">{portfolio.peakAvoidedKw} kW</span>
        </div>
        <div className="flex flex-col flex-1">
          <span className="text-xs text-ink-muted mb-1">CO2 avoided</span>
          <span className="mono text-2xl text-saved font-medium">{portfolio.totalSavingsKgCo2} kg</span>
        </div>
      </div>

      {/* Live Site Power Section */}
      <section className="mb-12">
        <h2 className="text-lg font-medium text-ink mb-4">Live site power — Network Aggregate</h2>
        <div className="border border-border bg-surface p-6 flex flex-col gap-6">
          
          <div className="flex gap-12 border-b border-border pb-4">
            <div className="flex flex-col">
              <span className="text-xs text-ink-muted uppercase tracking-wider mb-1">Current EV Load</span>
              <span className="mono text-xl text-solar font-medium">{portfolio.currentDemandKw} kW</span>
            </div>
            <div className="flex flex-col">
              <span className="text-xs text-ink-muted uppercase tracking-wider mb-1">Building Load</span>
              <span className="mono text-xl text-ink font-medium">210 kW</span>
            </div>
            <div className="flex flex-col">
              <span className="text-xs text-ink-muted uppercase tracking-wider mb-1">Available</span>
              <span className="mono text-xl text-ink font-medium">{portfolio.limitKw - portfolio.currentDemandKw - 210} kW</span>
            </div>
          </div>

          <div className="relative w-full h-48">
            <svg viewBox="0 0 1000 200" preserveAspectRatio="none" className="w-full h-full overflow-visible">
              <line x1="0" y1="20" x2="1000" y2="20" stroke="var(--color-danger)" strokeDasharray="4 4" />
              <text x="1005" y="24" className="text-xs fill-danger">Site Limit</text>
              <text x="0" y="195" className="text-[10px] fill-ink-muted">08:00</text>
              <text x="250" y="195" className="text-[10px] fill-ink-muted">10:00</text>
              <text x="500" y="195" className="text-[10px] fill-ink-muted">12:00</text>
              <text x="750" y="195" className="text-[10px] fill-ink-muted">14:00</text>
              <text x="1000" y="195" className="text-[10px] fill-ink-muted">16:00</text>

              <polyline fill="none" stroke="var(--color-ink-muted)" strokeWidth="1" points="0,150 250,130 500,140 750,120 1000,130" />
              <polyline fill="none" stroke="var(--color-solar)" strokeWidth="2" points="0,130 250,80 500,40 750,90 1000,100" />
            </svg>
          </div>
          <div className="flex gap-4 text-xs text-ink-muted mt-2 justify-center">
            <div className="flex items-center gap-1"><div className="w-3 h-0.5 bg-solar"></div> EV Load</div>
            <div className="flex items-center gap-1"><div className="w-3 h-0.5 bg-ink-muted"></div> Building Load</div>
            <div className="flex items-center gap-1"><div className="w-3 h-0.5 border-t border-dashed border-danger"></div> Hardware Capacity Limit</div>
          </div>
        </div>
      </section>

      {/* Site Status Table */}
      <section>
        <h2 className="text-lg font-medium text-ink mb-4">Site Status</h2>
        <div className="border border-border bg-surface w-full text-sm">
          <div className="grid grid-cols-8 border-b border-border bg-bg text-ink-muted text-xs uppercase tracking-wider p-4">
            <div className="col-span-2">Site</div>
            <div className="col-span-1">Status</div>
            <div className="col-span-1 text-right">Connectors</div>
            <div className="col-span-1 text-right">Charging</div>
            <div className="col-span-1 text-right">Site Load</div>
            <div className="col-span-1 text-right">At Risk</div>
            <div className="col-span-1 text-right">Savings</div>
          </div>
          
          {sites.map((site) => (
            <div 
              key={site.id} 
              onClick={() => navigate('/ops/sites')}
              className="grid grid-cols-8 items-center p-4 border-b border-border hover:bg-bg cursor-pointer transition-colors"
            >
              <div className="col-span-2 font-medium">{site.id}</div>
              <div className="col-span-1">
                <span className={`inline-flex items-center px-1.5 py-0.5 text-[10px] uppercase tracking-wide border ${site.status === 'Normal' ? 'bg-saved/10 text-saved border-saved/20' : 'bg-solar/10 text-solar border-solar/20'}`}>
                  {site.status}
                </span>
              </div>
              <div className="col-span-1 mono text-right">{site.connectors}</div>
              <div className="col-span-1 mono text-right">{site.charging}</div>
              <div className="col-span-1 mono text-right">{site.loadKw} / {site.limitKw}</div>
              <div className="col-span-1 mono text-right text-danger">{site.risk > 0 ? site.risk : '-'}</div>
              <div className="col-span-1 mono text-right text-saved">${site.savings}</div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
