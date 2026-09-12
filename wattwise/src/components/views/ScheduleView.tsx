import React from 'react';
import { 
  IndianRupee, 
  Leaf, 
  BatteryCharging, 
  Clock, 
  ArrowRight,
  Sparkles
} from 'lucide-react';
import { useWattwise } from '../../context/WattwiseContext';
import { ChargingTimeline } from '../schedule/ChargingTimeline';
import { EnergyConditionGraph } from '../schedule/EnergyConditionGraph';
import { StatCard } from '../dashboard/StatCard';
import { formatCurrency, formatCo2, formatKwh } from '../../utils/formatters';

export const ScheduleView: React.FC = () => {
  const { schedule, openConnectModal } = useWattwise();

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* Overview Stat Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Optimal Window"
          value={`${schedule.optimalStart} – ${schedule.optimalEnd}`}
          subtext="2h 30m shifted charge duration"
          icon={<Clock className="w-4 h-4" />}
          badge="Locked In"
          badgeType="accent"
          highlight={true}
        />

        <StatCard
          label="Estimated Cost"
          value={formatCurrency(schedule.smartCost)}
          subtext={`Standard immediate: ${formatCurrency(schedule.normalCost)}`}
          icon={<IndianRupee className="w-4 h-4" />}
          badge={`Save ${formatCurrency(schedule.savings)}`}
          badgeType="positive"
        />

        <StatCard
          label="CO₂ Avoided"
          value={formatCo2(schedule.co2AvoidedKg)}
          subtext="Equivalent to 19 km clean travel"
          icon={<Leaf className="w-4 h-4" />}
          badge="Clean Wind"
          badgeType="positive"
        />

        <StatCard
          label="Target Energy"
          value={formatKwh(schedule.energyNeededKwh)}
          subtext="62% → 90% State of Charge"
          icon={<BatteryCharging className="w-4 h-4" />}
          badge="Ready by 11 AM"
          badgeType="neutral"
        />
      </div>

      {/* Main Charging Timeline */}
      <ChargingTimeline />

      {/* Interactive 24-hr Energy Condition & Tariff Graph */}
      <EnergyConditionGraph />

      {/* Why This Window Deep Dive & Environmental Arbitrage */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-white rounded-2xl border border-neutral-200/80 p-6 shadow-sm space-y-4">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-[#D4F634]" />
            <h4 className="text-base font-bold text-neutral-900 tracking-tight">
              Cost Arbitrage Breakdown
            </h4>
          </div>

          <div className="space-y-3 text-xs">
            <div className="p-3 rounded-xl bg-neutral-50 border border-neutral-100 flex items-center justify-between">
              <div>
                <span className="font-semibold text-neutral-900 block">Peak Tariff (6:30 PM — 11:00 PM)</span>
                <span className="text-neutral-500">Grid demand 4.8 – 5.2 GW • Thermal peaking plants</span>
              </div>
              <span className="font-mono font-bold text-neutral-700 text-sm">$4.70/kWh</span>
            </div>

            <div className="p-3 rounded-xl bg-[#D4F634]/15 border border-[#D4F634]/40 flex items-center justify-between">
              <div>
                <span className="font-bold text-neutral-950 block">Wattwise Window (11:40 PM — 2:10 AM)</span>
                <span className="text-neutral-600">Grid demand 1.6 – 1.8 GW • Clean wind baseline</span>
              </div>
              <span className="font-mono font-extrabold text-neutral-950 text-base">$3.38/kWh</span>
            </div>

            <div className="p-3 rounded-xl bg-neutral-50 border border-neutral-100 flex items-center justify-between">
              <div>
                <span className="font-semibold text-neutral-900 block">Morning Shoulder (6:00 AM — 11:00 AM)</span>
                <span className="text-neutral-500">Commercial ramp • Grid demand 4.2 GW</span>
              </div>
              <span className="font-mono font-bold text-neutral-700 text-sm">$4.25/kWh</span>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-neutral-200/80 p-6 shadow-sm space-y-4 flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Sparkles className="w-4 h-4 text-emerald-600" />
              <h4 className="text-base font-bold text-neutral-900 tracking-tight">
                Emissions & Grid Decarbonization
              </h4>
            </div>
            <p className="text-xs text-neutral-600 leading-relaxed mb-4">
              By shifting 28.4 kWh of EV load from the evening fossil peak into the late-night clean wind surplus, Wattwise prevented <strong>4.2 kg of CO₂ emissions</strong> while relieving local transformer stress.
            </p>

            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="p-3 rounded-xl bg-neutral-50 border border-neutral-100">
                <span className="text-neutral-400 block font-mono text-[10px] uppercase">Peak Grid Carbon</span>
                <span className="text-sm font-bold text-neutral-800 font-mono">512 g CO₂/kWh</span>
              </div>
              <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-100 text-emerald-900">
                <span className="text-emerald-700 block font-mono text-[10px] uppercase">Off-Peak Wind Carbon</span>
                <span className="text-sm font-bold font-mono">112 g CO₂/kWh</span>
              </div>
            </div>
          </div>

          <button
            onClick={openConnectModal}
            className="w-full py-3 px-4 rounded-xl bg-neutral-900 hover:bg-black text-white text-xs font-semibold flex items-center justify-center gap-2 shadow-sm transition-all cursor-pointer"
          >
            <span>Adjust Departure Constraint</span>
            <ArrowRight className="w-3.5 h-3.5 text-[#D4F634]" />
          </button>
        </div>
      </div>
    </div>
  );
};
