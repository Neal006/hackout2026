import React from 'react';
import { Zap } from 'lucide-react';
import { estimateKmRange } from '../../utils/formatters';

interface BatteryIndicatorProps {
  currentSoC: number;
  targetSoC: number;
  isCharging?: boolean;
}

export const BatteryIndicator: React.FC<BatteryIndicatorProps> = ({
  currentSoC,
  targetSoC,
  isCharging = false,
}) => {
  const rangeKm = estimateKmRange(currentSoC);
  const targetKm = estimateKmRange(targetSoC);

  return (
    <div className="w-full bg-neutral-900 text-white p-5 rounded-2xl relative overflow-hidden shadow-sm">
      {/* Background ambient glow if charging */}
      {isCharging && (
        <div className="absolute top-0 right-0 -mr-16 -mt-16 w-48 h-48 rounded-full bg-[#D4F634]/15 blur-3xl pointer-events-none" />
      )}

      <div className="flex items-start justify-between mb-4">
        <div>
          <span className="text-[11px] font-mono uppercase tracking-widest text-neutral-400">
            Battery State of Charge
          </span>
          <div className="flex items-baseline gap-2 mt-1">
            <span className="text-4xl font-extrabold tracking-tight text-white font-mono">
              {currentSoC}%
            </span>
            <span className="text-neutral-400 text-sm font-medium">
              ~{rangeKm} km range
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {isCharging ? (
            <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#D4F634] text-neutral-950 text-xs font-bold animate-pulse">
              <Zap className="w-3.5 h-3.5 fill-current" />
              Charging (11 kW)
            </div>
          ) : (
            <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-neutral-800 text-neutral-300 text-xs font-medium">
              <span className="w-2 h-2 rounded-full bg-amber-400" />
              Target: {targetSoC}% ({targetKm} km)
            </div>
          )}
        </div>
      </div>

      {/* Battery Gauge Bar */}
      <div className="relative w-full h-7 bg-neutral-800 rounded-xl p-1 border border-neutral-700/60 overflow-hidden">
        {/* Target marker notch */}
        <div
          className="absolute top-0 bottom-0 w-0.5 bg-white/60 z-20"
          style={{ left: `${targetSoC}%` }}
        >
          <div className="absolute -top-1 -translate-x-1/2 w-2 h-2 rounded-full bg-white shadow" />
        </div>

        {/* Current fill bar */}
        <div
          className={`h-full rounded-lg transition-all duration-500 relative flex items-center justify-end pr-2 ${
            isCharging
              ? 'bg-gradient-to-r from-emerald-500 via-[#D4F634] to-[#D4F634] shadow-[0_0_12px_rgba(212,246,52,0.6)]'
              : currentSoC > 50
              ? 'bg-gradient-to-r from-neutral-200 to-white'
              : 'bg-gradient-to-r from-amber-400 to-amber-300'
          }`}
          style={{ width: `${Math.min(100, Math.max(8, currentSoC))}%` }}
        >
          {isCharging && (
            <Zap className="w-3 h-3 text-neutral-950 fill-current animate-bounce" />
          )}
        </div>

        {/* Buffer highlight zone between current and target */}
        {targetSoC > currentSoC && (
          <div
            className="absolute top-1 bottom-1 bg-[#D4F634]/20 rounded-r-lg border-r border-dashed border-[#D4F634]/70 pointer-events-none"
            style={{
              left: `${currentSoC}%`,
              width: `${targetSoC - currentSoC}%`,
            }}
          />
        )}
      </div>

      {/* Ticks and legend */}
      <div className="flex justify-between items-center mt-2 text-[11px] font-mono text-neutral-400">
        <span>0%</span>
        <span>25%</span>
        <span>50%</span>
        <span className="text-[#D4F634] font-semibold">Target {targetSoC}%</span>
        <span>100%</span>
      </div>
    </div>
  );
};
