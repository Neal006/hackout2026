import React from 'react';
import { Zap, TrendingDown, Leaf, ArrowRight, RefreshCw } from 'lucide-react';
import { useWattwise } from '../../context/WattwiseContext';
import { formatCurrency, formatCo2 } from '../../utils/formatters';

export const OptimalWindowBanner: React.FC = () => {
  const { schedule, setCurrentNav, openConnectModal } = useWattwise();

  return (
    <div className="w-full bg-white rounded-2xl border border-neutral-200/90 shadow-sm overflow-hidden">
      {/* Header bar with electric accent */}
      <div className="bg-neutral-900 text-white p-6 sm:p-7 relative overflow-hidden">
        {/* Glow orb in corner */}
        <div className="absolute -right-12 -top-12 w-48 h-48 rounded-full bg-[#D4F634]/15 blur-3xl pointer-events-none" />

        <div className="flex flex-wrap items-center justify-between gap-4 relative z-10">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="w-2.5 h-2.5 rounded-full bg-[#D4F634] inline-block animate-pulse" />
              <span className="text-xs font-mono uppercase tracking-widest text-[#D4F634] font-bold">
                Recommended by Wattwise
              </span>
            </div>
            <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-white">
              Optimal charging window
            </h2>
          </div>

          <button
            onClick={openConnectModal}
            className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-xs font-semibold text-neutral-200 transition-colors border border-neutral-700"
          >
            <RefreshCw className="w-3.5 h-3.5 text-[#D4F634]" />
            <span>Re-optimize Schedule</span>
          </button>
        </div>

        {/* Large Window Display */}
        <div className="mt-4 inline-flex items-center gap-3 px-5 py-3 rounded-2xl bg-neutral-800/90 border border-neutral-700/80 shadow-inner">
          <div className="w-8 h-8 rounded-xl bg-[#D4F634] flex items-center justify-center text-neutral-950 shadow-sm">
            <Zap className="w-5 h-5 fill-current" />
          </div>
          <div>
            <div className="text-[11px] font-mono text-neutral-400 uppercase tracking-wider">
              Shifted window (2h 30m)
            </div>
            <div className="text-2xl sm:text-3xl font-extrabold text-white font-mono tracking-tight">
              {schedule.optimalStart} — {schedule.optimalEnd}
            </div>
          </div>
        </div>

        {/* Horizontal Mini Timeline */}
        <div className="mt-6 pt-5 border-t border-neutral-800/80">
          <div className="text-xs font-semibold text-neutral-400 uppercase tracking-wider mb-3">
            Schedule Flow
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5 text-xs">
            <div className="p-2.5 rounded-xl bg-neutral-800/60 border border-neutral-700/50">
              <div className="text-neutral-400 text-[10px] font-mono">6:30 PM</div>
              <div className="font-semibold text-white mt-0.5">Connected</div>
            </div>
            <div className="p-2.5 rounded-xl bg-neutral-800/60 border border-neutral-700/50">
              <div className="text-amber-400 text-[10px] font-mono">6:30 – 11:40 PM</div>
              <div className="font-semibold text-neutral-200 mt-0.5">Waiting / optimized</div>
            </div>
            <div className="p-2.5 rounded-xl bg-[#D4F634]/15 border border-[#D4F634]/40 col-span-2 sm:col-span-1">
              <div className="text-[#D4F634] text-[10px] font-mono font-bold">11:40 PM – 2:10 AM</div>
              <div className="font-bold text-[#D4F634] mt-0.5 flex items-center gap-1">
                <Zap className="w-3 h-3 fill-current" /> ⚡ Charging
              </div>
            </div>
            <div className="p-2.5 rounded-xl bg-neutral-800/60 border border-neutral-700/50">
              <div className="text-emerald-400 text-[10px] font-mono">2:10 AM</div>
              <div className="font-semibold text-neutral-200 mt-0.5">Fully charged</div>
            </div>
            <div className="p-2.5 rounded-xl bg-neutral-800/60 border border-neutral-700/50">
              <div className="text-neutral-400 text-[10px] font-mono">11:00 AM</div>
              <div className="font-semibold text-white mt-0.5">Departure</div>
            </div>
          </div>
        </div>
      </div>

      {/* Why This Window & Financial Impact */}
      <div className="p-6 sm:p-7 space-y-6">
        <div>
          <h4 className="text-sm font-bold text-neutral-900 tracking-tight uppercase mb-3 flex items-center gap-2">
            <span>Why this window?</span>
            <span className="text-[10px] font-normal text-neutral-500 lowercase">
              (multi-objective grid optimization)
            </span>
          </h4>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
            {/* Reason 1 */}
            <div className="p-4 rounded-xl border border-neutral-200/80 bg-neutral-50/50 flex items-start gap-3">
              <div className="w-8 h-8 rounded-lg bg-amber-100 text-amber-800 flex items-center justify-center shrink-0 mt-0.5">
                <Zap className="w-4 h-4" />
              </div>
              <div>
                <div className="text-xs font-bold text-neutral-900">
                  ⚡ Lower electricity cost
                </div>
                <div className="text-xs text-neutral-500 mt-0.5">
                  Super off-peak rate of <strong>$3.38/kWh</strong> vs <strong>$4.50/kWh</strong> peak evening tariff.
                </div>
              </div>
            </div>

            {/* Reason 2 */}
            <div className="p-4 rounded-xl border border-neutral-200/80 bg-neutral-50/50 flex items-start gap-3">
              <div className="w-8 h-8 rounded-lg bg-blue-100 text-blue-800 flex items-center justify-center shrink-0 mt-0.5">
                <TrendingDown className="w-4 h-4" />
              </div>
              <div>
                <div className="text-xs font-bold text-neutral-900">
                  📉 Lower grid demand
                </div>
                <div className="text-xs text-neutral-500 mt-0.5">
                  Regional load drops from <strong>5.2 GW</strong> down to <strong>1.8 GW</strong>, relieving substation strain.
                </div>
              </div>
            </div>

            {/* Reason 3 */}
            <div className="p-4 rounded-xl border border-neutral-200/80 bg-neutral-50/50 flex items-start gap-3">
              <div className="w-8 h-8 rounded-lg bg-emerald-100 text-emerald-800 flex items-center justify-center shrink-0 mt-0.5">
                <Leaf className="w-4 h-4" />
              </div>
              <div>
                <div className="text-xs font-bold text-neutral-900">
                  🌱 Higher renewable availability
                </div>
                <div className="text-xs text-neutral-500 mt-0.5">
                  <strong>84% clean energy</strong> share during late night wind and hydro surplus hours.
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Cost & Carbon Breakdown Bar */}
        <div className="p-4 rounded-xl bg-neutral-50 border border-neutral-200/70 flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-6 text-sm">
            <div>
              <span className="text-xs text-neutral-500 block">Estimated cost:</span>
              <span className="font-extrabold text-neutral-900 font-mono text-lg">
                {formatCurrency(schedule.smartCost)}
              </span>
            </div>

            <div>
              <span className="text-xs text-neutral-500 block">Normal cost:</span>
              <span className="font-semibold text-neutral-400 line-through font-mono text-base">
                {formatCurrency(schedule.normalCost)}
              </span>
            </div>

            <div className="pl-4 border-l border-neutral-300">
              <span className="text-xs text-emerald-700 font-semibold block">You save:</span>
              <span className="font-black text-emerald-600 font-mono text-xl">
                {formatCurrency(schedule.savings)}
              </span>
            </div>

            <div className="pl-4 border-l border-neutral-300">
              <span className="text-xs text-neutral-500 block">CO₂ avoided:</span>
              <span className="font-bold text-neutral-900 font-mono text-base">
                {formatCo2(schedule.co2AvoidedKg)}
              </span>
            </div>
          </div>

          <button
            onClick={() => setCurrentNav('schedule')}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-neutral-900 hover:bg-black text-white text-xs font-semibold shadow-sm transition-all cursor-pointer"
          >
            <span>View Full Schedule</span>
            <ArrowRight className="w-3.5 h-3.5 text-[#D4F634]" />
          </button>
        </div>
      </div>
    </div>
  );
};
