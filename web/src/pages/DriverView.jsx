import { useState } from 'react';
import { useGlobalState } from '../context/GlobalStateContext';

export default function DriverView() {
  const { data, triggerEvent } = useGlobalState();
  const { site } = data;
  
  // Available states: PLUGGED_IN, SCHEDULED, ACTIVE_CHARGING, COMPLETED
  const [viewState, setViewState] = useState('PLUGGED_IN'); 
  const [time, setTime] = useState('17:30');
  
  // Modal states
  const [showBoost, setShowBoost] = useState(false);
  const [showMethodology, setShowMethodology] = useState(false);

  if (!site) return null; 

  const handleBoostConfirm = () => {
    triggerEvent('boost');
    setShowBoost(false);
    setViewState('SCHEDULED');
  };

  return (
    <div className="min-h-screen bg-bg relative">
      <div className="p-6 max-w-md mx-auto flex flex-col pt-12 pb-24">
        
        <header className="mb-8 border-b border-border pb-4">
          <div className="text-xl font-medium text-ink tracking-tight mb-2">Noonshift</div>
          <div className="text-sm text-ink-muted">Charging at {site.id}</div>
        </header>

        {viewState === 'PLUGGED_IN' && (
          <div className="flex flex-col gap-6">
            <div className="flex justify-between items-center bg-surface p-4 border border-border">
              <span className="text-sm font-medium text-ink">Car connected</span>
              <span className="text-xs text-ink-muted mono uppercase tracking-wider">Connector 12</span>
            </div>

            <div className="flex flex-col gap-4 mt-4">
              <h1 className="text-lg font-medium text-ink">When are you leaving?</h1>
              
              <div className="flex flex-col items-start gap-1">
                <input 
                  type="time" 
                  value={time} 
                  onChange={(e) => setTime(e.target.value)}
                  className="bg-transparent text-3xl font-medium text-ink focus:outline-none border-b border-transparent focus:border-ink py-1 min-h-[44px]"
                />
                <span className="text-xs text-ink-muted">Based on your previous visits</span>
              </div>
            </div>

            <div className="flex flex-col gap-2 bg-surface p-4 border border-border mt-2">
              <div className="flex justify-between text-sm">
                <span className="text-ink-muted">Energy needed</span>
                <span className="mono text-ink">8.0 kWh</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-ink-muted">Estimated ready time</span>
                <span className="text-ink font-medium">{time}</span>
              </div>
            </div>

            <div className="flex flex-col gap-3 mt-6">
              <button 
                onClick={() => setViewState('SCHEDULED')}
                className="w-full bg-ink text-surface py-3 font-medium transition-opacity hover:opacity-90 min-h-[44px]"
              >
                Confirm
              </button>
              <button 
                onClick={() => setShowBoost(true)}
                className="w-full bg-transparent border border-border text-ink py-3 font-medium transition-colors hover:border-ink min-h-[44px]"
              >
                Need it sooner?
              </button>
            </div>
          </div>
        )}

        {viewState === 'SCHEDULED' && (
          <div className="flex flex-col gap-8">
            <div>
              <p className="text-lg font-medium text-ink leading-snug">
                You're scheduled to charge during a cleaner, lower-cost period.
              </p>
            </div>

            {/* Timeline */}
            <div className="flex flex-col border border-border bg-surface">
              <div className="flex items-center gap-4 p-4 border-b border-border">
                <div className="w-16 text-xs text-ink-muted font-medium tracking-wide uppercase">Now</div>
                <div className="mono text-sm">08:30</div>
              </div>
              <div className="flex items-center gap-4 p-4 border-b border-border bg-bg">
                <div className="w-16 text-xs text-ink-muted font-medium tracking-wide uppercase">Wait</div>
                <div className="mono text-sm text-ink-muted">09:00 → 11:10</div>
              </div>
              <div className="flex items-center gap-4 p-4 border-b border-border bg-solar/10">
                <div className="w-16 text-xs text-solar font-medium tracking-wide uppercase">Charging</div>
                <div className="mono text-sm font-medium">11:10 → 12:20</div>
              </div>
              <div className="flex items-center gap-4 p-4">
                <div className="w-16 text-xs text-saved font-medium tracking-wide uppercase">Ready</div>
                <div className="mono text-sm font-medium">17:30</div>
              </div>
            </div>

            <div className="flex flex-col gap-3 bg-surface p-4 border border-border text-sm">
              <div className="flex justify-between">
                <span className="text-ink-muted">Ready by</span>
                <span className="font-medium text-ink">5:30 PM</span>
              </div>
              <div className="flex justify-between">
                <span className="text-ink-muted">Charging</span>
                <span className="font-medium text-ink">11:10–12:20</span>
              </div>
              <div className="flex justify-between">
                <span className="text-ink-muted">Energy</span>
                <span className="mono text-ink">8.0 / 8.0 kWh</span>
              </div>
            </div>

            <div className="flex flex-col gap-1">
              <span className="text-xs text-ink-muted font-medium tracking-wide uppercase">Grid cleanliness</span>
              <span className="text-sm text-ink">Cleaner than 72% of today's charging hours</span>
            </div>

            <div className="flex flex-col gap-3">
              <button 
                onClick={() => setViewState('PLUGGED_IN')}
                className="w-full bg-transparent border border-border text-ink py-3 font-medium transition-colors hover:border-ink min-h-[44px]"
              >
                Edit departure
              </button>
              <button 
                onClick={() => setShowBoost(true)}
                className="w-full bg-transparent text-ink-muted py-3 text-sm transition-colors hover:text-ink min-h-[44px] border-0 underline"
              >
                Need it sooner?
              </button>
            </div>
          </div>
        )}

        {viewState === 'ACTIVE_CHARGING' && (
          <div className="flex flex-col gap-8">
            <div className="bg-surface border border-border p-6 flex flex-col gap-6">
              <div className="flex justify-between items-end">
                <h1 className="text-lg font-medium text-ink">Charging now</h1>
                <span className="mono text-2xl text-solar font-medium">6.8 kW</span>
              </div>

              <div className="flex flex-col gap-2">
                <div className="w-full h-2 bg-bg border border-border">
                  <div className="h-full bg-solar" style={{ width: '42%' }}></div>
                </div>
                <div className="text-right mono text-sm text-ink-muted">3.4 / 8.0 kWh</div>
              </div>

              <div className="flex flex-col gap-3 text-sm mt-2">
                <div className="flex justify-between border-b border-border pb-3">
                  <span className="text-ink-muted">Estimated completion</span>
                  <span className="font-medium text-ink">12:20 PM</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-ink-muted">Ready by</span>
                  <span className="font-medium text-ink">5:30 PM</span>
                </div>
              </div>
            </div>

            <p className="text-sm text-ink-muted leading-relaxed">
              This session is being scheduled around site demand and grid conditions.
            </p>

            <button 
              onClick={() => setShowBoost(true)}
              className="w-full bg-transparent border border-border text-ink py-3 font-medium transition-colors hover:border-ink min-h-[44px]"
            >
              Need it sooner?
            </button>
          </div>
        )}

        {viewState === 'COMPLETED' && (
          <div className="flex flex-col gap-8">
            <div className="bg-surface border border-border p-6">
              <h1 className="text-xl font-medium text-ink mb-1">Session complete</h1>
              <div className="mono text-sm text-ink-muted uppercase tracking-wider">8.0 kWh delivered</div>
            </div>

            <div className="flex flex-col gap-4">
              <h2 className="text-sm font-medium text-ink">Noonshift Impact</h2>
              
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-surface border border-border p-4 flex flex-col gap-1">
                  <span className="text-xs text-ink-muted uppercase tracking-wider">Est. savings</span>
                  <span className="mono text-2xl text-saved font-medium">$2.15</span>
                </div>
                <div className="bg-surface border border-border p-4 flex flex-col gap-1">
                  <span className="text-xs text-ink-muted uppercase tracking-wider">Est. CO2 avoided</span>
                  <span className="mono text-2xl text-saved font-medium">1.2 kg</span>
                </div>
              </div>
              
              <p className="text-xs text-ink-muted mt-2">Compared with charging immediately.</p>
            </div>

            <button 
              onClick={() => setShowMethodology(true)}
              className="text-left text-sm text-ink underline hover:text-ink-muted transition-colors border-0 p-0"
            >
              How this was calculated
            </button>
          </div>
        )}

      </div>

      {/* INLINE BOOST MODAL */}
      {showBoost && (
        <div className="fixed inset-0 bg-ink/20 flex flex-col justify-end z-50">
          <div className="bg-surface w-full p-6 pb-12 border-t border-border flex flex-col gap-6 shadow-none">
            <h2 className="text-lg font-medium text-ink">Need your car sooner?</h2>
            <p className="text-sm text-ink-muted">Boost moves your charging earlier.</p>
            
            <div className="flex flex-col gap-3 bg-bg border border-border p-4 text-sm mt-2">
              <div className="flex justify-between">
                <span className="text-ink-muted">New estimated ready time</span>
                <span className="font-medium text-ink">10:30 AM</span>
              </div>
              <div className="flex justify-between">
                <span className="text-ink-muted">Additional cost</span>
                <span className="mono text-ink">+$2.15</span>
              </div>
            </div>

            <div className="flex flex-col gap-3 mt-4">
              <button 
                onClick={handleBoostConfirm}
                className="w-full bg-ink text-surface py-3 font-medium transition-opacity hover:opacity-90 min-h-[44px]"
              >
                Boost charging
              </button>
              <button 
                onClick={() => setShowBoost(false)}
                className="w-full bg-transparent border border-border text-ink py-3 font-medium transition-colors hover:border-ink min-h-[44px]"
              >
                Keep current plan
              </button>
            </div>
          </div>
        </div>
      )}

      {/* INLINE METHODOLOGY MODAL */}
      {showMethodology && (
        <div className="fixed inset-0 bg-ink/20 flex flex-col justify-end z-50">
          <div className="bg-surface w-full p-6 pb-12 border-t border-border flex flex-col gap-6 shadow-none">
            <h2 className="text-lg font-medium text-ink">Impact Methodology</h2>
            
            <div className="flex flex-col gap-4 text-sm text-ink">
              <div className="flex justify-between border-b border-border pb-2">
                <span className="text-ink-muted">Energy Delivered</span>
                <span className="mono">8.0 kWh</span>
              </div>
              <div className="flex justify-between border-b border-border pb-2">
                <span className="text-ink-muted">Charge Schedule</span>
                <span className="mono">11:10–12:20</span>
              </div>
              <div className="flex justify-between border-b border-border pb-2">
                <span className="text-ink-muted">Charge-Immediately Baseline</span>
                <span className="mono">08:30–09:40</span>
              </div>
              <div className="flex justify-between border-b border-border pb-2">
                <span className="text-ink-muted">Tariff Estimate</span>
                <span className="mono">PG&E BEV (Summer)</span>
              </div>
              <div className="flex justify-between border-b border-border pb-2">
                <span className="text-ink-muted">Marginal Carbon Estimate</span>
                <span className="mono">WattTime MOER</span>
              </div>
            </div>

            <button 
              onClick={() => setShowMethodology(false)}
              className="w-full mt-4 bg-transparent border border-border text-ink py-3 font-medium transition-colors hover:border-ink min-h-[44px]"
            >
              Close details
            </button>
          </div>
        </div>
      )}

      {/* DEV CONTROLS (INVISIBLE/SUBTLE FOOTER) */}
      <div className="fixed bottom-0 left-0 w-full bg-bg border-t border-border p-2 flex justify-center gap-4 opacity-30 hover:opacity-100 transition-opacity z-10">
        <button onClick={() => setViewState('PLUGGED_IN')} className="text-[10px] uppercase font-mono px-2 py-1 border border-border min-h-[32px]">1. Plug</button>
        <button onClick={() => setViewState('SCHEDULED')} className="text-[10px] uppercase font-mono px-2 py-1 border border-border min-h-[32px]">2. Sched</button>
        <button onClick={() => setViewState('ACTIVE_CHARGING')} className="text-[10px] uppercase font-mono px-2 py-1 border border-border min-h-[32px]">3. Charge</button>
        <button onClick={() => setViewState('COMPLETED')} className="text-[10px] uppercase font-mono px-2 py-1 border border-border min-h-[32px]">4. Done</button>
      </div>
    </div>
  );
}
