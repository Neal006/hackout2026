import { useState, useEffect } from 'react';
import { useGlobalState } from '../context/GlobalStateContext';

export default function SchedulesView() {
  const { data, triggerEvent } = useGlobalState();
  const { siteDetail } = data;
  
  const [timeAgo, setTimeAgo] = useState('0s');

  useEffect(() => {
    if (!siteDetail?.solved_at) return;
    const timer = setInterval(() => {
      const diff = Math.floor((Date.now() - siteDetail.solved_at) / 1000);
      setTimeAgo(`${diff}s`);
    }, 1000);
    return () => clearInterval(timer);
  }, [siteDetail?.solved_at]);

  const handleReoptimize = () => {
    triggerEvent('reoptimize_start');
    setTimeout(() => {
      triggerEvent('reoptimize_end');
    }, 2000); // 2 second mock optimization
  };

  return (
    <div className="p-8 max-w-5xl mx-auto w-full">
      <header className="mb-8 flex justify-between items-end border-b border-border pb-4">
        <div>
          <h1 className="text-2xl font-semibold text-ink">Optimization Control Center</h1>
          <p className="text-sm text-ink-muted mt-1">Global scheduling engine status</p>
        </div>
        <button 
          onClick={handleReoptimize}
          disabled={siteDetail.isOptimizing}
          className={`px-6 py-2 text-sm uppercase tracking-wider font-medium transition-colors ${siteDetail.isOptimizing ? 'bg-bg text-ink-muted border border-border cursor-wait' : 'bg-ink text-surface hover:opacity-90'}`}
        >
          {siteDetail.isOptimizing ? 'Optimizing...' : 'Re-optimize Now'}
        </button>
      </header>

      <div className="grid grid-cols-4 gap-6 mb-8">
        <div className="border border-border p-4 bg-surface flex flex-col justify-between">
          <span className="text-[10px] uppercase tracking-wider text-ink-muted mb-1 block">Algorithm Status</span>
          <span className="mono text-xl font-medium">{siteDetail.isOptimizing ? 'Running (HiGHS)' : 'Idle'}</span>
        </div>
        <div className="border border-border p-4 bg-surface flex flex-col justify-between">
          <span className="text-[10px] uppercase tracking-wider text-ink-muted mb-1 block">Last Solved</span>
          <span className="mono text-xl font-medium">{timeAgo} ago</span>
        </div>
        <div className="border border-border p-4 bg-surface flex flex-col justify-between">
          <span className="text-[10px] uppercase tracking-wider text-ink-muted mb-1 block">Carbon Signal</span>
          <span className="mono text-xl font-medium text-saved">Active (WattTime)</span>
        </div>
        <div className="border border-border p-4 bg-surface flex flex-col justify-between">
          <span className="text-[10px] uppercase tracking-wider text-ink-muted mb-1 block">Tariff Data</span>
          <span className="mono text-xl font-medium text-saved">Active (PG&E)</span>
        </div>
      </div>

      <section>
        <h2 className="text-lg font-medium text-ink mb-4">24-Hour Optimization Window</h2>
        <div className="border border-border bg-surface p-6 flex flex-col relative min-h-[300px]">
          
          <div className="absolute top-10 bottom-10 left-6 right-6 flex">
            {/* 24 hour blocks */}
            {Array.from({length: 24}).map((_, i) => (
              <div key={i} className="flex-1 flex flex-col justify-end border-r border-border/30 relative group">
                <div className="absolute bottom-[-24px] left-0 text-[10px] text-ink-muted font-mono">{i}:00</div>
                
                {/* Cost/Carbon background */}
                {(i >= 9 && i <= 14) && (
                  <div className="absolute inset-0 bg-saved/10"></div>
                )}
                {(i >= 16 && i <= 21) && (
                  <div className="absolute inset-0 bg-danger/5"></div>
                )}
                
                {/* Simulated Load Bar */}
                <div 
                  className="w-full bg-grid-blue/80 transition-all duration-500 ease-out"
                  style={{ height: `${20 + Math.random() * (siteDetail.isOptimizing ? 10 : 60)}%` }}
                ></div>
              </div>
            ))}
          </div>

          <div className="absolute bottom-2 left-6 flex gap-6 text-[10px] uppercase tracking-wider font-mono">
            <span className="flex items-center gap-2"><div className="w-3 h-3 bg-saved/20 border border-saved/40"></div> Super Off-Peak / Clean</span>
            <span className="flex items-center gap-2"><div className="w-3 h-3 bg-danger/10 border border-danger/20"></div> Peak / Dirty</span>
            <span className="flex items-center gap-2"><div className="w-3 h-3 bg-grid-blue/80"></div> Scheduled Load</span>
          </div>
        </div>
      </section>
    </div>
  );
}
