import { useState } from 'react';
import { useGlobalState } from '../context/GlobalStateContext';

const Kpi = ({ label, value, tone = 'text-ink' }) => (
  <div className="border border-border p-4 bg-surface flex flex-col justify-between">
    <span className="text-[10px] uppercase tracking-wider text-ink-muted mb-1 block">{label}</span>
    <span className={`mono text-2xl font-medium ${tone}`}>{value}</span>
  </div>
);

export default function ChargersView() {
  const { data } = useGlobalState();
  const { chargersList, status } = data;
  const [filter, setFilter] = useState('All');

  const rows = filter === 'All' ? chargersList : filter === 'ASAP bays' ? chargersList.filter((c) => c.asap) : chargersList.filter((c) => c.status === filter);
  const count = (st) => chargersList.filter((c) => c.status === st).length;

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto w-full">
      <header className="mb-6 md:mb-8 flex flex-wrap justify-between items-end gap-2 border-b border-border pb-4">
        <div>
          <h1 className="text-2xl font-semibold text-ink">Chargers</h1>
          <p className="text-sm text-ink-muted mt-1">
            {status.nConnectors} × {status.pMaxKw} kW on a {status.feedKw} kW feed · static share {status.safeShareKw} kW each when the controller is offline
          </p>
        </div>
      </header>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-4 md:gap-6 mb-8">
        <Kpi label="Chargers" value={chargersList.length} />
        <Kpi label="Charging" value={count('Charging')} tone="text-solar" />
        <Kpi label="Available" value={count('Available')} tone="text-saved" />
        <Kpi label="Full, still plugged" value={count('Done')} tone="text-ink-muted" />
        <Kpi label="ASAP bays" value={status.connectorsAsap.length} />
      </div>

      <div className="flex flex-wrap gap-2 mb-6">
        {['All', 'Charging', 'Available', 'Done', 'Waiting', 'ASAP bays'].map((f) => (
          <button key={f} onClick={() => setFilter(f)} className={`px-3 py-1 text-xs border rounded transition-colors ${filter === f ? 'bg-ink text-surface border-ink' : 'bg-surface text-ink-muted border-border hover:border-ink'}`}>
            {f}
          </button>
        ))}
      </div>

      <div className="border border-border bg-surface w-full text-sm overflow-x-auto">
        <div className="min-w-[760px]">
          <div className="grid grid-cols-8 border-b border-border bg-bg text-ink-muted text-[10px] uppercase tracking-wider p-4">
            <div className="col-span-1">Charger</div>
            <div className="col-span-1 text-center">Status</div>
            <div className="col-span-1 text-right">Power now</div>
            <div className="col-span-1 text-right">Plan cap</div>
            <div className="col-span-1 text-right">Static share</div>
            <div className="col-span-1 text-right">Energy today</div>
            <div className="col-span-1 text-right">Idle</div>
            <div className="col-span-1 text-right">Session</div>
          </div>

          <div className="flex flex-col max-h-[60vh] overflow-y-auto">
            {rows.map((c) => (
              <div key={c.id} className="grid grid-cols-8 items-center p-4 border-b border-border hover:bg-bg transition-colors">
                <div className="col-span-1 mono font-medium text-xs">
                  {c.id}
                  {c.asap && <span className="ml-1 text-[9px] uppercase text-ink-muted border border-border px-1">asap</span>}
                </div>
                <div className="col-span-1 text-center">
                  <span className={`inline-flex items-center px-1.5 py-0.5 text-[10px] uppercase tracking-wide border ${c.status === 'Available' ? 'bg-saved/10 text-saved border-saved/20' : c.status === 'Charging' ? 'bg-solar/10 text-solar border-solar/20' : 'bg-bg text-ink-muted border-border'}`}>
                    {c.status}
                  </span>
                </div>
                <div className="col-span-1 mono text-xs text-right">{c.status === 'Charging' ? `${c.power.toFixed(1)} kW` : '-'}</div>
                <div className="col-span-1 mono text-xs text-right">
                  {c.pMaxKw.toFixed(1)} kW{c.capObserved && <span className="ml-1 text-[9px] text-ink-muted">meter</span>}
                </div>
                <div className="col-span-1 mono text-xs text-right text-ink-muted">{status.safeShareKw} kW</div>
                <div className="col-span-1 mono text-xs text-right">{c.energyToday.toFixed(1)} kWh</div>
                <div className="col-span-1 mono text-xs text-right">{c.idleMin > 0 ? `${c.idleMin} min` : '-'}</div>
                <div className="col-span-1 mono text-xs text-right text-ink-muted">{c.sessionId ?? '-'}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
