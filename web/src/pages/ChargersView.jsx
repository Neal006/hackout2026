import { useState } from 'react';
import { useGlobalState } from '../context/GlobalStateContext';

export default function ChargersView() {
  const { data } = useGlobalState();
  const [filter, setFilter] = useState('All');

  const filteredChargers = filter === 'All' ? data.chargersList : data.chargersList.filter(c => c.status === filter);

  return (
    <div className="p-8 max-w-7xl mx-auto w-full">
      <header className="mb-8 flex justify-between items-end border-b border-border pb-4">
        <div>
          <h1 className="text-2xl font-semibold text-ink">Charger Fleet</h1>
          <p className="text-sm text-ink-muted mt-1">Hardware monitoring and telemetry</p>
        </div>
      </header>

      <div className="grid grid-cols-6 gap-6 mb-8">
        <div className="border border-border p-4 bg-surface flex flex-col justify-between">
          <span className="text-[10px] uppercase tracking-wider text-ink-muted mb-1 block">Total Chargers</span>
          <span className="mono text-2xl font-medium">{data.chargersList.length}</span>
        </div>
        <div className="border border-border p-4 bg-surface flex flex-col justify-between">
          <span className="text-[10px] uppercase tracking-wider text-ink-muted mb-1 block">Charging</span>
          <span className="mono text-2xl font-medium text-solar">{data.chargersList.filter(c => c.status === 'Charging').length}</span>
        </div>
        <div className="border border-border p-4 bg-surface flex flex-col justify-between">
          <span className="text-[10px] uppercase tracking-wider text-ink-muted mb-1 block">Available</span>
          <span className="mono text-2xl font-medium text-saved">{data.chargersList.filter(c => c.status === 'Available').length}</span>
        </div>
        <div className="border border-border p-4 bg-surface flex flex-col justify-between">
          <span className="text-[10px] uppercase tracking-wider text-ink-muted mb-1 block">Offline</span>
          <span className="mono text-2xl font-medium text-ink-muted">{data.chargersList.filter(c => c.status === 'Offline').length}</span>
        </div>
        <div className="border border-border p-4 bg-surface flex flex-col justify-between">
          <span className="text-[10px] uppercase tracking-wider text-ink-muted mb-1 block">Faulted</span>
          <span className="mono text-2xl font-medium text-danger">{data.chargersList.filter(c => c.status === 'Faulted').length}</span>
        </div>
      </div>

      <div className="flex gap-2 mb-6">
        {['All', 'Charging', 'Available', 'Offline', 'Faulted'].map(f => (
          <button 
            key={f} 
            onClick={() => setFilter(f)}
            className={`px-3 py-1 text-xs border rounded transition-colors ${filter === f ? 'bg-ink text-surface border-ink' : 'bg-surface text-ink-muted border-border hover:border-ink'}`}
          >
            {f}
          </button>
        ))}
      </div>

      <div className="border border-border bg-surface w-full text-sm">
        <div className="grid grid-cols-7 border-b border-border bg-bg text-ink-muted text-[10px] uppercase tracking-wider p-4">
          <div className="col-span-1">Charger ID</div>
          <div className="col-span-1">Site</div>
          <div className="col-span-1">Connector</div>
          <div className="col-span-1 text-center">Status</div>
          <div className="col-span-1 text-right">Power</div>
          <div className="col-span-1 text-right">Energy Today</div>
          <div className="col-span-1 text-right">Last Heartbeat</div>
        </div>
        
        <div className="flex flex-col h-[500px] overflow-y-auto">
          {filteredChargers.map((c) => (
            <div key={c.id} className="grid grid-cols-7 items-center p-4 border-b border-border hover:bg-bg transition-colors">
              <div className="col-span-1 mono font-medium text-xs">{c.id}</div>
              <div className="col-span-1 truncate pr-4 text-xs">{c.site}</div>
              <div className="col-span-1 mono text-xs">{c.connector}</div>
              <div className="col-span-1 text-center">
                <span className={`inline-flex items-center px-1.5 py-0.5 text-[10px] uppercase tracking-wide border ${c.status === 'Available' ? 'bg-saved/10 text-saved border-saved/20' : c.status === 'Charging' ? 'bg-solar/10 text-solar border-solar/20' : c.status === 'Faulted' ? 'bg-danger/10 text-danger border-danger/20' : 'bg-bg text-ink-muted border-border'}`}>
                  {c.status}
                </span>
              </div>
              <div className="col-span-1 mono text-xs text-right">{c.status === 'Charging' ? c.power.toFixed(1) + ' kW' : '-'}</div>
              <div className="col-span-1 mono text-xs text-right">{c.energyToday.toFixed(1)} kWh</div>
              <div className="col-span-1 mono text-xs text-right text-ink-muted">{c.lastHeartbeat}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
