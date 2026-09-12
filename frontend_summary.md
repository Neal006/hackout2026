# Noonshift Frontend Codebase Summary

This document contains the source code for the primary frontend components we just built, ensuring the strict styling and layout requirements (no shadows, max 4px radius, inline SVG charts, custom websocket mock state, etc.).

## 1. `DriverView.jsx` (Mobile-First Driver Screen)
```jsx
import { useState } from 'react';
import { useNoonshiftSocket } from '../hooks/useNoonshiftSocket';

export default function DriverView() {
  const { data, error } = useNoonshiftSocket('demo-site');
  const [viewState, setViewState] = useState('question'); 
  const [time, setTime] = useState('17:30');
  const [boost, setBoost] = useState(false);

  if (error) {
    return <div className="p-4 text-ink font-sans text-sm">{error}</div>;
  }
  
  if (!data) {
    return null; 
  }

  const isShortfall = false;
  const shortfallAmount = 2.1;

  if (viewState === 'receipt') {
    return (
      <div className="min-h-screen p-4 md:p-8 flex flex-col justify-center items-center text-center gap-8 max-w-md mx-auto">
        <p className="font-serif text-2xl leading-relaxed text-ink">
          You saved <span className="mono block text-4xl mt-2 mb-2 text-saved whitespace-nowrap">${data?.impact?.saved_usd?.toFixed(2) || '0.00'}</span>
          and <span className="mono block text-4xl mt-2 mb-2 text-saved whitespace-nowrap">{data?.impact?.saved_kgco2?.toFixed(1) || '0.0'} kg CO2</span>
          vs charging at plug-in{isShortfall ? `, and were ${shortfallAmount} kWh short of your need` : ''}.
        </p>
        <button 
          onClick={() => setViewState('question')} 
          className="text-xs text-ink-muted underline mt-12 hover:text-ink transition-colors border-0 min-h-[44px] px-4"
        >
          estimate — method
        </button>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-8 max-w-md mx-auto flex flex-col gap-12 pt-12">
      <div className="flex flex-col items-center gap-2">
        <svg viewBox="0 0 200 100" className="w-full h-auto overflow-visible">
          <path d="M 10 90 A 90 90 0 0 1 190 90" fill="none" stroke="var(--color-border)" strokeWidth="4" />
          <path d="M 150 45 A 90 90 0 0 1 165 65" fill="none" stroke="var(--color-ink-muted)" strokeWidth="4" strokeDasharray="4 4" />
          {viewState === 'charging' && (
            <path d="M 70 23 A 90 90 0 0 1 100 10" fill="none" stroke="var(--color-solar)" strokeWidth="6" />
          )}
          <circle cx="50" cy="40" r="5" fill="var(--color-ink)" />
        </svg>
        <span className="text-xs text-ink-muted">your last 5 visits: left 17:20–17:45</span>
      </div>

      {viewState === 'question' && (
        <div className="flex flex-col gap-8">
          <div className="flex flex-col gap-2">
            <p className="font-serif text-2xl text-center text-ink flex items-center justify-center flex-wrap gap-1">
              Leaving at 
              <input 
                type="time" 
                value={time} 
                onChange={(e) => setTime(e.target.value)}
                className="bg-transparent border-b border-border text-center font-serif text-2xl w-28 focus:outline-none focus:border-ink min-h-[44px] min-w-[44px]"
              />
              ?
            </p>
            
            <div className="relative mt-6 px-4">
              <div className="h-px bg-border w-full"></div>
              <div className="absolute top-0 left-1/4 w-px h-3 bg-border"></div>
              <div className="absolute top-0 left-1/2 w-px h-3 bg-border"></div>
              <div className="absolute top-0 left-3/4 w-px h-3 bg-border"></div>
              <div className="absolute top-4 left-1/4 -translate-x-1/2 text-xs text-ink-muted">super-off-peak</div>
            </div>
          </div>

          <button 
            onClick={() => setViewState('charging')}
            className="w-full bg-ink text-surface py-3 rounded font-medium hover:opacity-90 transition-opacity min-h-[44px]"
          >
            Confirm
          </button>

          <div className="flex justify-center">
            <button 
              onClick={() => setBoost(!boost)}
              className={`rounded-full px-6 py-2 text-sm border transition-colors min-h-[44px] ${boost ? 'bg-boost text-surface border-boost' : 'text-boost border-boost hover:bg-boost/10'}`}
            >
              Need it sooner? Boost
            </button>
          </div>
        </div>
      )}

      {viewState === 'charging' && (
        <div className="flex flex-col gap-8">
          <p className="font-serif text-xl text-center text-ink leading-snug">
            charging 11:10–12:20,<br />
            ready by {time}.
          </p>

          <div className="flex flex-col gap-2">
            <div className="w-full h-11 border border-border rounded overflow-hidden relative">
              <div className="absolute top-0 left-0 h-full bg-solar" style={{ width: '40%' }}></div>
              <div className="absolute inset-0 flex items-center justify-between px-3 text-sm">
                <span className="text-ink mix-blend-difference">grid is cleaner than 72% of today</span>
                <span className="mono mix-blend-difference">14.2 kWh</span>
              </div>
            </div>
          </div>

          <button 
            onClick={() => setViewState('receipt')}
            className="mt-8 text-xs text-ink-muted border-b border-border self-center pb-1 hover:text-ink transition-colors min-h-[44px] px-4"
          >
            simulate unplug
          </button>
        </div>
      )}
    </div>
  );
}
```

## 2. `OpsDashboard.jsx` (Desktop-First Operator Screen with Gantt)
```jsx
import { useState, useEffect } from 'react';
import { useNoonshiftSocket } from '../hooks/useNoonshiftSocket';

export default function OpsDashboard() {
  const { data, error, triggerDemo } = useNoonshiftSocket('demo-site');
  const [demoOpen, setDemoOpen] = useState(false);
  const [timeAgo, setTimeAgo] = useState('0s ago');

  useEffect(() => {
    if (!data?.solved_at) return;
    const timer = setInterval(() => {
      const diff = Math.floor((Date.now() - data.solved_at) / 1000);
      setTimeAgo(`${diff}s ago`);
    }, 1000);
    return () => clearInterval(timer);
  }, [data?.solved_at]);

  if (error) return <div className="p-4 text-ink font-sans text-sm">{error}</div>;
  if (!data) return null; 

  const sortedConnectors = [...(data.connectors || [])].sort((a, b) => a.deadlineMins - b.deadlineMins);

  return (
    <div className="min-h-screen flex text-ink font-sans relative overflow-hidden">
      <nav className="w-48 border-r border-border shrink-0 p-6 flex flex-col gap-4 sticky top-0 h-screen z-10 bg-bg">
        <div className="text-left pb-1 w-max border-b border-grid-blue">Site</div>
        <button 
          onClick={() => setDemoOpen(!demoOpen)}
          className={`text-left pb-1 w-max transition-colors min-h-[44px] ${demoOpen ? 'text-ink border-b border-ink' : 'text-ink-muted border-b border-transparent hover:text-ink'}`}
        >
          Demo
        </button>
      </nav>

      <main className="flex-1 flex flex-col relative min-w-0">
        {data.status?.mode !== 'normal' && (
          <div className="w-full bg-grid-blue/10 py-1 px-6 text-sm">
            running on {data.status?.mode || 'cached forecast'}, ≤6h old
          </div>
        )}

        <div className="p-8 flex flex-col gap-12 max-w-5xl">
          <section className="relative w-full h-48 border-b border-border">
            <svg viewBox="0 0 1000 200" preserveAspectRatio="none" className="w-full h-full overflow-visible">
              <rect x="250" y="0" width="200" height="200" fill="var(--color-solar)" opacity="0.08" />
              <rect x="660" y="0" width="200" height="200" fill="var(--color-grid-blue)" opacity="0.08" />
              <line x1="0" y1="50" x2="1000" y2="50" stroke="var(--color-ink-muted)" strokeDasharray="4 4" />
              <text x="1005" y="54" className="text-xs" fill="var(--color-ink-muted)">site limit (150kW)</text>
              <polyline 
                fill="none" 
                stroke="var(--color-ink)" 
                strokeWidth="2"
                points={(data.meter_ticks || []).map((tick, i) => `${(i / 23) * 1000},${200 - tick.val}`).join(' ')} 
              />
            </svg>
          </section>

          <section className="flex flex-col gap-6">
            <div className="flex flex-col items-end gap-1">
              <div className="flex gap-8 text-right">
                <div className="flex flex-col">
                  <span className="mono text-4xl">${data.impact?.saved_usd?.toFixed(0) || '0'}</span>
                  <span className="text-xs">saved</span>
                </div>
                <div className="flex flex-col">
                  <span className="mono text-4xl">{data.impact?.saved_kgco2?.toFixed(0) || '0'}</span>
                  <span className="text-xs">kg co2 saved</span>
                </div>
                <div className="flex flex-col">
                  <span className="mono text-4xl">{data.impact?.peak_avoided?.toFixed(0) || '0'}</span>
                  <span className="text-xs">peak kw avoided</span>
                </div>
              </div>
              <span className="text-xs text-ink-muted mt-1">re-solved {timeAgo}</span>
            </div>

            <div className="flex flex-col gap-1 w-full mt-4">
              {(data.connectors || []).map(c => (
                <div key={c.id} className="flex items-center gap-4 group">
                  <span className="mono text-sm w-16 shrink-0">{c.id}</span>
                  <div className="flex-1 h-6 relative bg-surface border-y border-border group-hover:border-ink/20 transition-colors">
                    <div className="absolute top-0 bottom-0 bg-solar/20" style={{ left: `${c.startPct}%`, width: `${c.planWidth}%` }}>
                      <div className="absolute top-1 bottom-1 left-0 bg-grid-blue" style={{ width: `${(c.actualWidth / c.planWidth) * 100}%` }}></div>
                    </div>
                    <div className="absolute top-1/2 -mt-1 w-2 h-2 bg-ink border border-surface rotate-45" style={{ left: `${c.startPct + c.planWidth}%`, transform: 'translate(-50%, -50%) rotate(45deg)' }}></div>
                    {c.hasBoost && <div className="absolute top-0 bottom-0 w-[2px] bg-[#a83a2c]" style={{ left: `${c.startPct + 5}%` }}></div>}
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="flex flex-col gap-2 border-t border-border pt-8">
            <h3 className="font-medium text-ink mb-2">Deadline Risk</h3>
            {sortedConnectors.slice(0, 10).map(c => (
              <div key={c.id} className={`flex gap-4 mono text-sm ${c.deadlineMins < 15 ? 'text-[#a83a2c]' : 'text-ink'}`}>
                <span className="w-16">{c.id}</span>
                <span>{c.deadlineMins} mins</span>
              </div>
            ))}
          </section>
        </div>
      </main>

      {demoOpen && (
        <aside className="w-80 h-screen fixed right-0 top-0 bg-bg border-l border-border z-20 p-6 flex flex-col gap-6">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-lg font-medium">Demo Actions</h2>
            <button onClick={() => setDemoOpen(false)} className="text-ink-muted hover:text-ink text-sm border-0 min-h-[44px] px-2">close</button>
          </div>
          <div className="flex flex-col gap-3">
            <button onClick={() => triggerDemo('early')} className="text-left py-3 px-4 border border-ink hover:bg-surface rounded transition-colors flex gap-3 items-center min-h-[44px]">
              <span className="mono text-ink-muted">1</span> Tom leaves early
            </button>
            <button onClick={() => triggerDemo('boost')} className="text-left py-3 px-4 border border-ink hover:bg-surface rounded transition-colors flex gap-3 items-center min-h-[44px]">
              <span className="mono text-ink-muted">2</span> Sofia boosts
            </button>
            <button onClick={() => triggerDemo('late')} className="text-left py-3 px-4 border border-ink hover:bg-surface rounded transition-colors flex gap-3 items-center min-h-[44px]">
              <span className="mono text-ink-muted">3</span> +20 late arrivals
            </button>
            <button onClick={() => triggerDemo('signal')} className="text-left py-3 px-4 border border-ink hover:bg-surface rounded transition-colors flex gap-3 items-center min-h-[44px]">
              <span className="mono text-ink-muted">4</span> Signal drops out
            </button>
          </div>
        </aside>
      )}
    </div>
  );
}
```

## 3. `useNoonshiftSocket.js` (State Mock & Demo Manager)
```javascript
import { useState, useEffect } from 'react';

export function useNoonshiftSocket(siteId) {
  const [data, setData] = useState(() => {
    const connectors = Array.from({ length: 40 }, (_, i) => {
      const id = `CN-${String(i + 1).padStart(2, '0')}`;
      const hasBoost = Math.random() > 0.8;
      const deadlineMins = Math.floor(Math.random() * 240) + 5; 
      const startPct = Math.random() * 20; 
      const planWidth = 30 + Math.random() * 40; 
      const actualWidth = planWidth * (0.5 + Math.random() * 0.5); 
      
      return { id, deadlineMins, hasBoost, startPct, planWidth, actualWidth };
    });

    return {
      plan: [],
      meter_ticks: Array.from({ length: 24 }, (_, i) => ({
        time: i,
        val: 50 + Math.random() * 50 // 50-100 kW
      })),
      impact: { saved_usd: 142.50, saved_kgco2: 45.2, peak_avoided: 18.5 },
      status: { mode: 'normal' },
      connectors,
      solved_at: Date.now()
    };
  });

  const [error, setError] = useState(null);

  useEffect(() => {
    const interval = setInterval(() => {
      setData(prev => ({
        ...prev,
        impact: {
          ...prev.impact,
          saved_usd: prev.impact.saved_usd + 0.1,
          saved_kgco2: prev.impact.saved_kgco2 + 0.5
        },
        solved_at: Date.now()
      }));
    }, 4000);
    
    return () => clearInterval(interval);
  }, [siteId]);

  const triggerDemo = (endpoint) => {
    setTimeout(() => {
      setData(prev => {
        let newConnectors = [...prev.connectors];
        let newStatus = { ...prev.status };
        let newTicks = [...prev.meter_ticks];
        
        if (endpoint === 'early') {
          if (newConnectors.length > 0) newConnectors.shift();
        } else if (endpoint === 'boost') {
          if (newConnectors.length > 0) {
            newConnectors[0].hasBoost = true;
            newConnectors[0].deadlineMins = 5; 
          }
        } else if (endpoint === 'late') {
          for (let i = 0; i < 20; i++) {
            newConnectors.push({
              id: `CN-L${i}`,
              deadlineMins: Math.floor(Math.random() * 120) + 10,
              hasBoost: false,
              startPct: 80,
              planWidth: 10 + Math.random() * 10,
              actualWidth: 5 + Math.random() * 5
            });
          }
          newTicks = newTicks.map(t => ({ ...t, val: Math.min(145, t.val + 40) }));
        } else if (endpoint === 'signal') {
          newStatus.mode = 'cached forecast';
        }
        
        return { ...prev, connectors: newConnectors, status: newStatus, meter_ticks: newTicks, solved_at: Date.now() };
      });
    }, 600); 
  };

  return { data, error, triggerDemo };
}
```
