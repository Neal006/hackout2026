import React from 'react';
import { Lightbulb, ArrowDownRight, Compass, ShieldCheck } from 'lucide-react';

export const SmartExplanationCard: React.FC = () => {
  return (
    <div className="w-full bg-white rounded-2xl border border-neutral-200/80 p-6 shadow-sm">
      <div className="flex items-start gap-4">
        <div className="w-10 h-10 rounded-xl bg-neutral-900 text-[#D4F634] flex items-center justify-center shrink-0">
          <Lightbulb className="w-5 h-5" />
        </div>

        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <h4 className="text-sm font-bold text-neutral-900 tracking-tight">
              How Wattwise Optimization Works
            </h4>
            <span className="text-[10px] font-mono font-semibold px-2 py-0.5 rounded bg-emerald-50 text-emerald-700">
              Deadline-Based Arbitrage
            </span>
          </div>

          <p className="text-xs text-neutral-600 leading-relaxed">
            Most EV owners plug in at <strong>6:30 PM</strong> when coming home. Standard chargers immediately begin pulling 11 kW during the grid’s worst evening peak (5.2 GW regional load, $4.70/kWh tariff). 
          </p>
          <p className="text-xs text-neutral-600 leading-relaxed">
            Because you gave Wattwise until <strong>11:00 AM tomorrow</strong>, the system safely pauses the session and dispatches charge current into the <strong>11:40 PM — 2:10 AM</strong> valley. You wake up fully charged to 90%, having saved <strong>$32</strong> and avoided <strong>4.2 kg CO₂</strong> with zero sacrifice.
          </p>

          <div className="pt-2 flex flex-wrap items-center gap-4 text-xs text-neutral-500 font-mono">
            <span className="flex items-center gap-1">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
              Guaranteed target by 11:00 AM
            </span>
            <span className="flex items-center gap-1">
              <ArrowDownRight className="w-3.5 h-3.5 text-blue-600" />
              Zero peak grid congestion
            </span>
            <span className="flex items-center gap-1">
              <Compass className="w-3.5 h-3.5 text-amber-600" />
              100% automated OCPP control
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
