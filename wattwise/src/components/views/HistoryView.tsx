import React from 'react';
import { CheckCircle2 } from 'lucide-react';
import { MOCK_HISTORY_SESSIONS } from '../../utils/mockData';
import { formatCurrency, formatCo2, formatKwh } from '../../utils/formatters';

export const HistoryView: React.FC = () => {
  const sessions = MOCK_HISTORY_SESSIONS;

  const totalSaved = sessions.reduce((acc, s) => acc + s.savings, 0) + 32;
  const totalCo2 = (sessions.reduce((acc, s) => acc + s.co2AvoidedKg, 0) + 4.2).toFixed(1);
  const totalEnergy = (sessions.reduce((acc, s) => acc + s.energyKwh, 0) + 28.4).toFixed(1);

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* Monthly Aggregate Banner */}
      <div className="bg-neutral-900 text-white rounded-2xl p-6 sm:p-7 shadow-lg border border-neutral-800 relative overflow-hidden">
        <div className="absolute right-0 top-0 translate-x-8 -translate-y-8 w-60 h-60 bg-[#D4F634]/15 rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-[#D4F634] inline-block" />
              <span className="text-xs font-mono uppercase tracking-widest text-[#D4F634] font-bold">
                September 2026 Optimization Summary
              </span>
            </div>
            <span className="text-xs text-neutral-400 font-mono">
              6 Sessions Tracked
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
            <div className="p-4 rounded-xl bg-neutral-800/80 border border-neutral-700/60">
              <span className="text-xs text-neutral-400 block font-medium">Total Saved This Month</span>
              <div className="flex items-baseline gap-2 mt-1">
                <span className="text-3xl font-black text-[#D4F634] font-mono">
                  {formatCurrency(totalSaved)}
                </span>
                <span className="text-xs text-emerald-400 font-semibold font-mono">
                  26.4% avg reduction
                </span>
              </div>
            </div>

            <div className="p-4 rounded-xl bg-neutral-800/80 border border-neutral-700/60">
              <span className="text-xs text-neutral-400 block font-medium">Clean Energy Delivered</span>
              <div className="flex items-baseline gap-2 mt-1">
                <span className="text-3xl font-black text-white font-mono">
                  {formatKwh(Number(totalEnergy))}
                </span>
                <span className="text-xs text-neutral-400 font-mono">
                  at 11 kW L2
                </span>
              </div>
            </div>

            <div className="p-4 rounded-xl bg-neutral-800/80 border border-neutral-700/60">
              <span className="text-xs text-neutral-400 block font-medium">Total CO₂ Avoided</span>
              <div className="flex items-baseline gap-2 mt-1">
                <span className="text-3xl font-black text-emerald-400 font-mono">
                  {formatCo2(Number(totalCo2))}
                </span>
                <span className="text-xs text-neutral-400 font-mono">
                  ~114 km offset
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Session List */}
      <div className="bg-white rounded-2xl border border-neutral-200/80 p-6 shadow-sm">
        <div className="flex items-center justify-between mb-5">
          <div>
            <h3 className="text-base font-bold text-neutral-900 tracking-tight">
              Previous Charging Sessions
            </h3>
            <p className="text-xs text-neutral-500">
              Every completed session dispatched via automated dynamic load shifting
            </p>
          </div>
          <span className="text-xs font-mono font-bold bg-neutral-100 text-neutral-700 px-3 py-1 rounded-full">
            100% On-Schedule Rate
          </span>
        </div>

        <div className="space-y-3">
          {sessions.map((session) => (
            <div
              key={session.id}
              className="p-4 sm:p-5 rounded-xl border border-neutral-200/80 hover:border-neutral-300 hover:shadow-xs transition-all bg-white flex flex-col md:flex-row md:items-center justify-between gap-4"
            >
              {/* Left Details */}
              <div className="space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-bold text-sm text-neutral-900">
                    {session.date}
                  </span>
                  <span className="text-neutral-400">•</span>
                  <span className="text-xs font-mono text-neutral-500">
                    {session.timeRange}
                  </span>
                  {session.isOptimal && (
                    <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full ml-1">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                      Optimal charging ✓
                    </span>
                  )}
                </div>

                <div className="text-xs text-neutral-500 flex items-center gap-2">
                  <span>{session.charger}</span>
                  <span>•</span>
                  <span>Target: {session.targetReached}% reached</span>
                </div>
              </div>

              {/* Right Metrics Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs pt-3 md:pt-0 border-t md:border-t-0 border-neutral-100">
                <div>
                  <span className="text-neutral-400 block text-[10px] uppercase font-mono">Energy</span>
                  <span className="font-bold text-neutral-800 font-mono text-sm">
                    {formatKwh(session.energyKwh)}
                  </span>
                </div>

                <div>
                  <span className="text-neutral-400 block text-[10px] uppercase font-mono">Billed Cost</span>
                  <span className="font-bold text-neutral-900 font-mono text-sm">
                    {formatCurrency(session.cost)}
                  </span>
                </div>

                <div>
                  <span className="text-neutral-400 block text-[10px] uppercase font-mono">Saved</span>
                  <span className="font-bold text-emerald-600 font-mono text-sm">
                    +{formatCurrency(session.savings)}
                  </span>
                </div>

                <div>
                  <span className="text-neutral-400 block text-[10px] uppercase font-mono">CO₂ Avoided</span>
                  <span className="font-bold text-neutral-900 font-mono text-sm">
                    {formatCo2(session.co2AvoidedKg)}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
