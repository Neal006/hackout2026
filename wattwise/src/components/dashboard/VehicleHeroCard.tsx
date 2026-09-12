import React from 'react';
import { Zap, Cable, ChevronRight } from 'lucide-react';
import { useWattwise } from '../../context/WattwiseContext';
import { estimateKmRange } from '../../utils/formatters';

export const VehicleHeroCard: React.FC = () => {
  const { vehicle, schedule, openConnectModal, setCurrentNav, disconnectVehicle } = useWattwise();

  return (
    <div className="w-full bg-white rounded-2xl border border-neutral-200/80 p-6 shadow-sm">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
        {/* Left Side: Vehicle Info & Graphic Mockup */}
        <div className="flex items-start sm:items-center gap-5">
          {/* Stylized Vehicle SVG / Icon Card */}
          <div className="relative w-20 h-20 sm:w-24 sm:h-24 rounded-2xl bg-neutral-900 flex items-center justify-center p-3 text-white shrink-0 overflow-hidden shadow-inner border border-neutral-800">
            {/* Ambient electric lime glow */}
            <div className="absolute -bottom-4 left-1/2 -translate-x-1/2 w-16 h-8 bg-[#D4F634]/30 rounded-full blur-md" />
            
            {/* Minimal Tesla silhouette vector */}
            <svg viewBox="0 0 100 45" className="w-full h-auto text-neutral-100 z-10" fill="currentColor">
              <path d="M12 28 C 15 28, 22 28, 25 24 C 29 19, 42 12, 60 12 C 72 12, 80 18, 88 23 C 94 25, 98 27, 98 32 C 98 35, 93 36, 90 36 C 89 32, 86 29, 81 29 C 76 29, 73 32, 72 36 L 36 36 C 35 32, 32 29, 27 29 C 22 29, 19 32, 18 36 L 6 36 C 3 36, 2 34, 2 31 C 2 28, 6 28, 12 28 Z" opacity="0.9" />
              <circle cx="27" cy="35" r="4.5" fill="#171717" stroke="#D4F634" strokeWidth="2" />
              <circle cx="81" cy="35" r="4.5" fill="#171717" stroke="#D4F634" strokeWidth="2" />
            </svg>
          </div>

          <div>
            <div className="flex flex-wrap items-center gap-2 mb-1">
              <h3 className="text-xl font-extrabold text-neutral-900 tracking-tight">
                {vehicle.model}
              </h3>
              <span className="text-xs font-mono text-neutral-500 bg-neutral-100 px-2 py-0.5 rounded-full">
                {vehicle.variant}
              </span>
            </div>

            <p className="text-xs text-neutral-500 flex items-center gap-1.5 font-mono">
              <span>{vehicle.chargerName}</span>
              <span>•</span>
              <span className="text-neutral-700 font-semibold">{vehicle.maxChargeRateKw} kW Level 2</span>
            </p>

            {/* Connection badge */}
            <div className="mt-2.5 flex items-center gap-2">
              {vehicle.connected ? (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  Connected & Scheduled
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                  Disconnected
                </span>
              )}

              <span className="text-xs text-neutral-400 font-mono">
                Est. Range: ~{estimateKmRange(vehicle.currentSoC)} km
              </span>
            </div>
          </div>
        </div>

        {/* Right Side: Key Status & Action CTAs */}
        <div className="flex flex-wrap items-center gap-3">
          {vehicle.connected ? (
            <>
              <button
                onClick={() => setCurrentNav('schedule')}
                className="px-4 py-2.5 rounded-xl border border-neutral-200 hover:bg-neutral-50 text-neutral-800 text-xs font-semibold transition-all inline-flex items-center gap-1.5 cursor-pointer"
              >
                <span>View Schedule</span>
                <ChevronRight className="w-4 h-4 text-neutral-400" />
              </button>

              <button
                onClick={openConnectModal}
                className="px-4 py-2.5 rounded-xl bg-neutral-900 hover:bg-black text-white text-xs font-semibold shadow-sm transition-all inline-flex items-center gap-1.5 cursor-pointer"
              >
                <Zap className="w-3.5 h-3.5 text-[#D4F634]" />
                <span>Adjust Window</span>
              </button>

              <button
                onClick={disconnectVehicle}
                className="px-3 py-2.5 rounded-xl text-neutral-400 hover:text-neutral-700 text-xs font-medium transition-colors"
                title="Disconnect vehicle for demo"
              >
                Disconnect
              </button>
            </>
          ) : (
            <button
              onClick={openConnectModal}
              className="w-full sm:w-auto px-6 py-3 rounded-xl bg-neutral-900 hover:bg-black text-white text-sm font-semibold shadow-md transition-all inline-flex items-center justify-center gap-2 cursor-pointer animate-pulse-glow"
            >
              <Cable className="w-4 h-4 text-[#D4F634]" />
              <span>Connect Vehicle</span>
            </button>
          )}
        </div>
      </div>

      {/* Quick Summary Strip */}
      {vehicle.connected && (
        <div className="mt-5 pt-4 border-t border-neutral-100 grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
          <div className="p-2.5 rounded-lg bg-neutral-50 border border-neutral-100">
            <span className="text-neutral-400 block text-[10px] font-mono uppercase">Charging scheduled</span>
            <span className="font-bold text-neutral-900 font-mono text-sm">{schedule.optimalStart}</span>
          </div>

          <div className="p-2.5 rounded-lg bg-neutral-50 border border-neutral-100">
            <span className="text-neutral-400 block text-[10px] font-mono uppercase">Est. completion</span>
            <span className="font-bold text-neutral-900 font-mono text-sm">{schedule.optimalEnd}</span>
          </div>

          <div className="p-2.5 rounded-lg bg-neutral-50 border border-neutral-100">
            <span className="text-neutral-400 block text-[10px] font-mono uppercase">Energy to deliver</span>
            <span className="font-bold text-neutral-900 font-mono text-sm">{schedule.energyNeededKwh} kWh</span>
          </div>

          <div className="p-2.5 rounded-lg bg-neutral-50 border border-neutral-100">
            <span className="text-neutral-400 block text-[10px] font-mono uppercase">Cost / Savings</span>
            <span className="font-bold text-emerald-600 font-mono text-sm">₹{schedule.smartCost} (Save ₹{schedule.savings})</span>
          </div>
        </div>
      )}
    </div>
  );
};
