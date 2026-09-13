import { useGlobalState } from '../context/GlobalStateContext';
import { useNavigate } from 'react-router-dom';

const PAGE_FOR = { Signal: '/ops/schedules', 'Site Load': '/ops/overview', Bays: '/ops/sessions', Site: '/ops/sites', System: '/ops/overview' };

export default function AlertsView() {
  const { data, triggerEvent } = useGlobalState();
  const navigate = useNavigate();

  const active = data.alerts.filter((a) => a.status === 'Active');
  const done = data.alerts.filter((a) => a.status === 'Resolved');
  const view = (a) => navigate(PAGE_FOR[a.entity] ?? '/ops/sites');

  return (
    <div className="p-4 md:p-8 max-w-5xl mx-auto w-full">
      <header className="mb-6 md:mb-8 border-b border-border pb-4">
        <h1 className="text-2xl font-semibold text-ink">Alerts</h1>
        <p className="text-sm text-ink-muted mt-1">Every event the backend broadcasts: urgency, done, observed caps, move-by, ladder changes, queue. Resolving is local to this screen.</p>
      </header>

      <section className="mb-8 md:mb-12">
        <h2 className="text-lg font-medium text-ink mb-4">Active ({active.length})</h2>
        <div className="border border-border bg-surface w-full flex flex-col">
          {active.length === 0 ? (
            <div className="p-8 text-center text-sm text-ink-muted">Nothing needs attention.</div>
          ) : (
            active.map((a) => (
              <div key={a.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 border-b border-border last:border-0 hover:bg-bg transition-colors">
                <div className="flex items-start gap-4 min-w-0">
                  <div className={`w-2 h-2 mt-1.5 rounded-full shrink-0 ${a.severity === 'Critical' ? 'bg-danger' : a.severity === 'Warning' ? 'bg-solar' : 'bg-ink-muted'}`}></div>
                  <div className="flex flex-col gap-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="mono text-xs text-ink-muted">{a.entity}</span>
                      <span className="text-ink-muted text-xs">•</span>
                      <span className="text-[10px] uppercase text-ink-muted">{a.severity}</span>
                    </div>
                    <span className="text-sm text-ink">{a.desc}</span>
                    <span className="text-[10px] uppercase text-ink-muted">{a.time}</span>
                  </div>
                </div>
                <div className="flex gap-2 shrink-0">
                  <button onClick={() => view(a)} className="text-xs uppercase tracking-wider px-3 py-1.5 border border-border hover:bg-bg transition-colors">View</button>
                  <button onClick={() => triggerEvent('resolve_alert', a.id)} className="text-xs uppercase tracking-wider px-3 py-1.5 bg-ink text-surface hover:opacity-90 transition-opacity">Resolve</button>
                </div>
              </div>
            ))
          )}
        </div>
      </section>

      <section>
        <h2 className="text-lg font-medium text-ink mb-4">Resolved</h2>
        <div className="border border-border bg-surface w-full flex flex-col opacity-60">
          {done.length === 0 ? (
            <div className="p-8 text-center text-sm text-ink-muted">Nothing resolved yet.</div>
          ) : (
            done.map((a) => (
              <div key={a.id} className="flex items-center justify-between gap-3 p-4 border-b border-border last:border-0">
                <div className="flex flex-col gap-1 min-w-0">
                  <span className="mono text-xs text-ink-muted">{a.entity} · {a.time}</span>
                  <span className="text-sm text-ink">{a.desc}</span>
                </div>
                <span className="text-[10px] uppercase text-ink-muted px-2 py-1 bg-bg border border-border shrink-0">Resolved</span>
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  );
}
