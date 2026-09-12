export default function TariffsView() {
  return (
    <div className="p-8 max-w-4xl mx-auto w-full">
      <header className="mb-8 flex justify-between items-end border-b border-border pb-4">
        <div>
          <h1 className="text-2xl font-semibold text-ink">Tariff Management</h1>
          <p className="text-sm text-ink-muted mt-1">Active utility rates defining scheduler constraints</p>
        </div>
      </header>

      <section className="mb-8">
        <h2 className="text-lg font-medium text-ink mb-4">Active Tariff Profile</h2>
        <div className="border border-border bg-surface p-6 flex flex-col gap-6">
          <div className="flex justify-between border-b border-border pb-4">
            <span className="text-sm text-ink-muted">Utility Provider</span>
            <span className="font-medium text-ink">PG&E</span>
          </div>
          <div className="flex justify-between border-b border-border pb-4">
            <span className="text-sm text-ink-muted">Rate Schedule</span>
            <span className="mono font-medium text-ink">Business EV (BEV-2) Summer</span>
          </div>
          <div className="flex justify-between pb-2">
            <span className="text-sm text-ink-muted">Subscription Block</span>
            <span className="mono font-medium text-ink">150 kW</span>
          </div>
        </div>
      </section>

      <section>
        <h2 className="text-lg font-medium text-ink mb-4">Time-of-Use Periods</h2>
        <div className="border border-border bg-surface w-full text-sm">
          <div className="grid grid-cols-3 border-b border-border bg-bg text-ink-muted text-xs uppercase tracking-wider p-4">
            <div className="col-span-1">Period</div>
            <div className="col-span-1 text-center">Hours</div>
            <div className="col-span-1 text-right">Energy Rate ($/kWh)</div>
          </div>
          
          <div className="grid grid-cols-3 items-center p-4 border-b border-border">
            <div className="col-span-1 font-medium flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-saved"></div>
              Super Off-Peak
            </div>
            <div className="col-span-1 text-center mono text-ink-muted">09:00 – 14:00</div>
            <div className="col-span-1 text-right mono">$0.18</div>
          </div>
          
          <div className="grid grid-cols-3 items-center p-4 border-b border-border">
            <div className="col-span-1 font-medium flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-ink-muted"></div>
              Off-Peak
            </div>
            <div className="col-span-1 text-center mono text-ink-muted">00:00 – 09:00<br/>14:00 – 16:00<br/>21:00 – 00:00</div>
            <div className="col-span-1 text-right mono">$0.24</div>
          </div>
          
          <div className="grid grid-cols-3 items-center p-4">
            <div className="col-span-1 font-medium flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-danger"></div>
              Peak
            </div>
            <div className="col-span-1 text-center mono text-ink-muted">16:00 – 21:00</div>
            <div className="col-span-1 text-right mono text-danger">$0.45</div>
          </div>
        </div>
      </section>
    </div>
  );
}
