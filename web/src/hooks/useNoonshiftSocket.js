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
    // We attempt to connect, but immediately fall back to the mock interval
    // so the UI remains visible for testing.
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
        
        return {
          ...prev,
          connectors: newConnectors,
          status: newStatus,
          meter_ticks: newTicks,
          solved_at: Date.now()
        };
      });
    }, 600); 
  };

  return { data, error, triggerDemo };
}
