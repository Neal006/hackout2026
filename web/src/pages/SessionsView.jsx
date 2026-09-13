import { useState } from 'react';
import { useGlobalState } from '../context/GlobalStateContext';

export default function SessionsView() {
  const { data } = useGlobalState();
  const [filter, setFilter] = useState('All');

  const filteredSessions = filter === 'All' ? data.sessions : data.sessions.filter(s => s.status === filter);

  return (
    <div className="p-8 max-w-7xl mx-auto w-full">
      <header className="mb-8 flex justify-between items-end border-b border-border pb-4">
        <div>
          <h1 className="text-2xl font-semibold text-ink">Session Management</h1>
          <p className="text-sm text-ink-muted mt-1">Live and historical charging sessions</p>
        </div>
        <div className="flex gap-4">
          <input type="text" placeholder="Search sessions..." className="border border-border bg-surface text-sm p-2 outline-none w-64" />
        </div>
      </header>

      <div className="flex gap-2 mb-6">
        {['All', 'Charging', 'Waiting', 'Completed'].map(f => (
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
        <div className="grid grid-cols-8 border-b border-border bg-bg text-ink-muted text-xs uppercase tracking-wider p-4">
          <div className="col-span-1">Session</div>
          <div className="col-span-1">Site</div>
          <div className="col-span-1">Connector</div>
          <div className="col-span-1">Arrival</div>
          <div className="col-span-1">Energy</div>
          <div className="col-span-1 text-center">Status</div>
          <div className="col-span-1 text-center">Risk</div>
          <div className="col-span-1 text-right">Action</div>
        </div>
        
        <div className="flex flex-col h-[600px] overflow-y-auto">
          {filteredSessions.map((s) => (
            <div key={s.id} className="grid grid-cols-8 items-center p-4 border-b border-border hover:bg-bg transition-colors">
              <div className="col-span-1 mono font-medium text-xs">{s.id}</div>
              <div className="col-span-1 truncate pr-4">{s.site}</div>
              <div className="col-span-1 mono text-xs">{s.connector}</div>
              <div className="col-span-1 mono text-xs">{s.arrival}</div>
              <div className="col-span-1 mono text-xs">{s.energy}</div>
              <div className="col-span-1 text-center">
                <span className={`inline-flex items-center px-1.5 py-0.5 text-[10px] uppercase tracking-wide border ${s.status === 'Completed' ? 'bg-saved/10 text-saved border-saved/20' : s.status === 'Charging' ? 'bg-[#98B62D]/10 text-[#98B62D] border-[#98B62D]/20' : 'bg-[#98B62D]/10 text-[#98B62D] border-[#98B62D]/20'}`}>
                  {s.status}
                </span>
              </div>
              <div className="col-span-1 text-center">
                <span className={`text-xs ${s.risk === 'High' ? 'text-danger font-medium' : 'text-[#98B62D]'}`}>{s.risk}</span>
              </div>
              <div className="col-span-1 text-right">
                <button onClick={() => alert('Session Details:\nSession ID: ' + s.id + '\nArrival: ' + s.arrival + '\nEnergy: ' + s.energy)} className="text-grid-blue hover:text-ink text-xs underline border-0 p-0">Details</button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
