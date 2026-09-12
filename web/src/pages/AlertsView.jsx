import { useGlobalState } from '../context/GlobalStateContext';

export default function AlertsView() {
  const { data, triggerEvent } = useGlobalState();

  const activeAlerts = data.alerts.filter(a => a.status === 'Active');
  const resolvedAlerts = data.alerts.filter(a => a.status === 'Resolved');

  return (
    <div className="p-8 max-w-5xl mx-auto w-full">
      <header className="mb-8 flex justify-between items-end border-b border-border pb-4">
        <div>
          <h1 className="text-2xl font-semibold text-ink">Alert Center</h1>
          <p className="text-sm text-ink-muted mt-1">Operational exceptions and warnings</p>
        </div>
      </header>

      <section className="mb-12">
        <h2 className="text-lg font-medium text-ink mb-4">Active Alerts ({activeAlerts.length})</h2>
        <div className="border border-border bg-surface w-full flex flex-col">
          {activeAlerts.length === 0 ? (
            <div className="p-8 text-center text-sm text-ink-muted">No active alerts.</div>
          ) : (
            activeAlerts.map(a => (
              <div key={a.id} className="flex items-center justify-between p-4 border-b border-border last:border-0 hover:bg-bg transition-colors">
                <div className="flex items-start gap-4">
                  <div className={`w-2 h-2 mt-1.5 rounded-full ${a.severity === 'Critical' ? 'bg-danger' : 'bg-solar'}`}></div>
                  <div className="flex flex-col gap-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-ink text-sm">{a.site}</span>
                      <span className="text-ink-muted text-xs">•</span>
                      <span className="mono text-xs text-ink-muted">{a.entity}</span>
                    </div>
                    <span className="text-sm text-ink">{a.desc}</span>
                    <span className="text-[10px] uppercase text-ink-muted">{a.time}</span>
                  </div>
                </div>
                <div className="flex gap-2">
                  <button className="text-xs uppercase tracking-wider px-3 py-1.5 border border-border hover:bg-bg transition-colors">View</button>
                  <button onClick={() => triggerEvent('resolve_alert', a.id)} className="text-xs uppercase tracking-wider px-3 py-1.5 bg-ink text-surface hover:opacity-90 transition-opacity">Resolve</button>
                </div>
              </div>
            ))
          )}
        </div>
      </section>

      <section>
        <h2 className="text-lg font-medium text-ink mb-4">Recently Resolved</h2>
        <div className="border border-border bg-surface w-full flex flex-col opacity-60">
          {resolvedAlerts.length === 0 ? (
            <div className="p-8 text-center text-sm text-ink-muted">No resolved alerts.</div>
          ) : (
            resolvedAlerts.map(a => (
              <div key={a.id} className="flex items-center justify-between p-4 border-b border-border last:border-0">
                <div className="flex flex-col gap-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-ink text-sm">{a.site}</span>
                    <span className="text-ink-muted text-xs">•</span>
                    <span className="mono text-xs text-ink-muted">{a.entity}</span>
                  </div>
                  <span className="text-sm text-ink">{a.desc}</span>
                </div>
                <span className="text-[10px] uppercase text-ink-muted px-2 py-1 bg-bg border border-border">Resolved</span>
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  );
}
