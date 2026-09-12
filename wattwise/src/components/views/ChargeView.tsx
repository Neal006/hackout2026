import React from 'react';
import { 
  Play, 
  Square, 
  AlertTriangle, 
  Plug, 
  Cpu 
} from 'lucide-react';
import { useWattwise } from '../../context/WattwiseContext';
import { BatteryIndicator } from '../dashboard/BatteryIndicator';
import { estimateKmRange, formatCurrency } from '../../utils/formatters';

export const ChargeView: React.FC = () => {
  const { 
    vehicle, 
    schedule, 
    setChargeMode, 
    updateTargetSoC, 
    isSimulatingCharge, 
    startSimulation, 
    stopSimulation 
  } = useWattwise();

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* Top Battery Status */}
      <BatteryIndicator
        currentSoC={vehicle.currentSoC}
        targetSoC={vehicle.targetSoC}
        isCharging={vehicle.status === 'charging'}
      />

      {/* Charge Mode Selector: Smart vs Immediate */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Smart Optimized Option */}
        <div
          onClick={() => setChargeMode('smart')}
          className={`p-6 rounded-2xl border-2 transition-all cursor-pointer relative overflow-hidden ${
            schedule.chargeMode === 'smart'
              ? 'bg-neutral-900 text-white border-neutral-900 shadow-md ring-2 ring-[#D4F634]/40'
              : 'bg-white text-neutral-900 border-neutral-200 hover:border-neutral-300'
          }`}
        >
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-[#D4F634] inline-block animate-pulse" />
              <span className="text-xs font-mono font-bold uppercase tracking-wider text-[#D4F634]">
                Recommended
              </span>
            </div>
            <span
              className={`text-xs font-semibold px-2.5 py-0.5 rounded-full ${
                schedule.chargeMode === 'smart'
                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                  : 'bg-neutral-100 text-neutral-600'
              }`}
            >
              Save ₹32 • 25% Off
            </span>
          </div>

          <h3 className="text-xl font-bold tracking-tight mb-1">
            Smart Optimized Schedule
          </h3>
          <p
            className={`text-xs mb-5 ${
              schedule.chargeMode === 'smart' ? 'text-neutral-400' : 'text-neutral-500'
            }`}
          >
            Waits for the 11:40 PM clean energy trough. Avoids peak ₹4.70 rates.
          </p>

          <div className="grid grid-cols-2 gap-3 text-xs pt-4 border-t border-neutral-800/80">
            <div>
              <span className="text-neutral-400 block text-[10px] uppercase font-mono">Cost</span>
              <span className="text-xl font-extrabold text-[#D4F634] font-mono">
                {formatCurrency(schedule.smartCost)}
              </span>
            </div>
            <div>
              <span className="text-neutral-400 block text-[10px] uppercase font-mono">Window</span>
              <span className="text-sm font-bold text-white font-mono">
                11:40 PM — 2:10 AM
              </span>
            </div>
          </div>
        </div>

        {/* Immediate Charging Option */}
        <div
          onClick={() => setChargeMode('immediate')}
          className={`p-6 rounded-2xl border-2 transition-all cursor-pointer relative overflow-hidden ${
            schedule.chargeMode === 'immediate'
              ? 'bg-neutral-900 text-white border-neutral-900 shadow-md ring-2 ring-amber-400/40'
              : 'bg-white text-neutral-900 border-neutral-200 hover:border-neutral-300'
          }`}
        >
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-500" />
              <span className="text-xs font-mono font-bold uppercase tracking-wider text-amber-500">
                Peak Load Override
              </span>
            </div>
            <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-800">
              No Delay
            </span>
          </div>

          <h3 className="text-xl font-bold tracking-tight mb-1">
            Charge Immediately
          </h3>
          <p
            className={`text-xs mb-5 ${
              schedule.chargeMode === 'immediate' ? 'text-neutral-400' : 'text-neutral-500'
            }`}
          >
            Starts pulling 11 kW right now at 6:30 PM despite peak grid congestion.
          </p>

          <div className="grid grid-cols-2 gap-3 text-xs pt-4 border-t border-neutral-200">
            <div>
              <span className="text-neutral-400 block text-[10px] uppercase font-mono">Cost</span>
              <span className="text-xl font-extrabold text-neutral-900 font-mono">
                {formatCurrency(schedule.normalCost)}
              </span>
            </div>
            <div>
              <span className="text-neutral-400 block text-[10px] uppercase font-mono">Ready by</span>
              <span className="text-sm font-bold text-neutral-900 font-mono">
                9:00 PM (Tonight)
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Target Battery Level Adjustment */}
      <div className="bg-white rounded-2xl border border-neutral-200/80 p-6 shadow-sm">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h4 className="text-base font-bold text-neutral-900 tracking-tight">
              Target State of Charge (SoC)
            </h4>
            <p className="text-xs text-neutral-500">
              Select desired battery percentage before your 11:00 AM departure.
            </p>
          </div>
          <div className="text-right">
            <span className="text-2xl font-extrabold font-mono text-neutral-900">
              {vehicle.targetSoC}%
            </span>
            <span className="text-xs text-neutral-400 block font-mono">
              ~{estimateKmRange(vehicle.targetSoC)} km range
            </span>
          </div>
        </div>

        <input
          type="range"
          min={70}
          max={100}
          step={5}
          value={vehicle.targetSoC}
          onChange={(e) => updateTargetSoC(Number(e.target.value))}
          className="w-full h-2.5 bg-neutral-100 rounded-lg cursor-pointer accent-neutral-900"
        />

        <div className="flex justify-between items-center mt-3 text-xs text-neutral-400 font-mono">
          <span>70% (Commute)</span>
          <span className="font-bold text-neutral-700">80% (Daily Battery Health)</span>
          <span className="font-bold text-[#A3C610]">90% (Recommended)</span>
          <span>100% (Long Highway Trip)</span>
        </div>
      </div>

      {/* Interactive Simulation Console for Hackathon Judges */}
      <div className="bg-gradient-to-br from-neutral-900 via-neutral-950 to-black text-white rounded-2xl p-6 sm:p-7 shadow-lg border border-neutral-800 relative overflow-hidden">
        <div className="absolute right-0 bottom-0 translate-x-12 translate-y-12 w-64 h-64 bg-[#D4F634]/10 rounded-full blur-3xl pointer-events-none" />

        <div className="flex flex-wrap items-center justify-between gap-4 relative z-10 mb-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#D4F634] text-neutral-950 flex items-center justify-center font-bold shadow-md">
              <Cpu className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h4 className="text-base font-bold text-white tracking-tight">
                  Interactive Live Session Simulator
                </h4>
                <span className="text-[10px] font-mono bg-neutral-800 text-[#D4F634] px-2 py-0.5 rounded-full border border-neutral-700">
                  DEMO TOOL
                </span>
              </div>
              <p className="text-xs text-neutral-400 mt-0.5">
                Simulate the EV accepting power at 11 kW during the scheduled window.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {isSimulatingCharge ? (
              <button
                onClick={stopSimulation}
                className="px-4 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold transition-all shadow-sm flex items-center gap-2 cursor-pointer"
              >
                <Square className="w-3.5 h-3.5 fill-current" />
                <span>Stop Simulation</span>
              </button>
            ) : (
              <button
                onClick={startSimulation}
                className="px-5 py-2.5 rounded-xl bg-[#D4F634] hover:bg-[#c6e929] text-neutral-950 text-xs font-bold transition-all shadow-md flex items-center gap-2 cursor-pointer"
              >
                <Play className="w-3.5 h-3.5 fill-current" />
                <span>Simulate Charge Progress</span>
              </button>
            )}
          </div>
        </div>

        {/* Live Readouts */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs pt-4 border-t border-neutral-800/80">
          <div className="p-3 rounded-xl bg-neutral-900/90 border border-neutral-800">
            <span className="text-neutral-500 block font-mono text-[10px] uppercase">Active Power</span>
            <span className="text-lg font-bold text-white font-mono">
              {isSimulatingCharge ? '11.0 kW' : '0.0 kW (Paused)'}
            </span>
          </div>

          <div className="p-3 rounded-xl bg-neutral-900/90 border border-neutral-800">
            <span className="text-neutral-500 block font-mono text-[10px] uppercase">Current SoC</span>
            <span className="text-lg font-bold text-[#D4F634] font-mono">
              {vehicle.currentSoC}% / {vehicle.targetSoC}%
            </span>
          </div>

          <div className="p-3 rounded-xl bg-neutral-900/90 border border-neutral-800">
            <span className="text-neutral-500 block font-mono text-[10px] uppercase">OCPP Protocol</span>
            <span className="text-lg font-bold text-white font-mono">v2.0.1 Ready</span>
          </div>

          <div className="p-3 rounded-xl bg-neutral-900/90 border border-neutral-800">
            <span className="text-neutral-500 block font-mono text-[10px] uppercase">Session State</span>
            <span className="text-sm font-bold text-emerald-400 font-mono flex items-center gap-1.5 mt-1">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
              {isSimulatingCharge ? 'Current Flowing' : 'Smart Hold'}
            </span>
          </div>
        </div>
      </div>

      {/* Charger Hardware Specs */}
      <div className="bg-white rounded-2xl border border-neutral-200/80 p-6 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-neutral-100 flex items-center justify-center text-neutral-800">
              <Plug className="w-5 h-5" />
            </div>
            <div>
              <h4 className="text-sm font-bold text-neutral-900">
                Connected Hardware: Wallbox Pulsar Plus
              </h4>
              <p className="text-xs text-neutral-500 font-mono">
                Hardwired 3-Phase AC • Max 11 kW • Type 2 Connector
              </p>
            </div>
          </div>
          <span className="text-xs font-mono font-semibold px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
            OCPP Connected
          </span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
          <div className="p-3 rounded-xl bg-neutral-50 border border-neutral-100">
            <span className="text-neutral-400 block text-[10px] font-mono">VOLTAGE / CURRENT</span>
            <span className="font-bold text-neutral-900 font-mono">400V / 16A per phase</span>
          </div>
          <div className="p-3 rounded-xl bg-neutral-50 border border-neutral-100">
            <span className="text-neutral-400 block text-[10px] font-mono">EFFICIENCY</span>
            <span className="font-bold text-neutral-900 font-mono">94.8% End-to-End</span>
          </div>
          <div className="p-3 rounded-xl bg-neutral-50 border border-neutral-100">
            <span className="text-neutral-400 block text-[10px] font-mono">COMM PROTOCOL</span>
            <span className="font-bold text-neutral-900 font-mono">ISO 15118 & OCPP 2.0</span>
          </div>
          <div className="p-3 rounded-xl bg-neutral-50 border border-neutral-100">
            <span className="text-neutral-400 block text-[10px] font-mono">SAFETY INTERLOCK</span>
            <span className="font-bold text-emerald-600 font-mono">Locked & Grounded</span>
          </div>
        </div>
      </div>
    </div>
  );
};
