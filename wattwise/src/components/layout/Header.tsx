import React from 'react';
import { 
  Clock, 
  RotateCcw, 
  Cable, 
  Activity 
} from 'lucide-react';
import { useWattwise } from '../../context/WattwiseContext';

export const Header: React.FC = () => {
  const { currentNav, openConnectModal, resetDemo, simTime, connected, hourly } = useWattwise();
  const nowHour = simTime ? new Date(simTime).getHours() : -1;
  const nowSignal = hourly.find((h) => h.rawHour === nowHour);

  const navTitles: Record<string, { title: string; subtitle: string }> = {
    dashboard: { title: 'Overview', subtitle: 'Real-time charging status & optimal window' },
    charge: { title: 'Charge Console', subtitle: 'Target battery state & instant vs smart dispatch' },
    schedule: { title: 'Schedule & Grid', subtitle: 'Deadline timeline & dynamic tariff forecast' },
    history: { title: 'Charging History', subtitle: 'Past sessions, verified savings & CO₂ avoided' },
    profile: { title: 'Preferences & Specs', subtitle: 'Vehicle, Wallbox hardware & ToU tariff rates' },
  };

  const pageInfo = navTitles[currentNav] || navTitles.dashboard;

  return (
    <header className="sticky top-0 z-30 bg-[#F7F7F5]/90 backdrop-blur-md border-b border-neutral-200/80 px-4 sm:px-8 py-4 transition-all">
      <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-4">
        {/* Left: View title */}
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl sm:text-2xl font-black text-neutral-900 tracking-tight">
              {pageInfo.title}
            </h1>
            <span className="hidden sm:inline-block w-1.5 h-1.5 rounded-full bg-neutral-300" />
            <span className="hidden sm:inline-block text-xs font-mono text-neutral-400">
              DEMO MODE
            </span>
          </div>
          <p className="text-xs text-neutral-500 hidden sm:block mt-0.5">
            {pageInfo.subtitle}
          </p>
        </div>

        {/* Right: Simulated Clock & Status Badges */}
        <div className="flex items-center gap-3">
          {/* Simulated Time Badge */}
          <div className="hidden lg:flex items-center gap-2 px-3 py-1.5 rounded-xl bg-white border border-neutral-200/80 text-xs font-mono shadow-xs">
            <Clock className="w-3.5 h-3.5 text-neutral-500" />
            <span className="text-neutral-500">Local Sim:</span>
            <span className="font-semibold text-neutral-900">{simTime ? new Date(simTime).toLocaleString([], { weekday: "short", hour: "numeric", minute: "2-digit" }) : connected ? "…" : "offline"}</span>
          </div>

          {/* Grid Signal Badge */}
          <div className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-xl bg-white border border-neutral-200/80 text-xs shadow-xs">
            <Activity className="w-3.5 h-3.5 text-amber-500" />
            <span className="text-neutral-500">Grid:</span>
            <span className="font-semibold text-neutral-900 font-mono">{nowSignal ? `${nowSignal.renewablePercent}% clean` : "—"}</span>
            <span className="text-[11px] font-mono text-neutral-400">{nowSignal ? `($${nowSignal.tariff.toFixed(2)}/kWh)` : ""}</span>
          </div>

          {/* Quick Connect CTA */}
          <button
            onClick={openConnectModal}
            className="flex items-center gap-2 px-3.5 py-1.5 rounded-xl bg-neutral-900 hover:bg-black text-white text-xs font-semibold shadow-xs transition-all cursor-pointer"
          >
            <Cable className="w-3.5 h-3.5 text-[#D4F634]" />
            <span>Connect Vehicle</span>
          </button>

          {/* Reset Demo Button */}
          <button
            onClick={resetDemo}
            className="p-2 rounded-xl bg-white border border-neutral-200/80 hover:bg-neutral-100 text-neutral-600 transition-colors cursor-pointer"
            title="Reset demo parameters"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </header>
  );
};
