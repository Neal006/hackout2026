import React, { useState } from 'react';
import { 
  Car, 
  Plug, 
  Zap, 
  Sliders, 
  RotateCcw
} from 'lucide-react';
import { useWattwise } from '../../context/WattwiseContext';

export const ProfileView: React.FC = () => {
  const { vehicle, resetDemo } = useWattwise();

  const [minBuffer, setMinBuffer] = useState<number>(30);
  const [notifications, setNotifications] = useState({
    readyByDeparture: true,
    chargeStarted: true,
    gridSurgeWarning: true,
  });

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* User & Plan Overview */}
      <div className="bg-white rounded-2xl border border-neutral-200/80 p-6 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-2xl bg-neutral-900 text-white flex items-center justify-center font-bold text-xl shadow-inner border border-neutral-800">
            S
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-lg font-bold text-neutral-900">Srishti Sharma</h3>
              <span className="text-[10px] font-mono font-bold bg-[#D4F634] text-neutral-950 px-2 py-0.5 rounded-full">
                PRO DRIVER
              </span>
            </div>
            <p className="text-xs text-neutral-500 font-mono">
              srishti@wattwise.energy • EV Fleet ID #WW-8924
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={resetDemo}
            className="px-4 py-2 rounded-xl border border-neutral-200 hover:bg-neutral-50 text-neutral-700 text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Reset Demo Defaults</span>
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Vehicle Configuration */}
        <div className="bg-white rounded-2xl border border-neutral-200/80 p-6 shadow-sm space-y-4">
          <div className="flex items-center gap-2.5 pb-3 border-b border-neutral-100">
            <Car className="w-5 h-5 text-neutral-900" />
            <div>
              <h4 className="text-sm font-bold text-neutral-900">Connected Vehicle</h4>
              <p className="text-xs text-neutral-400">Direct telemetry synced via Tesla Fleet API</p>
            </div>
          </div>

          <div className="space-y-3 text-xs">
            <div className="flex justify-between py-2 border-b border-neutral-50">
              <span className="text-neutral-500">Model</span>
              <span className="font-bold text-neutral-900 font-mono">{vehicle.model}</span>
            </div>
            <div className="flex justify-between py-2 border-b border-neutral-50">
              <span className="text-neutral-500">Battery Capacity</span>
              <span className="font-bold text-neutral-900 font-mono">{vehicle.batteryCapacityKwh} kWh NMC</span>
            </div>
            <div className="flex justify-between py-2 border-b border-neutral-50">
              <span className="text-neutral-500">Max AC Onboard Charger</span>
              <span className="font-bold text-neutral-900 font-mono">{vehicle.maxChargeRateKw} kW (3-Phase 16A)</span>
            </div>
            <div className="flex justify-between py-2 border-b border-neutral-50">
              <span className="text-neutral-500">VIN</span>
              <span className="font-mono text-neutral-700">{vehicle.vin}</span>
            </div>
            <div className="flex justify-between py-2">
              <span className="text-neutral-500">Firmware</span>
              <span className="font-mono text-neutral-700">{vehicle.firmware}</span>
            </div>
          </div>
        </div>

        {/* Connected Charger Hardware */}
        <div className="bg-white rounded-2xl border border-neutral-200/80 p-6 shadow-sm space-y-4">
          <div className="flex items-center gap-2.5 pb-3 border-b border-neutral-100">
            <Plug className="w-5 h-5 text-neutral-900" />
            <div>
              <h4 className="text-sm font-bold text-neutral-900">Connected Charger</h4>
              <p className="text-xs text-neutral-400">Smart EVSE hardware with OCPP 2.0.1 control</p>
            </div>
          </div>

          <div className="space-y-3 text-xs">
            <div className="flex justify-between py-2 border-b border-neutral-50">
              <span className="text-neutral-500">Hardware Unit</span>
              <span className="font-bold text-neutral-900 font-mono">{vehicle.chargerName}</span>
            </div>
            <div className="flex justify-between py-2 border-b border-neutral-50">
              <span className="text-neutral-500">Rating & Installation</span>
              <span className="font-bold text-neutral-900 font-mono">11 kW • 400V 3-Phase</span>
            </div>
            <div className="flex justify-between py-2 border-b border-neutral-50">
              <span className="text-neutral-500">Connector Interface</span>
              <span className="font-bold text-neutral-900 font-mono">Type 2 (IEC 62196-2)</span>
            </div>
            <div className="flex justify-between py-2 border-b border-neutral-50">
              <span className="text-neutral-500">Control Protocol</span>
              <span className="font-bold text-neutral-900 font-mono">OCPP 2.0.1 SetChargingProfile</span>
            </div>
            <div className="flex justify-between py-2">
              <span className="text-neutral-500">Connection Link</span>
              <span className="text-emerald-600 font-semibold font-mono">Wi-Fi 5GHz (Signal 98%)</span>
            </div>
          </div>
        </div>

        {/* Dynamic Energy Tariff Rates */}
        <div className="bg-white rounded-2xl border border-neutral-200/80 p-6 shadow-sm space-y-4">
          <div className="flex items-center gap-2.5 pb-3 border-b border-neutral-100">
            <Zap className="w-5 h-5 text-neutral-900" />
            <div>
              <h4 className="text-sm font-bold text-neutral-900">Utility Tariff Schedule</h4>
              <p className="text-xs text-neutral-400">Time-of-Day (ToU-EV Tier 2)</p>
            </div>
          </div>

          <div className="space-y-2.5 text-xs">
            <div className="p-3 rounded-xl bg-emerald-50/60 border border-emerald-200/70 flex items-center justify-between">
              <div>
                <span className="font-bold text-neutral-900 block">Super Off-Peak (Target Window)</span>
                <span className="text-neutral-500 font-mono text-[11px]">11:00 PM — 6:00 AM</span>
              </div>
              <span className="font-mono font-extrabold text-emerald-700 text-sm">$3.38 / kWh</span>
            </div>

            <div className="p-3 rounded-xl bg-neutral-50 border border-neutral-100 flex items-center justify-between">
              <div>
                <span className="font-bold text-neutral-900 block">Normal / Shoulder</span>
                <span className="text-neutral-500 font-mono text-[11px]">6:00 AM — 5:00 PM</span>
              </div>
              <span className="font-mono font-bold text-neutral-700 text-sm">$3.90 / kWh</span>
            </div>

            <div className="p-3 rounded-xl bg-rose-50/60 border border-rose-200/70 flex items-center justify-between">
              <div>
                <span className="font-bold text-neutral-900 block">Peak Demand (Avoided)</span>
                <span className="text-neutral-500 font-mono text-[11px]">5:00 PM — 11:00 PM</span>
              </div>
              <span className="font-mono font-bold text-rose-700 text-sm">$4.70 / kWh</span>
            </div>
          </div>
        </div>

        {/* Charging & Notification Preferences */}
        <div className="bg-white rounded-2xl border border-neutral-200/80 p-6 shadow-sm space-y-4">
          <div className="flex items-center gap-2.5 pb-3 border-b border-neutral-100">
            <Sliders className="w-5 h-5 text-neutral-900" />
            <div>
              <h4 className="text-sm font-bold text-neutral-900">Optimization Preferences</h4>
              <p className="text-xs text-neutral-400">Rules applied during automated scheduling</p>
            </div>
          </div>

          <div className="space-y-4 text-xs">
            <div>
              <div className="flex justify-between mb-1">
                <span className="font-medium text-neutral-700">Immediate Safety Buffer</span>
                <span className="font-bold text-neutral-900 font-mono">{minBuffer}%</span>
              </div>
              <p className="text-[11px] text-neutral-400 mb-1.5">
                Always charges up to this minimum immediately before smart hold engages.
              </p>
              <input
                type="range"
                min={20}
                max={50}
                step={5}
                value={minBuffer}
                onChange={(e) => setMinBuffer(Number(e.target.value))}
                className="w-full h-2 bg-neutral-100 rounded-lg cursor-pointer accent-neutral-900"
              />
            </div>

            <div className="pt-2 border-t border-neutral-100 space-y-2">
              <label className="flex items-center justify-between cursor-pointer">
                <div>
                  <span className="font-medium text-neutral-800 block">Notify when vehicle is ready</span>
                  <span className="text-[11px] text-neutral-400">Pushes notification at 11:00 AM</span>
                </div>
                <input
                  type="checkbox"
                  checked={notifications.readyByDeparture}
                  onChange={(e) => setNotifications((p) => ({ ...p, readyByDeparture: e.target.checked }))}
                  className="rounded accent-neutral-900 w-4 h-4 cursor-pointer"
                />
              </label>

              <label className="flex items-center justify-between cursor-pointer">
                <div>
                  <span className="font-medium text-neutral-800 block">Grid surge alert</span>
                  <span className="text-[11px] text-neutral-400">Alerts if emergency grid curtailment triggers</span>
                </div>
                <input
                  type="checkbox"
                  checked={notifications.gridSurgeWarning}
                  onChange={(e) => setNotifications((p) => ({ ...p, gridSurgeWarning: e.target.checked }))}
                  className="rounded accent-neutral-900 w-4 h-4 cursor-pointer"
                />
              </label>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
