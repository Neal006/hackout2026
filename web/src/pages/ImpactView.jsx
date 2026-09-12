export default function ImpactView() {
  return (
    <div className="p-8 max-w-5xl mx-auto w-full">
      <header className="mb-8 flex justify-between items-end border-b border-border pb-4">
        <div>
          <h1 className="text-2xl font-semibold text-ink">Business Impact</h1>
          <p className="text-sm text-ink-muted mt-1">Noonshift vs Charge-Immediately Baseline (YTD)</p>
        </div>
      </header>

      <div className="grid grid-cols-4 gap-6 mb-12">
        <div className="border border-border p-5 bg-surface flex flex-col justify-between">
          <span className="text-[10px] uppercase tracking-wider text-ink-muted mb-1 block">Energy Shifted</span>
          <span className="mono text-3xl font-medium">1.42 MWh</span>
        </div>
        <div className="border border-border p-5 bg-surface flex flex-col justify-between">
          <span className="text-[10px] uppercase tracking-wider text-ink-muted mb-1 block">Estimated Cost Saved</span>
          <span className="mono text-3xl font-medium text-saved">$428.50</span>
        </div>
        <div className="border border-border p-5 bg-surface flex flex-col justify-between">
          <span className="text-[10px] uppercase tracking-wider text-ink-muted mb-1 block">Peak Demand Avoided</span>
          <span className="mono text-3xl font-medium text-ink">94 kW</span>
        </div>
        <div className="border border-border p-5 bg-surface flex flex-col justify-between">
          <span className="text-[10px] uppercase tracking-wider text-ink-muted mb-1 block">Estimated CO2 Avoided</span>
          <span className="mono text-3xl font-medium text-saved">136 kg</span>
        </div>
      </div>

      <section>
        <h2 className="text-lg font-medium text-ink mb-6">Counterfactual Comparison</h2>
        
        <div className="grid grid-cols-2 gap-8">
          <div className="border border-border bg-surface p-6 flex flex-col gap-6">
            <h3 className="font-semibold text-ink-muted uppercase tracking-wider text-xs text-center pb-4 border-b border-border">Baseline (Charge Immediately)</h3>
            
            <div className="flex flex-col gap-4">
              <div className="flex justify-between items-end">
                <span className="text-sm text-ink-muted">Energy Cost</span>
                <span className="mono text-xl text-ink font-medium">$842</span>
              </div>
              <div className="w-full h-2 bg-danger/20"><div className="h-full bg-danger" style={{width: '100%'}}></div></div>
              
              <div className="flex justify-between items-end mt-4">
                <span className="text-sm text-ink-muted">Peak Load</span>
                <span className="mono text-xl text-ink font-medium">210 kW</span>
              </div>
              <div className="w-full h-2 bg-danger/20"><div className="h-full bg-danger" style={{width: '100%'}}></div></div>

              <div className="flex justify-between items-end mt-4">
                <span className="text-sm text-ink-muted">Carbon Generated</span>
                <span className="mono text-xl text-ink font-medium">840 kg</span>
              </div>
              <div className="w-full h-2 bg-danger/20"><div className="h-full bg-danger" style={{width: '100%'}}></div></div>
            </div>
          </div>

          <div className="border-2 border-grid-blue bg-surface p-6 flex flex-col gap-6 relative shadow-[0_0_15px_rgba(59,130,246,0.1)]">
            <h3 className="font-semibold text-grid-blue uppercase tracking-wider text-xs text-center pb-4 border-b border-border">Noonshift Scheduled</h3>
            
            <div className="flex flex-col gap-4">
              <div className="flex justify-between items-end">
                <span className="text-sm text-ink-muted">Energy Cost</span>
                <span className="mono text-xl text-saved font-medium">$413.50</span>
              </div>
              <div className="w-full h-2 bg-saved/20"><div className="h-full bg-saved" style={{width: '49%'}}></div></div>
              
              <div className="flex justify-between items-end mt-4">
                <span className="text-sm text-ink-muted">Peak Load</span>
                <span className="mono text-xl text-ink font-medium">116 kW</span>
              </div>
              <div className="w-full h-2 bg-bg border border-border"><div className="h-full bg-ink" style={{width: '55%'}}></div></div>

              <div className="flex justify-between items-end mt-4">
                <span className="text-sm text-ink-muted">Carbon Generated</span>
                <span className="mono text-xl text-saved font-medium">704 kg</span>
              </div>
              <div className="w-full h-2 bg-saved/20"><div className="h-full bg-saved" style={{width: '83%'}}></div></div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
