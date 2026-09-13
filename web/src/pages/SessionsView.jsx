import { useState } from 'react';
import { useGlobalState } from '../context/GlobalStateContext';
import UrgencyControl from '../components/UrgencyControl';

const NEED_COPY = { declared: 'from the driver', history: 'this bay\'s history', site: 'site median' };

export default function SessionsView() {
  const { data } = useGlobalState();
  const [filter, setFilter] = useState('All');

  const rows = filter === 'All' ? data.sessions : data.sessions.filter((s) => s.status === filter);

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto w-full">
      <header className="mb-6 md:mb-8 flex flex-wrap justify-between items-end gap-2 border-b border-border pb-4">
        <div>
          <h1 className="text-2xl font-semibold text-ink">Sessions</h1>
          <p className="text-sm text-ink-muted mt-1">Every plugged-in car today, live from the meter frames · {data.sessions.length} so far{data.status.waiting > 0 ? ` · ${data.status.waiting} waiting for a bay` : ''}</p>
        </div>
      </header>

      <div className="flex flex-wrap gap-2 mb-6">
        {['All', 'Charging', 'Waiting', 'Completed'].map((f) => (
          <button key={f} onClick={() => setFilter(f)} className={`px-3 py-1 text-xs border rounded transition-colors ${filter === f ? 'bg-ink text-surface border-ink' : 'bg-surface text-ink-muted border-border hover:border-ink'}`}>
            {f}
          </button>
        ))}
      </div>

      <div className="border border-border bg-surface w-full text-sm overflow-x-auto">
        <div className="min-w-[960px]">
          <div className="grid grid-cols-12 border-b border-border bg-bg text-ink-muted text-xs uppercase tracking-wider p-4">
            <div className="col-span-1">Session</div>
            <div className="col-span-1">Bay</div>
            <div className="col-span-1">Arrived</div>
            <div className="col-span-1">Ready by</div>
            <div className="col-span-2">Energy · need from</div>
            <div className="col-span-1 text-center">Urgency</div>
            <div className="col-span-1 text-right">Idle</div>
            <div className="col-span-1 text-center">Status</div>
            <div className="col-span-1 text-center">Risk</div>
            <div className="col-span-2 text-right">Set urgency</div>
          </div>

          <div className="flex flex-col max-h-[70vh] overflow-y-auto">
            {rows.length === 0 && <div className="p-8 text-center text-sm text-ink-muted">No sessions {filter === 'All' ? 'yet' : `with status ${filter}`}.</div>}
            {rows.map((s) => (
              <div key={s.id} className={`grid grid-cols-12 items-center p-4 border-b border-border transition-colors ${s.risk === 'High' && s.status !== 'Completed' ? 'bg-danger/10 border-l-4 border-l-danger' : 'hover:bg-bg'}`}>
                <div className="col-span-1 mono font-medium text-xs">{s.id}</div>
                <div className="col-span-1 mono text-xs">
                  {s.connector}
                  {s.asap && <span className="ml-1 text-[9px] uppercase text-ink-muted border border-border px-1">asap bay</span>}
                </div>
                <div className="col-span-1 mono text-xs">{s.arrival}</div>
                <div className="col-span-1 mono text-xs">
                  {s.departure}
                  {s.moveBy && <span className="ml-1 text-[9px] uppercase text-solar">move-by</span>}
                </div>
                <div className="col-span-2 text-xs">
                  <span className="mono">{s.energy}</span>
                  {s.needConfidence && <span className="ml-2 text-[10px] text-ink-muted">{NEED_COPY[s.needConfidence] ?? s.needConfidence}</span>}
                  {s.capObserved && <span className="ml-2 text-[10px] text-ink-muted">· cap {s.pMaxKw} kW (meter)</span>}
                </div>
                <div className="col-span-1 text-center text-xs">{s.urgency ? <span className="text-solar">{s.urgency === 'now' ? 'leaving now' : s.urgency}</span> : <span className="text-ink-muted">—</span>}</div>
                <div className="col-span-1 mono text-xs text-right">{s.idleMin > 0 ? `${s.idleMin} min` : '—'}</div>
                <div className="col-span-1 text-center">
                  <span className={`inline-flex items-center px-1.5 py-0.5 text-[10px] uppercase tracking-wide border ${s.status === 'Completed' ? 'bg-saved/10 text-saved border-saved/20' : s.status === 'Charging' ? 'bg-solar/10 text-solar border-solar/20' : 'bg-bg text-ink-muted border-border'}`}>
                    {s.status}
                  </span>
                </div>
                <div className="col-span-1 text-center">
                  <span className={`text-xs ${s.risk === 'High' ? 'text-danger font-medium' : 'text-ink-muted'}`}>{s.risk}</span>
                </div>
                <div className="col-span-2 text-right">
                  {s.status === 'Completed' ? <span className="text-xs text-ink-muted">—</span> : <UrgencyControl sessionId={s.sid} simTime={data.simTime} current={s.urgency} />}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
