import { useState } from 'react';
import { useGlobalState } from '../context/GlobalStateContext';
import { useNavigate } from 'react-router-dom';
import UrgencyControl from '../components/UrgencyControl';

const NEED_COPY = { declared: 'driver', history: 'bay history', site: 'site median' };

const Field = ({ label, children, tone = '' }) => (
  <div className="flex justify-between gap-3 border-b border-border pb-2">
    <span className="text-ink-muted">{label}</span>
    <span className={`mono text-right ${tone}`}>{children}</span>
  </div>
);

export default function OpsDashboard() {
  const { data } = useGlobalState();
  const { siteDetail: site, status } = data;
  const navigate = useNavigate();
  const [selectedId, setSelectedId] = useState(null);
  const selected = selectedId ? site.connectors.find((c) => c.id === selectedId) : null;

  return (
    <div className="flex flex-col md:h-screen md:max-h-screen">
      <header className="px-4 md:px-8 py-4 md:py-6 border-b border-border shrink-0 bg-surface">
        <div className="flex flex-wrap justify-between items-end gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-ink">{site.id} · live charging</h1>
            <p className="text-sm text-ink-muted mt-1">{site.connectors.length} cars plugged in{status.waiting > 0 ? ` · ${status.waiting} waiting for a bay` : ''}</p>
          </div>
          <div className="flex flex-wrap gap-6 md:gap-8 text-right text-sm">
            <div className="flex flex-col">
              <span className="text-[10px] uppercase tracking-wider text-ink-muted">Mode</span>
              <span className={`font-medium ${status.mode === 'live' ? 'text-saved' : 'text-solar'}`}>{status.mode}</span>
            </div>
            <div className="flex flex-col">
              <span className="text-[10px] uppercase tracking-wider text-ink-muted">Feed</span>
              <span className="mono text-ink font-medium">{site.limitKw} kW</span>
            </div>
            <div className="flex flex-col">
              <span className="text-[10px] uppercase tracking-wider text-ink-muted">EV load</span>
              <span className="mono text-solar font-medium">{site.evLoadKw} kW</span>
            </div>
            <div className="flex flex-col">
              <span className="text-[10px] uppercase tracking-wider text-ink-muted">Headroom</span>
              <span className="mono text-ink font-medium">{Math.max(0, site.limitKw - site.currentLoadKw)} kW</span>
            </div>
          </div>
        </div>
      </header>

      <main className="flex-1 flex flex-col md:flex-row md:overflow-hidden bg-bg">
        {/* Gantt */}
        <div className="flex-1 md:overflow-y-auto p-4 md:p-8 md:border-r border-border">
          <div className="flex flex-wrap justify-between items-end gap-2 mb-4">
            <h2 className="text-lg font-medium text-ink">Plan per bay, 06:00 → 22:00</h2>
            <div className="flex flex-wrap gap-4 text-[10px] uppercase tracking-wider text-ink-muted">
              <span className="flex items-center gap-1"><div className="w-3 h-3 bg-solar/20"></div> Planned</span>
              <span className="flex items-center gap-1"><div className="w-3 h-3 bg-grid-blue/80"></div> Delivered</span>
              <span className="flex items-center gap-1"><div className="w-1.5 h-1.5 bg-ink rotate-45"></div> Ready by</span>
              <span className="flex items-center gap-1"><div className="w-[2px] h-3 bg-danger"></div> Urgent</span>
            </div>
          </div>

          <div className="border border-border bg-surface flex flex-col overflow-x-auto">
            <div className="min-w-[560px]">
              <div className="flex border-b border-border bg-bg px-4 py-2">
                <div className="w-20 text-xs text-ink-muted mono shrink-0">Bay</div>
                <div className="flex-1 flex justify-between text-[10px] text-ink-muted mono">
                  <span>06</span><span>08</span><span>10</span><span>12</span><span>14</span><span>16</span><span>18</span><span>20</span><span>22</span>
                </div>
              </div>

              <div className="flex flex-col p-4 gap-2">
                {site.connectors.length === 0 && <div className="text-sm text-ink-muted text-center py-8">No cars plugged in yet.</div>}
                {site.connectors.map((c) => (
                  <div key={c.id} onClick={() => setSelectedId(c.id)} className={`flex items-center gap-4 group cursor-pointer p-1 -mx-1 rounded transition-colors ${selected?.id === c.id ? 'bg-bg' : 'hover:bg-bg/50'}`}>
                    <span className="mono text-xs w-16 shrink-0 text-ink-muted group-hover:text-ink flex flex-col leading-tight">
                      {c.id}
                      {c.asap && <span className="text-[9px] uppercase">asap</span>}
                      {c.urgency && <span className="text-[9px] uppercase text-danger">{c.urgency}</span>}
                    </span>
                    <div className={`flex-1 h-6 relative bg-bg border transition-colors ${c.urgency ? 'border-danger' : c.risk === 'High' ? 'border-danger/50' : 'border-border group-hover:border-ink/20'}`}>
                      <div className="absolute top-0 bottom-0 bg-solar/20" style={{ left: `${c.startPct}%`, width: `${c.planWidth}%` }}>
                        <div className="absolute top-1 bottom-1 left-0 bg-grid-blue/80" style={{ width: `${(c.actualWidth / c.planWidth) * 100}%` }}></div>
                      </div>
                      <div className="absolute top-1/2 w-2 h-2 bg-ink" style={{ left: `${c.startPct + c.planWidth}%`, transform: 'translate(-50%, -50%) rotate(45deg)' }}></div>
                      {(c.hasBoost || c.urgency) && <div className="absolute top-0 bottom-0 w-[2px] bg-danger" style={{ left: `${c.startPct}%` }}></div>}
                      {c.moveBy && <span className="absolute right-1 top-0 text-[9px] uppercase text-solar">move-by</span>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Side panel */}
        {selected && (
          <aside className="md:w-80 shrink-0 bg-surface flex flex-col md:overflow-y-auto border-t md:border-t-0 border-border">
            <div className="p-4 md:p-6 border-b border-border flex justify-between items-center sticky top-0 bg-surface z-10">
              <h2 className="text-xl font-semibold">{selected.id} · session {selected.sessionId}</h2>
              <button onClick={() => setSelectedId(null)} className="text-ink-muted hover:text-ink text-sm">Close</button>
            </div>

            <div className="p-4 md:p-6 flex flex-col gap-6">
              <div className="flex flex-col gap-1">
                <span className="text-[10px] uppercase tracking-wider text-ink-muted">Status</span>
                <span className={`inline-flex w-max items-center px-2 py-0.5 rounded text-[10px] uppercase font-mono ${selected.status === 'Charging' ? 'bg-solar/10 text-solar border border-solar/20' : 'bg-bg border border-border'}`}>{selected.status}</span>
              </div>

              <div className="flex flex-col gap-3 text-sm">
                <Field label="Needs">{selected.energyReq.toFixed(1)} kWh <span className="text-ink-muted text-xs">({NEED_COPY[selected.needConfidence] ?? '—'})</span></Field>
                <Field label="Delivered">{selected.delivered.toFixed(1)} kWh</Field>
                <Field label="Power now">{selected.power.toFixed(1)} kW</Field>
                <Field label="Plan cap">{selected.pMaxKw.toFixed(1)} kW{selected.capObserved && <span className="text-ink-muted text-xs"> (from the meter)</span>}</Field>
                <Field label="Scheduled">{selected.scheduled}</Field>
                <Field label="Ready by">{selected.readyBy}{selected.moveBy && <span className="text-solar text-xs"> move-by</span>}</Field>
                <Field label="Urgency">{selected.urgency ?? '—'}</Field>
                {selected.idleMin > 0 && <Field label="Idle since full">{selected.idleMin} min</Field>}
                {selected.asap && <Field label="Bay">ASAP (never deferred)</Field>}
                <Field label="Deadline risk" tone={selected.risk === 'High' ? 'text-danger font-medium' : 'text-saved'}>{selected.risk}</Field>
              </div>

              <div className="flex flex-col gap-3">
                <span className="text-[10px] uppercase tracking-wider text-ink-muted">Set urgency for this driver</span>
                {selected.status === 'Done' ? <span className="text-xs text-ink-muted">Car is full.</span> : <UrgencyControl sessionId={selected.sessionId} simTime={data.simTime} current={selected.urgency} compact />}
              </div>

              <div className="flex flex-col gap-2 mt-2">
                <button onClick={() => navigate('/ops/sessions')} className="w-full text-xs uppercase tracking-wider border border-border py-2 hover:bg-bg transition-colors">All sessions</button>
                <button onClick={() => navigate('/ops/schedules')} className="w-full text-xs uppercase tracking-wider border border-border py-2 hover:bg-bg transition-colors">Today's plan</button>
              </div>
            </div>
          </aside>
        )}
      </main>
    </div>
  );
}
