import React from 'react';
import { 
  Zap, 
  Leaf, 
  IndianRupee, 
  BatteryCharging, 
  Cable, 
  Clock
} from 'lucide-react';
import { useWattwise } from '../../context/WattwiseContext';
import { VehicleHeroCard } from '../dashboard/VehicleHeroCard';
import { BatteryIndicator } from '../dashboard/BatteryIndicator';
import { OptimalWindowBanner } from '../dashboard/OptimalWindowBanner';
import { StatCard } from '../dashboard/StatCard';
import { SmartExplanationCard } from '../dashboard/SmartExplanationCard';
import { EnergyConditionGraph } from '../schedule/EnergyConditionGraph';
import { formatCurrency, formatCo2, formatKwh } from '../../utils/formatters';

export const DashboardView: React.FC = () => {
  const { vehicle, schedule, openConnectModal, gridPercentile, priceTier, shortfallKwh } = useWattwise();
  const pctOff = schedule.normalCost > 0 ? Math.round((100 * schedule.savings) / schedule.normalCost) : 0;

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* Top Banner if vehicle disconnected */}
      {!vehicle.connected && (
        <div className="p-5 rounded-2xl bg-neutral-900 text-white flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-lg border border-neutral-800">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-neutral-800 flex items-center justify-center text-[#D4F634]">
              <Cable className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-base text-white">Vehicle Disconnected</h3>
              <p className="text-xs text-neutral-400 mt-0.5">
                Connect your EV now to unlock dynamic time-of-day tariff savings.
              </p>
            </div>
          </div>
          <button
            onClick={openConnectModal}
            className="px-5 py-2.5 rounded-xl bg-[#D4F634] hover:bg-[#c6e929] text-neutral-950 text-xs font-bold transition-all shadow-md cursor-pointer shrink-0"
          >
            Connect Vehicle →
          </button>
        </div>
      )}

      {/* Vehicle Hero Card */}
      <VehicleHeroCard />

      {/* Battery State of Charge & Quick Metrics */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <BatteryIndicator
            currentSoC={vehicle.currentSoC}
            targetSoC={vehicle.targetSoC}
            isCharging={vehicle.status === 'charging'}
          />
        </div>

        {/* Quick Dwell & Target Card */}
        <div className="bg-white rounded-2xl border border-neutral-200/80 p-5 shadow-sm flex flex-col justify-between">
          <div>
            <span className="text-[11px] font-mono uppercase tracking-wider text-neutral-400">
              Session Constraints
            </span>
            <div className="mt-2 space-y-3">
              <div className="flex items-center justify-between text-xs pb-2 border-b border-neutral-100">
                <span className="text-neutral-500">Connected at:</span>
                <span className="font-bold text-neutral-900 font-mono">{schedule.connectTime}</span>
              </div>
              <div className="flex items-center justify-between text-xs pb-2 border-b border-neutral-100">
                <span className="text-neutral-500">Must depart by:</span>
                <span className="font-bold text-neutral-900 font-mono">{schedule.departureTime}</span>
              </div>
              <div className="flex items-center justify-between text-xs pb-2 border-b border-neutral-100">
                <span className="text-neutral-500">Flexibility buffer:</span>
                <span className="font-bold text-[#A3C610] font-mono">{schedule.flexibilityHours}h {schedule.flexibilityMinutes}m</span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-neutral-500">Target battery:</span>
                <span className="font-bold text-neutral-900 font-mono">{vehicle.targetSoC}% (+{schedule.energyNeededKwh} kWh)</span>
              </div>
            </div>
          </div>

          <button
            onClick={openConnectModal}
            className="mt-4 w-full py-2.5 px-3 rounded-xl border border-neutral-200 hover:bg-neutral-50 text-neutral-700 text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
          >
            <Clock className="w-3.5 h-3.5 text-neutral-500" />
            <span>Modify Dwell Times</span>
          </button>
        </div>
      </div>

      {/* 4 Core Stat Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Estimated Cost"
          value={formatCurrency(schedule.smartCost)}
          subtext={`Normal rate: ${formatCurrency(schedule.normalCost)}`}
          icon={<IndianRupee className="w-4 h-4" />}
          badge={`${pctOff}% off`}
          badgeType="positive"
        />

        <StatCard
          label="You Save"
          value={formatCurrency(schedule.savings)}
          subtext="Saved on this session"
          icon={<Zap className="w-4 h-4" />}
          badge={priceTier ? `${priceTier.tier} rate` : "estimate"}
          badgeType="accent"
          highlight={true}
        />

        <StatCard
          label="CO₂ Avoided"
          value={formatCo2(schedule.co2AvoidedKg)}
          subtext={shortfallKwh > 0 ? `Last session ended ${shortfallKwh} kWh short of your stated need` : "vs charging at plug-in (estimate)"}
          icon={<Leaf className="w-4 h-4" />}
          badge={gridPercentile != null ? `cleaner than ${Math.round(gridPercentile)}% of today` : "estimate"}
          badgeType="positive"
        />

        <StatCard
          label="Energy Used"
          value={formatKwh(schedule.energyNeededKwh)}
          subtext={`To reach ${vehicle.targetSoC}% target`}
          icon={<BatteryCharging className="w-4 h-4" />}
          badge="7 kW L2"
          badgeType="neutral"
        />
      </div>

      {/* Optimal Charging Window Result Banner */}
      <OptimalWindowBanner />

      {/* Dynamic Grid Signals & Price Chart */}
      <EnergyConditionGraph />

      {/* Smart Charging Explanation */}
      <SmartExplanationCard />
    </div>
  );
};
