import { useGlobalState } from '../context/GlobalStateContext';

// Numbers come from GET /sites/{id}/impact: deltas vs the charge-immediately baseline, labelled estimates.
export default function ImpactView() {
  const { data } = useGlobalState();
  const { impact, id: siteId } = data.siteDetail;
  const perSession = impact.sessions ? impact.saved_kgco2 / impact.sessions : 0;

  const Card = ({ label, value, saved }) => (
    <div className="border border-border p-5 bg-surface flex flex-col justify-between">
      <span className="text-[10px] uppercase tracking-wider text-ink-muted mb-1 block">{label}</span>
      <span className={`mono text-3xl font-medium ${saved ? 'text-saved' : 'text-ink'}`}>{value}</span>
    </div>
  );

  return (
    <div className="p-8 max-w-5xl mx-auto w-full">
      <header className="mb-8 flex justify-between items-end border-b border-border pb-4">
        <div>
          <h1 className="text-2xl font-semibold text-ink">Business Impact</h1>
          <p className="text-sm text-ink-muted mt-1">Noonshift vs Charge-Immediately Baseline (today, {siteId})</p>
        </div>
        <span className="text-[10px] uppercase tracking-wider text-ink-muted">estimate · metered vs baseline frozen at plug-in</span>
      </header>

      <div className="grid grid-cols-4 gap-6 mb-12">
        <Card label="Energy Delivered" value={`${(impact.kwh / 1000).toFixed(2)} MWh`} />
        <Card label="Estimated Cost Saved" value={`$${impact.saved_usd.toFixed(2)}`} saved />
        <Card label="Sessions Counted" value={impact.sessions} />
        <Card label="Estimated CO2 Avoided" value={`${impact.saved_kgco2.toFixed(1)} kg`} saved />
      </div>

      <section>
        <h2 className="text-lg font-medium text-ink mb-6">Counterfactual Comparison</h2>
        <div className="grid grid-cols-2 gap-8">
          <div className="border border-border bg-surface p-6 flex flex-col gap-4">
            <h3 className="font-semibold text-ink-muted uppercase tracking-wider text-xs text-center pb-4 border-b border-border">Baseline (Charge Immediately)</h3>
            <p className="text-sm text-ink-muted">
              Every car draws full power from the moment it plugs in, under the same feed. Same {impact.kwh.toFixed(1)} kWh delivered.
            </p>
          </div>
          <div className="border-2 border-grid-blue bg-surface p-6 flex flex-col gap-4 relative shadow-[0_0_15px_rgba(59,130,246,0.1)]">
            <h3 className="font-semibold text-grid-blue uppercase tracking-wider text-xs text-center pb-4 border-b border-border">Noonshift Scheduled</h3>
            <div className="flex justify-between items-end">
              <span className="text-sm text-ink-muted">Bill delta</span>
              <span className="mono text-xl text-saved font-medium">−${impact.saved_usd.toFixed(2)}</span>
            </div>
            <div className="flex justify-between items-end">
              <span className="text-sm text-ink-muted">CO2 delta</span>
              <span className="mono text-xl text-saved font-medium">−{impact.saved_kgco2.toFixed(1)} kg</span>
            </div>
            <div className="flex justify-between items-end">
              <span className="text-sm text-ink-muted">Per session</span>
              <span className="mono text-xl text-ink font-medium">{perSession.toFixed(2)} kg</span>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
